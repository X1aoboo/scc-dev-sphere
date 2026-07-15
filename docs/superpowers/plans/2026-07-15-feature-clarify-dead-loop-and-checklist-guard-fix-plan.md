# Feature-Clarify Dead Loop & Checklist Guard Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three interrelated bugs in feature-clarify: dead loop in final confirmation (Phase 8 order), checklist hook blocking sub-agents (CLI mediation), and two contract test failures (missing doc sections).

**Architecture:** Phase 8 reorder breaks the chicken-and-egg deadlock by asking user to confirm BEFORE running checkComplete. Two narrow CLI commands (`confirm-final` / `update-checklist`) replace direct Write/Edit for checklist updates, with the Bash hook exempting the CLI. Reviewer prompt extracted to standalone file for main-session/sub-agent decoupling.

**Tech Stack:** Node.js (scripts), Markdown (skills), Claude Code hooks (guard.js), node:test (testing)

## Global Constraints

- All script changes in `scripts/feature-clarify.js` and `scripts/devsphere-guard.js` must pass existing Node.js test suite
- `feature-clarify.js` `checkComplete()` — no changes (text check retained as defense-in-depth)
- `hooks/hooks.json` — no changes
- `devsphere-guard.js` `checkClarifyChecklistWritesFromStdin` — no changes
- `requirement-checklist.json` template — no changes

---

## File Structure

```
skills/feature-clarify/
├── SKILL.md                    # Modify: Phase 8 reorder, Phase 7b ref, 完成判断原则
├── reviewer-prompt.md           # Create: extracted reviewer sub-agent prompt
├── requirement-checklist.json  # No change
└── requirement.md              # No change

scripts/
├── feature-clarify.js          # Modify: +confirm-final, +update-checklist commands
├── devsphere-guard.js          # Modify: checkClarifyChecklistBashFromStdin exemption
└── test/
    └── feature-clarify.test.js # Modify: +tests for new commands

skills/knowledge-query/
└── SKILL.md                    # Modify: +knowledge-sources.json reference
```

---

### Task 1: Create reviewer-prompt.md

**Files:**
- Create: `skills/feature-clarify/reviewer-prompt.md`

**Interfaces:**
- Consumes: nothing
- Produces: reviewer behavior contract consumed by `feature-clarify/SKILL.md` Phase 7b

- [ ] **Step 1: Create the file**

```markdown
# Reviewer Prompt — 需求澄清评审子 Agent

你是一位需求评审专家。请对照评审清单，逐项检查 `inputs/requirement.md` 的需求质量。

## 评审规则

1. 读取 `reviews/requirement-checklist.json`，对所有 `result: "fail"` 的项进行复检（首轮全量检查）。
2. 逐项对照 requirement.md 内容判断：
   - **pass** — 有明确可验证内容，注明 evidence（如 §2.1）
   - **fail** — 缺少或模糊，注明缺失点
3. 判断依据：
   - 只依据文档实际内容
   - 核心功能必须有行为和结果描述
   - 验收标准必须可操作判断
   - 不得出现「友好、快速、待定、可能」等不可验证措辞
   - Agent 推断未获用户确认的不得视为需求事实

## 更新评审结果

通过 CLI 写入评审结果，不可直接 Write/Edit checklist JSON：

```bash
node scripts/feature-clarify.js update-checklist <taskPath> '<json-payload>'
```

Payload 格式：
```json
{"items": [{"id": "7.1.1", "result": "pass", "evidence": "§2.1", "note": ""}]}
```

## 返回格式

返回 `{passed, failed, summary}` 供主会话分流处理。

## 禁止

- 修改 requirement.md
- 直接 Write/Edit requirement-checklist.json
- 根据自身知识补充需求内容
- 调用 AskUserQuestion（决策由主会话处理）
```

- [ ] **Step 2: Commit**

```bash
git add skills/feature-clarify/reviewer-prompt.md
git commit -m "feat: extract reviewer sub-agent prompt to standalone file"
```

---

### Task 2: Add confirm-final and update-checklist commands to feature-clarify.js

**Files:**
- Modify: `scripts/feature-clarify.js`

**Interfaces:**
- Consumes: `readJSON()` (existing util in file), `ensureDir()` (existing)
- Produces: `confirmFinal(taskPath): {confirmed: boolean}`, `updateChecklist(taskPath, payload): {updated: number}` — both exported via `module.exports` and callable via CLI

