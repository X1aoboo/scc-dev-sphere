# 决策输出链路修补 + Agent 文件合并 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the decision format drift (SA writes Markdown, system needs JSON) via guard + validation tighten, and consolidate duplicated agent protocol sections into shared reference files.

**Architecture:** Two independent plans. Plan C1 (script/guard, TDD) — add `checkDecisionsFormat` guard function + tighten `addDecision` validation, both rejecting plain-string options and empty rationale. Plan C2 (content, scenario verification) — create 3 shared reference files replacing duplicated sections in 6 agent files, expand field specs in README.

**Tech Stack:** Node.js (`node:test` + `node:assert`), no external dependencies. Scripts are dual-use CLI + `require()`.

## Global Constraints

- Guard must fail-closed: corrupt JSON → deny, not allow.
- Guard only enforces under `decisions/` directory; non-decisions paths pass through.
- `options` shape enforcement: every option must be `{label: string, description: string}` — both non-empty.
- `rationale` required for `gated` type decisions.
- Agent files must NOT duplicate protocol text — reference only.
- CIE/DEV do NOT reference `teammate-design-protocol.md` (they are pure reviewers, not stage owners).
- Existing tests must stay green — both validation tighten AND new tests.
- All decisions validation applies to both `addDecision` (script) and `checkDecisionsFormat` (guard, disk re-check).

---

## Plan C1: Script Guard (TDD, independently shippable)

### Task C1-1: Tighten `addDecision` validation — options shape + rationale required

**Files:**
- Modify: `scripts/devsphere-decisions.js:50-67`
- Test: `scripts/test/devsphere-decisions.test.js`

**Interfaces:**
- Consumes: `addDecision(taskPath, slug, input)` existing signature, `VALID_TYPES`, `VALID_CATEGORIES`, `VALID_ASK_MODES`
- Produces: `addDecision` throws on (a) gated decision with options elements that aren't `{label, description}` objects, (b) gated decision with empty/missing `rationale`

- [ ] **Step 1: Write failing tests**

Append to `scripts/test/devsphere-decisions.test.js`:

```js
// === Fix: options shape + rationale validation ===

test('addDecision gated 拒绝纯字符串 options', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(
    () => addDecision(taskPath, 'business-design', {
      type: 'gated', category: 'feature_scope', summary: 'q',
      options: ['仅字符串A', '仅字符串B'], // 不是 {label, description}
      askMode: 'single_select',
    }),
    /option/
  );
});

test('addDecision gated 拒绝 option 缺 label', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(
    () => addDecision(taskPath, 'business-design', {
      type: 'gated', category: 'feature_scope', summary: 'q',
      options: [{ description: '无label的选项' }, { label: 'b', description: 'y' }],
      askMode: 'single_select',
    }),
    /option/
  );
});

test('addDecision gated 拒绝 option 缺 description', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(
    () => addDecision(taskPath, 'business-design', {
      type: 'gated', category: 'feature_scope', summary: 'q',
      options: [{ label: 'a', description: '' }, { label: 'b', description: 'y' }],
      askMode: 'single_select',
    }),
    /option/
  );
});

test('addDecision gated 拒绝空 rationale（缺失/空串/空白）', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  // 短缺
  assert.throws(
    () => addDecision(taskPath, 'business-design', {
      type: 'gated', category: 'feature_scope', summary: 'q',
      options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }],
      askMode: 'single_select',
      // rationale 缺失
    }),
    /rationale/
  );
});

test('addDecision gated 拒绝空白 rationale', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(
    () => addDecision(taskPath, 'business-design', {
      type: 'gated', category: 'feature_scope', summary: 'q',
      options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }],
      askMode: 'single_select',
      rationale: '',
    }),
    /rationale/
  );
});

test('addDecision autonomous 不需要 rationale（非空不校验）', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  // autonomous 类型没 rationale 应该正常
  const d = addDecision(taskPath, 'business-design', {
    type: 'autonomous', category: 'tradeoff', summary: '自决项',
  });
  assert.strictEqual(d.status, 'pending');
});

test('addDecision gated 合法选项（{label,description}对象 + rationale 存在）→ 通过', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  const d = addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: '合法gated',
    options: [{ label: '选项A', description: 'A的详细解释，足够支撑用户独立判断' }, { label: '选项B', description: 'B的详细解释' }],
    askMode: 'single_select',
    rationale: '从knowledge-query发现...不确定点...若不决策的后果',
  });
  assert.strictEqual(d.status, 'pending');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node scripts/test/devsphere-decisions.test.js`
