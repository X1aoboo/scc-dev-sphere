'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  readConfig,
  setConfig,
  configPath,
  DEFAULT_ARCHIVE_ROOT,
} = require('../devsphere-config');
const { HELP, main } = require('../devsphere-cli');
const { listTasks, runArchive } = require('../devsphere-archive');
const { makeTask, writeArtifact } = require('./helpers');

const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function capture(argv) {
  let stdout = '';
  let stderr = '';
  const exitCode = main(argv, {
    cwd: path.join(__dirname, '..', '..'),
    env: {},
    stdin: undefined,
    stdout: { write: value => { stdout += value; } },
    stderr: { write: value => { stderr += value; } },
  });
  return { exitCode, stdout, stderr };
}

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ds-archive-'));
}

test('config read creates default config.json when missing', () => {
  const root = makeWorkspace();
  const config = readConfig(root);
  assert.deepStrictEqual(config, { archive: { root: DEFAULT_ARCHIVE_ROOT } });
  const written = JSON.parse(fs.readFileSync(configPath(root), 'utf8'));
  assert.deepStrictEqual(written, { archive: { root: DEFAULT_ARCHIVE_ROOT } });
});

test('config read fills missing archive.root and persists, keeping other keys', () => {
  const root = makeWorkspace();
  fs.mkdirSync(path.join(root, '.devsphere', 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.devsphere', 'config', 'config.json'),
    JSON.stringify({ other: 1 }),
    'utf8',
  );
  const config = readConfig(root);
  assert.strictEqual(config.other, 1);
  assert.strictEqual(config.archive.root, DEFAULT_ARCHIVE_ROOT);
  const written = JSON.parse(fs.readFileSync(configPath(root), 'utf8'));
  assert.strictEqual(written.archive.root, DEFAULT_ARCHIVE_ROOT);
  assert.strictEqual(written.other, 1);
});

test('config read keeps existing archive.root unchanged', () => {
  const root = makeWorkspace();
  fs.mkdirSync(path.join(root, '.devsphere', 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.devsphere', 'config', 'config.json'),
    JSON.stringify({ archive: { root: '/team/archive' } }),
    'utf8',
  );
  assert.strictEqual(readConfig(root).archive.root, '/team/archive');
});

test('config set writes nested key and persists', () => {
  const root = makeWorkspace();
  const config = setConfig(root, 'archive.root', '/data/archive');
  assert.strictEqual(config.archive.root, '/data/archive');
  const written = JSON.parse(fs.readFileSync(configPath(root), 'utf8'));
  assert.strictEqual(written.archive.root, '/data/archive');
});

test('config CLI read and set work end to end', () => {
  const root = makeWorkspace();
  const read = capture(['config', 'read', '--workspace-root', root]);
  assert.strictEqual(read.exitCode, 0, read.stderr);
  assert.strictEqual(JSON.parse(read.stdout).archive.root, DEFAULT_ARCHIVE_ROOT);
  const set = capture(['config', 'set', '--workspace-root', root, '--key', 'archive.root', '--value', '/x/archive']);
  assert.strictEqual(set.exitCode, 0, set.stderr);
  assert.strictEqual(JSON.parse(set.stdout).archive.root, '/x/archive');
});

test('HELP exposes config domain', () => {
  assert.match(HELP, /config\s+read \| set/);
});

test('archive list-tasks returns task ids with status', () => {
  const { workspaceRoot, taskId } = makeTask();
  const tasks = listTasks(workspaceRoot);
  assert.ok(tasks.some(task => task.taskId === taskId && task.status === 'initialized'));
});

test('archive list-tasks returns empty for workspace without tasks', () => {
  const root = makeWorkspace();
  assert.deepStrictEqual(listTasks(root), []);
});

test('archive list-tasks CLI works end to end', () => {
  const { workspaceRoot, taskId } = makeTask();
  const out = capture(['archive', 'list-tasks', '--workspace-root', workspaceRoot]);
  assert.strictEqual(out.exitCode, 0, out.stderr);
  const tasks = JSON.parse(out.stdout);
  assert.ok(Array.isArray(tasks) && tasks.some(task => task.taskId === taskId));
});

test('HELP exposes archive domain', () => {
  assert.match(HELP, /archive\s+list-tasks/);
});

function makeTaskWithDesigns() {
  const created = makeTask();
  writeArtifact(created.taskPath, 'business-design', '1.0.0', '# Business');
  writeArtifact(created.taskPath, 'solution-design', '1.0.0', '# Solution');
  const assetsDir = path.join(created.taskPath, 'artifacts', 'business-design-assets', 'ucd');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(assetsDir, 'w1.svg'), '<svg/>', 'utf8');
  return created;
}

test('archive run creates version layer and copies docs and assets byte-identical', () => {
  const { workspaceRoot, taskId, taskPath } = makeTaskWithDesigns();
  const result = runArchive(workspaceRoot, taskId, 'v1.2.0', path.join(workspaceRoot, 'release'));
  assert.strictEqual(result.mode, 'created');
  assert.deepStrictEqual(result.docs.sort(), ['business-design.md', 'solution-design.md']);
  assert.deepStrictEqual(result.assets, ['business-design-assets']);
  assert.deepStrictEqual(
    fs.readFileSync(path.join(result.destination, 'business-design.md')),
    fs.readFileSync(path.join(taskPath, 'artifacts', 'business-design.md')),
  );
  assert.strictEqual(
    fs.readFileSync(path.join(result.destination, 'business-design-assets', 'ucd', 'w1.svg'), 'utf8'),
    '<svg/>',
  );
});

test('archive run updates existing version layer in place and keeps unrelated files', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  const dest = path.join(workspaceRoot, '.devsphere', 'archive', 'v1.2.0', taskId);
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'business-design.md'), 'OLD', 'utf8');
  fs.writeFileSync(path.join(dest, 'extra.txt'), 'keep me', 'utf8');
  const result = runArchive(workspaceRoot, taskId, 'v1.2.0', undefined);
  assert.strictEqual(result.mode, 'updated');
  assert.match(fs.readFileSync(path.join(dest, 'business-design.md'), 'utf8'), /# Business/);
  assert.strictEqual(fs.readFileSync(path.join(dest, 'extra.txt'), 'utf8'), 'keep me');
});

