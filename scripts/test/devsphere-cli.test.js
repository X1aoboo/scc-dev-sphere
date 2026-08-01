'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const bin = path.join(root, 'bin', process.platform === 'win32' ? 'devsphere.cmd' : 'devsphere');
const { HELP, main, resolveWorkspaceRoot } = require('../devsphere-cli');

function capture(argv, overrides = {}) {
  let stdout = '';
  let stderr = '';
  const exitCode = main(argv, {
    cwd: overrides.cwd || root,
    env: overrides.env || {},
    stdin: overrides.stdin,
    stdout: { write: value => { stdout += value; } },
    stderr: { write: value => { stderr += value; } },
  });
  return { exitCode, stdout, stderr };
}

function makeWorkspace(name = '工作 空间') {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'devsphere-cli-'));
  const workspaceRoot = path.join(parent, name);
  fs.mkdirSync(workspaceRoot);
  return workspaceRoot;
}

test('help exposes every public domain and launcher works without Claude variables', () => {
  for (const domain of ['workspace', 'workflow', 'design', 'approval', 'knowledge', 'state', 'guard']) {
    assert.match(HELP, new RegExp(`^  ${domain}`, 'm'));
  }
  assert.doesNotMatch(HELP, /^  decisions\b/m);
  const result = process.platform === 'win32'
    ? spawnSync(bin, ['--help'], { encoding: 'utf8', shell: true, env: { PATH: process.env.PATH } })
    : spawnSync(bin, ['--help'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: devsphere/);
});

test('guard domain consumes hook stdin, denies protected writes, and stays silent otherwise', () => {
  const evidenceWrite = capture(['guard', 'evidence-write'], {
    stdin: JSON.stringify({ tool_input: { file_path: '/project/evidence/knowledge/EV-001.json' } }),
  });
  assert.strictEqual(evidenceWrite.exitCode, 0, evidenceWrite.stderr);
  assert.strictEqual(JSON.parse(evidenceWrite.stdout).hookSpecificOutput.permissionDecision, 'deny');
  assert.match(evidenceWrite.stdout, /devsphere knowledge register-evidence-record/);

  const configWrite = capture(['guard', 'knowledge-config-write'], {
    stdin: JSON.stringify({ tool_input: { file_path: 'C:\\project\\knowledge-sources.json' } }),
  });
  assert.strictEqual(configWrite.exitCode, 0, configWrite.stderr);
  assert.strictEqual(JSON.parse(configWrite.stdout).hookSpecificOutput.permissionDecision, 'deny');
  assert.match(configWrite.stdout, /devsphere knowledge/);

  for (const stdin of ['', '{invalid', '[]', JSON.stringify({ tool_input: { file_path: '/project/README.md' } })]) {
    const result = capture(['guard', 'evidence-write'], { stdin });
    assert.deepStrictEqual(result, { exitCode: 0, stdout: '', stderr: '' });
  }
});

test('shell guards allow CLI mutations but deny every explicit protected-file access', () => {
  const cases = [
    ['evidence-shell', 'printf x > evidence/evidence-registry.json', true],
    ['evidence-shell', 'devsphere knowledge register-evidence-record --input-file input.json', false],
    ['evidence-shell', 'node scripts/knowledge-query.js register-evidence-record .', false],
    ['evidence-shell', 'devsphere knowledge register-evidence-record --input-file input.json && cat evidence/evidence-registry.json', true],
    ['knowledge-config-shell', 'sed -i x knowledge-sources.json', true],
    ['knowledge-config-shell', 'devsphere knowledge update-config --key sources.web.enabled --value true', false],
    ['knowledge-config-shell', 'node scripts/knowledge-query.js reset-config .', false],
    ['knowledge-config-shell', 'devsphere knowledge reset-config && cat knowledge-sources.json', true],
  ];
  for (const [action, command, denied] of cases) {
    const result = capture(['guard', action], { stdin: JSON.stringify({ tool_input: { command } }) });
    assert.strictEqual(result.exitCode, 0, `${action}: ${result.stderr}`);
    assert.strictEqual(Boolean(result.stdout), denied, `${action}: ${command}`);
  }
});

test('workspace root resolves by option, neutral env, then cwd', () => {
  const cwd = makeWorkspace('cwd');
  const envRoot = makeWorkspace('env');
  const optionRoot = makeWorkspace('option');
  assert.strictEqual(resolveWorkspaceRoot({}, { cwd, env: {} }), cwd);
  assert.strictEqual(resolveWorkspaceRoot({}, { cwd, env: { DEVSPHERE_PROJECT_ROOT: envRoot } }), envRoot);
  assert.strictEqual(resolveWorkspaceRoot(
    { 'workspace-root': optionRoot },
    { cwd, env: { DEVSPHERE_PROJECT_ROOT: envRoot } },
  ), optionRoot);
});

test('workspace and workflow commands run from a Unicode path with spaces', () => {
  const workspaceRoot = makeWorkspace();
  let result = capture([
    'workspace', 'create-feature-task',
    '--workspace-root', workspaceRoot,
    '--task-id', 'FEAT-统一CLI',
  ]);
  assert.strictEqual(result.exitCode, 0, result.stderr);
  const created = JSON.parse(result.stdout);
  assert.ok(fs.existsSync(path.join(created.taskPath, 'state.json')));
  assert.strictEqual(fs.existsSync(path.join(created.taskPath, 'decisions')), false);
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(path.join(created.taskPath, 'evidence', 'evidence-registry.json'), 'utf8')),
    { evidences: [] },
  );

  result = capture(['workflow', 'resolve-next-action'], {
    cwd: root,
    env: { DEVSPHERE_PROJECT_ROOT: workspaceRoot },
  });
  assert.strictEqual(result.exitCode, 0, result.stderr);
  assert.strictEqual(JSON.parse(result.stdout).skill, 'feature-clarify');
});