Expected: 5 new failures (options shape errors + rationale errors), existing tests still pass

- [ ] **Step 3: Implement validation in `addDecision`**

Replace the gated validation block in `addDecision` (lines 60-67 in `devsphere-decisions.js`):

```js
  if (input.type === 'gated') {
    if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 4) {
      throw new Error('gated decision requires 2-4 options');
    }
    for (const opt of input.options) {
      if (typeof opt !== 'object' || opt === null
          || typeof opt.label !== 'string' || !opt.label.trim()
          || typeof opt.description !== 'string' || !opt.description.trim()) {
        throw new Error('gated decision options must be {label, description} objects with non-empty strings');
      }
    }
    if (!VALID_ASK_MODES.includes(input.askMode)) {
      throw new Error(`Invalid askMode: ${input.askMode}`);
    }
    if (typeof input.rationale !== 'string' || !input.rationale.trim()) {
      throw new Error('rationale is required for gated decisions');
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node scripts/test/devsphere-decisions.test.js`
Expected: ALL tests pass (including the 7 new ones)

- [ ] **Step 5: Commit**

```bash
git add scripts/devsphere-decisions.js scripts/test/devsphere-decisions.test.js
git commit -m "feat(decisions): tighten addDecision validation — options {label,description} shape + rationale required"
```

---

### Task C1-2: Add `checkDecisionsFormat` guard function + CLI

**Files:**
- Modify: `scripts/devsphere-guard.js:1-220`
- Test: `scripts/test/devsphere-guard-decisions.test.js`

**Interfaces:**
- Consumes: `decisionsPath`, `readDecisions`, `SLUG_PREFIX` from `devsphere-decisions.js`; `path`, `fs`
- Produces: `checkDecisionsFormat(filePath)` → `{allow:boolean, reason?:string}`; `checkDecisionsFormatFromStdin(stdinJson)` → `null | {hookSpecificOutput}`; CLI `check-decisions-format`

- [ ] **Step 1: Import dependencies at top of guard.js**

Add to the existing `require` block at line 6-7 of `devsphere-guard.js`:

```js
const { resolveMainArtifact, countGatedPending, readDecisions, decisionsPath, SLUG_PREFIX } = require('./devsphere-decisions');
```

Note: `SLUG_PREFIX` is new in the import — add it to the existing destructure on line 7. The current line is:
```js
const { resolveMainArtifact, countGatedPending, readDecisions } = require('./devsphere-decisions');
```
Change to:
```js
const { resolveMainArtifact, countGatedPending, readDecisions, decisionsPath, SLUG_PREFIX } = require('./devsphere-decisions');
```

- [ ] **Step 2: Write failing tests**

Append to `scripts/test/devsphere-guard-decisions.test.js`:

```js
// === C1: checkDecisionsFormat tests ===

const { checkDecisionsFormat } = require('../devsphere-guard');
const path = require('path');

function decisionsFilePath(taskPath, slug) {
  return path.join(taskPath, 'decisions', `${slug}-decisions.json`);
}

test('format: 非 decisions 目录 → 放行', () => {
  const { taskPath } = makeTask();
  const r = checkDecisionsFormat(path.join(taskPath, 'artifacts', 'business-design.md'));
  assert.strictEqual(r.allow, true);
});

test('format: decisions 目录下 .md 文件 → 拒绝', () => {
  const { taskPath } = makeTask();
  const mdFile = path.join(taskPath, 'decisions', 'D-001-test.md');
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  fs.writeFileSync(mdFile, '# test');
  const r = checkDecisionsFormat(mdFile);
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /JSON/);
});

test('format: decisions 目录下 .txt 文件 → 拒绝', () => {
  const { taskPath } = makeTask();
  const txtFile = path.join(taskPath, 'decisions', 'notes.txt');
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  fs.writeFileSync(txtFile, 'notes');
  const r = checkDecisionsFormat(txtFile);
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /JSON/);
});

test('format: decisions JSON 损坏 → 拒绝', () => {
  const { taskPath } = makeTask();
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  const jf = decisionsFilePath(taskPath, 'business-design');
  fs.writeFileSync(jf, '{ not valid json');
  const r = checkDecisionsFormat(jf);
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /JSON/);
});

test('format: decisions JSON 但 options 为纯字符串 → 拒绝', () => {
  const { taskPath } = makeTask();
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  const jf = decisionsFilePath(taskPath, 'business-design');
  fs.writeFileSync(jf, JSON.stringify({
    stage: 'businessDesign', taskId: 'FEAT-001',
    decisions: [{ id: 'BD-DEC-001', type: 'gated', status: 'pending', category: 'feature_scope', summary: 'q', options: ['strA', 'strB'], rationale: 'ok' }],
  }));
  const r = checkDecisionsFormat(jf);
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /{label, description}/);
});

test('format: decisions JSON options 缺 description → 拒绝', () => {
  const { taskPath } = makeTask();
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  const jf = decisionsFilePath(taskPath, 'business-design');
  fs.writeFileSync(jf, JSON.stringify({
    stage: 'businessDesign', taskId: 'FEAT-001',
    decisions: [{ id: 'BD-DEC-001', type: 'gated', status: 'pending', category: 'feature_scope', summary: 'q', options: [{ label: 'a' }, { label: 'b', description: 'y' }], rationale: 'ok' }],
  }));
  const r = checkDecisionsFormat(jf);
  assert.strictEqual(r.allow, false);
});

test('format: decisions JSON gated 缺 rationale → 拒绝', () => {
  const { taskPath } = makeTask();
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  const jf = decisionsFilePath(taskPath, 'business-design');
  fs.writeFileSync(jf, JSON.stringify({
    stage: 'businessDesign', taskId: 'FEAT-001',
    decisions: [{ id: 'BD-DEC-001', type: 'gated', status: 'pending', category: 'feature_scope', summary: 'q', options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }] }],
  }));
  const r = checkDecisionsFormat(jf);
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /rationale/);
});

test('format: 合法 decisions JSON（options {label,description} + rationale）→ 放行', () => {
  const { taskPath } = makeTask();
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  const jf = decisionsFilePath(taskPath, 'business-design');
  fs.writeFileSync(jf, JSON.stringify({
    stage: 'businessDesign', taskId: 'FEAT-001',
    decisions: [{ id: 'BD-DEC-001', type: 'gated', status: 'pending', category: 'feature_scope', summary: 'q', options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], rationale: '从查询发现...不确定点...若不决策', askMode: 'single_select' }],
  }));
  const r = checkDecisionsFormat(jf);
  assert.strictEqual(r.allow, true);
});

test('format: decisions JSON 空 decisions 数组 → 放行', () => {
  const { taskPath } = makeTask();
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  const jf = decisionsFilePath(taskPath, 'business-design');
  fs.writeFileSync(jf, JSON.stringify({ stage: 'businessDesign', taskId: 'FEAT-001', decisions: [] }));
  const r = checkDecisionsFormat(jf);
  assert.strictEqual(r.allow, true);
});

test('format: decisions JSON autonomous 不需要 rationale/options → 放行', () => {
  const { taskPath } = makeTask();
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  const jf = decisionsFilePath(taskPath, 'business-design');
  fs.writeFileSync(jf, JSON.stringify({
    stage: 'businessDesign', taskId: 'FEAT-001',
    decisions: [{ id: 'BD-DEC-001', type: 'autonomous', status: 'pending', category: 'tradeoff', summary: '自决', options: [], rationale: '' }],
  }));
  const r = checkDecisionsFormat(jf);
  assert.strictEqual(r.allow, true);
});
```

- [ ] **Step 3: Run tests to verify fails**

Run: `node scripts/test/devsphere-guard-decisions.test.js`
Expected: 10 new failures (checkDecisionsFormat not defined), existing tests still pass

