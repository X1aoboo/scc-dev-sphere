# 设计任务整任务归档与激活 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `design-archive` 从"复制基线文档"重构为"整任务目录迁移"，新增 `design-active` Skill 将归档任务激活回工作区，形成可逆闭环。

**Architecture:** 全部确定性逻辑在 `scripts/devsphere-archive.js`（挂 `devsphere` CLI `archive` 域，动作从 2 个扩到 5 个：`list-tasks`、`run`、`list-versions`、`list-archived`、`activate`）；两个 Skill 只做编排。迁移优先 `fs.renameSync`，`EXDEV` 降级 copyTree + rmSync。版本层为不可变快照：目标已存在即拒绝，不做覆盖更新（现有 `mode: created/updated` 语义删除）。

**Tech Stack:** Node.js 内置模块（`fs`/`path`）、`node:test`、无第三方依赖。

**Spec:** `docs/superpowers/specs/2026-09-17-design-task-archive-activate-design.md`

## Global Constraints

- 测试命令：`node --test scripts/test/design-archive-skill-contract.test.js`（无 package.json，直接 node:test）。
- 所有校验（路径安全、存在性、冲突、symlink 预扫描）必须先于任何写操作 —— 失败无副作用。
- `version` 与 `task-id` 必须过 `assertSafeSegment`（拒绝空、`.`、`..`、`/`、`\`、NUL）。
- 两个 SKILL.md 均须 `disable-model-invocation: true`，中文正文。
- `archive run` 前置校验保留：`artifacts/` 顶层无 `.md` 基线文档 → 拒绝归档。
- `current-task.json` 结构（`create-feature-task` 写入的形状）：`{ activeTaskId, activeTaskType: 'feature', workspaceRoot, taskPath: '.devsphere/tasks/feature/<task-id>' }`。
- 禁止符号链接：迁移前对**整个任务树**（而非仅 artifacts 源集）`assertNoSymlinks` 预扫描。

---

### Task 1: `archive run` 重构为整任务迁移

**Files:**
- Modify: `scripts/devsphere-archive.js`（`runArchive` 重写，新增 `moveTree`）
- Modify: `scripts/devsphere-cli.js`（HELP 文案更新）
- Test: `scripts/test/design-archive-skill-contract.test.js`

**Interfaces:**
- Consumes: 现有 `taskPathFor`、`assertSafeSegment`、`assertNoSymlinksInSource`、`copyTree`、`resolveArchiveRoot`、`readJSON`（均在 `devsphere-archive.js` 内）；`scripts/devsphere-state.js` 导出的 `readCurrentTask(workspaceRoot)`。
- Produces: `runArchive(workspaceRoot, taskId, version, explicitArchiveRoot)` 返回 `{ taskId, version, archiveRoot, destination, movedTree: string[] }`（`mode`/`docs`/`assets` 字段删除）；新导出 `moveTree(src, dest)`（Task 3 复用）。

- [ ] **Step 1: 重写失败测试**

在 `scripts/test/design-archive-skill-contract.test.js` 中，删除以下旧用例（复制语义将被移除；最后一个断言 `mode: 'created'`，随 mode 字段删除而失效）：

- `archive run creates version layer and copies docs and assets byte-identical`
- `archive run updates existing version layer in place and keeps unrelated files`
- `archive run treats existing empty version dir as created`
- `archive run accepts free-format Chinese-containing task ids`
- `archive run CLI works end to end`（被下方 move 语义版本取代）

测试文件顶部 require 区新增：

```js
const { createFeatureTask } = require('../devsphere-workspace');
```

将其替换为（放在原 `makeTaskWithDesigns` helper 之后）：

```js
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
```

同时更新既有用例 `archive run refuses when artifacts has no design docs and creates no layer`、`archive run rejects symlinks in source`（artifacts 顶层 evil.md symlink）、路径穿越两组用例 —— 这些**保持不变**（行为兼容），无需改动。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: 新增用例 FAIL（`movedTree` undefined、源目录仍存在、重复归档未拒绝等），config/list-tasks 等旧用例 PASS。

- [ ] **Step 3: 重写 `runArchive` 与新增 `moveTree`**

`scripts/devsphere-archive.js` 顶部新增依赖（该文件目前不依赖其他业务模块，`devsphere-state.js` 也不依赖本文件，无循环）：

```js
const { readCurrentTask } = require('./devsphere-state');
```

将现有 `runArchive` 函数整体替换为：

```js
function moveTree(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    copyTree(src, dest);
    fs.rmSync(src, { recursive: true });
  }
}

