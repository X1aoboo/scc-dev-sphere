'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTask } = require('./helpers');

const script = path.join(__dirname, '..', 'knowledge-query.js');

function run(workspaceRoot, command, ...args) {
  return spawnSync(process.execPath, [script, command, workspaceRoot, ...args], { encoding: 'utf8' });
}

function writeWorkspaceConfig(workspaceRoot, config) {
  const configPath = path.join(workspaceRoot, '.devsphere', 'config', 'knowledge-sources.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config), 'utf8');
  return configPath;
}

test('read-config normalizes the unchanged plugin default without creating workspace state', () => {
  const workspaceRoot = fs.mkdtempSync('/tmp/ds-knowledge-config-');
  const result = run(workspaceRoot, 'read-config');

  assert.strictEqual(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.strictEqual(output._source, 'plugin-default');
  assert.strictEqual(Object.hasOwn(output, 'priority'), false);
  for (const source of Object.values(output.sources)) assert.strictEqual(source.enabled, false);
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, '.devsphere')), false);
});

test('workspace config is the sole input and invalid source entries are filtered', () => {
  const workspaceRoot = fs.mkdtempSync('/tmp/ds-knowledge-workspace-');
  writeWorkspaceConfig(workspaceRoot, {
    sources: {
      skill: {
        enabled: true,
        names: [
          { name: 'product-query', description: ' 查询产品规则 ' },
          { name: 'missing-description', description: '' },
          { description: 'missing target' },
          'legacy-string',
        ],
      },
      local: { enabled: false, dirs: [{ dir: 'docs', description: '团队文档' }] },
      mcp: { enabled: true, tools: [{ name: 'internal-search', description: '内部知识库' }] },
      web: { enabled: true, description: ' 公开官方资料 ' },
    },
    priority: ['repo'],
  });

  const result = run(workspaceRoot, 'read-config');
  assert.strictEqual(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.strictEqual(output._source, 'workspace');
  assert.strictEqual(Object.hasOwn(output, 'priority'), false);
  assert.deepStrictEqual(output.sources.skill.names, [
    { name: 'product-query', description: '查询产品规则' },
  ]);
  assert.deepStrictEqual(output.sources.local, { enabled: false, dirs: [] });
  assert.strictEqual(output.sources.repo.enabled, false);
  assert.deepStrictEqual(output.sources.mcp.tools, [
    { name: 'internal-search', description: '内部知识库' },
  ]);
  assert.deepStrictEqual(output.sources.web, { enabled: true, description: '公开官方资料' });
});

test('enabled source type becomes disabled when filtering leaves no valid targets', () => {
  const workspaceRoot = fs.mkdtempSync('/tmp/ds-knowledge-empty-');
  writeWorkspaceConfig(workspaceRoot, {
    sources: {
      repo: { enabled: true, paths: [{ path: '.', description: '' }] },
      web: { enabled: true, description: '   ' },
    },
  });

  const output = JSON.parse(run(workspaceRoot, 'read-config').stdout);
  assert.deepStrictEqual(output.sources.repo, { enabled: false, paths: [] });
  assert.deepStrictEqual(output.sources.web, { enabled: false, description: '' });
});

test('upsert-source creates a complete workspace config and updates by type plus target', () => {
  const workspaceRoot = fs.mkdtempSync('/tmp/ds-knowledge-upsert-');
  let result = run(workspaceRoot, 'upsert-source', 'repo', '.', '查询当前代码');
  assert.strictEqual(result.status, 0, result.stderr);
  result = run(workspaceRoot, 'upsert-source', 'repo', '.', '查询当前代码、配置和测试');
  assert.strictEqual(result.status, 0, result.stderr);

  const configPath = path.join(workspaceRoot, '.devsphere', 'config', 'knowledge-sources.json');
  const stored = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.strictEqual(Object.hasOwn(stored, 'priority'), false);
  assert.deepStrictEqual(stored.sources.repo.paths, [
    { path: '.', description: '查询当前代码、配置和测试' },
  ]);

  const output = JSON.parse(run(workspaceRoot, 'read-config').stdout);
  assert.strictEqual(output._source, 'workspace');
  assert.strictEqual(output.sources.repo.enabled, true);
  assert.match(run(workspaceRoot, 'show-config').stdout, /\. — 查询当前代码、配置和测试/);
});

test('upsert-source and remove-source support web and targeted source removal', () => {
  const workspaceRoot = fs.mkdtempSync('/tmp/ds-knowledge-remove-');
  assert.strictEqual(run(workspaceRoot, 'upsert-source', 'skill', 'product-query', '产品规则').status, 0);
  assert.strictEqual(run(workspaceRoot, 'upsert-source', 'web', '公开官方资料').status, 0);
  assert.strictEqual(run(workspaceRoot, 'remove-source', 'skill', 'product-query').status, 0);
  assert.strictEqual(run(workspaceRoot, 'remove-source', 'web').status, 0);

  const output = JSON.parse(run(workspaceRoot, 'read-config').stdout);
  assert.deepStrictEqual(output.sources.skill, { enabled: false, names: [] });
  assert.deepStrictEqual(output.sources.web, { enabled: false, description: '' });
});

test('merge-results command is unavailable', () => {
  const workspaceRoot = fs.mkdtempSync('/tmp/ds-knowledge-merge-');
  const result = run(workspaceRoot, 'merge-results');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /Unknown command/);
});

test('update-config rejects the removed priority field', () => {
  const workspaceRoot = fs.mkdtempSync('/tmp/ds-knowledge-priority-');
  const result = run(workspaceRoot, 'update-config', 'priority', 'repo');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /priority is not part/);
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, '.devsphere')), false);
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

  const read = run(workspaceRoot, 'read-evidence', 'EV-001');
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
  const result = run(workspaceRoot, 'register-evidence', 'x', 'repo', 'q');
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /Unknown command/);
});
