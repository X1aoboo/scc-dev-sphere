#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { getTaskPath, readState, readCurrentTask } = require('./devsphere-state');
const { resolveMainArtifact, countGatedPending, readDecisions, decisionsPath, SLUG_PREFIX, validateDecisionsFile } = require('./devsphere-decisions');

const ALLOWED_IMPLEMENT_STATUSES = ['implementation_planned', 'implementing'];

function hasActiveTask(workspaceRoot) {
  const current = readCurrentTask(workspaceRoot);
  return !!(current && current.activeTaskId);
}

function checkImplementEntry(workspaceRoot) {
  if (!hasActiveTask(workspaceRoot)) {
    return { allowed: false, reason: 'No active task. Create a feature task first with /scc-dev-sphere:feature-init.' };
  }

  const taskPath = getTaskPath(workspaceRoot);
  if (!taskPath) {
    return { allowed: false, reason: 'Cannot resolve task path from current-task.json.' };
  }

  const state = readState(taskPath);
  if (!state) {
    return { allowed: false, reason: 'State file not found for active task.' };
  }

  if (!ALLOWED_IMPLEMENT_STATUSES.includes(state.status)) {
    return {
      allowed: false,
      reason: `Task status is '${state.status}'. Code implementation requires 'implementation_planned' or 'implementing'. Complete design, approval, and planning first.`,
    };
  }

  // Check implementation plan exists
  const planPath = path.join(taskPath, 'implementation', 'implementation-plan.md');
  if (state.status === 'implementation_planned' && !fs.existsSync(planPath)) {
    return {
      allowed: false,
      reason: 'Implementation plan not found. Generate it first with /scc-dev-sphere:feature-plan-implementation.',
    };
  }

  return { allowed: true, reason: 'OK' };
}

function checkApproveEntry(workspaceRoot) {
  if (!hasActiveTask(workspaceRoot)) {
    return { allowed: false, reason: 'No active task.' };
  }

  const taskPath = getTaskPath(workspaceRoot);
  if (!taskPath) {
    return { allowed: false, reason: 'Cannot resolve task path.' };
  }

  const state = readState(taskPath);
  if (!state) {
    return { allowed: false, reason: 'State file not found.' };
  }

  if (state.status !== 'design_ready') {
    return {
      allowed: false,
      reason: `Task status is '${state.status}'. Design approval requires 'design_ready'. Complete all design phases and integrated review first.`,
    };
  }

  return { allowed: true, reason: 'OK' };
}

// slug → stage 驼峰（与 feature-workflow.js 的 stage 命名对齐）。
function slugToStage(slug) {
  return slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

// PreToolUse 决策：仅对「真实 devsphere 任务 + 人工门禁阶段」的设计阶段主产物，
// 强制 gated 决策已全部 resolved。非门禁阶段（auto-design 全部 / collaborative 非门禁阶段）
// 与非 devsphere 路径一律放行，避免破坏既有流程，与 resolver 的 stage-level 策略对齐。
function decideWrite(filePath) {
  const target = resolveMainArtifact(filePath);
  if (!target.isMainArtifact) return { allow: true };
  const { taskPath, slug } = target;

  // I1: 必须是真实 devsphere 任务（state.json 可读）。读不到 → 不是我们的任务 → 放行。
  let state;
  try { state = readState(taskPath); } catch (e) { return { allow: true }; }
  if (!state) return { allow: true };

  // C1 stage-aware 门控：仅当 isHumanGated(mode, stage, humanGateStages) 为真才强制决策门。
  // strict 全阶段；collaborative 仅 humanGateStages 阶段；auto-design 与非门禁阶段一律放行。
  const mode = state.workflowMode || 'auto-design';
  const stage = slugToStage(slug);
  const humanGated = mode === 'strict-human-loop'
    || (mode === 'collaborative-design' && Array.isArray(state.humanGateStages) && state.humanGateStages.includes(stage));
  if (!humanGated) return { allow: true };

  // 强制阶段（strict 全阶段 / collaborative 门禁阶段）：应用决策门。
  let decisions;
  try { decisions = readDecisions(taskPath, slug); }
  catch (e) {
    // I5: decisions 文件损坏 → fail-closed（拒绝），因为本就要强制。
    return { allow: false, reason: `decisions 文件损坏，请检查 ${slug}-decisions.json 后再定稿` };
  }
  if (!decisions) {
    return { allow: false, reason: `scoping 未完成：${slug} 的 decisions 文件不存在，先完成 scope（出土决策）再定稿` };
  }
  const pending = countGatedPending(taskPath, slug);
  if (pending > 0) {
    return { allow: false, reason: `还有 ${pending} 个 gated 决策待用户确认，先 resolve 再定稿 ${slug}.md` };
  }
  return { allow: true };
}

// PreToolUse stdin 处理：输出 hookSpecificOutput.permissionDecision
function checkDecisionsResolvedFromStdin(stdinJson) {
  const filePath = stdinJson && stdinJson.tool_input && stdinJson.tool_input.file_path;
  if (!filePath) return null; // 无文件路径，不表态
  const d = decideWrite(filePath);
  if (d.allow) return null; // 静默放行（exit 0 无输出）
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: d.reason,
    },
  };
}

