#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { getTaskPath, readState, readCurrentTask } = require('./devsphere-state');
const { validateDesignReady } = require('./devsphere-approval');
const {
  DESIGN_TYPE_KEYS,
  validatePersistedReview,
} = require('./devsphere-design');

const TRANSITIONS = {
  initialized: ['clarified'],
  clarified: ['designing'],
  designing: ['design_ready', 'blocked'],
  design_ready: ['external_test_design_ready', 'approved_for_implementation', 'designing'],
  external_test_design_ready: ['approved_for_implementation', 'designing'],
  approved_for_implementation: ['implementation_planned', 'designing'],
  implementation_planned: ['implementing'],
  implementing: ['verification_ready'],
  verification_ready: ['completed', 'implementing', 'blocked'],
  blocked: ['designing', 'implementing'],
  completed: [],
};

function hasActiveTask(workspaceRoot) {
  const current = readCurrentTask(workspaceRoot);
  return Boolean(current && current.activeTaskId);
}

function checkImplementEntry(workspaceRoot) {
  if (!hasActiveTask(workspaceRoot)) return { allowed: false, reason: 'No active task.' };
  const taskPath = getTaskPath(workspaceRoot);
  const state = taskPath && readState(taskPath);
  if (!state || !['implementation_planned', 'implementing'].includes(state.status)) {
    return { allowed: false, reason: 'Implementation requires overall design approval and implementation planning.' };
  }
  if (state.status === 'implementation_planned' && !fs.existsSync(path.join(taskPath, 'implementation', 'implementation-plan.md'))) {
    return { allowed: false, reason: 'Implementation plan not found.' };
  }
  return { allowed: true, reason: 'OK' };
}

function checkApproveEntry(workspaceRoot) {
  if (!hasActiveTask(workspaceRoot)) return { allowed: false, reason: 'No active task.' };
  const taskPath = getTaskPath(workspaceRoot);
  const ready = taskPath && validateDesignReady(taskPath);
  return ready && ready.valid
    ? { allowed: true, reason: 'OK' }
    : { allowed: false, reason: ready ? ready.issues.join('; ') : 'Task path not found.' };
}

function checkStateAdvance(taskPath, targetStatus) {
  const state = readState(taskPath);
  if (!state) return { allowed: false, reason: 'State file not found.' };
  if (!(TRANSITIONS[state.status] || []).includes(targetStatus)) {
    return { allowed: false, reason: `Invalid transition from '${state.status}' to '${targetStatus}'.` };
  }
  return { allowed: true, reason: 'OK' };
}

function deny(reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}

function checkEvidenceWritesFromStdin(input) {
  const filePath = input && input.tool_input && input.tool_input.file_path;
  if (!filePath || !/(?:\/evidence\/knowledge\/EV-|\/evidence\/evidence-registry\.json$)/.test(filePath.replace(/\\/g, '/'))) return null;
  return deny('Evidence must be registered by the main session through devsphere knowledge register-evidence-record.');
}

function checkEvidenceBashFromStdin(input) {
  const command = input && input.tool_input && input.tool_input.command;
  if (typeof command !== 'string' || !/(?:evidence\/knowledge\/|evidence\/evidence-registry\.json)/.test(command)) return null;
  return deny('Evidence must be registered through devsphere knowledge register-evidence-record.');
}

function normalized(value) {
  return typeof value === 'string' ? value.replace(/\\/g, '/') : '';
}

function isDesignReviewer(input) {
  const agentType = input && input.agent_type;
  return typeof agentType === 'string' && /^(?:scc-dev-sphere:)?design-reviewer$/.test(agentType);
}

function hookPath(input) {
  const toolInput = input && input.tool_input;
  return normalized(toolInput && (toolInput.file_path || toolInput.path));
}

function checkInternalResourceAccess(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid hook input for internal resource guard');
  const toolName = input.tool_name;
  const value = toolName === 'Bash'
    ? normalized(input.tool_input && input.tool_input.command)
    : hookPath(input);
  if (!value.includes('design-review-policy.json')) return null;
  return deny('Design Review Policy is an internal plugin resource and may only be resolved through devsphere by design-reviewer.');
}

const DESIGN_MANAGED_PATH = /(?:^|\/)(?:work\/(?:business|solution|implementation|test)-design\/(?:lint|review)\.json|approvals\/(?:business|solution|implementation|test)-design\.json|approvals\/design-final-approval\.json|artifacts\/(?:business|solution|implementation|test)-design(?:\.md|-assets\/))/;

