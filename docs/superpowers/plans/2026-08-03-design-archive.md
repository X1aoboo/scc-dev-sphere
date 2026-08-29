# Design Archive Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增用户可调用的 `design-archive` Skill，把指定任务 `artifacts/` 下的基线设计稿（文档 + 配套资产）按 `{归档根目录}/{版本}/{任务ID}/` 版本分层归档；同版本重复归档更新该层。

**Architecture:** 薄 Skill 编排（`skills/design-archive/SKILL.md`，`disable-model-invocation: true`）+ 确定性脚本（`scripts/devsphere-archive.js` 的 `archive list-tasks`/`run`、`scripts/devsphere-config.js` 的 `config read`/`set`，挂现有 `bin/devsphere` CLI）+ node:test 合同测试。归档根目录持久化在 `.devsphere/config/config.json` 的 `archive.root`，`config read` 读即补全默认值。

**Tech Stack:** Node.js CommonJS（无第三方依赖）、`node:test`、`bin/devsphere` launcher。

## Global Constraints

（来自已批准 spec：`docs/superpowers/specs/2026-08-03-design-archive-design.md`，逐条严格执行）

- **仅用户显式调用**：`skills/design-archive/SKILL.md` frontmatter 必须含 `disable-model-invocation: true`；不得含 `user-invocable: false` 或 `context: fork`。
- **版本必填、用户提供、自由格式**；分层不使用设计稿 frontmatter 的 baseline version。
- **task_name = 任务 ID**（`.devsphere/tasks/feature/<task-id>/` 目录名）。
- **复制源 = `artifacts/` 顶层全部 `*.md` + 顶层全部 `*-assets/` 目录**，字节原样复制，保留相对引用。
- **更新语义**：目标层 `{root}/{version}/{taskId}/` 不存在或存在但空 → `created`（完整复制）；已有文件 → `updated`（覆盖源集内文件，**不删除**目标层其他文件）。
- **归档根目录解析顺序**：`--archive-root` 显式值 → `config.json` 的 `archive.root` → 默认 `.devsphere/archive`。
- **config read 读即补全**：文件缺失或缺 `archive.root` 时写入默认配置并持久化；已有 key 原样保留。
- **错误处理**：非法任务 ID → 非 0 退出且无目录/复制副作用；缺 `--version` → 报错；`artifacts/` 无 `.md` → 报错不建空层；源含符号链接 → 拒绝。
- **CLI 入口**：走 `bin/devsphere`，新域 `config read|set`、`archive list-tasks|run`。
- **无新依赖**：CommonJS、`node:test`；不引入 npm 包。
- **`.devsphere/` 加入 `.gitignore`**。

---

### Task 1: 通用配置模块 `devsphere-config.js` + CLI `config` 域

**Files:**
- Create: `scripts/devsphere-config.js`
- Modify: `scripts/devsphere-cli.js`（顶部 require、HELP Domains、`dispatchConfig`、`dispatch` 的 `config` case）
- Test: `scripts/test/design-archive-skill-contract.test.js`（新建，含 config 测试组）

**Interfaces:**
- Produces（供 Task 3 使用）:
  - `DEFAULT_ARCHIVE_ROOT`（常量 `'.devsphere/archive'`）
  - `configPath(workspaceRoot) → string`（`.devsphere/config/config.json`）
  - `readConfig(workspaceRoot) → object`（读即补全：文件缺失或缺 `archive.root` 时写入默认 `{ archive: { root: DEFAULT_ARCHIVE_ROOT } }` 并持久化）
  - `setConfig(workspaceRoot, key, value) → object`（按点号嵌套 key 写入并持久化）
  - CLI `devsphere config read --workspace-root <root>` → 输出完整配置对象；`devsphere config set --workspace-root <root> --key <dotted> --value <v>` → 输出更新后配置对象

- [ ] **Step 1: 创建测试文件，写失败的 config 测试**

创建 `scripts/test/design-archive-skill-contract.test.js`，写入：

