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
const { listTasks, runArchive, listVersions, listArchived, activateTask } = require('../devsphere-archive');
const { createFeatureTask } = require('../devsphere-workspace');
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

function makeTaskWithDesigns(taskId) {
  const created = makeTask(taskId === undefined ? {} : { taskId });
  writeArtifact(created.taskPath, 'business-design', '1.0.0', '# Business');
  writeArtifact(created.taskPath, 'solution-design', '1.0.0', '# Solution');
  const assetsDir = path.join(created.taskPath, 'artifacts', 'business-design-assets', 'ucd');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(assetsDir, 'w1.svg'), '<svg/>', 'utf8');
  return created;
}

test('archive run moves whole task tree to version layer and removes source', () => {
  const { workspaceRoot, taskId, taskPath } = makeTaskWithDesigns();
  const result = runArchive(workspaceRoot, taskId, 'v1.2.0', path.join(workspaceRoot, 'release'));
  assert.ok(Array.isArray(result.movedTree) && result.movedTree.includes('state.json'));
  assert.ok(result.movedTree.includes('artifacts'));
  assert.strictEqual(fs.existsSync(taskPath), false, 'source task dir must be removed');
  assert.ok(fs.existsSync(path.join(result.destination, 'state.json')));
  assert.match(
    fs.readFileSync(path.join(result.destination, 'artifacts', 'business-design.md'), 'utf8'),
    /# Business/,
  );
  assert.ok(fs.existsSync(path.join(result.destination, 'artifacts', 'business-design-assets', 'ucd', 'w1.svg')));
  assert.ok(fs.existsSync(path.join(result.destination, 'work')));
  assert.strictEqual(result.mode, undefined, 'mode field is removed');
});

test('archive run clears current task reference when archiving the active task', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  runArchive(workspaceRoot, taskId, 'v1.0.0', undefined);
  assert.strictEqual(
    fs.existsSync(path.join(workspaceRoot, '.devsphere', 'current-task.json')),
    false,
    'current-task.json must be removed',
  );
});

test('archive run keeps current task reference when archiving a non-active task', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  // create a second task in the same workspace; it becomes the current task
  createFeatureTask(workspaceRoot, 'FEAT-OTHER-002');
  writeArtifact(
    path.join(workspaceRoot, '.devsphere', 'tasks', 'feature', 'FEAT-OTHER-002'),
    'business-design', '1.0.0',
  );
  runArchive(workspaceRoot, taskId, 'v1.0.0', undefined); // archive the FIRST (non-current) task
  const current = JSON.parse(fs.readFileSync(
    path.join(workspaceRoot, '.devsphere', 'current-task.json'), 'utf8',
  ));
  assert.strictEqual(current.activeTaskId, 'FEAT-OTHER-002');
});

test('archive run rejects duplicate version archive without side effects', () => {
  const { workspaceRoot, taskId, taskPath } = makeTaskWithDesigns();
  const dest = path.join(workspaceRoot, '.devsphere', 'archive', 'v1.2.0', taskId);
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'old.md'), 'old', 'utf8');
  assert.throws(() => runArchive(workspaceRoot, taskId, 'v1.2.0', undefined), /already archived at this version/i);
  assert.ok(fs.existsSync(taskPath), 'source must be untouched');
  assert.strictEqual(fs.readFileSync(path.join(dest, 'old.md'), 'utf8'), 'old');
});

test('archive run rejects when destination exists as an empty dir', () => {
  const { workspaceRoot, taskId, taskPath } = makeTaskWithDesigns();
  fs.mkdirSync(path.join(workspaceRoot, '.devsphere', 'archive', 'v1', taskId), { recursive: true });
  assert.throws(() => runArchive(workspaceRoot, taskId, 'v1', undefined), /already archived at this version/i);
  assert.ok(fs.existsSync(taskPath));
});

test('archive run rejects symlink anywhere in the task tree', () => {
  const { workspaceRoot, taskId, taskPath } = makeTaskWithDesigns();
  fs.symlinkSync('/etc/hosts', path.join(taskPath, 'work', 'evil-link'));
  assert.throws(() => runArchive(workspaceRoot, taskId, 'v1', undefined), /symbolic link/i);
  assert.ok(fs.existsSync(taskPath));
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, '.devsphere', 'archive', 'v1')), false);
});