function runArchive(workspaceRoot, taskId, version, explicitArchiveRoot) {
  if (typeof version !== 'string' || !version.trim()) {
    throw new Error('Version is required');
  }
  assertSafeSegment(version, 'version');
  const taskPath = taskPathFor(workspaceRoot, taskId);
  if (!fs.existsSync(taskPath)) throw new Error(`Task not found: ${taskId}`);
  const artifactsDir = path.join(taskPath, 'artifacts');
  if (!fs.existsSync(artifactsDir)) {
    throw new Error(`No baseline design docs to archive (missing artifacts dir)`);
  }
  const hasBaselineDocs = fs.readdirSync(artifactsDir, { withFileTypes: true })
    .some(entry => entry.isFile() && entry.name.endsWith('.md'));
  if (!hasBaselineDocs) {
    throw new Error('No baseline design docs to archive (no *.md in artifacts)');
  }

  // Pre-scan the whole task tree before any write so any symlink (even deep
  // inside work/ or evidence/) fails with no side effects.
  assertNoSymlinksInSource(taskPath);

  const archiveRoot = resolveArchiveRoot(workspaceRoot, explicitArchiveRoot);
  const destination = path.join(archiveRoot, version, taskId);
  if (fs.existsSync(destination)) {
    throw new Error(`Task already archived at this version: ${version}/${taskId}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  moveTree(taskPath, destination);

  const current = readCurrentTask(workspaceRoot);
  if (current && current.activeTaskId === taskId) {
    fs.rmSync(path.join(workspaceRoot, '.devsphere', 'current-task.json'));
  }

  return {
    taskId,
    version,
    archiveRoot,
    destination,
    movedTree: fs.readdirSync(destination).sort(),
  };
}
```

导出行更新为：

```js
module.exports = { taskPathFor, listTasks, runArchive, moveTree };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: 全部 PASS（skill 合同用例此时仍针对旧 SKILL.md，Task 4 才改）。

- [ ] **Step 5: 更新 HELP 并提交**

`scripts/devsphere-cli.js` 中 HELP 的 archive 行改为：

```
  archive    list-tasks | run | list-versions | list-archived | activate
```

（既有用例 `HELP exposes archive domain` 断言 `/archive\s+list-tasks/`，新文案兼容。）

```bash
git add scripts/devsphere-archive.js scripts/devsphere-cli.js scripts/test/design-archive-skill-contract.test.js
git commit -m "feat(archive): move whole task tree on archive, reject duplicate version, clear current-task"
```

---

### Task 2: `archive list-versions` 与 `list-archived`

**Files:**
- Modify: `scripts/devsphere-archive.js`（新增 `listVersions`、`listArchived`）
- Modify: `scripts/devsphere-cli.js`（`dispatchArchive` 新增两个分支）
- Test: `scripts/test/design-archive-skill-contract.test.js`

**Interfaces:**
- Consumes: `assertSafeSegment`、`resolveArchiveRoot`、`readJSON`（`devsphere-archive.js` 内已有）。
- Produces: `listVersions(workspaceRoot, explicitArchiveRoot) → string[]`；`listArchived(workspaceRoot, version, explicitArchiveRoot) → [{ taskId, status }]`。CLI 选项：`list-versions` 接受 `--archive-root`（可选）；`list-archived` 要求 `--version`、接受 `--archive-root`（可选）。

- [ ] **Step 1: 写失败测试**

追加到 `scripts/test/design-archive-skill-contract.test.js`（文件顶部 require 行把 `listTasks, runArchive` 扩为 `listTasks, runArchive, listVersions, listArchived, activateTask`，为 Task 2/3 一并引入；Task 3 前可先只加 `listVersions, listArchived`）：

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: 新用例 FAIL（`listVersions is not a function` / HELP 不匹配）。

- [ ] **Step 3: 实现**

`scripts/devsphere-archive.js` 在 `listTasks` 之后新增：

```js
function listVersions(workspaceRoot, explicitArchiveRoot) {
  const archiveRoot = resolveArchiveRoot(workspaceRoot, explicitArchiveRoot);
  if (!fs.existsSync(archiveRoot)) return [];
  return fs.readdirSync(archiveRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function listArchived(workspaceRoot, version, explicitArchiveRoot) {
  assertSafeSegment(version, 'version');
  const archiveRoot = resolveArchiveRoot(workspaceRoot, explicitArchiveRoot);
  const versionDir = path.join(archiveRoot, version);
  if (!fs.existsSync(versionDir)) throw new Error(`Version layer not found: ${version}`);
  return fs.readdirSync(versionDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const state = readJSON(path.join(versionDir, entry.name, 'state.json'));
      return { taskId: entry.name, status: state ? state.status : null };
    })
    .sort((a, b) => a.taskId.localeCompare(b.taskId));
}
```

`scripts/devsphere-cli.js` 的 `dispatchArchive` 中，在 `run` 分支之后追加：

```js
  if (action === 'list-versions') {
    requireAllowedOptions(options, ['archive-root']);
    return archive.listVersions(workspaceRoot, options['archive-root']);
  }
  if (action === 'list-archived') {
    requireAllowedOptions(options, ['version', 'archive-root']);
    return archive.listArchived(
      workspaceRoot,
      requireOption(options, 'version'),
      options['archive-root'],
    );
  }
```

导出行加入 `listVersions, listArchived`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/devsphere-archive.js scripts/devsphere-cli.js scripts/test/design-archive-skill-contract.test.js
git commit -m "feat(archive): add list-versions and list-archived actions"
```

---

### Task 3: `archive activate` 迁回工作区

**Files:**
- Modify: `scripts/devsphere-archive.js`（新增 `activateTask`）
- Modify: `scripts/devsphere-cli.js`（`dispatchArchive` 新增 `activate` 分支）
- Test: `scripts/test/design-archive-skill-contract.test.js`

**Interfaces:**
- Consumes: Task 1 的 `moveTree`、`assertSafeSegment`、`assertNoSymlinksInSource`、`resolveArchiveRoot`；`devsphere-state.js` 的 `writeCurrentTask(workspaceRoot, task)`。
- Produces: `activateTask(workspaceRoot, taskId, version, explicitArchiveRoot)` 返回 `{ taskId, version, taskPath, destination, activated: true }`。CLI：`archive activate --task-id <id> --version <v> [--archive-root <path>]`。

- [ ] **Step 1: 写失败测试**

追加到测试文件（require 行补齐 `activateTask`，见 Task 2 Step 1）：

```js
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
  runArchive(other.workspaceRoot, other.taskId, 'v1.0.0', undefined);
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
  assert.throws(() => activateTask(workspaceRoot, taskId, 'v9.9.9', undefined), /Version layer not found/);
  runArchive(workspaceRoot, taskId, 'v1.0.0', undefined);
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
```

注意 `activate rejects when task already exists in workspace` 用例：`other` workspace 的归档根指向 `workspaceRoot` 的 archive（显式 `--archive-root` 路径参数模拟"归档区与工作区分离"），其中只有 v1.0.0/`taskId`，没有 `FEAT-OTHER-002` —— 应在 `already exists in workspace` 或 `Archived task not found` 之一报错。**实现时把"工作区冲突"校验放在"归档任务存在"校验之前**（见 Step 3 顺序），使该用例稳定命中 workspace 冲突。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: 新用例 FAIL（`activateTask is not a function`）。

- [ ] **Step 3: 实现**

`scripts/devsphere-archive.js` 顶部依赖扩为：

```js
const { readCurrentTask, writeCurrentTask } = require('./devsphere-state');
```

新增（放在 `runArchive` 之后）：

```js
function activateTask(workspaceRoot, taskId, version, explicitArchiveRoot) {
  assertSafeSegment(taskId, 'taskId');
  assertSafeSegment(version, 'version');
  const tasksDir = path.join(workspaceRoot, '.devsphere', 'tasks', 'feature');
  const taskPath = path.join(tasksDir, taskId);
  if (fs.existsSync(taskPath)) {
    throw new Error(`Task already exists in workspace: ${taskId} (complete or archive it first)`);
  }
  const archiveRoot = resolveArchiveRoot(workspaceRoot, explicitArchiveRoot);
  const versionDir = path.join(archiveRoot, version);
  if (!fs.existsSync(versionDir)) throw new Error(`Version layer not found: ${version}`);
  const archivedPath = path.join(versionDir, taskId);
  if (!fs.existsSync(archivedPath)) {
    throw new Error(`Archived task not found: ${version}/${taskId}`);
  }
  assertNoSymlinksInSource(archivedPath);

  fs.mkdirSync(tasksDir, { recursive: true });
  moveTree(archivedPath, taskPath);

  writeCurrentTask(workspaceRoot, {
    activeTaskId: taskId,
    activeTaskType: 'feature',
    workspaceRoot: workspaceRoot,
    taskPath: `.devsphere/tasks/feature/${taskId}`,
  });

  if (fs.existsSync(versionDir) && fs.readdirSync(versionDir).length === 0) {
    fs.rmdirSync(versionDir);
  }

  return { taskId, version, taskPath, destination: taskPath, activated: true };
}
```

`scripts/devsphere-cli.js` 的 `dispatchArchive` 末尾（`throw new Error` 之前）追加：

```js
  if (action === 'activate') {
    requireAllowedOptions(options, ['task-id', 'version', 'archive-root']);
    return archive.activateTask(
      workspaceRoot,
      requireOption(options, 'task-id'),
      requireOption(options, 'version'),
      options['archive-root'],
    );
  }
```

导出行加入 `activateTask`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/devsphere-archive.js scripts/devsphere-cli.js scripts/test/design-archive-skill-contract.test.js
git commit -m "feat(archive): add activate action to move archived task back as current task"
```

---

### Task 4: 重构 `skills/design-archive/SKILL.md` 并更新契约测试

**Files:**
- Modify: `skills/design-archive/SKILL.md`（整文件重写）
- Test: `scripts/test/design-archive-skill-contract.test.js`

**Interfaces:**
- Consumes: Task 1-3 的 CLI 动作（`archive list-tasks`/`run`、`config read`/`set`）。
- Produces: SKILL.md 结构约定 —— frontmatter `name: design-archive` + `disable-model-invocation: true`；`## 集成契约`、`## 执行步骤`（5 步、每步含 devsphere CLI 命令）、`## 规则`、`## 完成`。契约测试按此结构断言。

- [ ] **Step 1: 更新失败测试**

替换测试文件中现有两个 SKILL.md 合同用例为：

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: 两个 skill 合同用例 FAIL（现文案无"迁移"、无 design-active、含"纯复制"）。

- [ ] **Step 3: 重写 SKILL.md**

`skills/design-archive/SKILL.md` 整文件替换为：

````markdown
---
name: design-archive
description: 将指定设计任务的完整目录从设计工作空间迁移（移动）到带版本分层的归档目录，任务从工作区移除；版本由用户提供，同一版本重复归档拒绝。禁止模型自动调用，仅用户在主会话显式调用。
disable-model-invocation: true
---

# Design Archive — 设计归档

把指定任务的完整目录从 `.devsphere/tasks/feature/<task-id>/` 迁移到 `{归档根目录}/{版本}/{任务ID}/`，按软件版本分层，供发布留档与追溯。归档后任务从工作区移除；后续需要设计变更时，使用 `design-active` 将任务激活回工作区。

## 集成契约

- **入口:** `/scc-dev-sphere:design-archive`
- **入参:** 任务（列表单选）、版本号（必填、自由格式）、归档根目录（默认取配置，可修改并持久化）
- **输出:** `{归档根目录}/{版本}/{任务ID}/` 下的完整任务目录；任务从工作区移除
- **完成标准:** 任务目录已迁移到目标分层目录，向用户展示归档路径与任务树概要

## 执行步骤

1. 枚举任务列表供用户选择：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" archive list-tasks --workspace-root "<workspaceRoot>"`，把结果以单选列表呈现给用户。列表为空时，提示先执行 `feature-init` 并终止。
2. 收集版本号：以自然语言向用户提问，版本为必填、自由格式（如 `1.2.0` 或团队自定义格式）。
3. 读取并确认归档根目录：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" config read --workspace-root "<workspaceRoot>"`，向用户展示当前 `archive.root`；用户需要修改时，执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" config set --workspace-root "<workspaceRoot>" --key archive.root --value "<new-root>"` 持久化后采用新值。
4. 执行归档：`"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" archive run --workspace-root "<workspaceRoot>" --task-id "<task-id>" --version "<version>" --archive-root "<resolved-root>"`，解析脚本输出的 JSON。脚本报错（任务不存在、版本缺失、无基线文档、同版本重复归档等）时透传错误并终止。
5. 展示归档摘要：归档路径、迁移的任务树概要（`movedTree` 顶层条目清单）；说明任务已从工作区移除；如被归档任务是当前激活任务，说明当前任务引用已清理。提示后续设计变更使用 `design-active` 激活。

## 规则

- **仅用户显式调用**：不得被模型自动触发；只在用户在主会话输入 `/scc-dev-sphere:design-archive` 时执行。
- **版本必填且用户提供**：分层使用用户给出的软件版本；不读取、不使用设计稿 frontmatter 的 baseline version。
- **迁移即移除源**：归档是移动而非复制，任务目录整体迁出工作区；迁移过程不修改任务内容。
- **同版本重复归档拒绝**：目标层已存在该任务时脚本报错终止，不做覆盖；换版本号重新归档。
- **基线校验前置**：`artifacts/` 顶层无 `.md` 基线文档的任务（未完成设计发布）拒绝归档。
- **当前任务清理**：被归档任务是当前激活任务时，脚本自动清除当前任务引用。
- **确定性执行**：任务枚举、校验、目录检测、迁移与引用清理全部由 `devsphere` CLI 完成；Skill 不自行拼接路径或执行迁移。
- **非法输入拦截**：任务不存在、路径穿越、源含符号链接等错误由脚本拦截，Skill 透传并终止。

## 完成

归档分层目录已写入指定版本且任务已从工作区移除，向用户呈现归档路径与任务树概要后完成。
````

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add skills/design-archive/SKILL.md scripts/test/design-archive-skill-contract.test.js
git commit -m "feat(skill): rewrite design-archive for whole-task migration"
```

---

### Task 5: 新增 `skills/design-active/SKILL.md` 与契约测试

**Files:**
- Create: `skills/design-active/SKILL.md`
- Test: `scripts/test/design-archive-skill-contract.test.js`

**Interfaces:**
- Consumes: Task 2-3 的 CLI 动作（`config read`/`set`、`archive list-versions`/`list-archived`/`activate`）。
- Produces: `design-active` Skill（两级单选：版本 → 任务），frontmatter `name: design-active` + `disable-model-invocation: true`。

- [ ] **Step 1: 写失败测试**

追加到测试文件：

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: 新用例 FAIL（文件不存在）。

- [ ] **Step 3: 创建 SKILL.md**

`skills/design-active/SKILL.md`：

````markdown
---
name: design-active
description: 将归档目录中指定版本层的完整设计任务迁移回设计工作空间并设为当前任务，用于设计变更；先选版本层再选任务。禁止模型自动调用，仅用户在主会话显式调用。
disable-model-invocation: true
---

# Design Active — 设计激活

把归档目录 `{归档根目录}/{版本}/{任务ID}/` 中的完整任务目录迁移回 `.devsphere/tasks/feature/<task-id>/` 并设为当前激活任务，与 `design-archive` 互为逆操作。激活后任务回到设计工作空间，可继续做设计变更，完成后可再次归档到新版本层。

## 集成契约

- **入口:** `/scc-dev-sphere:design-active`
- **入参:** 归档根目录（默认取配置，可修改并持久化）、版本层（列表单选）、任务（列表单选）
- **输出:** 工作区 `.devsphere/tasks/feature/<task-id>/` 下的完整任务目录；任务设为当前激活任务；空版本层自动清理
- **完成标准:** 任务已迁回工作区并设为当前任务，向用户展示迁回路径与后续设计变更提示

## 执行步骤

1. 读取并确认归档根目录：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" config read --workspace-root "<workspaceRoot>"`，向用户展示当前 `archive.root`；用户需要修改时，执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" config set --workspace-root "<workspaceRoot>" --key archive.root --value "<new-root>"` 持久化后采用新值。
2. 枚举版本层供用户选择：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" archive list-versions --workspace-root "<workspaceRoot>" --archive-root "<resolved-root>"`，把结果以单选列表呈现给用户。列表为空时，提示归档区为空、无任务可激活并终止。
3. 枚举该版本层下的任务供用户选择：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" archive list-archived --workspace-root "<workspaceRoot>" --version "<version>" --archive-root "<resolved-root>"`，把结果（含任务状态）以单选列表呈现给用户。列表为空时提示该版本层无任务并终止。
4. 执行激活：`"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" archive activate --workspace-root "<workspaceRoot>" --task-id "<task-id>" --version "<version>" --archive-root "<resolved-root>"`，解析脚本输出的 JSON。脚本报错（版本层不存在、任务不存在、工作区已存在同 ID 任务等）时透传错误并终止。
5. 展示激活摘要：迁回路径、已设为当前激活任务、空版本层已清理（如适用）。若任务的设计处于已发布状态，提示先执行 `design-reopen` 回到草稿状态再做设计变更。

## 规则

- **仅用户显式调用**：不得被模型自动触发；只在用户在主会话输入 `/scc-dev-sphere:design-active` 时执行。
- **两级选择**：先选版本层、再选该层任务；不默认取最新版本，用户可有意识激活旧版本快照做设计变更。
- **激活即设为当前任务**：迁移完成后任务即成为当前激活任务，可直接进入设计流程。
- **工作区冲突拒绝**：工作区已存在同 ID 任务时脚本报错终止（先完成或归档现有任务），不合并不覆盖。
- **确定性执行**：版本层枚举、任务枚举、校验、迁移、当前任务写入全部由 `devsphere` CLI 完成；Skill 不自行拼接路径或执行迁移。
- **非法输入拦截**：路径穿越、归档树含符号链接等错误由脚本拦截，Skill 透传并终止。

## 完成

任务已迁回工作区并设为当前任务，向用户呈现迁回路径与设计变更提示后完成。
````

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add skills/design-active/SKILL.md scripts/test/design-archive-skill-contract.test.js
git commit -m "feat(skill): add design-active to reactivate archived design tasks"
```

---

### Task 6: README 更新与全量验证

**Files:**
- Modify: `README.md`（技能表）
- Test: 全部 `scripts/test/*.test.js`

**Interfaces:**
- Consumes: Task 4-5 的两个 Skill。
- Produces: 文档与代码一致；全量测试绿。

- [ ] **Step 1: 更新 README 技能表**

`README.md` 设计通用能力行（当前为 `| 设计通用能力 | [`design-draft`](skills/design-draft/SKILL.md)、[`design-reopen`](skills/design-reopen/SKILL.md)、[`design-archive`](skills/design-archive/SKILL.md) |`）改为：

```markdown
| 设计通用能力 | [`design-draft`](skills/design-draft/SKILL.md)、[`design-reopen`](skills/design-reopen/SKILL.md)、[`design-archive`](skills/design-archive/SKILL.md)、[`design-active`](skills/design-active/SKILL.md) | 
```

若 README 其他位置有 design-archive 的行为描述（如"复制基线设计稿"），同步改为"整任务迁移归档"表述。执行前先 `grep -n "design-archive" README.md` 核对。

- [ ] **Step 2: 全量测试**

Run: `node --test scripts/test/*.test.js`
Expected: 全部 PASS，无回归。

- [ ] **Step 3: 手工冒烟（可选但推荐）**

在临时目录起一个真实 workspace 验证 CLI 链路：

```bash
TMP=$(mktemp -d)
node scripts/devsphere-cli.js workspace create-feature-task --workspace-root "$TMP" --task-id FEAT-SMOKE
mkdir -p "$TMP/.devsphere/tasks/feature/FEAT-SMOKE/artifacts"
printf '# design\n' > "$TMP/.devsphere/tasks/feature/FEAT-SMOKE/artifacts/business-design.md"
node scripts/devsphere-cli.js archive run --workspace-root "$TMP" --task-id FEAT-SMOKE --version v1
test ! -d "$TMP/.devsphere/tasks/feature/FEAT-SMOKE" && echo "source removed"
node scripts/devsphere-cli.js archive list-versions --workspace-root "$TMP"
node scripts/devsphere-cli.js archive activate --workspace-root "$TMP" --task-id FEAT-SMOKE --version v1
test -f "$TMP/.devsphere/tasks/feature/FEAT-SMOKE/state.json" && echo "restored"
rm -rf "$TMP"
```

Expected: 依次输出 `source removed`、`["v1"]`、激活 JSON、`restored`。

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "docs(readme): document whole-task archive and design-active skill"
```
