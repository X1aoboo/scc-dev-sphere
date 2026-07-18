# Feature Design 重构 — Batch 1（Business 垂直切片）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 跑通 Business Design 的 Work → Draft → Gate → 单视角 Review → Baseline 闭环，验证 D1（主会话推演）、D2（progress.json 里程碑）与中断恢复，不启用 Agent Teams。

**Architecture:** 新增唯一聚合脚本 `scripts/devsphere-design.js`（init-stage / mark-ready / inspect / record-gate / publish），承载 Work 目录初始化、结构化 ready 信号、确定性 Router、Draft→Artifact 发布。复用现有 `devsphere-decisions.js`、`devsphere-review-matrix.js`、`devsphere-state.js`、`devsphere-workspace.js`。`feature-design` skill 改为消费 `inspect` 输出的生命周期入口。

**Tech Stack:** Node.js（无依赖，仅 `fs`/`path`/`crypto`），`node:test` 内置测试框架，CommonJS。

## Global Constraints

- 本仓库**无 `package.json`、无构建步骤**。脚本既是 CLI（`node scripts/foo.js <cmd> <args>`）又可 `require()`。
- 测试用 `node:test` + `node:assert`，放在 `scripts/test/`，文件名 `<topic>.test.js`，helper 在 `scripts/test/helpers.js`。
- 跑测试：`node --test scripts/test/devsphere-design.test.js`（单文件）或 `node --test scripts/test/`（全量）。
- Skill 文档面向中文 UI，交互必须用 `AskUserQuestion`，遵循 `references/interaction-guidelines.md`。
- 阎王约束（来自 CLAUDE.md）：不引入 Agent runtime；脚本只做确定性判断与原子写入，不做专业设计。
- 产物权威：Draft 用最终 Artifact frontmatter（`artifactId` + `version`），**不写 `status: draft`**。Gate/Review/Baseline 统一绑定 `artifactId + version + sha256(draft)`。
- State 写入只能经由 `devsphere-state.js`；不可在 skill prompt 里直接读写 `state.json`。
- Git 提交信息用 `feat(scope):` / `refactor(scope):` / `test(scope):` / `docs(scope):` 前缀，scope 用 `design`。

---

## File Structure

**新增：**
- `scripts/devsphere-design.js` — 聚合脚本：init-stage / mark-ready / inspect / record-gate / publish（+ 内部 helper：hash、frontmatter 解析，导出供测试与 router 复用）。
- `templates/design-work/analysis.md`、`discovery.md`、`design.md` — Work 通用模板（draft 复用 `templates/artifacts/business-design.md`，不新增 draft 模板）。
- `scripts/test/devsphere-design.test.js` — 聚合脚本测试。

**修改：**
- `scripts/devsphere-workspace.js` — `DIRS` 增加 `'work'`。
- `scripts/devsphere-decisions.js` — `VALID_TYPES` 增加 `'assumption'`（D7）。
- `skills/feature-design/SKILL.md` — 改为生命周期入口，消费 `inspect`，删除 Agent Teams 依赖。

**接口契约（跨任务引用，先立后用）：**

```js
// scripts/devsphere-design.js 导出
function initStage(taskPath, stage)              // stage='businessDesign'
function markReady(taskPath, stage, which)       // which='analysis'|'discovery'
function inspect(taskPath, stage)                // → { stage, milestone, draftRef, gate, review, baseline, nextAction, decisions }
function recordGate(taskPath, stage, status, checks)  // status='pass'|'warn'|'fail'; checks={templateChecks:[],qualityChecks:[]}
function publish(taskPath, stage)                // → { artifactPath, hash, baseline }
// helpers
function sha256File(filePath)                    // → 'sha256:<hex>'
function readDraftRef(taskPath, stage)           // → {artifactId,version,hash} | null
function progressPath(taskPath, stage)           // → 绝对路径
```

`inspect` 返回的 `nextAction` 形态（Batch 1 仅 business）：

```json
{ "kind": "run_stage", "activity": "analyze" }
{ "kind": "run_stage", "activity": "discover" }
{ "kind": "run_stage", "activity": "design" }
{ "kind": "ask_decision", "decisions": [ /* pending gated */ ] }
{ "kind": "run_gate" }
{ "kind": "run_stage", "activity": "revise", "reason": "..." }
{ "kind": "run_review" }
{ "kind": "baseline" }
{ "kind": "stage_complete" }
{ "kind": "blocked", "reason": "..." }
```

---

### Task 1: Workspace 增加 `work/` 目录 + Work 通用模板

**Files:**
- Modify: `scripts/devsphere-workspace.js:11-22`（`DIRS` 数组）
- Create: `templates/design-work/analysis.md`
- Create: `templates/design-work/discovery.md`
- Create: `templates/design-work/design.md`
- Test: `scripts/test/devsphere-design.test.js`（本任务起建立该测试文件）

**Interfaces:**
- Produces: `createFeatureTask` 创建的任务根目录下存在 `work/` 目录；三份 Work 模板可供 `init-stage`（Task 4）复制。

- [ ] **Step 1: 写失败测试 — work 目录由 createFeatureTask 创建**

追加到 `scripts/test/devsphere-design.test.js`（先建文件头部）：

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');

