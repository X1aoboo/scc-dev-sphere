#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { getTaskPath, readState, readCurrentTask } = require('./devsphere-state');
const { resolveMainArtifact, countGatedPending, readDecisions, decisionsPath, SLUG_PREFIX } = require('./devsphere-decisions');

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

// 校验 decisions/ 目录下的文件格式：只允许 <slug>-decisions.json，且
// gated decision 的 options 必须是 {label, description} 对象、rationale 必填。
function checkDecisionsFormat(filePath) {
  const norm = (filePath || '').replace(/\\/g, '/');
  // 仅匹配 decisions/ 目录
  if (!/\/decisions\//.test(norm)) return { allow: true };

  const fileName = norm.split('/').pop();
  // 拒绝非 JSON 文件
  if (!fileName.endsWith('.json')) {
    return { allow: false, reason: `decisions 目录只允许 JSON 文件，发现非 JSON 文件: ${fileName}` };
  }

  // 读取并校验 JSON 内容
  let data;
  try { data = JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch (e) {
    return { allow: false, reason: `decisions JSON 解析失败: ${e.message}` };
  }

  if (!data || !Array.isArray(data.decisions)) return { allow: true };

  for (const d of data.decisions) {
    if (d.type !== 'gated') continue;
    if (!Array.isArray(d.options)) continue;

    // 每个 option 必须是 {label, description} 对象
    for (const opt of d.options) {
      if (typeof opt !== 'object' || opt === null
          || typeof opt.label !== 'string' || !opt.label.trim()
          || typeof opt.description !== 'string' || !opt.description.trim()) {
        return { allow: false, reason: `decisions 文件中 "${d.id || '?'}" 的 options 元素必须是 {label, description} 对象，且字符串非空` };
      }
    }
    // gated 必须有 rationale
    if (typeof d.rationale !== 'string' || !d.rationale.trim()) {
      return { allow: false, reason: `decisions 文件中 gated 决策 "${d.id || '?'}" 缺少 rationale（必填）` };
    }
  }
  return { allow: true };
}

function checkDecisionsFormatFromStdin(stdinJson) {
  const filePath = stdinJson && stdinJson.tool_input && stdinJson.tool_input.file_path;
  if (!filePath) return null;
  const d = checkDecisionsFormat(filePath);
  if (d.allow) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: d.reason,
    },
  };
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

module.exports = { checkImplementEntry, checkApproveEntry, checkStateAdvance, hasActiveTask, decideWrite, checkDecisionsResolvedFromStdin, slugToStage, checkDecisionsFormat, checkDecisionsFormatFromStdin };