```js
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: FAIL — `Cannot find module '../devsphere-config'`。

- [ ] **Step 3: 实现 `scripts/devsphere-config.js`**

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ARCHIVE_ROOT = '.devsphere/archive';

const DEFAULTS = {
  archive: { root: DEFAULT_ARCHIVE_ROOT },
};

// --- Core I/O ---

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = isPlainObject(base[key]) && isPlainObject(override[key])
      ? deepMerge(base[key], override[key])
      : override[key];
  }
  return out;
}

// --- Config path ---

function configPath(workspaceRoot) {
  return path.join(workspaceRoot, '.devsphere', 'config', 'config.json');
}

// --- Config operations ---

function readConfig(workspaceRoot) {
  const file = configPath(workspaceRoot);
  const current = readJSON(file) || {};
  const merged = deepMerge(DEFAULTS, current);
  if (JSON.stringify(merged) !== JSON.stringify(current)) writeJSON(file, merged);
  return merged;
}

function setConfig(workspaceRoot, key, value) {
  const parts = String(key).split('.');
  if (parts.length === 0 || parts.some(part => !part.trim())) {
    throw new Error(`Invalid config key: ${key}`);
  }
  const config = readConfig(workspaceRoot);
  let node = config;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!isPlainObject(node[parts[i]])) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
  writeJSON(configPath(workspaceRoot), config);
  return config;
}

module.exports = {
  DEFAULT_ARCHIVE_ROOT,
  configPath,
  readConfig,
  setConfig,
};
```

- [ ] **Step 4: 接入 CLI `config` 域**

在 `scripts/devsphere-cli.js`：

顶部 require 区（其他 `const design = require(...)` 之后）新增：

```js
const config = require('./devsphere-config');
```

`HELP` 常量 `Domains:` 块中，在 `approval` 行之后新增一行：

```js
  config     read | set
```

`dispatchApproval` 定义之后新增：

```js
function dispatchConfig(action, options, io) {
  const workspaceRoot = resolveWorkspaceRoot(options, io);
  if (action === 'read') {
    requireAllowedOptions(options, []);
    return config.readConfig(workspaceRoot);
  }
  if (action === 'set') {
    requireAllowedOptions(options, ['key', 'value']);
    return config.setConfig(
      workspaceRoot,
      requireOption(options, 'key'),
      requireOption(options, 'value'),
    );
  }
  throw new Error(`Unknown config action: ${action}`);
}
```

`dispatch` 的 switch 中新增：

```js
    case 'config': return dispatchConfig(action, options, io);
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: PASS — 7 个测试全绿。

- [ ] **Step 6: 运行全部既有测试确认无回归**

Run: `node --test scripts/test`
Expected: PASS（若个别既有用例因 HELP 增加 `config`/`archive` 行而失败，按其后置断言修复——既有断言只校验它列举的域存在，不应受影响）。

- [ ] **Step 7: 提交**

```bash
git add scripts/devsphere-config.js scripts/devsphere-cli.js scripts/test/design-archive-skill-contract.test.js
git commit -m "feat(config): add general devsphere config read/set with self-healing defaults"
```

---

### Task 2: `archive list-tasks` 枚举任务

**Files:**
- Create: `scripts/devsphere-archive.js`（本任务只含 `listTasks` + `taskPathFor`）
- Modify: `scripts/devsphere-cli.js`（顶部 require、`dispatchArchive`、`dispatch` 的 `archive` case、HELP 追加 `archive list-tasks` 行）
- Test: `scripts/test/design-archive-skill-contract.test.js`（追加 list-tasks 测试组）

**Interfaces:**
- Consumes: 无（本任务不依赖 Task 1）
- Produces（供 Task 3 使用）:
  - `taskPathFor(workspaceRoot, taskId) → string`（`.devsphere/tasks/feature/<taskId>`）
  - `listTasks(workspaceRoot) → Array<{ taskId: string, status: string|null }>`（按 taskId 排序；任务目录缺失时返回 `[]`）
  - CLI `devsphere archive list-tasks --workspace-root <root>` → 输出任务数组

- [ ] **Step 1: 追加失败的 list-tasks 测试**

在测试文件顶部 require 区新增：

```js
const { listTasks } = require('../devsphere-archive');
const { makeTask } = require('./helpers');
```

在文件末尾追加：

```js
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: FAIL — `Cannot find module '../devsphere-archive'`。