// 校验一段 decisions JSON 文本内容。返回 {allow, reason}。
function validateDecisionsContent(content) {
  let data;
  try { data = JSON.parse(content); }
  catch (e) {
    return { allow: false, reason: `decisions JSON 解析失败: ${e.message}` };
  }
  try { validateDecisionsFile(data); }
  catch (e) {
    return { allow: false, reason: e.message };
  }
  return { allow: true };
}

// 校验 decisions/ 目录下某磁盘文件（用于 TeammateIdle 路径）。
function checkDecisionsFormat(filePath) {
  const norm = (filePath || '').replace(/\\/g, '/');
  if (!/\/decisions\//.test(norm)) return { allow: true };
  const fileName = norm.split('/').pop();
  if (!fileName.endsWith('.json')) {
    return { allow: false, reason: `decisions 目录只允许 JSON 文件，发现非 JSON 文件: ${fileName}` };
  }
  let content;
  try { content = fs.readFileSync(filePath, 'utf-8'); }
  catch (e) { return { allow: true }; } // 读不到（如新建中）→ 放行
  return validateDecisionsContent(content);
}

// PreToolUse：校验【正在写入的内容】，不是磁盘内容（RC2 修复）。
function checkDecisionsFormatFromStdin(stdinJson) {
  const ti = stdinJson && stdinJson.tool_input;
  if (!ti) return null;
  const filePath = ti.file_path;
  if (!filePath) return null;

  const norm = filePath.replace(/\\/g, '/');
  if (!/\/decisions\//.test(norm)) return null; // 非 decisions 路径，放行
  const fileName = norm.split('/').pop();
  if (!fileName.endsWith('.json')) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `decisions 目录只允许 JSON 文件，发现非 JSON 文件: ${fileName}`,
      },
    };
  }

  // 取「将要写入的内容」
  let content;
  if (typeof ti.content === 'string') {
    content = ti.content; // Write
  } else if (typeof ti.new_string === 'string') {
    // Edit：读磁盘原文，应用 old_string→new_string 重建
    let disk;
    try { disk = fs.readFileSync(filePath, 'utf-8'); }
    catch (e) { return null; } // 读不到磁盘无法重建，放行（Edit 本身会失败）
    content = disk.split(ti.old_string).join(ti.new_string);
  } else {
    return null; // 无内容可校验
  }

  const r = validateDecisionsContent(content);
  if (r.allow) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: r.reason,
    },
  };
}

function reviewJSONPath(filePath) {
  const norm = (filePath || '').replace(/\\/g, '/');
  if (/(?:^|\/)reviews\/review-matrix\.json$/.test(norm)) return 'review-matrix.json';
  if (/(?:^|\/)reviews\/[^/]+\/(?:sa|se|mde|tse|dev|cie)\.json$/.test(norm)) return 'reviewer snapshot';
  return null;
}

