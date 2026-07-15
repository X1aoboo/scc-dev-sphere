# Design Spec: Feature-Clarify Dead Loop & Checklist Guard Fix

**Date:** 2026-07-15
**Status:** Approved
**Scope:** `skills/feature-clarify/`, `scripts/feature-clarify.js`, `scripts/devsphere-guard.js`, `skills/knowledge-query/`

## Problem Summary

Three interrelated issues in the feature-clarify workflow:

1. **Dead loop in final confirmation** — `checkComplete()` requires `最终确认` text in `requirement.md` before the user is asked to confirm, creating a chicken-and-egg deadlock.
2. **Checklist hook blocks sub-agents** — `checkClarifyChecklistWritesFromStdin` unconditionally denies all Write/Edit to `requirement-checklist.json`, including from review sub-agents who must update it.
3. **Two contract test failures** — `feature-clarify/SKILL.md` missing `完成判断原则`; `knowledge-query/SKILL.md` missing `knowledge-sources.json` reference.

## Design

### 1. Dead Loop Fix: Phase 8 Reorder

**Root cause:** `checkComplete()` in `feature-clarify.js` (line 78) checks `content.includes('最终确认')` as a hard requirement. In SKILL.md phase 8, this check runs BEFORE the user is asked to confirm — but the confirmation text can only be written AFTER the user confirms.

**Fix:** Swap the order of phase 8 steps:

Before (broken):
```
8.1 checkComplete → 8.2 confirm_gate → 8.3 advance state
```
After (fixed):
```
8.1 show summary + confirm_gate → 8.2 user confirms →
8.3 write "最终确认" section to requirement.md →
8.4 update checklist item 7.8.8 to pass via CLI →
8.5 checkComplete → 8.6 advance state
```

Step 8.4 is critical: after writing the confirmation to requirement.md, the main session calls `feature-clarify.js confirm-final` to mark checklist item 7.8.8 ("用户已完成最终确认") as pass. This is a **narrow, purpose-built command** that only touches item 7.8.8 — the main session cannot use it to update arbitrary checklist items. Without this, checkComplete fails on the checklist check because the sub-agent last saw 7.8.8 as fail. Item 7.8.8 is the one checklist item whose pass/fail is determined by the main session (user confirmation), not by sub-agent document review.

- `feature-clarify.js` checkComplete() — **no change**: the `最终确认` text check and checklist check are both retained. They now run AFTER confirmation text is written and 7.8.8 is marked pass, so both pass naturally.
- If checkComplete fails after confirmation, the loop back to phase 7 is correct (genuine quality issues remain).

**File:** `skills/feature-clarify/SKILL.md` — Phase 8 section rewritten.

### 2. Checklist Hook: CLI Mediation

**Root cause:** PreToolUse hook stdin JSON has no field to distinguish main session from sub-agent context (confirmed via official docs: only `session_id`, `transcript_path`, `cwd`, `tool_name`, `tool_input`). The hook unconditionally blocks all writers.

**Fix:** Introduce a CLI command as the sole write path for `requirement-checklist.json`. Sub-agents call the CLI via Bash; hooks exempt the CLI but continue blocking direct Write/Edit.

#### 2a. Two new CLI commands in `feature-clarify.js`

Two separate commands with distinct callers and scopes:

**Command A: `confirm-final` — main session only**

```
node scripts/feature-clarify.js confirm-final <taskPath>
```

- **Caller:** Main session (phase 8, after user confirms)
- **Scope:** Updates checklist item 7.8.8 ONLY (`result: "pass"`, `evidence: "§11 最终确认"`)
- **No JSON payload** — the command is narrowly scoped; it cannot update any other item
- Returns `{ confirmed: true }` on success
- Errors if checklist not found or item 7.8.8 doesn't exist

**Command B: `update-checklist` — review sub-agent only**

```
node scripts/feature-clarify.js update-checklist <taskPath> '<json-payload>'
```

- **Caller:** Review sub-agent (phase 7b, via Agent tool → Bash)
- **Scope:** Updates arbitrary checklist items by id

Payload format:
```json
{
  "items": [
    {"id": "7.1.1", "result": "pass", "evidence": "§2.1", "note": ""},
    {"id": "7.1.2", "result": "fail", "evidence": "", "note": "missing business outcome"}
  ]
}
```

Script logic:
1. Parse payload, validate schema (id/result required, result ∈ {pass, fail})
2. Read current `reviews/requirement-checklist.json`
3. Match items by `id`, update `result`, `evidence`, `note`
4. Return error if any id not found
5. Write updated checklist back
6. Return `{ updated: N }` on success

**Separation rationale:** Although the Bash hook cannot distinguish callers, the narrow interface of `confirm-final` (single item, no payload) means the main session's SKILL.md can only instruct it to mark 7.8.8. The sub-agent's `reviewer-prompt.md` only instructs it to use `update-checklist`. The separation is enforced by prompt design, not by the hook.