- [ ] **Step 3: 实现 `scripts/devsphere-archive.js`（仅 listTasks）**

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function taskPathFor(workspaceRoot, taskId) {
  return path.join(workspaceRoot, '.devsphere', 'tasks', 'feature', taskId);
}

function listTasks(workspaceRoot) {
  const tasksDir = path.join(workspaceRoot, '.devsphere', 'tasks', 'feature');
  if (!fs.existsSync(tasksDir)) return [];
  return fs.readdirSync(tasksDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const state = readJSON(path.join(tasksDir, entry.name, 'state.json'));
      return { taskId: entry.name, status: state ? state.status : null };
    })
    .sort((a, b) => a.taskId.localeCompare(b.taskId));
}

module.exports = { taskPathFor, listTasks };
```

- [ ] **Step 4: 接入 CLI `archive` 域**

在 `scripts/devsphere-cli.js` 顶部 require 区新增：

```js
const archive = require('./devsphere-archive');
```

`dispatchConfig` 之后新增：

```js
function dispatchArchive(action, options, io) {
  const workspaceRoot = resolveWorkspaceRoot(options, io);
  if (action === 'list-tasks') {
    requireAllowedOptions(options, []);
    return archive.listTasks(workspaceRoot);
  }
  throw new Error(`Unknown archive action: ${action}`);
}
```

`dispatch` switch 中新增：

```js
    case 'archive': return dispatchArchive(action, options, io);
```

`HELP` 常量 `Domains:` 块中，在 `config` 行之后新增一行：

```js
  archive    list-tasks
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: PASS — 含新增 4 个测试全部通过。

- [ ] **Step 6: 提交**

```bash
git add scripts/devsphere-archive.js scripts/devsphere-cli.js scripts/test/design-archive-skill-contract.test.js
git commit -m "feat(archive): add task enumeration via archive list-tasks"
```

---

### Task 3: `archive run` 归档执行

**Files:**
- Modify: `scripts/devsphere-archive.js`（追加 `resolveArchiveRoot`、`runArchive`、`copyTree`）
- Modify: `scripts/devsphere-cli.js`（`dispatchArchive` 增加 `run` 分支）
- Test: `scripts/test/design-archive-skill-contract.test.js`（追加 run 测试组）

**Interfaces:**
- Consumes: `readConfig`/`DEFAULT_ARCHIVE_ROOT`（Task 1）、`taskPathFor`/`listTasks`（Task 2）
- Produces:
  - `resolveArchiveRoot(workspaceRoot, explicit) → string`（内部；顺序：显式非空值 → config `archive.root` → 默认 `.devsphere/archive`；结果相对 workspaceRoot 解析）
  - `runArchive(workspaceRoot, taskId, version, explicitArchiveRoot) → { taskId, version, archiveRoot, destination, mode, docs: string[], assets: string[] }`
  - CLI `devsphere archive run --workspace-root <root> --task-id <id> --version <v> [--archive-root <path>]`

- [ ] **Step 1: 追加失败的 run 测试**

在测试文件顶部 require 区新增 `runArchive` 与 `writeArtifact`：

```js
const { runArchive } = require('../devsphere-archive');
const { makeTask, writeArtifact } = require('./helpers');
```

在文件末尾追加：

```js
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: FAIL — `runArchive is not a function`。

- [ ] **Step 3: 实现 `runArchive`、`resolveArchiveRoot`、`copyTree`**

在 `scripts/devsphere-archive.js` 顶部 require 区新增：

```js
const { readConfig, DEFAULT_ARCHIVE_ROOT } = require('./devsphere-config');
```

在 `listTasks` 之后追加：

```js
function resolveArchiveRoot(workspaceRoot, explicit) {
  let value;
  if (typeof explicit === 'string' && explicit.trim()) {
    value = explicit;
  } else {
    const config = readConfig(workspaceRoot);
    const root = config.archive && config.archive.root;
    value = typeof root === 'string' && root.trim() ? root : DEFAULT_ARCHIVE_ROOT;
  }
  return path.resolve(workspaceRoot, value);
}