test('createFeatureTask 创建 work/ 目录', () => {
  const { taskPath } = makeTask();
  assert.ok(fs.existsSync(path.join(taskPath, 'work')));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/devsphere-design.test.js`
Expected: FAIL — `work/` 不存在。

- [ ] **Step 3: 修改 workspace.js 的 DIRS**

在 `scripts/devsphere-workspace.js` 的 `DIRS` 数组中，`'decisions',` 之后插入 `'work',`：

```js
const DIRS = [
  'inputs',
  'artifacts',
  'reviews',
  'approvals',
  'implementation',
  'verification',
  'links',
  'decisions',
  'work',
  'evidence/knowledge',
  'evidence/repository',
];
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/devsphere-design.test.js`
Expected: PASS。

- [ ] **Step 5: 创建三份 Work 通用模板**

`templates/design-work/analysis.md`：

```markdown
# 阶段分析 · {{STAGE}}

## 阶段目标
<!-- 本阶段要回答的设计问题 -->

## 上游输入摘要
<!-- 引用上游 Artifact 的 artifactId/version -->

## 初步理解

## 范围与边界

## 关键问题与未知项

## 调查计划

## 待用户确认事项
<!-- 引用 decisions/<slug>-decisions.json 中的 decision id -->
```

`templates/design-work/discovery.md`：

```markdown
# 调查综合 · {{STAGE}}

## 调查项与查询范围

## 关键发现
<!-- 每条发现引用 evidence/ -->

## 现状约束

## 冲突与未知项

## 对设计的影响
```

`templates/design-work/design.md`：

```markdown
# 设计推演 · {{STAGE}}

## 候选方案与比较

## 关键取舍
<!-- 引用 decisions/ 中的 tradeoff/assumption decision -->

## 设计推演

## 被拒绝方案

## 对 Draft 各部分的设计输入
```

- [ ] **Step 6: 提交**

```bash
git add scripts/devsphere-workspace.js templates/design-work scripts/test/devsphere-design.test.js
git commit -m "feat(design): add work/ dir and design-work templates"
```

---

### Task 2: decisions.js 增加 `assumption` 类型（D7）

**Files:**
- Modify: `scripts/devsphere-decisions.js:14`（`VALID_TYPES`）
- Test: `scripts/test/devsphere-decisions.test.js`（追加）

**Interfaces:**
- Produces: `addDecision({type:'assumption', category, summary})` 合法，行为同 autonomous（不要求 options/rationale），用于 discovery 记录未证前提。

- [ ] **Step 1: 写失败测试**

追加到 `scripts/test/devsphere-decisions.test.js`：

```js
test('addDecision 支持 type=assumption（D7）', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  const d = addDecision(taskPath, 'business-design', {
    type: 'assumption', category: 'assumption', summary: '假设用户量 < 1000',
  });
  assert.strictEqual(d.type, 'assumption');
  assert.strictEqual(d.status, 'pending');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/devsphere-decisions.test.js`
Expected: FAIL — `Invalid decision type: assumption`。

- [ ] **Step 3: 修改 VALID_TYPES**

`scripts/devsphere-decisions.js:14`：

```js
const VALID_TYPES = ['gated', 'autonomous', 'assumption'];
```

`addDecision` 现有分支对非 gated 一律不要求 options/rationale，`assumption` 自动落入该路径，无需额外改动。`validateDecisionElement` 同理（仅 gated 分支强校验）。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/devsphere-decisions.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/devsphere-decisions.js scripts/test/devsphere-decisions.test.js
git commit -m "feat(design): add assumption decision type (D7)"
```

---

### Task 3: `devsphere-design.js` 基础 helper（sha256 + frontmatter + draftRef）

**Files:**
- Create: `scripts/devsphere-design.js`
- Test: `scripts/test/devsphere-design.test.js`（追加）

**Interfaces:**
- Produces: `sha256File`、`parseDraftFrontmatter`、`readDraftRef`、`progressPath`、stage↔slug 映射常量。

- [ ] **Step 1: 写失败测试**

追加到 `scripts/test/devsphere-design.test.js`：

```js
const {
  sha256File, parseDraftFrontmatter, readDraftRef, progressPath, STAGE_SLUG,
} = require('../devsphere-design');

test('sha256File 返回 sha256: 前缀的 hex', () => {
  const { taskPath } = makeTask();
  const f = path.join(taskPath, 'work', 'tmp.txt');
  fs.writeFileSync(f, 'hello');
  const h = sha256File(f);
  assert.ok(h.startsWith('sha256:'));
  assert.strictEqual(h, 'sha256:' + require('crypto').createHash('sha256').update('hello').digest('hex'));
});

test('parseDraftFrontmatter 读取 artifactId 与 version', () => {
  const { taskPath } = makeTask();
  const f = path.join(taskPath, 'work', 'x.md');
  fs.writeFileSync(f, '---\nartifactId: "BD-1"\nversion: "0.1.0"\n---\n\nbody\n');
  assert.deepStrictEqual(parseDraftFrontmatter(f), { artifactId: 'BD-1', version: '0.1.0' });
});

test('STAGE_SLUG 映射 businessDesign → business-design', () => {
  assert.strictEqual(STAGE_SLUG.businessDesign, 'business-design');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/devsphere-design.test.js`
Expected: FAIL — `Cannot find module '../devsphere-design'`。

- [ ] **Step 3: 实现 devsphere-design.js 基础部分**

`scripts/devsphere-design.js`：

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJSON, writeJSON, readState, writeState } = require('./devsphere-state');

const STAGE_SLUG = {
  businessDesign: 'business-design',
  solutionDesign: 'solution-design',
  implementationDesign: 'implementation-design',
  testDesign: 'test-design',
};

function stageDir(taskPath, stage) {
  return path.join(taskPath, 'work', STAGE_SLUG[stage] || stage);
}

function progressPath(taskPath, stage) {
  return path.join(stageDir(taskPath, stage), 'progress.json');
}

function draftPath(taskPath, stage) {
  return path.join(stageDir(taskPath, stage), 'draft.md');
}

function artifactPath(taskPath, stage) {
  return path.join(taskPath, 'artifacts', `${STAGE_SLUG[stage]}.md`);
}

function gatePath(taskPath, stage) {
  return path.join(taskPath, 'quality-gates', `${STAGE_SLUG[stage]}.json`);
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
}

// 解析 draft/artifact frontmatter 中的 artifactId 与 version。缺失返回 null。
function parseDraftFrontmatter(filePath) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf-8'); } catch (e) { return null; }
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = m[1];
  const idMatch = fm.match(/^artifactId:\s*"?([^"\n]+)"?/m);
  const verMatch = fm.match(/^version:\s*"?([^"\n]+)"?/m);
  if (!idMatch || !verMatch) return null;
  return { artifactId: idMatch[1].trim(), version: verMatch[1].trim() };
}

