#!/usr/bin/env node
'use strict';

const path = require('path');
const { getTaskPath, readState, readCurrentTask } = require('./devsphere-state');

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
  const fs = require('fs');
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
      case 'check-advance':
        result = checkStateAdvance(args[1], args[2]);
        break;
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

module.exports = { checkImplementEntry, checkApproveEntry, checkStateAdvance, hasActiveTask };