function checkReviewWritesFromStdin(stdinJson) {
  const filePath = stdinJson && stdinJson.tool_input && stdinJson.tool_input.file_path;
  const target = reviewJSONPath(filePath);
  if (!target) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${target} 禁止通过 Write/Edit 直接修改；使用 Lead 的 review merge 或 devsphere-review-state.js complete 命令。`,
    },
  };
}

// --- Evidence guards ---

function checkEvidenceWritesFromStdin(stdinJson) {
  const ti = stdinJson && stdinJson.tool_input;
  if (!ti) return null;
  const toolName = ti.tool_name;
  if (toolName !== 'Write' && toolName !== 'Edit') return null;
  const filePath = ti.file_path;
  if (!filePath) return null;

  const norm = (filePath || '').replace(/\\/g, '/');
  const isEvidenceFile =
    norm.includes('/evidence/knowledge/EV-') ||
    norm.endsWith('/evidence/evidence-registry.json');

  if (!isEvidenceFile) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'Evidence files must be modified through scripts/knowledge-query.js, not direct Write/Edit.',
    },
  };
}

function checkEvidenceBashFromStdin(stdinJson) {
  const ti = stdinJson && stdinJson.tool_input;
  if (!ti || typeof ti.command !== 'string') return null;
  const command = ti.command;

  const targetsEvidence =
    command.includes('evidence/knowledge/') ||
    command.includes('evidence/evidence-registry.json');

  if (!targetsEvidence) return null;
  if (command.includes('knowledge-query.js')) return null; // 脚本豁免

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'Evidence files must be modified through scripts/knowledge-query.js.',
    },
  };
}

// TeammateIdle 质量门：活跃任务下所有 decisions/*.json 必须 schema 合法。
// 返回 {ok:true} 或 {ok:false, file, reason}。CLI 据此 exit 2（回喂 stderr，teammate 继续）。
function checkTeammateDecisions(workspaceRoot) {
  const taskPath = getTaskPath(workspaceRoot);
  if (!taskPath) return { ok: true };
  const decisionsDir = path.join(taskPath, 'decisions');
  if (!fs.existsSync(decisionsDir)) return { ok: true };
  let files;
  try { files = fs.readdirSync(decisionsDir).filter(f => f.endsWith('.json')); }
  catch (e) { return { ok: true }; }
  for (const f of files) {
    const full = path.join(decisionsDir, f);
    let content;
    try { content = fs.readFileSync(full, 'utf-8'); }
    catch (e) { continue; }
    const r = validateDecisionsContent(content);
    if (!r.allow) {
      return { ok: false, file: f, reason: r.reason };
    }
  }
  return { ok: true };
}

// PreToolUse Bash 守卫：禁止用 Bash 直接写 design-critical 文件（decisions/、artifacts/）。
// CLI（devsphere-decisions.js）走 Node fs，命令行不含 decisions/ 路径，且含脚本名 → 豁免。
function checkDecisionsBashFromStdin(stdinJson) {
  const ti = stdinJson && stdinJson.tool_input;
  if (!ti) return null;
  const command = ti.command;
  if (typeof command !== 'string') return null;

  // 含 decisions/ 或 artifacts/ 路径段，且不是 devsphere-decisions.js CLI 调用 → deny
  const targetsDesignFiles = /(decisions|artifacts)\//.test(command);
  const isCli = command.includes('devsphere-decisions.js');
  if (targetsDesignFiles && !isCli) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'design 文件（decisions/、artifacts/）禁止用 Bash 直接写：decisions 用 `devsphere-decisions.js` CLI（init/add/resolve），artifacts 用 Write 工具。',
      },
    };
  }
  return null;
}

function checkReviewBashFromStdin(stdinJson) {
  const ti = stdinJson && stdinJson.tool_input;
  if (!ti || typeof ti.command !== 'string') return null;
  const command = ti.command;
  const targetsReviewJSON = /reviews\/(?:review-matrix\.json|[^/]+\/(?:sa|se|mde|tse|dev|cie)\.json)/.test(command);
  const isReviewCLI = command.includes('devsphere-review-state.js')
    || command.includes('devsphere-review-matrix.js');
  if (targetsReviewJSON && !isReviewCLI) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: '评审 JSON 禁止通过 Bash 直接写入；Reviewer 使用 devsphere-review-state.js complete，Lead 使用 review-state merge 或 review-matrix 门禁命令。',
      },
    };
  }
  return null;
}

function checkStateAdvance(taskPath, targetStatus) {
  const state = readState(taskPath);
  if (!state) {
    return { allowed: false, reason: 'State file not found.' };
  }

  // Valid state transitions (spec section 4)
  const VALID_TRANSITIONS = {
    'initialized': ['assessed'],
    'assessed': ['designing'],
    'designing': ['design_ready', 'blocked'],
    'design_ready': ['approved_for_implementation', 'designing'],
    'approved_for_implementation': ['implementation_planned', 'designing'],
    'implementation_planned': ['implementing'],
    'implementing': ['verification_ready'],
    'verification_ready': ['completed', 'implementing', 'blocked'],
    'blocked': ['designing', 'implementing'],
    'completed': [],
  };

  const allowed = VALID_TRANSITIONS[state.status] || [];
  if (!allowed.includes(targetStatus)) {
    return {
      allowed: false,
      reason: `Invalid transition from '${state.status}' to '${targetStatus}'. Allowed: ${allowed.join(', ')}`,
    };
  }

  return { allowed: true, reason: 'OK' };
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const workspaceRoot = args[1];

  try {
    let result;
    switch (command) {
      case 'check-implement':
        result = checkImplementEntry(workspaceRoot);
        break;
      case 'check-approve':
        result = checkApproveEntry(workspaceRoot);
        break;
      case 'check-advance': {
        const taskPath = getTaskPath(workspaceRoot);
        if (!taskPath) {
          result = { allowed: false, reason: 'Cannot resolve task path.' };
          break;
        }
        result = checkStateAdvance(taskPath, args[2]);
        break;
      }
      case 'check-decisions-resolved': {
        let stdinJson = null;
        try {
          stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8'));
        } catch (e) {
          process.exit(0); // 解析失败则不表态
        }
        const decision = checkDecisionsResolvedFromStdin(stdinJson);
        if (decision) {
          process.stdout.write(JSON.stringify(decision));
          process.exit(0);
        }
        process.exit(0); // 静默放行
        break;
      }
      case 'check-decisions-format': {
        let stdinJson = null;
        try {
          stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8'));
        } catch (e) {
          process.exit(0);
        }
        const decision = checkDecisionsFormatFromStdin(stdinJson);
        if (decision) {
          process.stdout.write(JSON.stringify(decision));
          process.exit(0);
        }
        process.exit(0);
        break;
      }
      case 'check-review-writes': {
        let stdinJson = null;
        try { stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8')); }
        catch (e) { process.exit(0); }
        const decision = checkReviewWritesFromStdin(stdinJson);
        if (decision) process.stdout.write(JSON.stringify(decision));
        process.exit(0);
        break;
      }
      case 'check-teammate-decisions': {
        const r = checkTeammateDecisions(workspaceRoot);
        if (!r.ok) {
          process.stderr.write(`decisions 校验失败（${r.file}）: ${r.reason}\n`);
          process.exit(2);
        }
        process.exit(0);
        break;
      }
      case 'check-decisions-bash': {
        let stdinJson = null;
        try {
          stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8'));
        } catch (e) {
          process.exit(0);
        }
        const decision = checkDecisionsBashFromStdin(stdinJson);
        if (decision) {
          process.stdout.write(JSON.stringify(decision));
          process.exit(0);
        }
        process.exit(0);
        break;
      }
      case 'check-review-bash': {
        let stdinJson = null;
        try { stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8')); }
        catch (e) { process.exit(0); }
        const decision = checkReviewBashFromStdin(stdinJson);
        if (decision) process.stdout.write(JSON.stringify(decision));
        process.exit(0);
        break;
      }
      case 'check-evidence-writes': {
        let stdinJson = null;
        try { stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8')); }
        catch (e) { process.exit(0); }
        const decision = checkEvidenceWritesFromStdin(stdinJson);
        if (decision) process.stdout.write(JSON.stringify(decision));
        process.exit(0);
        break;
      }
      case 'check-evidence-bash': {
        let stdinJson = null;
        try { stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8')); }
        catch (e) { process.exit(0); }
        const decision = checkEvidenceBashFromStdin(stdinJson);
        if (decision) process.stdout.write(JSON.stringify(decision));
        process.exit(0);
        break;
      }
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        process.exit(1);
    }
    process.stdout.write(JSON.stringify(result));
    if (!result.allowed) process.exit(1);
  } catch (e) {
    process.stderr.write(JSON.stringify({ allowed: false, reason: e.message }));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  checkImplementEntry, checkApproveEntry, checkStateAdvance, hasActiveTask, decideWrite,
  checkDecisionsResolvedFromStdin, slugToStage, checkDecisionsFormat,
  checkDecisionsFormatFromStdin, validateDecisionsContent, checkTeammateDecisions,
  checkDecisionsBashFromStdin, reviewJSONPath, checkReviewWritesFromStdin,
  checkReviewBashFromStdin,
  checkEvidenceWritesFromStdin,
  checkEvidenceBashFromStdin,
};