- [ ] **Step 1: Add `confirmFinal` function after `readChecklist` (before line 107)**

```javascript
// --- confirmFinal ---

function confirmFinal(taskPath) {
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = readJSON(checklistPath);
  if (!checklist) throw new Error('requirement-checklist.json not found');

  let found = false;
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.8.8') {
        item.result = 'pass';
        item.evidence = '§11 最终确认';
        item.note = '';
        found = true;
        break;
      }
    }
    if (found) break;
  }

  if (!found) throw new Error('checklist item 7.8.8 not found');
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));
  return { confirmed: true };
}
```

- [ ] **Step 2: Add `updateChecklist` function after `confirmFinal`**

```javascript
// --- updateChecklist ---

function updateChecklist(taskPath, payload) {
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('payload.items must be an array');
  }
  for (const item of payload.items) {
    if (!item.id || !item.result) {
      throw new Error(`item missing id or result: ${JSON.stringify(item)}`);
    }
    if (!['pass', 'fail'].includes(item.result)) {
      throw new Error(`invalid result for ${item.id}: ${item.result}`);
    }
  }

  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = readJSON(checklistPath);
  if (!checklist) throw new Error('requirement-checklist.json not found');

  let updated = 0;
  for (const update of payload.items) {
    let found = false;
    for (const cat of checklist.categories) {
      for (const item of cat.items) {
        if (item.id === update.id) {
          item.result = update.result;
          item.evidence = update.evidence || '';
          item.note = update.note || '';
          found = true;
          updated++;
          break;
        }
      }
      if (found) break;
    }
    if (!found) throw new Error(`checklist item not found: ${update.id}`);
  }

  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));
  return { updated };
}
```

- [ ] **Step 3: Add CLI cases in the `switch` block (after `case 'read-checklist':`, before `default:`)**

```javascript
      case 'confirm-final':
        console.log(JSON.stringify(confirmFinal(taskPath)));
        break;
      case 'update-checklist': {
        const payload = JSON.parse(args[1]);
        console.log(JSON.stringify(updateChecklist(taskPath, payload)));
        break;
      }
```

- [ ] **Step 4: Update `module.exports` to export new functions**

Change the export line:
```javascript
module.exports = { init, checkComplete, readChecklist };
```
To:
```javascript
module.exports = { init, checkComplete, readChecklist, confirmFinal, updateChecklist };
```

- [ ] **Step 5: Verify CLI works manually**

```bash
# Setup a test task
TEST_DIR=$(mktemp -d)
mkdir -p "$TEST_DIR/tasks/feature/TEST-001/inputs"
mkdir -p "$TEST_DIR/tasks/feature/TEST-001/reviews"
echo "# test" > "$TEST_DIR/tasks/feature/TEST-001/inputs/requirement.md"
node scripts/feature-clarify.js init "$TEST_DIR/tasks/feature/TEST-001"

# Test confirm-final
node scripts/feature-clarify.js confirm-final "$TEST_DIR/tasks/feature/TEST-001"
# Expected: {"confirmed":true}

# Test update-checklist
node scripts/feature-clarify.js update-checklist "$TEST_DIR/tasks/feature/TEST-001" '{"items":[{"id":"7.1.1","result":"pass","evidence":"test","note":""}]}'
# Expected: {"updated":1}

# Cleanup
rm -rf "$TEST_DIR"
```

- [ ] **Step 6: Commit**

```bash
git add scripts/feature-clarify.js
git commit -m "feat: add confirm-final and update-checklist CLI commands for checklist mediation"
```

---

### Task 3: Add CLI exemption to devsphere-guard.js Bash hook

**Files:**
- Modify: `scripts/devsphere-guard.js:247-262`

**Interfaces:**
- Consumes: `clarifyChecklistPath` (existing, line 228-232)
- Produces: updated `checkClarifyChecklistBashFromStdin` that exempts `feature-clarify.js` CLI calls

- [ ] **Step 1: Replace the guard function body (lines 247-262)**

Replace:
```javascript
function checkClarifyChecklistBashFromStdin(stdinJson) {
  const ti = stdinJson && stdinJson.tool_input;
  if (!ti || typeof ti.command !== 'string') return null;
  const command = ti.command;
  const targetsChecklist = /reviews\/requirement-checklist\.json/.test(command);
  if (!targetsChecklist) return null;
  // 仅评审子 Agent 可操作；但 Bash 层面无法区分调用者身份，
  // 因此统一拒绝所有 Bash 对 checklist 的直接操作
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'requirement-checklist.json 禁止通过 Bash 直接操作；评审子 Agent 使用 Write 工具更新。',
    },
  };
}
```