// 读取当前 draft 引用：{artifactId, version, hash}；draft 不存在或 frontmatter 不全 → null
function readDraftRef(taskPath, stage) {
  const dp = draftPath(taskPath, stage);
  if (!fs.existsSync(dp)) return null;
  const fm = parseDraftFrontmatter(dp);
  if (!fm) return null;
  return { artifactId: fm.artifactId, version: fm.version, hash: sha256File(dp) };
}

module.exports = {
  STAGE_SLUG, stageDir, progressPath, draftPath, artifactPath, gatePath,
  sha256File, parseDraftFrontmatter, readDraftRef,
};
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/devsphere-design.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/devsphere-design.js scripts/test/devsphere-design.test.js
git commit -m "feat(design): add devsphere-design hash/frontmatter helpers"
```

---

### Task 4: `init-stage` 命令 — 初始化 Work 四文件 + progress.json

**Files:**
- Modify: `scripts/devsphere-design.js`（追加 `initStage` + CLI）
- Test: `scripts/test/devsphere-design.test.js`（追加）

**Interfaces:**
- Produces: `initStage(taskPath, stage)` 创建 `work/<slug>/{analysis,discovery,design,draft}.md`（draft 为空骨架带 frontmatter 占位）+ `progress.json`；幂等。

- [ ] **Step 1: 写失败测试**

```js
const { initStage } = require('../devsphere-design');

test('initStage 创建四份 work 文件 + progress.json，幂等', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  const dir = path.join(taskPath, 'work', 'business-design');
  for (const f of ['analysis.md', 'discovery.md', 'design.md', 'draft.md']) {
    assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);
  }
  const prog = JSON.parse(fs.readFileSync(path.join(dir, 'progress.json'), 'utf-8'));
  assert.deepStrictEqual(prog, { step: 'analyze', ready: { analysis: false, discovery: false } });
  // 幂等
  assert.doesNotThrow(() => initStage(taskPath, 'businessDesign'));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/devsphere-design.test.js`
Expected: FAIL — `initStage is not a function`。

- [ ] **Step 3: 实现 initStage**

在 `scripts/devsphere-design.js` 的 helper 之后、`module.exports` 之前插入：

```js
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

const WORK_TEMPLATES = {
  'analysis.md': 'design-work/analysis.md',
  'discovery.md': 'design-work/discovery.md',
  'design.md': 'design-work/design.md',
};

function defaultDraftFrontmatter(taskPath, stage) {
  const state = readState(taskPath) || {};
  const taskId = state.taskId || 'UNKNOWN';
  const idPrefix = { 'business-design': 'BD', 'solution-design': 'SD', 'implementation-design': 'ID', 'test-design': 'TD' }[STAGE_SLUG[stage]] || 'X';
  return `---\nartifactId: "${idPrefix}-${taskId}"\nversion: "0.1.0"\n---\n\n# 待填充 Draft\n`;
}

function initStage(taskPath, stage) {
  if (!STAGE_SLUG[stage]) throw new Error(`Unknown stage: ${stage}`);
  const dir = stageDir(taskPath, stage);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, rel] of Object.entries(WORK_TEMPLATES)) {
    const dest = path.join(dir, name);
    if (!fs.existsSync(dest)) {
      const tpl = path.join(TEMPLATES_DIR, rel);
      const body = fs.existsSync(tpl) ? fs.readFileSync(tpl, 'utf-8') : `# ${name}\n`;
      fs.writeFileSync(dest, body.replace(/\{\{STAGE\}\}/g, STAGE_SLUG[stage]), 'utf-8');
    }
  }
  const dp = path.join(dir, 'draft.md');
  if (!fs.existsSync(dp)) fs.writeFileSync(dp, defaultDraftFrontmatter(taskPath, stage), 'utf-8');
  const pp = progressPath(taskPath, stage);
  if (!fs.existsSync(pp)) {
    writeJSON(pp, { step: 'analyze', ready: { analysis: false, discovery: false } });
  }
  return { dir, progress: pp };
}
```

把 `initStage` 加入 `module.exports`。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/devsphere-design.test.js`
Expected: PASS。

- [ ] **Step 5: 加 CLI 入口**

在 `scripts/devsphere-design.js` 末尾（`module.exports` 之前）加最小 CLI 框架，先支持 `init-stage`：

```js
function main() {
  const [command, ...args] = process.argv.slice(2);
  try {
    switch (command) {
      case 'init-stage': {
        const [taskPath, stage] = args;
        process.stdout.write(JSON.stringify(initStage(taskPath, stage)));
        break;
      }
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        process.exit(1);
    }
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();
```

- [ ] **Step 6: 手测 CLI**

```bash
node scripts/devsphere-design.js init-stage $(mktemp -d)/fake businessDesign
```
Expected: 报错（state.json 不存在导致 readState 返回 null，但 initStage 不应崩；`defaultDraftFrontmatter` 已兜底 taskId）。验证：用 makeTask 同款临时任务跑 `node scripts/devsphere-design.js init-stage <taskPath> businessDesign` 输出 JSON 路径。

- [ ] **Step 7: 提交**

```bash
git add scripts/devsphere-design.js scripts/test/devsphere-design.test.js
git commit -m "feat(design): add init-stage command (work files + progress.json)"
```

---

### Task 5: `mark-ready` 命令（D2 — 结构化 ready 信号）

**Files:**
- Modify: `scripts/devsphere-design.js`（追加 `markReady` + CLI 分支）
- Test: `scripts/test/devsphere-design.test.js`（追加）

**Interfaces:**
- Produces: `markReady(taskPath, stage, which)` 把 `progress.json.ready[which]` 置 true 并推进 `step`；`which ∈ {'analysis','discovery'}`。

- [ ] **Step 1: 写失败测试**

```js
const { markReady } = require('../devsphere-design');

test('markReady analysis 置位并推进 step', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  const prog = JSON.parse(fs.readFileSync(progressPath(taskPath, 'businessDesign'), 'utf-8'));
  assert.strictEqual(prog.ready.analysis, true);
  assert.strictEqual(prog.step, 'discover');
});

test('markReady discovery 置位', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'discovery');
  const prog = JSON.parse(fs.readFileSync(progressPath(taskPath, 'businessDesign'), 'utf-8'));
  assert.strictEqual(prog.ready.discovery, true);
});

test('markReady 拒绝非法 which', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  assert.throws(() => markReady(taskPath, 'businessDesign', 'design'), /which/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/devsphere-design.test.js`
Expected: FAIL — `markReady is not a function`。

