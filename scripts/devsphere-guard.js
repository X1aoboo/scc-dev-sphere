#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { getTaskPath, readState, readCurrentTask } = require('./devsphere-state');
const { resolveMainArtifact, countGatedPending, readDecisions } = require('./devsphere-decisions');

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

// PreToolUse 决策：仅对「真实 devsphere 任务 + 强制人工交互模式」的设计阶段主产物，
// 强制 gated 决策已全部 resolved。auto-design 与非 devsphere 路径一律放行，避免破坏既有流程。
function decideWrite(filePath) {
  const target = resolveMainArtifact(filePath);
  if (!target.isMainArtifact) return { allow: true };
  const { taskPath, slug } = target;

  // I1: 必须是真实 devsphere 任务（state.json 可读）。读不到 → 不是我们的任务 → 放行。
  let state;
  try { state = readState(taskPath); } catch (e) { return { allow: true }; }
  if (!state) return { allow: true };

  // C1 模式门控：auto-design 不强制决策循环，放行（保护既有 AI 自主流程）。
  const mode = state.workflowMode || 'auto-design';
  if (mode === 'auto-design') return { allow: true };

  // 强制模式（strict-human-loop / collaborative-design）：应用决策门。
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

module.exports = { checkImplementEntry, checkApproveEntry, checkStateAdvance, hasActiveTask, decideWrite, checkDecisionsResolvedFromStdin };
