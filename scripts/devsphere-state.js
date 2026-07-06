#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// --- Core I/O ---

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// --- State ---

function readState(taskPath) {
  return readJSON(path.join(taskPath, 'state.json'));
}

function writeState(taskPath, state) {
  writeJSON(path.join(taskPath, 'state.json'), state);
}

function readCurrentTask(workspaceRoot) {
  const devsphereDir = path.join(workspaceRoot, '.devsphere');
  return readJSON(path.join(devsphereDir, 'current-task.json'));
}

function writeCurrentTask(workspaceRoot, task) {
  const devsphereDir = path.join(workspaceRoot, '.devsphere');
  writeJSON(path.join(devsphereDir, 'current-task.json'), task);
}

function getTaskPath(workspaceRoot) {
  const current = readCurrentTask(workspaceRoot);
  if (!current || !current.taskPath) return null;
  return path.join(workspaceRoot, current.taskPath);
}

// --- State Updates ---

function updateStageStatus(taskPath, stageName, newStatus) {
  const state = readState(taskPath);
  if (!state || !state.stages || !state.stages[stageName]) {
    throw new Error(`Stage ${stageName} not found in state`);
  }
  state.stages[stageName].status = newStatus;
  // If artifact path is expected but not set, set it
  if (!state.stages[stageName].artifact) {
    state.stages[stageName].artifact = `artifacts/${stageName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}.md`;
  }
  writeState(taskPath, state);
}

function updateTaskStatus(taskPath, newStatus) {
  const state = readState(taskPath);
  if (!state) throw new Error(`State not found at ${taskPath}`);
  state.status = newStatus;
  writeState(taskPath, state);
}

// --- CLI entry (for hook invocation) ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'read-state': {
        const taskPath = args[1];
        const state = readState(taskPath);
        process.stdout.write(JSON.stringify(state));
        break;
      }
      case 'read-current-task': {
        const workspaceRoot = args[1];
        const task = readCurrentTask(workspaceRoot);
        process.stdout.write(JSON.stringify(task));
        break;
      }
      case 'get-task-path': {
        const workspaceRoot = args[1];
        const taskPath = getTaskPath(workspaceRoot);
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

// Run CLI if executed directly
if (require.main === module) {
  main();
}

// Module exports for use by other scripts
module.exports = {
  readJSON,
  writeJSON,
  readState,
  writeState,
  readCurrentTask,
  writeCurrentTask,
  getTaskPath,
  updateStageStatus,
  updateTaskStatus,
};