test('archive run treats existing empty version dir as created', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  const dest = path.join(workspaceRoot, '.devsphere', 'archive', 'v1.2.0', taskId);
  fs.mkdirSync(dest, { recursive: true });
  const result = runArchive(workspaceRoot, taskId, 'v1.2.0', undefined);
  assert.strictEqual(result.mode, 'created');
});

test('archive run rejects unknown task id without side effects', () => {
  const { workspaceRoot } = makeTaskWithDesigns();
  assert.throws(() => runArchive(workspaceRoot, 'FEAT-NOPE', 'v1.2.0', undefined), /Task not found/);
});

test('archive run requires version', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  assert.throws(() => runArchive(workspaceRoot, taskId, '', undefined), /Version is required/);
});

test('archive run refuses when artifacts has no design docs and creates no layer', () => {
  const { workspaceRoot, taskId } = makeTask();
  const dest = path.join(workspaceRoot, '.devsphere', 'archive', 'v1', taskId);
  assert.throws(() => runArchive(workspaceRoot, taskId, 'v1', undefined), /No baseline design docs/);
  assert.strictEqual(fs.existsSync(dest), false);
});

test('archive run rejects symlinks in source', () => {
  const { workspaceRoot, taskId, taskPath } = makeTaskWithDesigns();
  fs.symlinkSync('/etc/hosts', path.join(taskPath, 'artifacts', 'evil.md'));
  assert.throws(() => runArchive(workspaceRoot, taskId, 'v1', undefined), /symbolic link/i);
});

test('archive run CLI works end to end', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  const out = capture([
    'archive', 'run', '--workspace-root', workspaceRoot,
    '--task-id', taskId, '--version', 'v1.0.0',
    '--archive-root', path.join(workspaceRoot, 'release'),
  ]);
  assert.strictEqual(out.exitCode, 0, out.stderr);
  const result = JSON.parse(out.stdout);
  assert.strictEqual(result.mode, 'created');
  assert.ok(fs.existsSync(path.join(result.destination, 'business-design.md')));
});

test('design-archive skill is user-invocable only and forbids model invocation', () => {
  const skill = read('skills/design-archive/SKILL.md');
  assert.match(skill, /^name: design-archive$/m);
  assert.match(skill, /归档/);
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.doesNotMatch(skill, /^user-invocable:\s*false$/m);
  assert.doesNotMatch(skill, /^context:\s*fork$/m);
});

test('design-archive skill orchestrates archive via devsphere CLI', () => {
  const skill = read('skills/design-archive/SKILL.md');
  const process = skill.match(/## 执行步骤([\s\S]*?)## 规则/)[1];
  assert.strictEqual((process.match(/^\d+\. /gm) || []).length, 5);
  for (const phrase of [/archive list-tasks/, /config read/, /config set/, /archive run/]) {
    assert.match(skill, phrase);
  }
  assert.match(skill, /## 集成契约/);
  assert.match(skill, /## 完成/);
});

test('.gitignore ignores .devsphere data area', () => {
  const ignore = read('.gitignore');
  assert.match(ignore, /^\.devsphere\/?$/m);
});
