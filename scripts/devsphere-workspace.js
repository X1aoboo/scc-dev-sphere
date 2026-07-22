#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  writeState, writeCurrentTask,
} = require('./devsphere-state');
const {
  BUILTIN_REQUIRED_DESIGN_TYPES,
  EXTERNAL_REQUIRED_DESIGN_TYPES,
  EXTERNAL_TEST_DESIGN_OUTPUT_DIR,
  readEffectiveTestDesignConfig,
  readPluginDefaultTestDesignConfig,
  validateTestDesignConfig,
} = require('./devsphere-test-design-config');

const DEFAULT_REQUIRED_DESIGN_TYPES = BUILTIN_REQUIRED_DESIGN_TYPES;

const DIRS = [
  'inputs',
  'artifacts',
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
  const testDesignConfig = validateTestDesignConfig(
    opts.testDesignConfig || readPluginDefaultTestDesignConfig(),
    'testDesignConfig',
  );
  const external = testDesignConfig.mode === 'external';
  const state = {
    taskId: opts.taskId || path.basename(taskPath),
    taskType: 'feature',
    requiredDesignTypes: external
      ? [...EXTERNAL_REQUIRED_DESIGN_TYPES]
      : [...DEFAULT_REQUIRED_DESIGN_TYPES],
    status: 'initialized',
    ...(external ? { externalTestDesign: { skillId: testDesignConfig.externalSkillId } } : {}),
  };
  writeState(taskPath, state);
}

function createFeatureTask(workspaceRoot, taskId, opts = {}) {
  const devsphereDir = path.join(workspaceRoot, '.devsphere');
  const taskPath = path.join(devsphereDir, 'tasks', 'feature', taskId);

  if (fs.existsSync(taskPath)) {
    throw new Error(`Task workspace already exists: ${taskPath}`);
  }

  const testDesignConfig = readEffectiveTestDesignConfig(workspaceRoot);
  ensureDirectories(taskPath);
  if (testDesignConfig.mode === 'external') {
    fs.mkdirSync(path.join(taskPath, EXTERNAL_TEST_DESIGN_OUTPUT_DIR), { recursive: true });
  }
  initState(taskPath, { ...opts, taskId, testDesignConfig });

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
        if (args.length !== 3) throw new Error('Usage: create-feature-task <workspaceRoot> <taskId>');
        const taskPath = createFeatureTask(workspaceRoot, taskId);
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

module.exports = {
  DEFAULT_REQUIRED_DESIGN_TYPES,
  EXTERNAL_REQUIRED_DESIGN_TYPES,
  createFeatureTask,
  ensureDirectories,
  initState,
};