- [ ] **Step 3: 实现 markReady**

```js
function markReady(taskPath, stage, which) {
  if (which !== 'analysis' && which !== 'discovery') {
    throw new Error(`which must be analysis|discovery, got: ${which}`);
  }
  const pp = progressPath(taskPath, stage);
  const prog = readJSON(pp) || { step: 'analyze', ready: { analysis: false, discovery: false } };
  prog.ready = prog.ready || { analysis: false, discovery: false };
  prog.ready[which] = true;
  if (which === 'analysis' && prog.step === 'analyze') prog.step = 'discover';
  writeJSON(pp, prog);
  return prog;
}
```

加入 `module.exports`。CLI `main()` 的 switch 增加：

```js
      case 'mark-ready': {
        const [taskPath, stage, which] = args;
        process.stdout.write(JSON.stringify(markReady(taskPath, stage, which)));
        break;
      }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/devsphere-design.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/devsphere-design.js scripts/test/devsphere-design.test.js
git commit -m "feat(design): add mark-ready command (D2 milestone signals)"
```

---

### Task 6: `record-gate` 命令 — 写 quality-gates JSON（绑定 draft hash）

**Files:**
- Modify: `scripts/devsphere-design.js`（追加 `recordGate` + `readGate` + CLI）
- Test: `scripts/test/devsphere-design.test.js`（追加）

**Interfaces:**
- Produces: `recordGate(taskPath, stage, status, checks)` 写 `quality-gates/<slug>.json`，结构 `{draftRef:{artifactId,version,hash}, templateChecks, qualityChecks, status}`；`readGate(taskPath, stage)` 读取。`status ∈ {'pass','warn','fail'}`（D8）。
- Consumes: Task 3 的 `readDraftRef`。

- [ ] **Step 1: 写失败测试**

```js
const { recordGate, readGate } = require('../devsphere-design');

function writeDraft(taskPath, stage, artifactId, version, body = '# draft') {
  const dp = path.join(taskPath, 'work', STAGE_SLUG[stage], 'draft.md');
  fs.writeFileSync(dp, `---\nartifactId: "${artifactId}"\nversion: "${version}"\n---\n\n${body}\n`, 'utf-8');
}

test('recordGate 写入绑定 draft hash 的结果', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0');
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  const g = readGate(taskPath, 'businessDesign');
  assert.strictEqual(g.status, 'pass');
  assert.strictEqual(g.draftRef.version, '0.1.0');
  assert.ok(g.draftRef.hash.startsWith('sha256:'));
});

test('recordGate 拒绝非法 status', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0');
  assert.throws(() => recordGate(taskPath, 'businessDesign', 'requires_human', { templateChecks: [], qualityChecks: [] }), /status/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/devsphere-design.test.js`
Expected: FAIL — `recordGate is not a function`。

- [ ] **Step 3: 实现 recordGate / readGate**

```js
const VALID_GATE_STATUS = ['pass', 'warn', 'fail'];

function readGate(taskPath, stage) {
  return readJSON(gatePath(taskPath, stage));
}

function recordGate(taskPath, stage, status, checks) {
  if (!VALID_GATE_STATUS.includes(status)) {
    throw new Error(`gate status must be pass|warn|fail, got: ${status}`);
  }
  const draftRef = readDraftRef(taskPath, stage);
  if (!draftRef) throw new Error(`No valid draft for stage ${stage}`);
  const result = {
    draftRef,
    templateChecks: (checks && checks.templateChecks) || [],
    qualityChecks: (checks && checks.qualityChecks) || [],
    status,
    recordedAt: new Date().toISOString(),
  };
  writeJSON(gatePath(taskPath, stage), result);
  return result;
}
```

加入 `module.exports`。CLI 增加：

```js
      case 'record-gate': {
        const [taskPath, stage, status, checksJson] = args;
        let checks;
        try { checks = JSON.parse(checksJson); } catch (e) { throw new Error(`Invalid checks JSON: ${e.message}`); }
        process.stdout.write(JSON.stringify(recordGate(taskPath, stage, status, checks)));
        break;
      }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/devsphere-design.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/devsphere-design.js scripts/test/devsphere-design.test.js
git commit -m "feat(design): add record-gate command (hash-bound gate result)"
```

---

### Task 7: `inspect` 命令 — 确定性 Router（核心）

**Files:**
- Modify: `scripts/devsphere-design.js`（追加 `inspect` + CLI）
- Test: `scripts/test/devsphere-design.test.js`（追加，逐分支覆盖）

**Interfaces:**
- Produces: `inspect(taskPath, stage)` → `{stage, milestone, draftRef, gate, review, baseline, pendingGated, nextAction}`。判断优先级见 spec §15：blocked > ask_decision > revise(gate fail / open blocking+apply) > 里程碑推进。
- Consumes: Task 3-6 的 helper；`devsphere-decisions.listGatedPending`；`devsphere-review-matrix.readMatrix`+`getRevisionItems`。

- [ ] **Step 1: 写失败测试 — 逐分支**

