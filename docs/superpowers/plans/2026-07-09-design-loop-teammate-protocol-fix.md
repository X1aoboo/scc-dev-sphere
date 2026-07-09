# 设计循环 teammate 协议 + decisions schema 守卫 修补 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two regressions after Plan C — (1) duplicate SA teammate in scope mode, (2) decisions file written empty / with invented schema that the guard didn't catch — while preserving the agent-teams persistent-teammate (保活) model.

**Architecture:** Two plans. Plan D2 (script/guard, TDD, ship first) — add full-schema validators, switch the PreToolUse guard to validate incoming write content, add a TeammateIdle quality gate. Plan D1 (skill/agent content, scenario verification) — rewrite the feature-design dispatch/resume protocol to capture agentId and resume via SendMessage, eliminating duplicate agents.

**Tech Stack:** Node.js (`node:test` + `node:assert`), no external deps. Scripts dual-use CLI + `require()`.

## Global Constraints

- Preserve agent-teams persistent teammate model — do NOT switch to one-shot subagents.
- Guard must validate INCOMING write content (`tool_input.content` for Write, reconstructed for Edit), not the on-disk file.
- Every decision element must have `type ∈ ['gated','autonomous']`; decisions without `type` are rejected.
- Decisions file top-level must be exactly `{stage, taskId, decisions[]}`; unknown top-level keys rejected.
- `SendMessage` with a string `message` MUST include a `summary` field.
- Same-stage draft MUST resume the scope-round teammate via `SendMessage to=<agentId>`, never re-spawn via Agent tool.
- Existing tests must stay green; net test count only grows.
- `validateDecisionsFile` is the single source of truth for schema, shared by addDecision, the PreToolUse guard, and the TeammateIdle gate.

---

## Plan D2: Script Guard (TDD, ship first)

### Task D2-1: Add `validateDecisionElement` + `validateDecisionsFile` validators; addDecision reuses them

**Files:**
- Modify: `scripts/devsphere-decisions.js` (add validators after line 16 constants block; refactor `addDecision` at lines 50-77)
- Test: `scripts/test/devsphere-decisions.test.js`

**Interfaces:**
- Consumes: `VALID_TYPES`, `VALID_CATEGORIES`, `VALID_ASK_MODES` (existing constants)
- Produces: `validateDecisionElement(d)` (throws on invalid), `validateDecisionsFile(data)` (throws on invalid); both exported

- [ ] **Step 1: Write failing tests**

Append to `scripts/test/devsphere-decisions.test.js`:

```js
// === Plan D2-1: validateDecisionElement / validateDecisionsFile ===

const { validateDecisionElement, validateDecisionsFile } = require('../devsphere-decisions');

function validGatedDecision() {
  return {
    id: 'BD-DEC-001', type: 'gated', category: 'feature_scope', status: 'pending',
    summary: 'q', rationale: 'ctx',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }],
    askMode: 'single_select', recommendation: 'a', resolution: null, evidence: [], impact: '',
  };
}

test('validateDecisionElement: 合法 gated → 不抛', () => {
  assert.doesNotThrow(() => validateDecisionElement(validGatedDecision()));
});

test('validateDecisionElement: 缺 type → 抛', () => {
  const d = validGatedDecision(); delete d.type;
  assert.throws(() => validateDecisionElement(d), /type/);
});

test('validateDecisionElement: 非法 type → 抛', () => {
  const d = validGatedDecision(); d.type = 'maybe';
  assert.throws(() => validateDecisionElement(d), /type/);
});

test('validateDecisionElement: 非法 category → 抛', () => {
  const d = validGatedDecision(); d.category = 'whatever';
  assert.throws(() => validateDecisionElement(d), /category/);
});

test('validateDecisionElement: 缺 summary → 抛', () => {
  const d = validGatedDecision(); d.summary = '';
  assert.throws(() => validateDecisionElement(d), /summary/);
});

test('validateDecisionElement: 非法 status → 抛', () => {
  const d = validGatedDecision(); d.status = 'wonky';
  assert.throws(() => validateDecisionElement(d), /status/);
});

test('validateDecisionElement: autonomous 不要求 options/rationale → 不抛', () => {
  const d = { id: 'X-1', type: 'autonomous', category: 'tradeoff', status: 'pending', summary: '自决' };
  assert.doesNotThrow(() => validateDecisionElement(d));
});

test('validateDecisionElement: gated options 纯字符串 → 抛', () => {
  const d = validGatedDecision(); d.options = ['a', 'b'];
  assert.throws(() => validateDecisionElement(d), /label, description/);
});

test('validateDecisionsFile: 合法 → 不抛', () => {
  assert.doesNotThrow(() => validateDecisionsFile({
    stage: 'businessDesign', taskId: 'FEAT-1', decisions: [validGatedDecision()],
  }));
});

test('validateDecisionsFile: 未知顶层字段 mode → 抛', () => {
  assert.throws(() => validateDecisionsFile({
    stage: 'businessDesign', taskId: 'FEAT-1', decisions: [], mode: 'scope',
  }), /mode/);
});

test('validateDecisionsFile: 未知顶层字段 openQuestions → 抛', () => {
  assert.throws(() => validateDecisionsFile({
    stage: 'businessDesign', taskId: 'FEAT-1', decisions: [], openQuestions: [],
  }), /openQuestions/);
});

test('validateDecisionsFile: 缺 stage → 抛', () => {
  assert.throws(() => validateDecisionsFile({ taskId: 'FEAT-1', decisions: [] }), /stage/);
});

test('validateDecisionsFile: decisions 非数组 → 抛', () => {
  assert.throws(() => validateDecisionsFile({ stage: 's', taskId: 't', decisions: {} }), /decisions/);
});

test('validateDecisionsFile: 元素缺 type → 抛（堵自创 schema）', () => {
  assert.throws(() => validateDecisionsFile({
    stage: 's', taskId: 't',
    decisions: [{ id: 'X', topic: 't', question: 'q', options: [] }],  // 无 type
  }), /type/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node scripts/test/devsphere-decisions.test.js`
Expected: new tests fail (validateDecisionElement/validateDecisionsFile not exported), existing tests still pass.

- [ ] **Step 3: Add the validator functions**

In `scripts/devsphere-decisions.js`, after the `VALID_ASK_MODES` constant (line 16) and before `decisionsPath` (line 18), insert:

```js
const VALID_DECISION_STATUS = ['pending', 'decided'];
const ALLOWED_TOPLEVEL = ['stage', 'taskId', 'decisions'];

// 校验单条 decision（persisted 形态）。不合法 → throw。addDecision 与守卫共用。
function validateDecisionElement(d) {
  if (!d || typeof d !== 'object') throw new Error('decision 必须为对象');
  if (typeof d.id !== 'string' || !d.id.trim()) throw new Error('decision id 必填');
  if (!VALID_TYPES.includes(d.type)) throw new Error(`decision type 非法: ${d.type}`);
  if (!d.category || !VALID_CATEGORIES.includes(d.category)) throw new Error(`decision category 非法: ${d.category}`);
  if (typeof d.summary !== 'string' || !d.summary.trim()) throw new Error('decision summary 必填');
  if (!VALID_DECISION_STATUS.includes(d.status)) throw new Error(`decision status 非法: ${d.status}`);
  if (d.type === 'gated') {
    if (!Array.isArray(d.options) || d.options.length < 2 || d.options.length > 4) {
      throw new Error('gated decision 需 2-4 options');
    }
    for (const opt of d.options) {
      if (typeof opt !== 'object' || opt === null
          || typeof opt.label !== 'string' || !opt.label.trim()
          || typeof opt.description !== 'string' || !opt.description.trim()) {
        throw new Error('gated decision options 元素必须是 {label, description} 非空对象');
      }
    }
    if (!VALID_ASK_MODES.includes(d.askMode)) throw new Error(`gated decision askMode 非法: ${d.askMode}`);
    if (typeof d.rationale !== 'string' || !d.rationale.trim()) {
      throw new Error('gated decision rationale 必填');
    }
  }
}

// 校验整个 decisions 文件结构。不合法 → throw。
function validateDecisionsFile(data) {
  if (!data || typeof data !== 'object') throw new Error('decisions 文件须为对象');
  for (const k of Object.keys(data)) {
    if (!ALLOWED_TOPLEVEL.includes(k)) throw new Error(`decisions 文件未知顶层字段: ${k}`);
  }
  if (typeof data.stage !== 'string' || !data.stage.trim()) throw new Error('decisions 文件 stage 必填');
  if (typeof data.taskId !== 'string' || !data.taskId.trim()) throw new Error('decisions 文件 taskId 必填');
  if (!Array.isArray(data.decisions)) throw new Error('decisions 文件 decisions 须为数组');
  for (const d of data.decisions) validateDecisionElement(d);
}
```

