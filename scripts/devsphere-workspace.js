#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  writeState, writeCurrentTask,
} = require('./devsphere-state');

const DEFAULT_REQUIRED_DESIGN_TYPES = [
  'businessDesign',
  'solutionDesign',
  'implementationDesign',
  'testDesign',
];

const DIRS = [
  'inputs',
  'artifacts',
  'reviews',
  'quality-gates',
  'approvals',
  'implementation',
  'verification',
  'links',
  'decisions',
  'work',
  'evidence/knowledge',
  'evidence/repository',
];

function ensureDirectories(taskPath) {
  for (const dir of DIRS) {
    const fullPath = path.join(taskPath, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}

function initState(taskPath, opts = {}) {
  const state = {
    taskId: opts.taskId || path.basename(taskPath),
    taskType: 'feature',
    workflowMode: opts.workflowMode || 'auto-design',
    humanGateStages: opts.humanGateStages || [],
    requiredDesignTypes: opts.requiredDesignTypes || DEFAULT_REQUIRED_DESIGN_TYPES,
    status: 'initialized',
  };
  writeState(taskPath, state);
}

function createFeatureTask(workspaceRoot, taskId, opts = {}) {
  const devsphereDir = path.join(workspaceRoot, '.devsphere');
  const taskPath = path.join(devsphereDir, 'tasks', 'feature', taskId);

  if (fs.existsSync(taskPath)) {
    throw new Error(`Task workspace already exists: ${taskPath}`);
  }

  ensureDirectories(taskPath);
  initState(taskPath, { ...opts, taskId });

  // Set as current task
  writeCurrentTask(workspaceRoot, {
    activeTaskId: taskId,
    activeTaskType: 'feature',
    workspaceRoot: workspaceRoot,
    taskPath: `.devsphere/tasks/feature/${taskId}`,
  });

  return taskPath;
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'create-feature-task': {
        const workspaceRoot = args[1];
        const taskId = args[2];
        const workflowMode = args[3] || 'auto-design';
        const taskPath = createFeatureTask(workspaceRoot, taskId, { workflowMode });
        process.stdout.write(JSON.stringify({ taskPath }));
        break;
      }
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        process.exit(1);
    }
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { DEFAULT_REQUIRED_DESIGN_TYPES, createFeatureTask, ensureDirectories, initState };