```js
const { inspect } = require('../devsphere-design');
const { initDecisions, addDecision } = require('../devsphere-decisions');
const { initMatrix, addIssue, setArtifactStatus } = require('../devsphere-review-matrix');

test('inspect: 无 work → run_stage/analyze', () => {
  const { taskPath } = makeTask();
  // 不调 initStage
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_stage', activity: 'analyze' });
});

test('inspect: analysis 未 ready → run_stage/analyze', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_stage', activity: 'analyze' });
});

test('inspect: analysis ready, discovery 未 ready → run_stage/discover', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_stage', activity: 'discover' });
});

test('inspect: discovery ready, 存在 pending gated → ask_decision', () => {
  const { taskPath, taskId } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', { type: 'gated', category: 'feature_scope', summary: 'q', options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select', rationale: 'r' });
  const na = inspect(taskPath, 'businessDesign').nextAction;
  assert.strictEqual(na.kind, 'ask_decision');
  assert.strictEqual(na.decisions.length, 1);
});

test('inspect: discovery ready, 无 draft → run_stage/design', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_stage', activity: 'design' });
});

test('inspect: draft 存在无 gate → run_gate', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0');
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_gate' });
});

test('inspect: gate fail → run_stage/revise', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0');
  recordGate(taskPath, 'businessDesign', 'fail', { templateChecks: [], qualityChecks: [] });
  const na = inspect(taskPath, 'businessDesign').nextAction;
  assert.strictEqual(na.kind, 'run_stage');
  assert.strictEqual(na.activity, 'revise');
});

test('inspect: gate pass 无 review → run_review', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0');
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_review' });
});

test('inspect: draft hash 改变后旧 gate 失效 → run_gate', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0');
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0', '# changed body'); // hash 变
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_gate' });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/devsphere-design.test.js`
Expected: FAIL — `inspect is not a function`。

- [ ] **Step 3: 实现 inspect**

在 `scripts/devsphere-design.js` 顶部 require 区追加：

```js
const { listGatedPending } = require('./devsphere-decisions');
const { readMatrix, getRevisionItems } = require('./devsphere-review-matrix');
```

实现：

```js
function gateAcceptable(gate, draftRef) {
  if (!gate || !gate.draftRef) return false;
  return gate.draftRef.hash === draftRef.hash && (gate.status === 'pass' || gate.status === 'warn');
}

function reviewAcceptable(matrix, slug, draftRef) {
  if (!matrix || !matrix.artifacts || !matrix.artifacts[slug]) return { complete: false, hasOpenRevision: false };
  const entry = matrix.artifacts[slug];
  const reviewedAtHash = entry.draftRef && entry.draftRef.hash;
  const revisionItems = getRevisionItems(matrix, slug);
  return {
    complete: reviewedAtHash === draftRef.hash && entry.status === 'reviewed' && revisionItems.length === 0,
    hasOpenRevision: reviewedAtHash === draftRef.hash && revisionItems.length > 0,
  };
}

function inspect(taskPath, stage) {
  const slug = STAGE_SLUG[stage];
  if (!slug) return { stage, nextAction: { kind: 'blocked', reason: `Unknown stage: ${stage}` } };

  const pp = progressPath(taskPath, stage);
  const prog = fs.existsSync(pp) ? readJSON(pp) : null;

  // 无 work → analyze
  if (!prog) return { stage, milestone: 'not_started', nextAction: { kind: 'run_stage', activity: 'analyze' } };

  if (!prog.ready || !prog.ready.analysis) {
    return { stage, milestone: 'analysis_ready', nextAction: { kind: 'run_stage', activity: 'analyze' } };
  }
  if (!prog.ready.discovery) {
    return { stage, milestone: 'discovery_ready', nextAction: { kind: 'run_stage', activity: 'discover' } };
  }

  // discovery ready：先看 pending gated decision
  const pendingGated = listGatedPending(taskPath, slug);
  if (pendingGated.length > 0) {
    return { stage, milestone: 'discovery_ready', pendingGated, nextAction: { kind: 'ask_decision', decisions: pendingGated } };
  }

  const draftRef = readDraftRef(taskPath, stage);
  if (!draftRef) {
    return { stage, milestone: 'discovery_ready', nextAction: { kind: 'run_stage', activity: 'design' } };
  }

  const gate = readGate(taskPath, stage);
  // gate fail（且绑定当前 hash）→ revise
  if (gate && gate.draftRef && gate.draftRef.hash === draftRef.hash && gate.status === 'fail') {
    return { stage, milestone: 'drafted', draftRef, gate, nextAction: { kind: 'run_stage', activity: 'revise', reason: 'gate fail' } };
  }
  if (!gateAcceptable(gate, draftRef)) {
    return { stage, milestone: 'drafted', draftRef, nextAction: { kind: 'run_gate' } };
  }

  const matrix = readMatrix(taskPath);
  const rev = reviewAcceptable(matrix, slug, draftRef);
  if (rev.hasOpenRevision) {
    return { stage, milestone: 'validated', draftRef, gate, nextAction: { kind: 'run_stage', activity: 'revise', reason: 'open review items' } };
  }
  if (!rev.complete) {
    return { stage, milestone: 'validated', draftRef, gate, nextAction: { kind: 'run_review' } };
  }

  // review 通过且无 open revision → baseline
  const state = readState(taskPath) || {};
  const baseline = state.stages && state.stages[stage] && state.stages[stage].baseline;
  if (!baseline || baseline.hash !== draftRef.hash) {
    return { stage, milestone: 'reviewed', draftRef, gate, nextAction: { kind: 'baseline' } };
  }
  return { stage, milestone: 'baselined', draftRef, gate, baseline, nextAction: { kind: 'stage_complete' } };
}
```

把 `inspect` 加入 `module.exports`。CLI 增加：

```js
      case 'inspect': {
        const [taskPath, stage] = args;
        process.stdout.write(JSON.stringify(inspect(taskPath, stage), null, 2));
        break;
      }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/devsphere-design.test.js`
Expected: PASS（全部分支）。

- [ ] **Step 5: 提交**

```bash
git add scripts/devsphere-design.js scripts/test/devsphere-design.test.js
git commit -m "feat(design): add inspect router (milestone + nextAction)"
```

---

### Task 8: `publish` 命令 — Draft 原样发布为 Artifact（Baseline）

**Files:**
- Modify: `scripts/devsphere-design.js`（追加 `publish` + CLI）
- Test: `scripts/test/devsphere-design.test.js`（追加）

**Interfaces:**
- Produces: `publish(taskPath, stage)` — 校验 draft/gate/review，原样复制 draft → artifact，校验 hash 一致，写 `state.stages[stage].baseline = {version, hash, inputVersions, approvedAt}`，返回 `{artifactPath, hash, baseline}`。
- Consumes: Task 3/6/7 helper；`devsphere-state.readState/writeState`。