- [ ] **Step 4: Implement `checkDecisionsFormat` + CLI handler**

Add after the `checkDecisionsResolvedFromStdin` function (after line 131) in `devsphere-guard.js`:

```js
// 校验 decisions/ 目录下的文件格式：只允许 <slug>-decisions.json，且
// gated decision 的 options 必须是 {label, description} 对象、rationale 必填。
function checkDecisionsFormat(filePath) {
  const norm = (filePath || '').replace(/\\/g, '/');
  // 仅匹配 decisions/ 目录
  if (!/\/decisions\//.test(norm)) return { allow: true };

  const fileName = norm.split('/').pop();
  // 拒绝非 JSON 文件
  if (!fileName.endsWith('.json')) {
    return { allow: false, reason: `decisions 目录只允许 JSON 文件，发现非 JSON 文件: ${fileName}` };
  }

  // 读取并校验 JSON 内容
  let data;
  try { data = JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch (e) {
    return { allow: false, reason: `decisions JSON 解析失败: ${e.message}` };
  }

  if (!data || !Array.isArray(data.decisions)) return { allow: true };

  for (const d of data.decisions) {
    if (d.type !== 'gated') continue;
    if (!Array.isArray(d.options)) continue;

    // 每个 option 必须是 {label, description} 对象
    for (const opt of d.options) {
      if (typeof opt !== 'object' || opt === null
          || typeof opt.label !== 'string' || !opt.label.trim()
          || typeof opt.description !== 'string' || !opt.description.trim()) {
        return { allow: false, reason: `decisions 文件中 "${d.id || '?'}" 的 options 元素必须是 {label, description} 对象，且字符串非空` };
      }
    }
    // gated 必须有 rationale
    if (typeof d.rationale !== 'string' || !d.rationale.trim()) {
      return { allow: false, reason: `decisions 文件中 gated 决策 "${d.id || '?'}" 缺少 rationale（必填）` };
    }
  }
  return { allow: true };
}

function checkDecisionsFormatFromStdin(stdinJson) {
  const filePath = stdinJson && stdinJson.tool_input && stdinJson.tool_input.file_path;
  if (!filePath) return null;
  const d = checkDecisionsFormat(filePath);
  if (d.allow) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: d.reason,
    },
  };
}
```

Add CLI entry in `main()` switch (alongside `check-decisions-resolved`):

```js
case 'check-decisions-format': {
  let stdinJson = null;
  try {
    stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8'));
  } catch (e) {
    process.exit(0);
  }
  const decision = checkDecisionsFormatFromStdin(stdinJson);
  if (decision) {
    process.stdout.write(JSON.stringify(decision));
    process.exit(0);
  }
  process.exit(0);
  break;
}
```

Update `module.exports`:

```js
module.exports = { checkImplementEntry, checkApproveEntry, checkStateAdvance, hasActiveTask, decideWrite, checkDecisionsResolvedFromStdin, slugToStage, checkDecisionsFormat, checkDecisionsFormatFromStdin };
```

- [ ] **Step 5: Run tests to verify passes**

Run: `node scripts/test/devsphere-guard-decisions.test.js`
Expected: ALL tests pass (existing 17 + 10 new = 27)

- [ ] **Step 6: Commit**

```bash
git add scripts/devsphere-guard.js scripts/test/devsphere-guard-decisions.test.js
git commit -m "feat(guard): add check-decisions-format — reject non-JSON/plain-string-options/empty-rationale in decisions/"
```

---

### Task C1-3: Wire `hooks.json` + run full test suite

**Files:**
- Modify: `hooks/hooks.json:22-32`

**Interfaces:**
- Consumes: Existing PreToolUse hook structure
- Produces: New PreToolUse entry for `check-decisions-format`

- [ ] **Step 1: Add PreToolUse hook entry**

Insert after the existing `check-decisions-resolved` PreToolUse block (after line 32 close-brace in hooks.json). The current PreToolUse block ends at line 32; add a comma and new entry:

```json
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-decisions-resolved"
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-decisions-format"
          }
        ]
      }
    ],
```

Note: The first entry already exists; add the second entry after it.

