'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTask } = require('./helpers');

const script = path.join(__dirname, '..', 'knowledge-query.js');

test('read-config uses the relocated plugin default without creating workspace state', () => {
  const workspaceRoot = fs.mkdtempSync('/tmp/ds-knowledge-config-');
  const result = spawnSync(process.execPath, [script, 'read-config', workspaceRoot], { encoding: 'utf8' });

  assert.strictEqual(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepStrictEqual(output.priority, ['skill', 'local', 'repo', 'mcp', 'web']);
  assert.strictEqual(output._source.priority, 'plugin-default');
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, '.devsphere')), false);
});

test('merge-results is a stdin/stdout-only transformation', () => {
  const workspaceRoot = fs.mkdtempSync('/tmp/ds-knowledge-merge-');
  const input = [
    { source: { type: 'repo', reference: 'src/a.js' }, claims: [{ key: 'timeout', text: '30s' }], gaps: [] },
    { source: { type: 'local', reference: 'ops.md' }, claims: [{ key: 'timeout', text: '60s' }], gaps: ['No rollback policy'] },
  ];
  const result = spawnSync(process.execPath, [script, 'merge-results', workspaceRoot], {
    input: JSON.stringify(input), encoding: 'utf8',
  });

  assert.strictEqual(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.strictEqual(output.conflicts.length, 1);
  assert.deepStrictEqual(output.gaps, ['No rollback policy']);
  assert.deepStrictEqual(fs.readdirSync(workspaceRoot), []);
});

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