function copyTree(src, dest) {
  const stat = fs.lstatSync(src);
  if (stat.isSymbolicLink()) {
    throw new Error(`Archive source cannot contain symbolic links: ${src}`);
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      copyTree(path.join(src, entry.name), path.join(dest, entry.name));
    }
  } else if (stat.isFile()) {
    fs.copyFileSync(src, dest);
  }
}

function runArchive(workspaceRoot, taskId, version, explicitArchiveRoot) {
  if (typeof version !== 'string' || !version.trim()) {
    throw new Error('Version is required');
  }
  const taskPath = taskPathFor(workspaceRoot, taskId);
  if (!fs.existsSync(taskPath)) throw new Error(`Task not found: ${taskId}`);
  const artifactsDir = path.join(taskPath, 'artifacts');
  if (!fs.existsSync(artifactsDir)) {
    throw new Error(`No baseline design docs to archive (missing artifacts dir)`);
  }

  const docs = [];
  const assets = [];
  for (const entry of fs.readdirSync(artifactsDir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Archive source cannot contain symbolic links: ${entry.name}`);
    }
    if (entry.isFile() && entry.name.endsWith('.md')) docs.push(entry.name);
    else if (entry.isDirectory() && entry.name.endsWith('-assets')) assets.push(entry.name);
  }
  if (docs.length === 0) {
    throw new Error('No baseline design docs to archive (no *.md in artifacts)');
  }

  const archiveRoot = resolveArchiveRoot(workspaceRoot, explicitArchiveRoot);
  const destination = path.join(archiveRoot, version, taskId);
  const hasFiles = fs.existsSync(destination) && fs.readdirSync(destination).length > 0;
  const mode = hasFiles ? 'updated' : 'created';
  fs.mkdirSync(destination, { recursive: true });

  for (const doc of docs) copyTree(path.join(artifactsDir, doc), path.join(destination, doc));
  for (const asset of assets) copyTree(path.join(artifactsDir, asset), path.join(destination, asset));

  return {
    taskId,
    version,
    archiveRoot,
    destination,
    mode,
    docs,
    assets,
  };
}
```

更新模块导出：

```js
module.exports = { taskPathFor, listTasks, runArchive };
```

- [ ] **Step 4: CLI `archive run` 分支**

在 `scripts/devsphere-cli.js` 的 `dispatchArchive` 中，`list-tasks` 分支后追加：

```js
  if (action === 'run') {
    requireAllowedOptions(options, ['task-id', 'version', 'archive-root']);
    return archive.runArchive(
      workspaceRoot,
      requireOption(options, 'task-id'),
      requireOption(options, 'version'),
      options['archive-root'],
    );
  }
```

同时把 `HELP` 中 `archive` 行更新为：

```js
  archive    list-tasks | run
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: PASS — 全部测试通过。

- [ ] **Step 6: 运行全部既有测试确认无回归**

Run: `node --test scripts/test`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add scripts/devsphere-archive.js scripts/devsphere-cli.js scripts/test/design-archive-skill-contract.test.js
git commit -m "feat(archive): add versioned archive run with update detection"
```

---

### Task 4: `design-archive` Skill 与 `.gitignore`

**Files:**
- Create: `skills/design-archive/SKILL.md`
- Modify: `.gitignore`
- Test: `scripts/test/design-archive-skill-contract.test.js`（追加 SKILL.md 合同 + gitignore 断言）

**Interfaces:**
- Consumes: Task 1-3 的 CLI（`config read|set`、`archive list-tasks|run`）
- Produces: 用户可调用的 `/scc-dev-sphere:design-archive` 编排方法

- [ ] **Step 1: 追加失败的 SKILL.md / gitignore 测试**

在测试文件顶部 require 区新增：

```js
const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
```

在文件末尾追加：

```js
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: FAIL — `ENOENT`（SKILL.md 不存在）或 `.gitignore` 断言失败。

- [ ] **Step 3: 创建 `skills/design-archive/SKILL.md`**

```markdown
---
name: design-archive
description: 将指定任务 artifacts 目录下的基线设计稿（设计文档 + 配套资产）归档到带版本分层的归档目录；版本由用户提供，同一版本重复归档更新该层。禁止模型自动调用，仅用户在主会话显式调用。
disable-model-invocation: true
---

# Design Archive — 设计归档

把指定任务的基线设计稿从 `.devsphere/tasks/feature/<task-id>/artifacts/` 归档到 `{归档根目录}/{版本}/{任务ID}/`，按软件版本分层，供发布留档与追溯。

## 集成契约

- **入口:** `/scc-dev-sphere:design-archive`
- **入参:** 任务（列表单选）、版本号（必填、自由格式）、归档根目录（默认取配置，可修改并持久化）
- **输出:** `{归档根目录}/{版本}/{任务ID}/` 下的设计文档与配套资产；新建（created）或更新（updated）
- **完成标准:** 基线设计稿已归档到目标分层目录，向用户展示归档路径与内容清单

## 执行步骤

1. 枚举任务列表供用户选择：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" archive list-tasks --workspace-root "<workspaceRoot>"`，把结果以单选列表呈现给用户。列表为空时，提示先执行 `feature-init` 并终止。
2. 收集版本号：以自然语言向用户提问，版本为必填、自由格式（如 `1.2.0` 或团队自定义格式）。
3. 读取并确认归档根目录：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" config read --workspace-root "<workspaceRoot>"`，向用户展示当前 `archive.root`；用户需要修改时，执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" config set --workspace-root "<workspaceRoot>" --key archive.root --value "<new-root>"` 持久化后采用新值。
4. 执行归档：`"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" archive run --workspace-root "<workspaceRoot>" --task-id "<task-id>" --version "<version>" --archive-root "<resolved-root>"`，解析脚本输出的 JSON。脚本报错（任务不存在、版本缺失、无基线文档等）时透传错误并终止。
5. 展示归档摘要：新建/更新模式、归档路径、复制的设计文档与配套资产清单；更新时如实说明已覆盖既有文件、源中已不存在的旧文件保留不删除。

## 规则

- **仅用户显式调用**：不得被模型自动触发；只在用户在主会话输入 `/scc-dev-sphere:design-archive` 时执行。
- **版本必填且用户提供**：分层使用用户给出的软件版本；不读取、不使用设计稿 frontmatter 的 baseline version。
- **只读源**：不得修改 `artifacts/`；归档是纯复制。
- **确定性执行**：任务枚举、校验、目录检测、复制与覆盖全部由 `devsphere` CLI 完成；Skill 不自行拼接路径或执行复制。
- **非法输入拦截**：任务不存在等错误由脚本拦截，Skill 透传并终止。
- **更新不删除**：目标层已有文件时覆盖源集内文件，但不得删除目标层内其他文件。

## 完成

归档分层目录已写入指定版本，向用户呈现归档路径与内容清单后完成。
```

- [ ] **Step 4: `.gitignore` 追加一行**

在 `.gitignore` 末尾追加：

```
.devsphere/
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `node --test scripts/test/design-archive-skill-contract.test.js`
Expected: PASS — 全部测试通过。

- [ ] **Step 6: 运行全部既有测试确认无回归**

Run: `node --test scripts/test`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add skills/design-archive/SKILL.md .gitignore scripts/test/design-archive-skill-contract.test.js
git commit -m "feat(skill): add user-invocable design-archive skill"
```

---

## 验证清单

- [ ] `node --test scripts/test` 全绿（含新 `design-archive-skill-contract.test.js`）
- [ ] `node bin/devsphere --help` 显示 `config`、`archive` 域
- [ ] 手工冒烟：`node bin/devsphere archive list-tasks --workspace-root <tmp>`、`config read --workspace-root <tmp>`、`archive run --task-id <id> --version v1.0.0 --workspace-root <tmp>`
- [ ] spec 中"仅用户显式调用"要求已由 SKILL.md frontmatter `disable-model-invocation: true` 与测试锁定