- [ ] **Step 2: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf-8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3: Run full test suite**

Run: `node scripts/test/devsphere-decisions.test.js && node scripts/test/devsphere-decisions-resolve.test.js && node scripts/test/devsphere-guard-decisions.test.js && node scripts/test/feature-workflow-decisions.test.js && node scripts/test/design-loop-resolver.test.js`
Expected: ALL tests pass, 61+17 new = 78+

- [ ] **Step 4: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat(hooks): wire check-decisions-format PreToolUse guard for decisions/ dir"
```

---

## Plan C2: Content Layer (scenario verification, depends on C1)

### Task C2-1: Create 3 shared reference files

**Files:**
- Create: `references/teammate-design-protocol.md`
- Create: `references/teammate-boundary.md`
- Create: `references/teammate-review-backflow.md`

**Interfaces:**
- Produces: Three reference files referenced by agent markdown files via relative links (`../references/teammate-*.md`)

- [ ] **Step 1: Create `references/teammate-design-protocol.md`**

```markdown
# Teammate 设计循环协议

SA/SE/MDE/TSE 阶段 owner agent 的设计阶段 teammate 交互协议。

## scope 模式（出土决策）

- 按 design skill 做上游分析：调 `knowledge-query` 查受影响领域知识 → 拆功能点候选 → 识别所有不确定/待采纳假设。
- 据派发 prompt 的 `humanGated` 标志落 `decisions/<slug>-decisions.json`：
  - `humanGated=true`：每个需用户拍板的点写成 `type=gated` decision。
  - `humanGated=false`：写成 `type=autonomous`（自决，不进闸口）。
- **写完 decisions 即停当轮。绝不写主产物、绝不擅自编答案。** 发消息给 lead：「gated 决策就绪，N 项待决」。

## draft 模式（基于决议定稿）

- 读 `decisions/<slug>-decisions.json` 的 `resolution`（lead 已逐项问过用户）。
- 按 design skill 产出完整主产物，所有 gated 项必须按 `resolution` 落实。
- 写完主产物即停当轮。

## 硬契约

- 不确定 → gated decision，不臆测。
- scope 不碰主产物；draft 不改 decisions 的 `resolution`。
- 违约时 PreToolUse 守卫会拦下主产物写入。

## decisions 脚本命令

初始化 decisions 文件：
```bash
node scripts/devsphere-decisions.js init <taskPath> <slug> <taskId> <stage>
```

添加一条 gated decision：
```bash
node scripts/devsphere-decisions.js add <taskPath> <slug> '{"type":"gated","category":"feature_scope","summary":"一句话","rationale":"从 knowledge-query 发现 → 不确定点 → 若不决策的后果","options":[{"label":"选项A","description":"A的具体含义、取舍、适用场景"},{"label":"选项B","description":"B的具体含义、取舍、适用场景"}],"recommendation":"选项A","askMode":"single_select","evidence":["EV-xxx"],"impact":"对下游阶段的影响"}'
```

gated decision 字段规范见 `templates/decisions/README.md`。每个 option 必须是 `{label, description}` 对象，`label` 简洁（≤25字）、`description` 详细——足够支撑用户独立做出判断。`rationale` 必填：从 knowledge-query 发现 → 不确定点 → 若不决策的后果。

## 相关文件

- 边界规范：`references/teammate-boundary.md`
- 评审回流：`references/teammate-review-backflow.md`
- 字段规范：`templates/decisions/README.md`
```

- [ ] **Step 2: Create `references/teammate-boundary.md`**

```markdown
# Teammate 边界规范

所有 scc-dev-sphere agent（SA/SE/MDE/TSE/DEV/CIE）作为 teammate 时的通用边界。

## AskUserQuestion 不可用

你是 teammate，**不直接面对用户、不调用 AskUserQuestion**（该工具仅 team-lead / 主会话可用）。

## 需要用户决策时

- 设计阶段 owner → 写 gated decision（见 `references/teammate-design-protocol.md`）
- 评审者 → 提 blocking item 回流给阶段 owner（见 `references/teammate-review-backflow.md`）
- 你为 gated decision 选择 `askMode`，按以下语义（lead 会据此构造 AskUserQuestion）：
  - `single_select`：互斥单选（如功能点取舍）
  - `confirm_gate`：高风险闸口确认（两选项确认式）
  - `multi_select`：非互斥多选