With:
```javascript
function checkClarifyChecklistBashFromStdin(stdinJson) {
  const ti = stdinJson && stdinJson.tool_input;
  if (!ti || typeof ti.command !== 'string') return null;
  const command = ti.command;
  const targetsChecklist = /reviews\/requirement-checklist\.json/.test(command);
  if (!targetsChecklist) return null;
  // CLI 调用豁免：confirm-final 和 update-checklist 通过 feature-clarify.js 安全写入
  const isClarifyCLI = command.includes('feature-clarify.js update-checklist')
    || command.includes('feature-clarify.js confirm-final');
  if (isClarifyCLI) return null;
  // 其他 Bash 操作 checklist 一律拒绝
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'requirement-checklist.json 禁止通过 Bash 直接操作；评审子 Agent 使用 feature-clarify.js update-checklist，主会话使用 feature-clarify.js confirm-final。',
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/devsphere-guard.js
git commit -m "fix: exempt feature-clarify.js CLI from checklist Bash guard"
```

---

### Task 4: Update feature-clarify/SKILL.md — three changes

**Files:**
- Modify: `skills/feature-clarify/SKILL.md`

**Interfaces:**
- Consumes: `reviewer-prompt.md` (Task 1), `feature-clarify.js confirm-final` (Task 2)
- Produces: corrected Phase 7b, Phase 8, and new 完成判断原则 section

- [ ] **Step 1: Add `完成判断原则` section between Phase 5 and Phase 6 (after line 121, before line 123)**

Insert after the Phase 5 六维度 list:
```markdown
## 完成判断原则

澄清完成的判断标准：
- 核心模糊点全部 resolved，无遗漏高影响 open 项
- 能完整描述至少一条端到端核心用户旅程
- 核心功能的验收标准可操作判断
- 关键业务规则和边界条件已明确
- 用户已确认需求汇总
```

- [ ] **Step 2: Rewrite Phase 7b sub-agent dispatch (lines 135-147)**

Replace the inline instruction block:
```markdown
### 7b. 派发评审子 Agent

通过 `Agent` 工具派发一次性子 Agent（`general-purpose` Task，每次新 Agent），注入 `skills/feature-clarify/reviewer-prompt.md` 行为契约。
```

- [ ] **Step 3: Rewrite Phase 8 (lines 164-179)**

Replace:
```
## 阶段8：最终确认与状态推进

1. **评审循环完整性检查：**
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/feature-clarify.js check-complete <taskPath>
# 返回 { complete: true }
```
- 返回 false → 状态不满足，重新进入阶段7 进行评审循环
- 返回 true → 完整性检查通过，继续下一步

2. 展示需求汇总，用 `confirm_gate` 请求最终确认。

3. 确认后执行状态推进：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status <workspaceRoot> clarified
```
```

With:
````markdown
## 阶段8：最终确认与状态推进

1. 展示需求汇总，用 `confirm_gate` 请求最终确认。用户拒绝时返回阶段3继续澄清。

2. 用户确认后执行：
   a. 将「最终确认」章节写入 `inputs/requirement.md`（追加确认时间戳和确认范围）
   b. 更新 checklist item 7.8.8 为 pass：
   ```bash
   node ${CLAUDE_SKILL_DIR}/../../scripts/feature-clarify.js confirm-final <taskPath>
   ```

3. 执行完整性检查：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/feature-clarify.js check-complete <taskPath>
# 返回 { complete: true }
```
- 返回 false → 状态不满足，重新进入阶段7 进行评审循环（此时 checklist 7.8.8 已 pass，仅剩真正的质量问题）
- 返回 true → 完整性检查通过，继续下一步

4. 推进状态：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status <workspaceRoot> clarified
```
````

- [ ] **Step 4: Verify contract test for `完成判断原则` passes**

```bash
node --test --test-name-pattern="self-judges completeness" scripts/test/skill-contracts.test.js
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add skills/feature-clarify/SKILL.md
git commit -m "fix: reorder Phase 8, reference reviewer-prompt.md, add 完成判断原则"
```

---

### Task 5: Fix knowledge-query/SKILL.md — add knowledge-sources.json reference

**Files:**
- Modify: `skills/knowledge-query/SKILL.md`