test('archive run accepts free-format Chinese-containing task ids', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns('FEAT-个人博客系统');
  const result = runArchive(workspaceRoot, taskId, 'v1.0.0', undefined);
  assert.ok(fs.existsSync(path.join(
    result.destination, 'artifacts', 'business-design.md',
  )));
  assert.strictEqual(fs.existsSync(path.join(
    workspaceRoot, '.devsphere', 'tasks', 'feature', taskId,
  )), false);
});

test('archive run CLI works end to end with move semantics', () => {
  const { workspaceRoot, taskId, taskPath } = makeTaskWithDesigns();
  const out = capture([
    'archive', 'run', '--workspace-root', workspaceRoot,
    '--task-id', taskId, '--version', 'v1.0.0',
    '--archive-root', path.join(workspaceRoot, 'release'),
  ]);
  assert.strictEqual(out.exitCode, 0, out.stderr);
  const result = JSON.parse(out.stdout);
  assert.ok(Array.isArray(result.movedTree));
  assert.ok(fs.existsSync(path.join(result.destination, 'state.json')));
  assert.strictEqual(fs.existsSync(taskPath), false);
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

test('archive run rejects path-traversal version before creating a layer', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  const archiveRoot = path.join(workspaceRoot, 'release');
  const escapedDest = path.join(workspaceRoot, 'escape', taskId);
  assert.throws(() => runArchive(workspaceRoot, taskId, '../escape', archiveRoot), /Invalid version/);
  assert.strictEqual(fs.existsSync(escapedDest), false);
});

test('archive run rejects version containing a path separator', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  assert.throws(() => runArchive(workspaceRoot, taskId, 'v1/x', undefined), /Invalid version/);
  assert.throws(() => runArchive(workspaceRoot, taskId, 'v1\\x', undefined), /Invalid version/);
});

test('archive run rejects path-traversal taskId before any write', () => {
  const { workspaceRoot } = makeTaskWithDesigns();
  assert.throws(() => runArchive(workspaceRoot, '../FEAT-X', 'v1', undefined), /Invalid taskId/);
  assert.strictEqual(
    fs.existsSync(path.join(workspaceRoot, '.devsphere', 'archive', 'v1', '..')),
    false,
  );
});

test('list-versions returns version layer names and empty list when no archive root', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  runArchive(workspaceRoot, taskId, 'v1.0.0', undefined);
  const root2 = makeWorkspace();
  assert.deepStrictEqual(listVersions(workspaceRoot, undefined), ['v1.0.0']);
  assert.deepStrictEqual(listVersions(root2, undefined), []);
});

test('list-archived returns tasks with status from archived state.json', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  runArchive(workspaceRoot, taskId, 'v1.0.0', undefined);
  const tasks = listArchived(workspaceRoot, 'v1.0.0', undefined);
  assert.ok(tasks.some(task => task.taskId === taskId && task.status === 'initialized'));
});

test('list-archived rejects unknown version layer', () => {
  const { workspaceRoot } = makeTaskWithDesigns();
  assert.throws(() => listArchived(workspaceRoot, 'v9.9.9', undefined), /Version layer not found/);
});

test('list-versions and list-archived CLI work end to end', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  runArchive(workspaceRoot, taskId, 'v1.0.0', undefined);
  const versions = capture(['archive', 'list-versions', '--workspace-root', workspaceRoot]);
  assert.strictEqual(versions.exitCode, 0, versions.stderr);
  assert.deepStrictEqual(JSON.parse(versions.stdout), ['v1.0.0']);
  const tasks = capture([
    'archive', 'list-archived', '--workspace-root', workspaceRoot, '--version', 'v1.0.0',
  ]);
  assert.strictEqual(tasks.exitCode, 0, tasks.stderr);
  assert.ok(JSON.parse(tasks.stdout).some(task => task.taskId === taskId));
});

test('HELP exposes new archive actions', () => {
  assert.match(HELP, /list-versions\s*\|\s*list-archived\s*\|\s*activate/);
});