#### 2b. Bash hook exemption

In `checkClarifyChecklistBashFromStdin` (`devsphere-guard.js`), add a CLI check:

```javascript
const isClarifyCLI = command.includes('feature-clarify.js update-checklist')
  || command.includes('feature-clarify.js confirm-final');
if (targetsChecklist && !isClarifyCLI) { /* deny */ }
```

This mirrors the pattern already used in `checkReviewBashFromStdin` (line 362).

#### 2c. Write/Edit hook — unchanged

`check-clarify-checklist` (Write|Edit matcher) continues to deny ALL direct writes. This is now correct behavior: sub-agents use the CLI, not Write/Edit, for checklist updates.

#### 2d. Sub-agent prompt extraction

Extract the reviewer instruction from SKILL.md phase 7b into a standalone file:

**New file:** `skills/feature-clarify/reviewer-prompt.md`

Contains the reviewer behavior contract, checklist rules, and the CLI invocation format:
```
node scripts/feature-clarify.js update-checklist <taskPath> '<json>'
```

**SKILL.md phase 7b** changed to reference the file instead of inlining the instruction. This decouples the main session flow from review rules.

**Files:**
- `scripts/feature-clarify.js` — new `confirm-final` and `update-checklist` commands (+ module exports)
- `scripts/devsphere-guard.js` — `checkClarifyChecklistBashFromStdin` add CLI exemption (both commands)
- `skills/feature-clarify/SKILL.md` — phase 7b reference external prompt + CLI instruction; phase 8 uses `confirm-final`
- `skills/feature-clarify/reviewer-prompt.md` — **new file**, extracted reviewer prompt (uses `update-checklist`)
- `hooks/hooks.json` — no change (Write/Edit hook remains, Bash hook updated via guard.js)
- `scripts/test/feature-clarify.test.js` — new test cases for `update-checklist` and `confirm-final`

### 3. Contract Test Fixes

#### 3a. `feature-clarify/SKILL.md` — add `完成判断原则`

New section after phase 5 (核心场景完整性检查), before phase 6:

```markdown
## 完成判断原则

澄清完成的判断标准：
- 核心模糊点全部 resolved，无遗漏高影响 open 项
- 能完整描述至少一条端到端核心用户旅程
- 核心功能的验收标准可操作判断
- 关键业务规则和边界条件已明确
- 用户已确认需求汇总
```

#### 3b. `knowledge-query/SKILL.md` — add `knowledge-sources.json` reference

Add a brief reference in the overview section (after the mermaid flowchart), noting that default multi-source configuration is stored in `knowledge-sources.json` at the skill root. The file physically exists at `skills/knowledge-query/knowledge-sources.json`.

**Files:**
- `skills/feature-clarify/SKILL.md`
- `skills/knowledge-query/SKILL.md`

## File Change Summary

| File | Change | Issue |
|------|--------|-------|
| `skills/feature-clarify/SKILL.md` | Phase 8 reorder (confirm → write → checkComplete) | #1 |
| `skills/feature-clarify/SKILL.md` | Phase 7b: reference external reviewer-prompt.md + CLI instruction | #2 |
| `skills/feature-clarify/SKILL.md` | New `完成判断原则` section after phase 5 | #3 |
| `skills/feature-clarify/reviewer-prompt.md` | **New** — extracted reviewer sub-agent prompt | #2 |
| `scripts/feature-clarify.js` | New `confirm-final` + `update-checklist` commands (+ exports) | #2 |
| `scripts/devsphere-guard.js` | `checkClarifyChecklistBashFromStdin`: add CLI exemption (both commands) | #2 |
| `skills/knowledge-query/SKILL.md` | Add `knowledge-sources.json` reference in overview | #3 |
| `scripts/test/feature-clarify.test.js` | New tests: `update-checklist` + `confirm-final` | #2 |

## Non-Changes

- `hooks/hooks.json` — unchanged (Write/Edit guard stays, Bash guard logic in script)
- `feature-clarify.js` `checkComplete()` — unchanged (text check retained as defense-in-depth)
- `requirement-checklist.json` template — unchanged (item 7.8.8 "用户已完成最终确认" retained)
- `devsphere-guard.js` `checkClarifyChecklistWritesFromStdin` — unchanged (correctly blocks all direct writes)

## Verification

1. `node --test scripts/test/feature-clarify.test.js` — all pass
2. `node --test scripts/test/skill-contracts.test.js` — all 12 pass
3. `node --test scripts/test/` — full test suite passes
4. Manual: `node scripts/feature-clarify.js confirm-final <taskPath>` — item 7.8.8 set to pass
5. Manual: `node scripts/feature-clarify.js update-checklist <taskPath> '{"items":[{"id":"7.1.1","result":"pass","evidence":"test"}]}'` — checklist updated
