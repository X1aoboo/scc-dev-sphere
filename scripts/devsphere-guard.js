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

// PreToolUse 决策：主产物写入前，确保该阶段 gated 决策已全部 resolved。
function decideWrite(filePath) {
  const target = resolveMainArtifact(filePath);
  if (!target.isMainArtifact) return { allow: true };
  const { taskPath, slug } = target;
  const decisions = readDecisions(taskPath, slug);
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
