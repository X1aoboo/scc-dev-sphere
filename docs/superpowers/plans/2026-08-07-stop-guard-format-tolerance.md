# Stop Guard Format Tolerance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Design Reviewer stop guard tolerant of markdown emphasis syntax, full-width punctuation, and case variations in `last_assistant_message` so weak models don't get stuck in a block loop.

**Architecture:** Add a `normalizeReviewerMessage()` preprocessing function in `devsphere-guard.js` that strips markdown emphasis (`**`, `__`, `*`, `_`), converts full-width colons and spaces to half-width, then apply existing regexes with the `i` flag on the normalized message.

**Tech Stack:** Node.js, `node:test` / `node:assert`

## Global Constraints

- Only `scripts/devsphere-guard.js` and its tests change — no agent prompt or CLI changes
- Markdown stripping uses paired backreference regex `([*_]{1,2})(.+?)\1` — must not strip single stray `*` used as list bullets
- `normalizeReviewerMessage` must be exported in `module.exports` for test access
- `DESIGN_TYPE_KEYS.includes(target)` stays unchanged — spelling variants are out of scope

---

### Task 1: Add normalizeReviewerMessage and wire it into checkDesignReviewerStop

**Files:**
- Modify: `scripts/devsphere-guard.js` (add function near line 80, after `normalized`; modify `checkDesignReviewerStop` at lines 151, 154, 161; add to exports at line 207-213)
- Test: `scripts/test/feature-design-skill-first.test.js` (add tests after line 848)

**Interfaces:**
- Consumes: `input.last_assistant_message` (string) in `checkDesignReviewerStop`
- Produces: `normalizeReviewerMessage(message: string): string` — exported from `devsphere-guard.js`

- [ ] **Step 1: Write the failing tests**

Add the import of `normalizeReviewerMessage` to the existing require from `../devsphere-guard`:

```js
const { checkDesignReviewerStop, normalizeReviewerMessage } = require('../devsphere-guard');
```

Add these unit tests for `normalizeReviewerMessage` after the existing `design-reviewer SubagentStop still allows failure returns` test (after line 848):

```js
test('normalizeReviewerMessage strips markdown emphasis syntax', () => {
  assert.strictEqual(normalizeReviewerMessage('**Design type**: businessDesign'), 'Design type: businessDesign');
  assert.strictEqual(normalizeReviewerMessage('*Design type*: businessDesign'), 'Design type: businessDesign');
  assert.strictEqual(normalizeReviewerMessage('__Design type__: businessDesign'), 'Design type: businessDesign');
  assert.strictEqual(normalizeReviewerMessage('_Design type_: businessDesign'), 'Design type: businessDesign');
});

test('normalizeReviewerMessage normalizes full-width punctuation and spaces', () => {
  assert.strictEqual(normalizeReviewerMessage('Design type： businessDesign'), 'Design type: businessDesign');
  assert.strictEqual(normalizeReviewerMessage('Design　type: businessDesign'), 'Design type: businessDesign');
});

test('normalizeReviewerMessage preserves single asterisks used as list bullets', () => {
  assert.strictEqual(normalizeReviewerMessage('- *item*'), '- item');
  assert.strictEqual(normalizeReviewerMessage('- item'), '- item');
});
```

Add these integration tests for `checkDesignReviewerStop` with format variants:

```js
test('design-reviewer SubagentStop tolerates markdown emphasis in Design type field', () => {
  const { workspaceRoot, taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  const input = {
    agent_type: 'scc-dev-sphere:design-reviewer',
    cwd: workspaceRoot,
    last_assistant_message: '# Design Review\n\n- **Design type**: businessDesign\n- Result: pass',
  };
  assert.strictEqual(checkDesignReviewerStop(input), null);
});

test('design-reviewer SubagentStop tolerates full-width colon in Design type field', () => {
  const { workspaceRoot, taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  const input = {
    agent_type: 'scc-dev-sphere:design-reviewer',
    cwd: workspaceRoot,
    last_assistant_message: '# Design Review\n\n- Design type： businessDesign\n- Result: pass',
  };
  assert.strictEqual(checkDesignReviewerStop(input), null);
});

test('design-reviewer SubagentStop tolerates case-insensitive Design type field', () => {
  const { workspaceRoot, taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  const input = {
    agent_type: 'scc-dev-sphere:design-reviewer',
    cwd: workspaceRoot,
    last_assistant_message: '# Design Review\n\n- design type: businessDesign\n- Result: pass',
  };
  assert.strictEqual(checkDesignReviewerStop(input), null);
});

test('design-reviewer SubagentStop tolerates markdown emphasis in Failure heading', () => {
  const { workspaceRoot, taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  const input = {
    agent_type: 'scc-dev-sphere:design-reviewer',
    cwd: workspaceRoot,
    last_assistant_message: '# **Design Review Failure**\n\n- Design type: businessDesign\n- Reason: missing inputs',
  };
  assert.strictEqual(checkDesignReviewerStop(input), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/test/feature-design-skill-first.test.js`

Expected: The new `normalizeReviewerMessage` tests fail with "normalizeReviewerMessage is not a function" and the integration tests fail because the format variants are not recognized.

- [ ] **Step 3: Implement normalizeReviewerMessage**

In `scripts/devsphere-guard.js`, add the function after the existing `normalized` function (after line 81):

```js
function normalizeReviewerMessage(message) {
  return message
    // 剥离 markdown 强调语法：**bold**, __bold__, *italic*, _italic_
    .replace(/([*_]{1,2})(.+?)\1/g, '$2')
    // 全角冒号 → 半角冒号
    .replace(/：/g, ':')
    // 全角空格（U+3000）→ 半角空格
    .replace(/　/g, ' ');
}
```

- [ ] **Step 4: Wire normalizeReviewerMessage into checkDesignReviewerStop**

In `checkDesignReviewerStop`, replace line 151:

```js
// Before:
const message = input.last_assistant_message || '';

// After:
const message = normalizeReviewerMessage(input.last_assistant_message || '');
```

Add `i` flag to the Failure detection regex at line 154:

```js
// Before:
if (/^# Design Review Failure\b/m.test(message)) return null;

// After:
if (/^# Design Review Failure\b/im.test(message)) return null;
```

Add `i` flag to the Design type extraction regex at line 161:

```js
// Before:
const match = message.match(/Design type:\s*(\S+)/);

// After:
const match = message.match(/Design type:\s*(\S+)/i);
```

- [ ] **Step 5: Add normalizeReviewerMessage to module.exports**

In the `module.exports` block (around line 207-213), add `normalizeReviewerMessage` to the list:

```js
module.exports = {
  TRANSITIONS,
  hasActiveTask, checkImplementEntry, checkApproveEntry, checkStateAdvance,
  checkEvidenceWritesFromStdin, checkEvidenceBashFromStdin,
  checkInternalResourceAccess, checkDesignManagedWrite, checkDesignManagedShell,
  checkDesignReviewerStop, normalizeReviewerMessage, isDesignReviewer, isManagedShellMutation,
};
```

- [ ] **Step 6: Run all tests to verify they pass**

Run: `node --test scripts/test/feature-design-skill-first.test.js`

Expected: All tests PASS, including the existing stop guard tests and the new format tolerance tests.

- [ ] **Step 7: Run full test suite to verify no regressions**

Run: `node --test scripts/test/`

Expected: All tests PASS with no regressions.

- [ ] **Step 8: Commit**

```bash
git add scripts/devsphere-guard.js scripts/test/feature-design-skill-first.test.js
git commit -m "feat(guard): tolerate markdown/case/punctuation variants in reviewer stop guard"
```
