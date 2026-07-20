#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { getTaskPath, readState, readCurrentTask } = require('./devsphere-state');
const { designReady } = require('./devsphere-design');

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
  const state = taskPath && readState(taskPath);
  if (!state || state.status !== 'design_ready') return { allowed: false, reason: 'Overall approval requires design_ready.' };
  const ready = designReady(taskPath);
  return ready.valid ? { allowed: true, reason: 'OK' } : { allowed: false, reason: ready.issues.join('; ') };
}

function checkStateAdvance(taskPath, targetStatus) {
  const state = readState(taskPath);
  if (!state) return { allowed: false, reason: 'State file not found.' };
  const transitions = {
    initialized: ['clarified'], clarified: ['assessed'], assessed: ['designing'],
    designing: ['design_ready', 'blocked'], design_ready: ['approved_for_implementation', 'designing'],
    approved_for_implementation: ['implementation_planned', 'designing'], implementation_planned: ['implementing'],
    implementing: ['verification_ready'], verification_ready: ['completed', 'implementing', 'blocked'],
    blocked: ['designing', 'implementing'], completed: [],
  };
  if (!(transitions[state.status] || []).includes(targetStatus)) {
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
  return deny('Evidence must be registered by the main session through knowledge-query.js.');
}

function checkEvidenceBashFromStdin(input) {
  const command = input && input.tool_input && input.tool_input.command;
  if (typeof command !== 'string' || !/(?:evidence\/knowledge\/|evidence\/evidence-registry\.json)/.test(command)) return null;
  if (command.includes('knowledge-query.js')) return null;
  return deny('Evidence must be registered through knowledge-query.js.');
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
    else if (result) { process.stdout.write(JSON.stringify(result)); if (!result.allowed) process.exit(1); }
  } catch (error) {
    process.stderr.write(JSON.stringify({ allowed: false, reason: error.message }));
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  hasActiveTask, checkImplementEntry, checkApproveEntry, checkStateAdvance,
  checkEvidenceWritesFromStdin, checkEvidenceBashFromStdin,
};