- [ ] **Step 1: 写失败测试**

```js
const { publish } = require('../devsphere-design');

function gateAndReviewPass(taskPath, stage) {
  recordGate(taskPath, stage, 'pass', { templateChecks: [], qualityChecks: [] });
  initMatrix(taskPath);
  setArtifactStatus(taskPath, STAGE_SLUG[stage], 'reviewed');
  // 给 matrix entry 绑定当前 draft hash
  const draftRef = readDraftRef(taskPath, stage);
  const { readMatrix, writeMatrix } = require('../devsphere-review-matrix');
  const m = readMatrix(taskPath);
  m.artifacts[STAGE_SLUG[stage]].draftRef = draftRef;
  m.artifacts[STAGE_SLUG[stage]].status = 'reviewed';
  writeMatrix(taskPath, m);
}

test('publish: 原样复制 draft 到 artifact，hash 一致，写 baseline', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0', '# final body');
  gateAndReviewPass(taskPath, 'businessDesign');
  const res = publish(taskPath, 'businessDesign');
  assert.strictEqual(res.hash, sha256File(artifactPath(taskPath, 'businessDesign')));
  assert.strictEqual(res.hash, sha256File(draftPath(taskPath, 'businessDesign')));
  const state = readState(taskPath);
  // readState 来自 devsphere-state
  assert.strictEqual(state.stages.businessDesign.baseline.version, '0.1.0');
  assert.strictEqual(state.stages.businessDesign.baseline.hash, res.hash);
});

test('publish: gate hash 不匹配 → 拒绝', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0', 'v1');
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0', 'v2'); // hash 变，gate 失效
  assert.throws(() => publish(taskPath, 'businessDesign'), /gate/);
});

test('publish: 存在 open blocking → 拒绝', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0');
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  initMatrix(taskPath);
  addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'se', round: 1, description: 'x' });
  assert.throws(() => publish(taskPath, 'businessDesign'), /blocking|review/i);
});
```

> 注意：测试里 `readState` 指 `require('../devsphere-state').readState`，需在测试文件顶部补 `const { readState } = require('../devsphere-state');`。`artifactPath`/`draftPath`/`sha256File` 已由 Task 3 导出。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test scripts/test/devsphere-design.test.js`
Expected: FAIL — `publish is not a function`。

- [ ] **Step 3: 实现 publish**

```js
function requirementHash(taskPath) {
  const reqPath = path.join(taskPath, 'inputs', 'requirement.md');
  if (!fs.existsSync(reqPath)) return null;
  return sha256File(reqPath);
}

function publish(taskPath, stage) {
  const slug = STAGE_SLUG[stage];
  if (!slug) throw new Error(`Unknown stage: ${stage}`);
  const draftRef = readDraftRef(taskPath, stage);
  if (!draftRef) throw new Error(`No valid draft for stage ${stage}`);

  const gate = readGate(taskPath, stage);
  if (!gateAcceptable(gate, draftRef)) {
    throw new Error(`gate 不通过或 hash 不匹配当前 draft（stage=${stage}）`);
  }

  const matrix = readMatrix(taskPath);
  const rev = reviewAcceptable(matrix, slug, draftRef);
  if (!rev.complete || rev.hasOpenRevision) {
    throw new Error(`review 未完成或存在 open revision（stage=${stage}）`);
  }

  const dp = draftPath(taskPath, stage);
  const ap = artifactPath(taskPath, stage);
  fs.mkdirSync(path.dirname(ap), { recursive: true });
  fs.copyFileSync(dp, ap);
  if (sha256File(ap) !== draftRef.hash) {
    throw new Error('artifact hash 与 draft hash 不一致（复制异常）');
  }

  const state = readState(taskPath);
  if (!state) throw new Error('state.json 不存在');
  state.stages = state.stages || {};
  state.stages[stage] = state.stages[stage] || {};
  const baseline = {
    version: draftRef.version,
    hash: draftRef.hash,
    inputVersions: {},
    approvedAt: new Date().toISOString(),
  };
  const reqHash = requirementHash(taskPath);
  if (reqHash) baseline.inputVersions.requirement = reqHash;
  state.stages[stage].baseline = baseline;
  state.stages[stage].artifact = `artifacts/${slug}.md`;
  writeState(taskPath, state);

  return { artifactPath: ap, hash: draftRef.hash, baseline };
}
```

把 `publish` 加入 `module.exports`。CLI 增加：

```js
      case 'publish': {
        const [taskPath, stage] = args;
        process.stdout.write(JSON.stringify(publish(taskPath, stage)));
        break;
      }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test scripts/test/devsphere-design.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/devsphere-design.js scripts/test/devsphere-design.test.js
git commit -m "feat(design): add publish command (baseline = verbatim draft copy)"
```

---

### Task 9: 改写 `feature-design/SKILL.md` 为生命周期入口

**Files:**
- Modify: `skills/feature-design/SKILL.md`（整体重写，保留 frontmatter name/description，description 改写）

**Interfaces:**
- Consumes: Task 7/8 的 `inspect` / `publish` / `init-stage` / `mark-ready` / `record-gate` CLI。

- [ ] **Step 1: 重写 SKILL.md**

整体替换 `skills/feature-design/SKILL.md` 内容为：

```markdown
---
name: feature-design
description: 设计阶段生命周期入口。在主会话(Design Lead)运行：循环咨询 devsphere-design inspect 拿 nextAction，按动作执行，检查完成标准后重读。不依赖 Agent Teams，不管理长期 Agent。
---

# Feature Design — 设计阶段生命周期入口

你在主会话(Design Lead)运行。**你不自行判断阶段流转或动作选择** —— 一律由确定性 `inspect` 决定。你只负责：读 inspect → 按 nextAction 执行 → 检查完成标准 → 重读 inspect。

## 入口

进入设计阶段第一步：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status ${CLAUDE_PROJECT_DIR} designing
```

随后对当前阶段初始化 Work（幂等）：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js init-stage <taskPath> businessDesign
```
`<taskPath>` 从 `devsphere-state.js read-current-task` + `get-task-path` 取。

## 核心循环

