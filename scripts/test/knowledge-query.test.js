'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTask } = require('./helpers');

const script = path.join(__dirname, '..', 'knowledge-query.js');

test('evidence commands persist under the active task instead of workspace root', () => {
  const { workspaceRoot, taskPath } = makeTask();
  const result = spawnSync(
    process.execPath,
    [script, 'register-evidence', workspaceRoot, '权限模型', 'repo', 'permission model'],
    { input: '# 权限模型\n\n管理员拥有审批权限。', encoding: 'utf8' }
  );

  assert.strictEqual(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.strictEqual(output.evId, 'EV-001');
  assert.ok(output.snapshotPath.startsWith(path.join(taskPath, 'evidence', 'knowledge')));
  assert.ok(fs.existsSync(path.join(taskPath, 'evidence', 'evidence-registry.json')));
  assert.ok(!fs.existsSync(path.join(workspaceRoot, 'evidence')));

  const read = spawnSync(
    process.execPath,
    [script, 'read-evidence', workspaceRoot, output.evId],
    { encoding: 'utf8' }
  );
  assert.strictEqual(read.status, 0, read.stderr);
  assert.match(read.stdout, /管理员拥有审批权限/);
});

test('evidence commands fail clearly when no active task exists', () => {
  const workspaceRoot = fs.mkdtempSync('/tmp/ds-knowledge-query-');
  const result = spawnSync(
    process.execPath,
    [script, 'next-ev-id', workspaceRoot],
    { encoding: 'utf8' }
  );

  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /无活跃任务/);
});