function isManagedShellMutation(command) {
  const value = normalized(command);
  if (!DESIGN_MANAGED_PATH.test(value)) return false;
  if (/(?:^|[^<])>{1,2}(?!>)/.test(value)) return true;
  if (/(?:^|[\s;&|])(?:rm|mv|cp|install|touch|truncate|tee)\s/i.test(value)) return true;
  if (/(?:^|[\s;&|])sed\s+[^;&|]*-[A-Za-z]*i[A-Za-z]*(?:\s|$)/i.test(value)) return true;
  if (/(?:^|[\s;&|])(?:node|python3?|ruby|perl)\b/i.test(value)) return true;
  return /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|unlinkSync|unlink|renameSync|rename)\s*\(/.test(value);
}

function checkDesignManagedWrite(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid hook input for Design write guard');
  const filePath = hookPath(input);
  if (!filePath || !DESIGN_MANAGED_PATH.test(filePath)) return null;
  return deny('This Design lifecycle file is CLI-managed and cannot be written directly.');
}

function designCommandAction(command) {
  const match = normalized(command).match(/\bdesign\s+(review-context|record-review|refresh-format-review|lint|approve-current-design|publish|reopen)\b/);
  return match && match[1];
}

function checkDesignManagedShell(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid hook input for Design shell guard');
  const command = input.tool_input && input.tool_input.command;
  if (typeof command !== 'string') return null;
  const action = designCommandAction(command);
  const reviewer = isDesignReviewer(input);
  if (['review-context', 'record-review', 'refresh-format-review'].includes(action) && !reviewer) {
    return deny(`${action} is owned by design-reviewer.`);
  }
  if (['lint', 'approve-current-design', 'publish', 'reopen'].includes(action) && reviewer) {
    return deny(`${action} is owned by the main session.`);
  }
  if (/devsphere-design\.js\s+(?:record-review|refresh-format-review|approve-current-design|publish|reopen)\b/.test(command)) {
    return deny('Design lifecycle mutations must use the unified devsphere CLI.');
  }
  if (isManagedShellMutation(command)) {
    return deny('Design lifecycle files cannot be modified directly from a shell command.');
  }
  return null;
}

function checkDesignReviewerStop(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid hook input for Design Reviewer stop guard');
  if (!isDesignReviewer(input)) return null;
  const message = input.last_assistant_message || '';

  // 失败返回，照旧放行
  if (/^# Design Review Failure\b/m.test(message)) return null;

  const workspaceRoot = input.cwd;
  const taskPath = workspaceRoot && getTaskPath(workspaceRoot);
  if (!taskPath) return { decision: 'block', reason: 'Design Reviewer cannot stop: no active Feature task was found.' };

  // 从返回消息解析目标 designType
  const match = message.match(/Design type:\s*(\S+)/);
  const target = match && match[1];

  if (target && DESIGN_TYPE_KEYS.includes(target)) {
    const result = validatePersistedReview(taskPath, target, { allowBlocked: true });
    return result.valid ? null : { decision: 'block', reason: `Design Reviewer cannot stop: ${result.reason}.` };
  }

  // 解析不到合法 designType → block 并提示格式问题
  return { decision: 'block', reason: 'Design Reviewer cannot stop: could not identify the reviewed design type from the return message.' };
}

function readHookInput() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')); } catch (error) { return null; }
}

function main() {
  const [command, workspaceRoot, targetStatus] = process.argv.slice(2);
  try {
    let result;
    if (command === 'check-implement') result = checkImplementEntry(workspaceRoot);
    else if (command === 'check-approve') result = checkApproveEntry(workspaceRoot);
    else if (command === 'check-advance') result = checkStateAdvance(getTaskPath(workspaceRoot), targetStatus);
    else if (command === 'check-evidence-writes') result = checkEvidenceWritesFromStdin(readHookInput());
    else if (command === 'check-evidence-bash') result = checkEvidenceBashFromStdin(readHookInput());
    else throw new Error(`Unknown command: ${command}`);

    if (result && result.hookSpecificOutput) process.stdout.write(JSON.stringify(result));
    else if (result) {
      process.stdout.write(JSON.stringify(result));
      if (!result.allowed) {
        // Exit 2 + stderr is the PreToolUse blocking contract. Avoids relying
        // on the hook's JSON schema, so the guard stays portable across CC
        // versions.
        process.stderr.write(result.reason || 'Blocked by devsphere-guard');
        process.exit(2);
      }
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ allowed: false, reason: error.message }));
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  TRANSITIONS,
  hasActiveTask, checkImplementEntry, checkApproveEntry, checkStateAdvance,
  checkEvidenceWritesFromStdin, checkEvidenceBashFromStdin,
  checkInternalResourceAccess, checkDesignManagedWrite, checkDesignManagedShell,
  checkDesignReviewerStop, isDesignReviewer, isManagedShellMutation,
};