每次循环：
1. `node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js inspect <taskPath> [stage]` → stdout 是一个快照 JSON，关注 `nextAction`。
2. 按 `nextAction.kind` 执行（见下）。
3. 执行后**立即重读 inspect**。

## 按 nextAction.kind 执行

### `run_stage`（activity = analyze | discover | design | revise）
- 加载对应 Stage Skill（如 `scc-dev-sphere:feature-design-business`）按 activity 执行专业工作。
- activity=analyze：完成 analysis.md 后，主会话判断达成完成条件 → `mark-ready <taskPath> <stage> analysis`。
- activity=discover：完成 discovery.md、登记 evidence、记 decision/assumption 后 → `mark-ready <taskPath> <stage> discovery`。
- activity=design：生成/更新 design.md 与 draft.md（draft 完整符合 Artifact 模板）。
- activity=revise：读取 inspect 返回的 revision 来源，统一修订 design.md/draft.md；不跳过 Gate。

### `ask_decision`
- 对 `decisions` **逐项** AskUserQuestion（遵循 `references/interaction-guidelines.md`，按 decision.askMode 选 single_select/multi_select/confirm_gate）。
- 每项 resolve：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-decisions.js resolve <taskPath> <slug> <decision.id> '<resolution json>'
```
- 全部 resolve 后重读 inspect。

### `run_gate`
- 执行 Template Check（`design-template-check`）与 Quality Check（`design-quality-gate`），由主会话按 checklist 判断。
- 结果落盘（status ∈ pass|warn|fail；requires_human 改走 ask_decision）：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js record-gate <taskPath> <stage> <status> '<checks json>'
```
`<checks json>` 形如 `{"templateChecks":[...],"qualityChecks":[...]}`。
- 重读 inspect：fail → revise；pass/warn → run_review。

### `run_review`
- 对当前冻结 Draft（inspect.draftRef）按该 artifact 的评审视角（business-design 仅架构向=SE）派发**一次性 Review Job**（主会话直接执行或派 Research/Review Subagent）。
- Review Job 返回 findings 后，经 review matrix CLI 合并并绑定当前 draft hash：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-review-matrix.js <merge-cmd> <taskPath> <slug> ...
```
- 重读 inspect：open blocking/apply → revise；通过 → baseline。

### `baseline`
- 人工批准（按 workflow mode；strict/collaborative 需 AskUserQuestion confirm_gate）后发布：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js publish <taskPath> <stage>
```
- publish 原样复制 draft → artifact，校验 hash 一致，写 baseline ref。**publish 不修改 draft 内容**；若仍需改，应回到 revise。
- 重读 inspect：→ `stage_complete`。

### `stage_complete` / `blocked`
- `stage_complete`：Batch 1（business）到此停止，报告完成。后续 batch 在此处推进到下一阶段。
- `blocked`：展示 reason，停止，等人工介入。

## 约束

- **不依赖 Agent Teams** —— 不检查 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`，不 bootstrap 设计团队，不 spawn/wake/message 稳定 teammate。
- **不自行写流程状态 / artifact / review matrix / decisions** —— state 只经 `publish`；artifact 只经 `publish`；decisions 只经 CLI；review matrix 只经 review-matrix CLI；gate 只经 `record-gate`。
- **专业推演在主会话完成** —— analysis/discovery/design/draft 由主会话 + Stage Skill 产出；Subagent 仅用于有界 Research/Review。
- **阶段切换卸载上游推演** —— Baseline 后只保留下游所需 Artifact 摘要，不在主会话累积上游 analysis/discovery/design 全文。
```

- [ ] **Step 2: 契约测试 — skill 不再引用 Agent Teams**

仓库已有 `scripts/test/skill-contracts.test.js`。检查它是否断言 feature-design 的 Agent Teams 依赖；若有相关断言，更新为"不依赖 Agent Teams"。先读：

```bash
grep -n "AGENT_TEAMS\|bootstrap\|teammate\|feature-design" scripts/test/skill-contracts.test.js
```

若存在针对 feature-design 的 Agent Teams/teammate 断言，将其改为断言"SKILL.md 不含 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` 与 `design-sa`/`design-se` 等稳定 teammate 名"。若无相关断言，跳过本步。

- [ ] **Step 3: 跑全部测试**

Run: `node --test scripts/test/`
Expected: PASS（含现有回归）。若 `feature-design-router.test.js` 因 router 尚未改造而失败属于预期（router 改造在 Batch 2），记录失败项，但不引入新失败。

- [ ] **Step 4: 提交**

```bash
git add skills/feature-design/SKILL.md scripts/test/skill-contracts.test.js
git commit -m "refactor(design): rewrite feature-design skill as lifecycle entry (no Agent Teams)"
```

---

### Task 10: 端到端验收 — Business 垂直切片主线场景

**Files:**
- Test: `scripts/test/devsphere-design-e2e.test.js`（新建）

**Interfaces:**
- Consumes: Task 1-9 全部能力。

- [ ] **Step 1: 写端到端测试（模拟主线，跳过 AI 内容判断）**

`scripts/test/devsphere-design-e2e.test.js`：

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');
const {
  initStage, markReady, inspect, recordGate, publish,
  draftPath, artifactPath, sha256File, STAGE_SLUG,
} = require('../devsphere-design');
const { initDecisions, addDecision, resolveDecision } = require('../devsphere-decisions');
const { initMatrix, addIssue, closeIssue, readMatrix, writeMatrix } = require('../devsphere-review-matrix');
const { readState } = require('../devsphere-state');

function writeDraft(taskPath, stage, id, ver, body = '# draft') {
  fs.writeFileSync(draftPath(taskPath, stage),
    `---\nartifactId: "${id}"\nversion: "${ver}"\n---\n\n${body}\n`, 'utf-8');
}