```

- [ ] **Step 3: Create `references/teammate-review-backflow.md`**

```markdown
# 评审回流约定

所有 scc-dev-sphere agent 在评审者角色下的交互约定。与 `references/teammate-boundary.md` 配合使用。

## blocking → revise → ask 回路

评审中发现「需用户决策」的点：

1. **提为 blocking issue**（通过 `feature-review` + review-matrix），不自行决定。
2. **回流给阶段 owner**：owner 在 revise 轮将其补为 gated decision，进 ask 循环（lead 代问用户）。
3. **决策创作权始终在阶段 owner**：评审者提供风险评估和依据，但不替 owner 做决策。

## 评审时仍遵守 teammate 边界

评审发现不确定/需用户拍板的点 → blocking item → 回流。评审者不直接向用户提问。
```

- [ ] **Step 4: Verify files are readable and well-formed**

```bash
cat references/teammate-design-protocol.md references/teammate-boundary.md references/teammate-review-backflow.md | wc -l
```
Expected: > 0 lines, no errors.

- [ ] **Step 5: Commit**

```bash
git add references/teammate-design-protocol.md references/teammate-boundary.md references/teammate-review-backflow.md
git commit -m "docs(references): add shared teammate protocol, boundary, and review-backflow reference files"
```

---

### Task C2-2: Replace duplicated protocol sections in 6 agent files

**Files:**
- Modify: `agents/sa.md:38-72`
- Modify: `agents/se.md:38-69`
- Modify: `agents/mde.md:29-62`
- Modify: `agents/tse.md:29-62`
- Modify: `agents/cie.md:33-40`
- Modify: `agents/dev.md:33-40`

**Interfaces:**
- Consumes: 3 new reference files from Task C2-1
- Produces: Each agent file replaces its protocol+interaction sections with reference lines

- [ ] **Step 1: Replace SA protocol sections**

Replace lines 38-72 in `agents/sa.md` (from `## teammate 交互协议` through end of `## 人机交互规范` section):

**Old content to remove** — everything from line 38 `## teammate 交互协议（设计阶段决策循环）` through line 72 (end of askMode list).

Replace with:

```markdown
## teammate 交互协议

- 设计循环：见 [references/teammate-design-protocol.md](../references/teammate-design-protocol.md)
- 边界规范：见 [references/teammate-boundary.md](../references/teammate-boundary.md)

## 评审约定

见 [references/teammate-review-backflow.md](../references/teammate-review-backflow.md)
```

- [ ] **Step 2: Replace SE protocol sections**

Same replacement as SA — lines 38-69 in `agents/se.md`. The exact old text is identical to SA (same scope/draft/hard-contract/askMode blocks). Replace with the same 3-line reference block from Step 1.

- [ ] **Step 3: Replace MDE protocol sections**

Same replacement — lines 29-62 in `agents/mde.md`. Replace with the same 3-line reference block from Step 1.

- [ ] **Step 4: Replace TSE protocol sections**

Same replacement — lines 29-62 in `agents/tse.md`. Replace with the same 3-line reference block from Step 1.

- [ ] **Step 5: Replace CIE protocol sections**

Replace lines 33-40 in `agents/cie.md` (from `## 评审回流约定（设计阶段决策循环）` through end of `## 人机交互规范` section):

```markdown
## teammate 交互协议

- 边界规范：见 [references/teammate-boundary.md](../references/teammate-boundary.md)
- 评审回流：见 [references/teammate-review-backflow.md](../references/teammate-review-backflow.md)
```

- [ ] **Step 6: Replace DEV protocol sections**

Replace lines 33-40 in `agents/dev.md`. Same as CIE — replace with the same 2-line reference block from Step 5.

- [ ] **Step 7: Verify no stale text remains**

Run:
```bash
grep -n "scope 模式\|draft 模式\|硬契约\|你不直接面对用户\|人机交互规范\|评审回流约定" agents/*.md
```
Expected: ZERO matches (all stale duplication removed). Only the reference lines should remain.