test('state, design, approval, and knowledge domains dispatch to existing modules', () => {
  const workspaceRoot = makeWorkspace('领域 分发');
  let result = capture([
    'workspace', 'create-feature-task',
    '--workspace-root', workspaceRoot,
    '--task-id', 'FEAT-domains',
  ]);
  const taskPath = JSON.parse(result.stdout).taskPath;

  result = capture(['state', 'read-current-task', '--workspace-root', workspaceRoot]);
  assert.strictEqual(result.exitCode, 0, result.stderr);
  assert.strictEqual(JSON.parse(result.stdout).activeTaskId, 'FEAT-domains');

  result = capture(['design', 'inspect-workspace', '--task-path', taskPath], { cwd: workspaceRoot });
  assert.strictEqual(result.exitCode, 0, result.stderr);
  assert.deepStrictEqual(JSON.parse(result.stdout).requiredDesignTypes, [
    'businessDesign',
    'solutionDesign',
    'implementationDesign',
  ]);

  result = capture(['approval', 'validate-design-ready', '--task-path', taskPath], { cwd: workspaceRoot });
  assert.strictEqual(result.exitCode, 1);
  assert.strictEqual(JSON.parse(result.stdout).valid, false);

  result = capture(['knowledge', 'read-config', '--workspace-root', workspaceRoot]);
  assert.strictEqual(result.exitCode, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).sources);
});

test('review and approval actions consume structured stdin before domain validation', () => {
  const workspaceRoot = makeWorkspace('review approval');
  let result = capture([
    'workspace', 'create-feature-task',
    '--workspace-root', workspaceRoot,
    '--task-id', 'FEAT-review-approval',
  ]);
  const taskPath = JSON.parse(result.stdout).taskPath;

  result = capture([
    'design', 'record-review',
    '--task-path', taskPath,
    '--design-type', 'businessDesign',
    '--input-file', '-',
  ], { cwd: workspaceRoot, stdin: '{}' });
  assert.strictEqual(result.exitCode, 1);
  assert.match(result.stderr, /No valid Draft/);

  result = capture([
    'design', 'approve-current-design',
    '--task-path', taskPath,
    '--design-type', 'businessDesign',
    '--input-file', '-',
  ], { cwd: workspaceRoot, stdin: '{"approvedBy":"human","acceptedRisks":[]}' });
  assert.strictEqual(result.exitCode, 1);
  assert.match(result.stderr, /Draft/);

  result = capture([
    'approval', 'approve-design',
    '--task-path', taskPath,
    '--input-file', '-',
  ], { cwd: workspaceRoot, stdin: '{"approvedBy":"human"}' });
  assert.strictEqual(result.exitCode, 1);
  assert.match(result.stderr, /Task status must be/);
});

test('structured input accepts a JSON file relative to the caller cwd', () => {
  const workspaceRoot = makeWorkspace('input file');
  let result = capture([
    'workspace', 'create-feature-task',
    '--workspace-root', workspaceRoot,
    '--task-id', 'FEAT-input-file',
  ]);
  assert.strictEqual(result.exitCode, 0, result.stderr);
  const inputFile = path.join(workspaceRoot, 'source.json');
  fs.writeFileSync(inputFile, JSON.stringify({
    topic: '统一 CLI',
    summary: 'CLI 入口已统一 [S1]，方案已经批准 [S2]',
    sources: [
      { type: 'repo', reference: 'scripts/devsphere-cli.js', summary: '统一分发入口' },
      { type: 'user', reference: '方案批准', summary: '用户批准统一 CLI 方案' },
    ],
  }));
  result = capture([
    'knowledge', 'register-evidence-record',
    '--workspace-root', workspaceRoot,
    '--input-file', 'source.json',
  ], { cwd: workspaceRoot });
  assert.strictEqual(result.exitCode, 0, result.stderr);
  assert.strictEqual(JSON.parse(result.stdout).id, 'EV-001');
});

test('unknown domains, actions, options, and duplicate options fail closed', () => {
  for (const argv of [
    ['missing', 'action'],
    ['decisions', 'read'],
    ['workflow', 'missing'],
    ['workflow', 'resolve-next-action', '--missing', 'value'],
    ['workflow', 'resolve-next-action', '--workspace-root', root, '--workspace-root', root],
  ]) {
    const result = capture(argv);
    assert.strictEqual(result.exitCode, 1, argv.join(' '));
    assert.match(result.stderr, /^Error:/);
  }
});