**Interfaces:**
- Consumes: nothing
- Produces: `knowledge-sources.json` string present in SKILL.md for contract test

- [ ] **Step 1: Add reference after the mermaid flowchart (after line 37, before `## 配置工作流`)**

Insert after the closing \`\`\` of the mermaid diagram:
```markdown
多数据源默认配置存储在 skill 根目录的 `knowledge-sources.json`，由 `scripts/knowledge-query.js` 管理。
```

- [ ] **Step 2: Verify contract test passes**

```bash
node --test --test-name-pattern="knowledge-query uses multi-source" scripts/test/skill-contracts.test.js
# Expected: PASS
```

- [ ] **Step 3: Commit**

```bash
git add skills/knowledge-query/SKILL.md
git commit -m "fix: add knowledge-sources.json reference to knowledge-query skill"
```

---

### Task 6: Add tests for confirm-final and update-checklist

**Files:**
- Modify: `scripts/test/feature-clarify.test.js`

**Interfaces:**
- Consumes: `confirmFinal`, `updateChecklist` from `feature-clarify.js` (Task 2)
- Produces: test coverage for both new commands

- [ ] **Step 1: Update require to include new exports**

Change line 10:
```javascript
const { init, checkComplete, readChecklist } = require('../feature-clarify');
```
To:
```javascript
const { init, checkComplete, readChecklist, confirmFinal, updateChecklist } = require('../feature-clarify');
```

- [ ] **Step 2: Add `confirmFinal` tests after existing `readChecklist` test (after line 104)**

```javascript
test('confirmFinal sets item 7.8.8 to pass', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-006');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  const result = confirmFinal(taskPath);
  assert.deepStrictEqual(result, { confirmed: true });

  const checklist = JSON.parse(fs.readFileSync(path.join(taskPath, 'reviews', 'requirement-checklist.json'), 'utf8'));
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.8.8') {
        assert.strictEqual(item.result, 'pass');
        assert.strictEqual(item.evidence, '§11 最终确认');
      }
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('confirmFinal throws on missing checklist', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-007');

  assert.throws(() => confirmFinal(taskPath), /requirement-checklist\.json not found/);

  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 3: Add `updateChecklist` tests**

```javascript
test('updateChecklist updates a single item', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-008');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  const result = updateChecklist(taskPath, { items: [{ id: '7.1.1', result: 'pass', evidence: '§2.1', note: '' }] });
  assert.deepStrictEqual(result, { updated: 1 });

  const checklist = JSON.parse(fs.readFileSync(path.join(taskPath, 'reviews', 'requirement-checklist.json'), 'utf8'));
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.1.1') {
        assert.strictEqual(item.result, 'pass');
        assert.strictEqual(item.evidence, '§2.1');
      }
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('updateChecklist updates multiple items', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-009');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  const result = updateChecklist(taskPath, {
    items: [
      { id: '7.1.1', result: 'pass', evidence: 'ok', note: '' },
      { id: '7.1.2', result: 'fail', evidence: '', note: 'missing' },
    ],
  });
  assert.deepStrictEqual(result, { updated: 2 });

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('updateChecklist rejects invalid payload', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-010');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  assert.throws(() => updateChecklist(taskPath, null), /payload\.items must be an array/);
  assert.throws(() => updateChecklist(taskPath, { items: 'not-array' }), /payload\.items must be an array/);
  assert.throws(() => updateChecklist(taskPath, { items: [{ result: 'pass' }] }), /missing id or result/);
  assert.throws(() => updateChecklist(taskPath, { items: [{ id: '7.1.1' }] }), /missing id or result/);
  assert.throws(() => updateChecklist(taskPath, { items: [{ id: '7.1.1', result: 'invalid' }] }), /invalid result/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('updateChecklist rejects missing item id', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-011');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  assert.throws(() => updateChecklist(taskPath, { items: [{ id: '99.99.99', result: 'pass', evidence: '', note: '' }] }), /checklist item not found/);

  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 4: Run all clarify tests**

```bash
node --test scripts/test/feature-clarify.test.js
# Expected: all 11 tests pass (6 existing + 5 new)
```

- [ ] **Step 5: Run full test suite**

```bash
node --test scripts/test/skill-contracts.test.js
node --test scripts/test/feature-clarify.test.js
# Expected: all pass
```

- [ ] **Step 6: Commit**

```bash
git add scripts/test/feature-clarify.test.js
git commit -m "test: add tests for confirm-final and update-checklist commands"
```