test('config set rejects prototype-polluting keys and does not pollute global prototype', () => {
  const root = makeWorkspace();
  assert.throws(() => setConfig(root, 'archive.__proto__.polluted', 'v'), /Invalid config key/);
  assert.throws(() => setConfig(root, 'constructor.foo', 'v'), /Invalid config key/);
  assert.throws(() => setConfig(root, 'prototype.bar', 'v'), /Invalid config key/);
  assert.strictEqual(Object.prototype.polluted, undefined);
});

test('archive run rejects nested symlink before creating a layer', () => {
  const { workspaceRoot, taskId, taskPath } = makeTaskWithDesigns();
  fs.symlinkSync('/etc/hosts', path.join(taskPath, 'artifacts', 'business-design-assets', 'bad-link'));
  const dest = path.join(workspaceRoot, '.devsphere', 'archive', 'v1', taskId);
  assert.throws(() => runArchive(workspaceRoot, taskId, 'v1', undefined), /symbolic link/i);
  assert.strictEqual(fs.existsSync(dest), false);
});

test('design-archive skill is user-invocable only and forbids model invocation', () => {
  const skill = read('skills/design-archive/SKILL.md');
  assert.match(skill, /^name: design-archive$/m);
  assert.match(skill, /迁移/);
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.doesNotMatch(skill, /^user-invocable:\s*false$/m);
  assert.doesNotMatch(skill, /^context:\s*fork$/m);
});

test('design-archive skill orchestrates whole-task migration via devsphere CLI', () => {
  const skill = read('skills/design-archive/SKILL.md');
  const process = skill.match(/## 执行步骤([\s\S]*?)## 规则/)[1];
  assert.strictEqual((process.match(/^\d+\. /gm) || []).length, 5);
  for (const phrase of [/archive list-tasks/, /config read/, /config set/, /archive run/]) {
    assert.match(skill, phrase);
  }
  assert.match(skill, /## 集成契约/);
  assert.match(skill, /## 完成/);
  assert.match(skill, /design-active/);
  assert.doesNotMatch(skill, /纯复制/);
});

test('design-active skill is user-invocable only and forbids model invocation', () => {
  const skill = read('skills/design-active/SKILL.md');
  assert.match(skill, /^name: design-active$/m);
  assert.match(skill, /激活/);
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.doesNotMatch(skill, /^user-invocable:\s*false$/m);
  assert.doesNotMatch(skill, /^context:\s*fork$/m);
});

test('design-active skill orchestrates two-level selection via devsphere CLI', () => {
  const skill = read('skills/design-active/SKILL.md');
  const process = skill.match(/## 执行步骤([\s\S]*?)## 规则/)[1];
  assert.strictEqual((process.match(/^\d+\. /gm) || []).length, 5);
  for (const phrase of [/archive list-versions/, /archive list-archived/, /archive activate/, /config read/]) {
    assert.match(skill, phrase);
  }
  assert.match(skill, /design-reopen/);
  assert.match(skill, /## 集成契约/);
  assert.match(skill, /## 完成/);
});

test('activate rejects legacy copy-mode layer without state.json', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  runArchive(workspaceRoot, taskId, 'v1.0.0', undefined);
  fs.rmSync(path.join(workspaceRoot, '.devsphere', 'archive', 'v1.0.0', taskId, 'state.json'));
  assert.throws(() => activateTask(workspaceRoot, taskId, 'v1.0.0', undefined), /legacy copy-mode layer/);
  assert.ok(fs.existsSync(path.join(workspaceRoot, '.devsphere', 'archive', 'v1.0.0', taskId, 'artifacts')));
});

test('.gitignore ignores .devsphere data area', () => {
  const ignore = read('.gitignore');
  assert.match(ignore, /^\.devsphere\/?$/m);
});

test('activate moves archived task back, sets current task, cleans empty version layer', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  runArchive(workspaceRoot, taskId, 'v1.0.0', undefined);
  const result = activateTask(workspaceRoot, taskId, 'v1.0.0', undefined);
  assert.strictEqual(result.activated, true);
  const taskPath = path.join(workspaceRoot, '.devsphere', 'tasks', 'feature', taskId);
  assert.ok(fs.existsSync(path.join(taskPath, 'state.json')));
  assert.ok(fs.existsSync(path.join(taskPath, 'artifacts', 'business-design.md')));
  assert.strictEqual(
    fs.existsSync(path.join(workspaceRoot, '.devsphere', 'archive', 'v1.0.0')),
    false,
    'empty version layer must be cleaned up',
  );
  const current = JSON.parse(fs.readFileSync(
    path.join(workspaceRoot, '.devsphere', 'current-task.json'), 'utf8',
  ));
  assert.strictEqual(current.activeTaskId, taskId);
  assert.strictEqual(current.taskPath, `.devsphere/tasks/feature/${taskId}`);
});

test('activate keeps version layer when other tasks remain in it', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  const other = makeTaskWithDesigns('FEAT-OTHER-002');
  runArchive(workspaceRoot, taskId, 'v1.0.0', undefined);
  runArchive(other.workspaceRoot, other.taskId, 'v1.0.0', path.join(workspaceRoot, '.devsphere', 'archive'));
  activateTask(workspaceRoot, taskId, 'v1.0.0', undefined);
  assert.ok(fs.existsSync(path.join(workspaceRoot, '.devsphere', 'archive', 'v1.0.0', other.taskId)));
});

test('activate rejects when task already exists in workspace', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  const other = makeTaskWithDesigns('FEAT-OTHER-002');
  runArchive(workspaceRoot, taskId, 'v1.0.0', undefined);
  // other task stays in workspace; try to activate a same-id task from another layer
  assert.throws(
    () => activateTask(other.workspaceRoot, other.taskId, 'v1.0.0', path.join(workspaceRoot, '.devsphere', 'archive')),
    /already exists in workspace/i,
  );
  assert.ok(fs.existsSync(path.join(other.workspaceRoot, '.devsphere', 'tasks', 'feature', other.taskId)));
});

test('activate rejects unknown version layer and unknown task', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  runArchive(workspaceRoot, taskId, 'v1.0.0', undefined);
  assert.throws(() => activateTask(workspaceRoot, taskId, 'v9.9.9', undefined), /Version layer not found/);
  assert.throws(() => activateTask(workspaceRoot, 'FEAT-NOPE', 'v1.0.0', undefined), /Archived task not found/);
});

test('activate rejects path traversal in version and task id', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  runArchive(workspaceRoot, taskId, 'v1.0.0', undefined);
  assert.throws(() => activateTask(workspaceRoot, taskId, '../escape', undefined), /Invalid version/);
  assert.throws(() => activateTask(workspaceRoot, '../' + taskId, 'v1.0.0', undefined), /Invalid taskId/);
});