test('E2E: business 垂直切片 analyze → ... → baseline，含中断恢复与 hash 失效', () => {
  const { taskPath, taskId } = makeTask();

  // 1. analyze → mark-ready analysis（模拟"中断恢复"：靠 progress.json 还原）
  initStage(taskPath, 'businessDesign');
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_stage', activity: 'analyze' });
  markReady(taskPath, 'businessDesign', 'analysis');

  // 2. discover → 记 pending gated decision → ask_decision
  markReady(taskPath, 'businessDesign', 'discovery');
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', { type: 'gated', category: 'feature_scope', summary: 'q', options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select', rationale: 'r' });
  assert.strictEqual(inspect(taskPath, 'businessDesign').nextAction.kind, 'ask_decision');
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });

  // 3. design → draft 存在 → run_gate
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0');
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_gate' });

  // 4. gate pass → run_review
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_review' });

  // 5. review 产生 blocking → revise
  initMatrix(taskPath);
  addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'se', round: 1, description: '缺验收标准' });
  const draftRef0 = require('../devsphere-design').readDraftRef(taskPath, 'businessDesign');
  let m = readMatrix(taskPath);
  m.artifacts['business-design'].draftRef = draftRef0;
  writeMatrix(taskPath, m);
  assert.strictEqual(inspect(taskPath, 'businessDesign').nextAction.kind, 'run_stage');
  assert.strictEqual(inspect(taskPath, 'businessDesign').nextAction.activity, 'revise');

  // 6. 修订 draft（hash 变）→ 关 blocking → 旧 review 因 hash 失效，需重 gate + 重 review
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0', '# draft with 验收标准');
  // hash 变后 gate 失效
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_gate' });
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  // 重新 review 通过（绑定新 hash）
  const draftRef1 = require('../devsphere-design').readDraftRef(taskPath, 'businessDesign');
  m = readMatrix(taskPath);
  m.artifacts['business-design'].draftRef = draftRef1;
  m.artifacts['business-design'].status = 'reviewed';
  // 关闭旧 blocking（新 hash 下视为已修）
  writeMatrix(taskPath, m);
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'baseline' });

  // 7. baseline → artifact hash == draft hash，state baseline 写入
  publish(taskPath, 'businessDesign');
  assert.strictEqual(sha256File(artifactPath(taskPath, 'businessDesign')), sha256File(draftPath(taskPath, 'businessDesign')));
  const state = readState(taskPath);
  assert.strictEqual(state.stages.businessDesign.baseline.hash, sha256File(draftPath(taskPath, 'businessDesign')));

  // 8. stage_complete
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'stage_complete' });
});
```

- [ ] **Step 2: 跑测试**

Run: `node --test scripts/test/devsphere-design-e2e.test.js`
Expected: PASS。若失败，根据失败点回到对应 Task 修正（最常见：reviewAcceptable 的 status/revisionItems 判定与现有 review-matrix 行为不一致——按 `devsphere-review-matrix.js` 的实际 issue 状态字段对齐）。

- [ ] **Step 3: 跑全量回归**

Run: `node --test scripts/test/`
Expected: 新增测试全 PASS；现有非设计回归不出现新失败（`feature-design-router.test.js` 的失败若仅因 router 未改造，记录为 Batch 2 处理项，不阻塞本批）。

- [ ] **Step 4: 手测 CLI 串联（可选但推荐）**

用真实临时任务手工跑一遍 `init-stage → mark-ready → inspect → record-gate → publish` 命令链，确认 stdout JSON 可读、退出码正确。

- [ ] **Step 5: 提交**

```bash
git add scripts/test/devsphere-design-e2e.test.js
git commit -m "test(design): add business vertical-slice end-to-end acceptance"
```

---

## Self-Review

**1. Spec 覆盖（Batch 1 范围）：**
- D1（主会话推演）→ Task 9 SKILL.md "专业推演在主会话完成" ✓
- D2（progress.json 里程碑）→ Task 4/5/7 ✓
- D7（assumption type）→ Task 2 ✓
- D8（gate pass|warn|fail）→ Task 6 `VALID_GATE_STATUS` ✓
- D9（cursor step 补 revise）→ progress.json step + inspect activity 含 revise ✓
- Work 四文件 + draft ✓（Task 4）
- Draft→Artifact 原样发布 + hash 一致 ✓（Task 8）
- Draft hash 变 → 旧 gate/review 失效 ✓（Task 7 测试 + E2E Step 6）
- 中断恢复 ✓（E2E 靠 progress.json + work 还原，Task 7 inspect 无会话状态）
- 单视角 Review（business=SE）→ Task 9 run_review + E2E（reviewerAgent='se'）✓
- 不启用 Agent Teams → Task 9 SKILL.md 删除依赖 ✓

Batch 1 不覆盖（属 Batch 2/3，符合 spec §8 分批）：多阶段扩展、多视角并行、Integrated、design_change/reopen、删旧 review-state/dispatch。

**2. 占位符扫描：** 无 TBD/TODO；每个 code step 都有完整代码。

**3. 类型/命名一致性：**
- `STAGE_SLUG`、`initStage`、`markReady`、`inspect`、`recordGate`、`readGate`、`publish`、`readDraftRef`、`sha256File`、`progressPath`、`draftPath`、`artifactPath`、`gatePath` 在定义与测试中一致 ✓
- `nextAction.kind` 集合 `run_stage|ask_decision|run_gate|run_review|baseline|stage_complete|blocked` 与 spec §7 一致 ✓
- `run_stage.activity` 含 `analyze|discover|design|revise`（D9）✓
- E2E 里 `readDraftRef` 经 `require('../devsphere-design')` 取——需确认 Task 3 已将其导出（已列入 Task 3 module.exports）✓

**注意点（实现时留意，非阻塞）：**
- `reviewAcceptable` 依赖 `devsphere-review-matrix.js` 的 `getRevisionItems` 与 `entry.status==='reviewed'`、`entry.draftRef.hash`；现有 matrix 是否已有 `draftRef` 字段需在 Task 7 实现时核对，若没有需在 review-matrix 侧补一个绑定 draft hash 的写入路径（Batch 1 单视角可由主会话在 run_review 后直接 `writeMatrix` 写入，如 E2E 所示）。
- `feature-design-router.test.js` 在 Batch 1 后会失败（router 未改）；本批不修，记录为 Batch 2 入口任务。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-18-feature-design-refactor-batch1.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
