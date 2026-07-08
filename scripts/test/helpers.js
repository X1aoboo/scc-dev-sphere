'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createFeatureTask } = require('../devsphere-workspace');

// 建一个临时任务工作区，返回 { workspaceRoot, taskPath, taskId }
function makeTask(opts = {}) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-test-'));
  const taskId = opts.taskId || 'FEAT-TEST-001';
  createFeatureTask(workspaceRoot, taskId, { workflowMode: opts.workflowMode || 'strict-human-loop' });
  const taskPath = path.join(workspaceRoot, '.devsphere', 'tasks', 'feature', taskId);
  return { workspaceRoot, taskPath, taskId };
}

module.exports = { makeTask };