- [ ] **Step 8: Commit**

```bash
git add agents/sa.md agents/se.md agents/mde.md agents/tse.md agents/cie.md agents/dev.md
git commit -m "refactor(agents): replace duplicated protocol sections with shared reference links"
```

---

### Task C2-3: Expand `templates/decisions/README.md` field specs

**Files:**
- Modify: `templates/decisions/README.md`

**Interfaces:**
- Consumes: N/A
- Produces: Updated field table with rationale/options[].description requirements

- [ ] **Step 1: Update README.md field table**

Replace the existing field table in `templates/decisions/README.md`:

Old (lines 3-18):
```
每条 decision 的结构...
| 字段 | 说明 |
...
| rationale | 背景与依据（含 EV 引用），知识沉淀用 |
| options | gated 必填，2-4 项 {label, description} |
...
```

Replace the `rationale` row and `options` row with expanded specs:

```markdown
| rationale | **gated 必填。** 从 knowledge-query 发现 → 不确定点 → 若不决策的后果。用户看 AskUserQuestion 时这就是决策背景；信息不足 = 用户判断失准。 |
| options | gated 必填，2-4 项 `{label: string, description: string}`。`label` 简短（≤25字），对应 AskUserQuestion 选项标题；`description` 详细——解释该选项的具体含义、取舍代价、适用场景，足够支撑用户做出独立判断。纯字符串选项被脚本校验拒绝。 |
```

- [ ] **Step 2: Verify no stale field descriptions remain**

```bash
grep "background" templates/decisions/README.md
```
Expected: no match for old vague descriptions.

- [ ] **Step 3: Commit**

```bash
git add templates/decisions/README.md
git commit -m "docs(templates): expand decisions README — rationale required, options {label,description} spec"
```

---

### Task C2-4: Update CLAUDE.md references

**Files:**
- Modify: `CLAUDE.md:83-100`

**Interfaces:**
- Consumes: N/A
- Produces: Updated CLAUDE.md reflecting guard layer and reference file structure

- [ ] **Step 1: Update the design loop section**

In `CLAUDE.md`, replace the last paragraph of the 设计阶段决策循环 section (line 98-100):

**Old:**
```
PreToolUse 守卫（`hooks/hooks.json` → `devsphere-guard.js check-decisions-resolved`）stage-aware 强制：gated 未 resolved 时阶段 owner 写不出主产物（auto-design 与非门禁阶段放行）。

决策内容持久化在 `decisions/<slug>-decisions.json`（双用途：闸口 + 知识沉淀）。编排由 `feature-design` skill（主会话执行）消费 resolver；agent teammate 协议见 `agents/*.md`。
```

**New:**
```
PreToolUse 双守卫：
- `check-decisions-resolved`：stage-aware 强制，gated 未 resolved 时阶段 owner 写不出主产物（auto-design 与非门禁阶段放行）。
- `check-decisions-format`：强制 decisions/ 目录只含合法 JSON，拒绝 .md/.txt 等非 JSON 文件，拒绝 options 纯字符串、拒绝 gated 缺 rationale。

决策内容持久化在 `decisions/<slug>-decisions.json`（双用途：闸口 + 知识沉淀）。编排由 `feature-design` skill（主会话执行）消费 resolver；agent teammate 协议见 `references/teammate-design-protocol.md`、`references/teammate-boundary.md`、`references/teammate-review-backflow.md`（各 agent 文件通过引用行加载，避免散弹式修改）。
```

- [ ] **Step 2: Verify CLAUDE.md still reads coherently**

```bash
grep -A 8 "### 设计阶段决策循环" CLAUDE.md
```
Expected: updated text with double guard + reference file mentions.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): reflect double guard + shared reference file structure in design loop section"
```

---

## Execution Order

1. **Plan C1 first** (Tasks C1-1 → C1-2 → C1-3): Script/guard changes are TDD, deterministic, independently testable. Ship before C2.
2. **Plan C2 second** (Tasks C2-1 → C2-2 → C2-3 → C2-4): Content layer depends on C1's guard being in place for scenario verification.