- [ ] **Step 4: Make addDecision reuse validateDecisionElement**

In `scripts/devsphere-decisions.js`, after the `decision` object is constructed and pushed (the `data.decisions.push(decision);` line), add a re-validation before write:

```js
  data.decisions.push(decision);
  validateDecisionElement(decision); // 双保险：persisted 形态再校验一次
  writeDecisions(taskPath, slug, data);
```

(Find the existing `data.decisions.push(decision);` line in `addDecision` and insert the `validateDecisionElement(decision);` call immediately after it, before `writeDecisions`.)

- [ ] **Step 5: Export the new functions**

Update `module.exports` at the end of `scripts/devsphere-decisions.js`. Add `validateDecisionElement`, `validateDecisionsFile` to the exported object.

- [ ] **Step 6: Run tests to verify they pass**

Run: `node scripts/test/devsphere-decisions.test.js`
Expected: ALL pass (existing + 15 new).

- [ ] **Step 7: Commit**

```bash
git add scripts/devsphere-decisions.js scripts/test/devsphere-decisions.test.js
git commit -m "feat(decisions): add validateDecisionElement/validateDecisionsFile full-schema validators; addDecision reuses"
```

---

### Task D2-2: Guard validates incoming write content (RC2) + full schema (RC3)

**Files:**
- Modify: `scripts/devsphere-guard.js` (lines 133-187: `checkDecisionsFormat`, `checkDecisionsFormatFromStdin`)
- Test: `scripts/test/devsphere-guard-decisions.test.js`

**Interfaces:**
- Consumes: `validateDecisionsFile` from `devsphere-decisions` (Task D2-1)
- Produces: `validateDecisionsContent(content)` → `{allow, reason}`; `checkDecisionsFormatFromStdin` now validates incoming content

- [ ] **Step 1: Add import of validateDecisionsFile**

In `scripts/devsphere-guard.js` line 7, change:
```js
const { resolveMainArtifact, countGatedPending, readDecisions, decisionsPath, SLUG_PREFIX } = require('./devsphere-decisions');
```
to:
```js
const { resolveMainArtifact, countGatedPending, readDecisions, decisionsPath, SLUG_PREFIX, validateDecisionsFile } = require('./devsphere-decisions');
```

- [ ] **Step 2: Write failing tests**

Append to `scripts/test/devsphere-guard-decisions.test.js`:

```js
// === Plan D2-2: checkDecisionsFormatFromStdin validates INCOMING content ===

test('stdin-format: Write 合法 content → null（放行）', () => {
  const content = JSON.stringify({
    stage: 'businessDesign', taskId: 'FEAT-1',
    decisions: [{ id: 'BD-DEC-001', type: 'gated', category: 'feature_scope', status: 'pending', summary: 'q', rationale: 'ctx', options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select' }],
  });
  const stdin = { tool_input: { file_path: '/x/decisions/business-design-decisions.json', content } };
  assert.strictEqual(checkDecisionsFormatFromStdin(stdin), null);
});

test('stdin-format: Write 自创 schema（无 type）→ deny', () => {
  const content = JSON.stringify({
    stage: 'businessDesign', taskId: 'FEAT-1', mode: 'scope',
    decisions: [{ id: 'DEC-BD-001', topic: 't', question: 'q', options: [] }],
  });
  const stdin = { tool_input: { file_path: '/x/decisions/business-design-decisions.json', content } };
  const r = checkDecisionsFormatFromStdin(stdin);
  assert.ok(r);
  assert.strictEqual(r.hookSpecificOutput.permissionDecision, 'deny');
});

test('stdin-format: Write 未知顶层字段 openQuestions → deny', () => {
  const content = JSON.stringify({ stage: 's', taskId: 't', decisions: [], openQuestions: [] });
  const stdin = { tool_input: { file_path: '/x/decisions/business-design-decisions.json', content } };
  const r = checkDecisionsFormatFromStdin(stdin);
  assert.ok(r);
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /openQuestions/);
});

test('stdin-format: Write 空 content → deny（解析失败）', () => {
  const stdin = { tool_input: { file_path: '/x/decisions/business-design-decisions.json', content: '' } };
  const r = checkDecisionsFormatFromStdin(stdin);
  assert.ok(r);
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /解析失败/);
});

test('stdin-format: Write 到非 decisions 路径 → null（放行）', () => {
  const stdin = { tool_input: { file_path: '/x/artifacts/business-design.md', content: 'whatever' } };
  assert.strictEqual(checkDecisionsFormatFromStdin(stdin), null);
});

test('stdin-format: Write 到 decisions/ 但非 .json → deny', () => {
  const stdin = { tool_input: { file_path: '/x/decisions/D-001.md', content: '# md' } };
  const r = checkDecisionsFormatFromStdin(stdin);
  assert.ok(r);
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /JSON/);
});

test('stdin-format: 无 tool_input → null', () => {
  assert.strictEqual(checkDecisionsFormatFromStdin({}), null);
});

test('stdin-format: tool_input 无 file_path → null', () => {
  assert.strictEqual(checkDecisionsFormatFromStdin({ tool_input: { content: '{}' } }), null);
});

test('stdin-format: Edit 用 new_string 重建校验 → deny（重建后非法）', () => {
  const { taskPath } = makeTask();
  const dir = path.join(taskPath, 'decisions');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, 'business-design-decisions.json');
  // 磁盘上是合法文件
  fs.writeFileSync(fp, JSON.stringify({ stage: 'businessDesign', taskId: 'FEAT-1', decisions: [] }));
  // Edit 把 decisions 数组替换成非法（无 type）
  const stdin = {
    tool_input: {
      file_path: fp,
      old_string: '"decisions": []',
      new_string: '"decisions": [{ "id": "X", "topic": "t" }]',
    },
  };
  const r = checkDecisionsFormatFromStdin(stdin);
  assert.ok(r);
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /type/);
});

test('stdin-format: 校验 incoming content 而非磁盘（磁盘空但 content 合法 → 放行）', () => {
  const { taskPath } = makeTask();
  const dir = path.join(taskPath, 'decisions');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, 'business-design-decisions.json');
  fs.writeFileSync(fp, ''); // 磁盘空文件
  const content = JSON.stringify({ stage: 'businessDesign', taskId: 'FEAT-1', decisions: [] });
  const stdin = { tool_input: { file_path: fp, content } };
  assert.strictEqual(checkDecisionsFormatFromStdin(stdin), null); // 放行：校验 incoming content
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node scripts/test/devsphere-guard-decisions.test.js`
Expected: new tests fail (checkDecisionsFormatFromStdin still reads disk). Existing format tests (which call `checkDecisionsFormat(filePath)` directly) still pass.

- [ ] **Step 4: Add `validateDecisionsContent` helper + rewrite the two functions**

In `scripts/devsphere-guard.js`, replace lines 133-187 (the `checkDecisionsFormat` and `checkDecisionsFormatFromStdin` functions) with:

```js
// 校验一段 decisions JSON 文本内容。返回 {allow, reason}。
function validateDecisionsContent(content) {
  let data;
  try { data = JSON.parse(content); }
  catch (e) {
    return { allow: false, reason: `decisions JSON 解析失败: ${e.message}` };
  }
  try { validateDecisionsFile(data); }
  catch (e) {
    return { allow: false, reason: e.message };
  }
  return { allow: true };
}

// 校验 decisions/ 目录下某磁盘文件（用于 TeammateIdle 路径）。
function checkDecisionsFormat(filePath) {
  const norm = (filePath || '').replace(/\\/g, '/');
  if (!/\/decisions\//.test(norm)) return { allow: true };
  const fileName = norm.split('/').pop();
  if (!fileName.endsWith('.json')) {
    return { allow: false, reason: `decisions 目录只允许 JSON 文件，发现非 JSON 文件: ${fileName}` };
  }
  let content;
  try { content = fs.readFileSync(filePath, 'utf-8'); }
  catch (e) { return { allow: true }; } // 读不到（如新建中）→ 放行
  return validateDecisionsContent(content);
}

// PreToolUse：校验【正在写入的内容】，不是磁盘内容（RC2 修复）。
function checkDecisionsFormatFromStdin(stdinJson) {
  const ti = stdinJson && stdinJson.tool_input;
  if (!ti) return null;
  const filePath = ti.file_path;
  if (!filePath) return null;

  const norm = filePath.replace(/\\/g, '/');
  if (!/\/decisions\//.test(norm)) return null; // 非 decisions 路径，放行
  const fileName = norm.split('/').pop();
  if (!fileName.endsWith('.json')) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `decisions 目录只允许 JSON 文件，发现非 JSON 文件: ${fileName}`,
      },
    };
  }

  // 取「将要写入的内容」
  let content;
  if (typeof ti.content === 'string') {
    content = ti.content; // Write
  } else if (typeof ti.new_string === 'string') {
    // Edit：读磁盘原文，应用 old_string→new_string 重建
    let disk;
    try { disk = fs.readFileSync(filePath, 'utf-8'); }
    catch (e) { return null; } // 读不到磁盘无法重建，放行（Edit 本身会失败）
    content = disk.split(ti.old_string).join(ti.new_string);
  } else {
    return null; // 无内容可校验
  }

  const r = validateDecisionsContent(content);
  if (r.allow) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: r.reason,
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node scripts/test/devsphere-guard-decisions.test.js`
Expected: ALL pass (existing 28 + 10 new = 38).

- [ ] **Step 6: Commit**

```bash
git add scripts/devsphere-guard.js scripts/test/devsphere-guard-decisions.test.js
git commit -m "fix(guard): validate incoming write content + full schema — close empty-file/invented-schema holes"
```

---

### Task D2-3: Add `check-teammate-decisions` TeammateIdle gate (D4)

**Files:**
- Modify: `scripts/devsphere-guard.js` (add function + CLI case)
- Test: `scripts/test/devsphere-guard-decisions.test.js`

**Interfaces:**
- Consumes: `getTaskPath` (existing), `validateDecisionsContent` (Task D2-2)
- Produces: `checkTeammateDecisions(workspaceRoot)` → `{ok:boolean, file?, reason?}`; CLI `check-teammate-decisions`

- [ ] **Step 1: Write failing tests**

Append to `scripts/test/devsphere-guard-decisions.test.js`:

```js
// === Plan D2-3: checkTeammateDecisions (TeammateIdle gate) ===

const { checkTeammateDecisions } = require('../devsphere-guard');

test('teammate-idle: 无活跃任务 → {ok:true}', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-ti-'));
  const r = checkTeammateDecisions(tmpRoot);
  assert.strictEqual(r.ok, true);
});

test('teammate-idle: 有任务但无 decisions 目录 → {ok:true}', () => {
  const { workspaceRoot } = makeTask();
  const r = checkTeammateDecisions(workspaceRoot);
  assert.strictEqual(r.ok, true);
});

test('teammate-idle: decisions 文件全部合法 → {ok:true}', () => {
  const { workspaceRoot, taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q', rationale: 'ctx',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  const r = checkTeammateDecisions(workspaceRoot);
  assert.strictEqual(r.ok, true);
});

test('teammate-idle: decisions 文件非法（空内容）→ {ok:false}', () => {
  const { workspaceRoot, taskPath } = makeTask();
  const dir = path.join(taskPath, 'decisions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'business-design-decisions.json'), '');
  const r = checkTeammateDecisions(workspaceRoot);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /解析失败/);
});

test('teammate-idle: decisions 文件自创 schema（无 type）→ {ok:false}', () => {
  const { workspaceRoot, taskPath } = makeTask();
  const dir = path.join(taskPath, 'decisions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'business-design-decisions.json'), JSON.stringify({
    stage: 'businessDesign', taskId: 'X', mode: 'scope',
    decisions: [{ id: 'D1', topic: 't', options: [] }],
  }));
  const r = checkTeammateDecisions(workspaceRoot);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /type|mode/);
});

test('teammate-idle: 非法文件名 .json 之外的 .md 被忽略（只扫 .json）→ {ok:true}', () => {
  const { workspaceRoot, taskPath } = makeTask();
  const dir = path.join(taskPath, 'decisions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'D-001.md'), '# bogus');
  const r = checkTeammateDecisions(workspaceRoot);
  assert.strictEqual(r.ok, true);
});
```

