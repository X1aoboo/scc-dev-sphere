'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createFeatureTask } = require('../devsphere-workspace');

// 建一个临时任务工作区，返回 { workspaceRoot, taskPath, taskId }
function makeTask(opts = {}) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-test-'));
  const taskId = opts.taskId || 'FEAT-TEST-001';
  const configDir = path.join(workspaceRoot, '.devsphere', 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'test-design.json'),
    JSON.stringify({ mode: 'builtin' }),
    'utf8',
  );
  createFeatureTask(workspaceRoot, taskId, {
    designRevisionLimit: opts.designRevisionLimit,
  });
  const taskPath = path.join(workspaceRoot, '.devsphere', 'tasks', 'feature', taskId);
  return { workspaceRoot, taskPath, taskId };
}

function writeArtifact(taskPath, artifact, version = '0.1.0', body = '# draft') {
  const filePath = path.join(taskPath, 'artifacts', `${artifact}.md`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\nartifactId: ${artifact}\nversion: "${version}"\n---\n\n${body}\n`, 'utf-8');
  return filePath;
}

module.exports = { makeTask, writeArtifact };