test('archive activate round trip: v1 consumed, modified task archives as v2', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  runArchive(workspaceRoot, taskId, 'v1.0.0', undefined);
  activateTask(workspaceRoot, taskId, 'v1.0.0', undefined);
  const taskPath = path.join(workspaceRoot, '.devsphere', 'tasks', 'feature', taskId);
  fs.writeFileSync(path.join(taskPath, 'artifacts', 'business-design.md'), '# Changed', 'utf8');
  runArchive(workspaceRoot, taskId, 'v2.0.0', undefined);
  assert.match(
    fs.readFileSync(path.join(workspaceRoot, '.devsphere', 'archive', 'v2.0.0', taskId, 'artifacts', 'business-design.md'), 'utf8'),
    /# Changed/,
  );
  activateTask(workspaceRoot, taskId, 'v2.0.0', undefined);
  assert.match(
    fs.readFileSync(path.join(taskPath, 'artifacts', 'business-design.md'), 'utf8'),
    /# Changed/,
  );
});

test('activate CLI works end to end', () => {
  const { workspaceRoot, taskId } = makeTaskWithDesigns();
  runArchive(workspaceRoot, taskId, 'v1.0.0', undefined);
  const out = capture([
    'archive', 'activate', '--workspace-root', workspaceRoot,
    '--task-id', taskId, '--version', 'v1.0.0',
  ]);
  assert.strictEqual(out.exitCode, 0, out.stderr);
  const result = JSON.parse(out.stdout);
  assert.strictEqual(result.activated, true);
  assert.ok(fs.existsSync(path.join(result.taskPath, 'state.json')));
});