(Add `const os = require('os');` to the test file's requires if not already present — check the top of the file; `os` is used by the no-active-task test.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node scripts/test/devsphere-guard-decisions.test.js`
Expected: new tests fail (checkTeammateDecisions not exported).

- [ ] **Step 3: Implement `checkTeammateDecisions` + CLI**

In `scripts/devsphere-guard.js`, add this function after `checkDecisionsFormatFromStdin`:

```js
// TeammateIdle 质量门：活跃任务下所有 decisions/*.json 必须 schema 合法。
// 返回 {ok:true} 或 {ok:false, file, reason}。CLI 据此 exit 2（回喂 stderr，teammate 继续）。
function checkTeammateDecisions(workspaceRoot) {
  const taskPath = getTaskPath(workspaceRoot);
  if (!taskPath) return { ok: true };
  const decisionsDir = path.join(taskPath, 'decisions');
  if (!fs.existsSync(decisionsDir)) return { ok: true };
  let files;
  try { files = fs.readdirSync(decisionsDir).filter(f => f.endsWith('.json')); }
  catch (e) { return { ok: true }; }
  for (const f of files) {
    const full = path.join(decisionsDir, f);
    let content;
    try { content = fs.readFileSync(full, 'utf-8'); }
    catch (e) { continue; }
    const r = validateDecisionsContent(content);
    if (!r.allow) {
      return { ok: false, file: f, reason: r.reason };
    }
  }
  return { ok: true };
}
```

Add a CLI case in `main()` switch (after the `check-decisions-format` case, before `default`):

```js
      case 'check-teammate-decisions': {
        const r = checkTeammateDecisions(workspaceRoot);
        if (!r.ok) {
          process.stderr.write(`decisions 校验失败（${r.file}）: ${r.reason}\n`);
          process.exit(2);
        }
        process.exit(0);
        break;
      }
```

Update `module.exports` to add `checkTeammateDecisions`:

```js
module.exports = { checkImplementEntry, checkApproveEntry, checkStateAdvance, hasActiveTask, decideWrite, checkDecisionsResolvedFromStdin, slugToStage, checkDecisionsFormat, checkDecisionsFormatFromStdin, validateDecisionsContent, checkTeammateDecisions };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node scripts/test/devsphere-guard-decisions.test.js`
Expected: ALL pass (38 + 6 new = 44).

- [ ] **Step 5: Commit**

```bash
git add scripts/devsphere-guard.js scripts/test/devsphere-guard-decisions.test.js
git commit -m "feat(guard): add check-teammate-decisions TeammateIdle quality gate"
```

---

### Task D2-4: Wire TeammateIdle hook + run full suite

**Files:**
- Modify: `hooks/hooks.json`

- [ ] **Step 1: Add TeammateIdle entry**

In `hooks/hooks.json`, add a `TeammateIdle` block after the `PreToolUse` block (which closes at the `]` after the two check-decisions entries). Insert before the `PostToolUse` block:

```json
    "TeammateIdle": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-teammate-decisions \"${CLAUDE_PROJECT_DIR}\""
          }
        ]
      }
    ],
```

Note: `TeammateIdle` ignores any `matcher` field (per docs), so omit it. Use `${CLAUDE_PLUGIN_ROOT}/..` as the workspace root — the same pattern the existing `PostToolUse` (`sync-artifact`) hook uses to resolve the user's project root (where `.devsphere/` lives).

- [ ] **Step 2: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf-8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3: Run full test suite**

Run:
```bash
node scripts/test/devsphere-decisions.test.js && node scripts/test/devsphere-decisions-resolve.test.js && node scripts/test/devsphere-guard-decisions.test.js && node scripts/test/feature-workflow-decisions.test.js && node scripts/test/design-loop-resolver.test.js
```
Expected: ALL pass.

- [ ] **Step 4: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat(hooks): wire TeammateIdle check-teammate-decisions quality gate"
```

---

## Plan D1: Skill/Agent Content Layer (scenario verification; depends on D2)

### Task D1-1: Rewrite feature-design SKILL dispatch/resume protocol

**Files:**
- Modify: `skills/feature-design/SKILL.md` (步骤2 dispatch table rows for `dispatch_agent` scope/draft; 约束 section)

- [ ] **Step 1: Rewrite the `dispatch_agent (scope)` row**

In `skills/feature-design/SKILL.md`, find the 步骤2 table row:

```
| `dispatch_agent` (mode=`scope`) | 用 Agent tool 派发 `action.agent` 为 teammate，prompt 指明：跑 `action.skill` 的 **scope 模式**、stage=`action.stage`、**humanGated**=`action.humanGated`、只写 decisions 不碰主产物。完成后到步骤3。 |
```

Replace with:

```
| `dispatch_agent` (mode=`scope`) | **轮1（出土决策）。** 用 Agent tool 派发 `action.agent` 为 teammate（后台），prompt 指明：跑 `action.skill` 的 **scope 模式**、stage=`action.stage`、**humanGated**=`action.humanGated`、只写 decisions 不碰主产物、**完成后发完成消息给 lead**。派发后**从 Agent 返回结果捕获 `agentId`**，按 stage 记入主会话上下文（如 `agentId[businessDesign]=<id>`）。**然后等待 teammate 自动推送的完成消息**——禁止轮询、禁止派第二个 Agent 去查、禁止派"check"agent（teammate 完成时消息自动送达 lead）。收到完成消息后到步骤3。 |
```

- [ ] **Step 2: Rewrite the `dispatch_agent (draft)` row**

Find the row:

```
| `dispatch_agent` (mode=`draft`) | 派发 `action.agent` 跑 **draft 模式**：读 decisions 的 resolution、按 skill 写主产物。**若 `action.requiresReReview===true`：draft 完成后不要直接回步骤1**——先执行一次 `dispatch_reviewers`：用 `action.reviewers` 派发评审者跑 `feature-review`，待 review-matrix 更新后再回步骤1。否则到步骤3。 |
```

Replace with:

```
| `dispatch_agent` (mode=`draft`) | **轮2（基于决议定稿），须恢复轮1 的同一 teammate 实例（保活上下文）。** 先查主会话是否持有该 stage 的 `agentId`。**持有** → 用 `SendMessage` 恢复：`to=<agentId>`、`message`=决议内容+draft 指令、**`summary`=<短摘要>（必填，否则报错）**。**绝不重新 Agent 派发**——恢复同一实例以保留轮1 分析上下文。**未持有**（如 `/resume` 后 in-process teammate 未恢复）→ 降级：重新 Agent 派发 draft（fresh 上下文），并在输出提示「teammate 未保活，draft 以 fresh 上下文重跑」。draft 完成后等 teammate 完成消息。**若 `action.requiresReReview===true`：draft 完成后不要直接回步骤1**——先执行一次 `dispatch_reviewers`（见下行），待 review-matrix 更新后再回步骤1。否则到步骤3。 |
```

- [ ] **Step 3: Add hard rules to the 约束 section**

In `skills/feature-design/SKILL.md`, find the `## 约束` section. Add these two bullets (after the existing "revise 后必须先 re-review" bullet):

```
- **【teammate 保活】同一 stage 的 draft 必须用 scope 轮捕获的 `agentId` 经 `SendMessage` 恢复，不得重新 Agent 派发**（保活上下文 + 防重复实例）。
- **【禁轮询/禁重复派发】scope 派发后只等 teammate 自动推送的完成消息，不得派任何"检查/查询/催促"agent**——teammate 完成时消息自动送达 lead，无需轮询。`SendMessage` 的 `message` 为字符串时**必须带 `summary` 字段**。
```

- [ ] **Step 4: Verify no stale "Agent tool 派发" for draft remains**

Run: `grep -n "重新 Agent 派发\|SendMessage\|agentId" skills/feature-design/SKILL.md`
Expected: the new protocol text appears; draft no longer says to re-spawn.

- [ ] **Step 5: Commit**

```bash
git add skills/feature-design/SKILL.md
git commit -m "feat(skill): feature-design teammate dispatch/resume protocol — capture agentId, SendMessage resume, no duplicate agents"
```

---

### Task D1-2: workflow SKILL note + teammate-design-protocol completion message

**Files:**
- Modify: `skills/workflow/SKILL.md` (feature-design delegation paragraph)
- Modify: `references/teammate-design-protocol.md` (scope/draft completion message)

- [ ] **Step 1: Add agentId note to workflow SKILL**

In `skills/workflow/SKILL.md`, find the feature-design special-case paragraph (the one starting "特别地，如果 `nextAction.skill === 'feature-design'`"). Append one sentence at its end:

```
agentId 在 feature-design 自身上下文内跨 resolver 迭代持有（scope 轮捕获、draft 轮 SendMessage 恢复同一 teammate），workflow 不介入 teammate 生命周期管理。
```

- [ ] **Step 2: Strengthen completion message in teammate-design-protocol.md**

In `references/teammate-design-protocol.md`, find the scope 模式 bullet ending with "发消息给 lead：「gated 决策就绪，N 项待决」". Replace that whole scope 模式 last bullet with:

```
- 写完 decisions 即停当轮。绝不写主产物、绝不擅自编答案。**完成后必须发一条明确完成消息给 lead**（格式：「✅ <stage> scope 完成：N 项 gated 决策已写入 `<slug>-decisions.json`，待 lead 代问」）——此消息是 lead 推进的唯一触发，无此消息 lead 不推进。
```

Find the draft 模式 bullet ending with "写完主产物即停当轮。" Replace with:

```
- 按 design skill 产出完整主产物，所有 gated 项必须按 resolution 落实。写完即停当轮，**发完成消息给 lead**（格式：「✅ <stage> draft 完成：主产物 `<slug>.md` 已写入」）。
```

- [ ] **Step 3: Commit**

```bash
git add skills/workflow/SKILL.md references/teammate-design-protocol.md
git commit -m "docs(skill): workflow agentId note + teammate completion-message contract"
```

---

### Task D1-3: Update CLAUDE.md + original spec docs

**Files:**
- Modify: `CLAUDE.md` (设计阶段决策循环 section)
- Modify: `docs/superpowers/specs/2026-07-09-design-stage-decision-loop-design.md` (§4.4)

- [ ] **Step 1: Update CLAUDE.md design-loop section**

In `CLAUDE.md`, find the 「设计阶段决策循环」 section's PreToolUse 双守卫 paragraph (the one listing `check-decisions-resolved` and `check-decisions-format`). After that paragraph, add a new paragraph:

```
TeammateIdle 质量门（`devsphere-guard.js check-teammate-decisions`）：teammate 报告完成（idle）前，校验活跃任务下所有 decisions/*.json schema 合法；非法则 exit 2 回喂 stderr，强制 teammate 继续（SA 写不出非法文件就报不了完成）。

teammate 保活协议：scope 轮捕获 agentId，draft 轮经 `SendMessage to=<agentId>` 恢复同一实例（保留轮1 分析上下文）；禁止重新 Agent 派发、禁止轮询/派检查 agent。见 `skills/feature-design/SKILL.md`。
```

- [ ] **Step 2: Update original spec §4.4**

In `docs/superpowers/specs/2026-07-09-design-stage-decision-loop-design.md`, find §4.4 (the guard section). Append a note:

```
**补充（2026-07-09）：** PreToolUse `check-decisions-format` 改为校验 incoming 写入内容（Write `tool_input.content` / Edit 重建），完整 schema 校验（`validateDecisionsFile`：拒绝无 type 的 decision、拒绝未知顶层字段）。新增 TeammateIdle 质量门 `check-teammate-decisions` 作 teammate 路径兜底。teammate 派发协议：scope 捕获 agentId → draft 经 SendMessage 恢复同一实例，详见 `docs/superpowers/specs/2026-07-09-design-loop-teammate-protocol-fix.md`。
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-07-09-design-stage-decision-loop-design.md
git commit -m "docs: CLAUDE.md + spec §4.4 — TeammateIdle gate + teammate保活 protocol"
```

---

## Execution Order

1. **Plan D2 first** (Tasks D2-1 → D2-4): deterministic, TDD, independently testable. Ship before D1 — the guard must reject invented schemas before the skill protocol matters.
2. **Plan D1 second** (Tasks D1-1 → D1-2): content layer; depends on D2's guard contract. Verified by scenario, not unit tests.
