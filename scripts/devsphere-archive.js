#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function taskPathFor(workspaceRoot, taskId) {
  return path.join(workspaceRoot, '.devsphere', 'tasks', 'feature', taskId);
}

function listTasks(workspaceRoot) {
  const tasksDir = path.join(workspaceRoot, '.devsphere', 'tasks', 'feature');
  if (!fs.existsSync(tasksDir)) return [];
  return fs.readdirSync(tasksDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const state = readJSON(path.join(tasksDir, entry.name, 'state.json'));
      return { taskId: entry.name, status: state ? state.status : null };
    })
    .sort((a, b) => a.taskId.localeCompare(b.taskId));
}

module.exports = { taskPathFor, listTasks };
