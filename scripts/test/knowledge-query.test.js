'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTask } = require('./helpers');

const script = path.join(__dirname, '..', 'knowledge-query.js');

test('main-session Evidence registration persists one multi-source topic under the active task', () => {
  const { workspaceRoot, taskPath } = makeTask();
  const input = {
    topic: '权限模型',
    summary: '[S1][S2] 管理员拥有审批权限。',
    sources: [
      { type: 'repo', reference: 'src/auth.js', summary: '审批守卫' },
      { type: 'user', reference: 'clarification', summary: '管理员审批' },
    ],
    conflicts: [],
  };
  const result = spawnSync(process.execPath, [script, 'register-evidence-record', workspaceRoot], {
    input: JSON.stringify(input), encoding: 'utf8',
  });

  assert.strictEqual(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.strictEqual(output.id, 'EV-001');
  assert.ok(fs.existsSync(path.join(taskPath, 'evidence', 'knowledge', 'EV-001.json')));
  assert.ok(!fs.existsSync(path.join(workspaceRoot, 'evidence')));

  const read = spawnSync(process.execPath, [script, 'read-evidence', workspaceRoot, 'EV-001'], { encoding: 'utf8' });
  assert.strictEqual(read.status, 0, read.stderr);
  assert.match(read.stdout, /管理员拥有审批权限/);
});

test('Evidence commands fail clearly when no active task exists', () => {
  const workspaceRoot = fs.mkdtempSync('/tmp/ds-knowledge-query-');
  const result = spawnSync(process.execPath, [script, 'register-evidence-record', workspaceRoot], {
    input: JSON.stringify({ topic: 'x', summary: '[S1] y', sources: [{ type: 'user', reference: 'u', summary: 'z' }] }),
    encoding: 'utf8',
  });
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /无活跃任务/);
});

test('legacy query-agent evidence write command is unavailable', () => {
  const { workspaceRoot } = makeTask();
  const result = spawnSync(process.execPath, [script, 'register-evidence', workspaceRoot, 'x', 'repo', 'q'], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /Unknown command/);
});
