#!/usr/bin/env node
'use strict';

const { readCurrentTask, readState, getTaskPath } = require('./devsphere-state');

// MVP: only feature resolver exists
const RESOLVERS = {
  feature: './workflows/feature-workflow',
};

function routeWorkflow(workspaceRoot) {
  const current = readCurrentTask(workspaceRoot);

  if (!current || !current.activeTaskId) {
    return {
      kind: 'show_status',
      taskType: null,
      taskId: null,
      status: null,
      stage: null,
      target: null,
      skill: null,
      args: {},
      agents: [],
      reason: 'No active task. Use /scc-dev-sphere:feature-init to create a feature task.',
      requiredArtifacts: [],
      expectedArtifacts: [],
      pause: null,
    };
  }

  const taskPath = getTaskPath(workspaceRoot);
  if (!taskPath) {
    return {
      kind: 'blocked',
      taskType: current.activeTaskType,
      taskId: current.activeTaskId,
      status: null,
      stage: null,
      target: null,
      skill: null,
      args: {},
      agents: [],
      reason: 'Task path could not be resolved from current-task.json.',
      requiredArtifacts: [],
      expectedArtifacts: [],
      pause: null,
    };
  }

  const state = readState(taskPath);
  if (!state) {
    return {
      kind: 'blocked',
      taskType: current.activeTaskType,
      taskId: current.activeTaskId,
      status: null,
      stage: null,
      target: null,
      skill: null,
      args: {},
      agents: [],
      reason: 'State file not found for active task.',
      requiredArtifacts: [],
      expectedArtifacts: [],
      pause: null,
    };
  }

  // Route to taskType-specific resolver
  const taskType = state.taskType || current.activeTaskType;
  if (!RESOLVERS[taskType]) {
    return {
      kind: 'show_status',
      taskType,
      taskId: state.taskId,
      status: state.status,
      stage: null,
      target: null,
      skill: null,
      args: {},
      agents: [],
      reason: `Task type '${taskType}' is not yet implemented in MVP. Only 'feature' is supported.`,
      requiredArtifacts: [],
      expectedArtifacts: [],
      pause: null,
    };
  }

  const resolver = require(RESOLVERS[taskType]);
  return resolver.resolveNextAction(taskPath, state);
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const workspaceRoot = args[0] || process.cwd();

  try {
    const nextAction = routeWorkflow(workspaceRoot);
    process.stdout.write(JSON.stringify(nextAction, null, 2));
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { routeWorkflow };
