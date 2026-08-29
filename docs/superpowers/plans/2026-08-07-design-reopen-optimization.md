# Design Reopen 优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/scc-dev-sphere:design-reopen` Skill 作为重开已基线设计的显式快捷入口，并修复 `checkDesignReviewerStop` 在多个未基线 Draft 共存时的死锁。

**Architecture:** Skill 层新建 `design-reopen`，通过 CLI 获取 taskPath、枚举已基线设计、执行 reopen 后自动转入 `feature-design`。Guard 层修改 `checkDesignReviewerStop`，从 reviewer 返回消息中解析 `designType`，精确校验目标设计的 review 有效性，替代原来的"全局数候选数量"逻辑。

**Tech Stack:** Node.js (CommonJS), `node:test`/`node:assert`, 无外部依赖

---

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `scripts/devsphere-guard.js` | 修改 | `checkDesignReviewerStop` 改为解析 designType |
| `skills/design-reopen/SKILL.md` | 新建 | 快捷入口 Skill 定义 |
| `scripts/test/feature-design-skill-first.test.js` | 修改 | 替换 stop hook 测试 + 新增多候选用例 |
| `scripts/test/design-reopen-skill-contract.test.js` | 新建 | Skill 契约测试（frontmatter、CLI 调用、契约文本） |
| `docs/guides/scc-dev-sphere-user-guide.md` | 修改 | 更新 reopen 使用说明 |
| `README.md` | 修改 | Skill 表补充 `design-reopen` |

---

### Task 1: 修复 `checkDesignReviewerStop` — 从返回消息解析 designType

**Files:**
- Modify: `scripts/devsphere-guard.js:150-163`
- Test: `scripts/test/feature-design-skill-first.test.js:775-789`

- [ ] **Step 1: 替换现有 stop hook 测试并新增多候选用例**

打开 `scripts/test/feature-design-skill-first.test.js`，找到第 775 行的测试：

```javascript
test('design-reviewer SubagentStop requires a complete current persisted Review', () => {
  const { workspaceRoot, taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  const input = {
    agent_type: 'scc-dev-sphere:design-reviewer',
    cwd: workspaceRoot,
    last_assistant_message: '# Design Review\n\n- Result: pass',
  };
  assert.strictEqual(checkDesignReviewerStop(input).decision, 'block');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  assert.strictEqual(checkDesignReviewerStop(input), null);
  fs.unlinkSync(lintStatusPath(taskPath, 'businessDesign'));
  assert.match(checkDesignReviewerStop(input).reason, /passing lint state/);
});
```

替换为以下两个测试（注意 input 中现在包含 `Design type:` 行）：

```javascript
test('design-reviewer SubagentStop validates the target design from the return message', () => {
  const { workspaceRoot, taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  const input = {
    agent_type: 'scc-dev-sphere:design-reviewer',
    cwd: workspaceRoot,
    last_assistant_message: '# Design Review\n\n- Design type: businessDesign\n- Result: pass',
  };
  // review not recorded yet → block
  assert.strictEqual(checkDesignReviewerStop(input).decision, 'block');
  // record review → pass
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  assert.strictEqual(checkDesignReviewerStop(input), null);
  // lint deleted → block with reason
  fs.unlinkSync(lintStatusPath(taskPath, 'businessDesign'));
  assert.match(checkDesignReviewerStop(input).reason, /passing lint state/);
});

test('design-reviewer SubagentStop with multiple un-baselined drafts only checks the target', () => {
  const { workspaceRoot, taskPath } = makeTask();
  setRequired(taskPath, ['businessDesign', 'solutionDesign']);
  // Both designs have Draft, no Baseline
  writeDraft(taskPath, 'businessDesign');
  writeDraft(taskPath, 'solutionDesign', VALID_SOLUTION_DRAFT);
  lintDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'solutionDesign');
  // Reviewer reviewed solutionDesign successfully
  recordReview(taskPath, 'solutionDesign', passingSummary(taskPath, 'solutionDesign'));
  const input = {
    agent_type: 'scc-dev-sphere:design-reviewer',
    cwd: workspaceRoot,
    last_assistant_message: '# Design Review\n\n- Design type: solutionDesign\n- Result: pass',
  };
  // Even though businessDesign has no review, solutionDesign's review is valid → pass
  assert.strictEqual(checkDesignReviewerStop(input), null);

  // Reverse: reviewer reviewed businessDesign but its review is invalid
  const inputBusiness = {
    agent_type: 'scc-dev-sphere:design-reviewer',
    cwd: workspaceRoot,
    last_assistant_message: '# Design Review\n\n- Design type: businessDesign\n- Result: pass',
  };
  assert.strictEqual(checkDesignReviewerStop(inputBusiness).decision, 'block');
});

test('design-reviewer SubagentStop blocks when design type is missing from return message', () => {
  const { workspaceRoot, taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  const input = {
    agent_type: 'scc-dev-sphere:design-reviewer',
    cwd: workspaceRoot,
    last_assistant_message: '# Design Review\n\n- Result: pass',
  };
  const result = checkDesignReviewerStop(input);
  assert.strictEqual(result.decision, 'block');
  assert.match(result.reason, /could not identify the reviewed design type/);
});

test('design-reviewer SubagentStop still allows failure returns', () => {
  const { workspaceRoot, taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  // No review recorded, but it's a failure return → pass
  const input = {
    agent_type: 'scc-dev-sphere:design-reviewer',
    cwd: workspaceRoot,
    last_assistant_message: '# Design Review Failure\n\n- Design type: businessDesign\n- Reason: missing inputs',
  };
  assert.strictEqual(checkDesignReviewerStop(input), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/test/feature-design-skill-first.test.js`
Expected: The new tests fail because the current `checkDesignReviewerStop` doesn't parse `designType` from the message. The first test will fail at the `decision: 'block'` assertion (current code returns `null` because the old message format `'# Design Review\n\n- Result: pass'` without `Design type:` would actually pass the old logic differently — actually it will fail because candidates detection logic differs).

- [ ] **Step 3: Implement the fix in `checkDesignReviewerStop`**

打开 `scripts/devsphere-guard.js`，找到 `checkDesignReviewerStop` 函数（第 150-163 行），替换整个函数体为：

```javascript
function checkDesignReviewerStop(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid hook input for Design Reviewer stop guard');
  if (!isDesignReviewer(input)) return null;
  const message = input.last_assistant_message || '';

  // 失败返回，照旧放行
  if (/^# Design Review Failure\b/m.test(message)) return null;

  const workspaceRoot = input.cwd;
  const taskPath = workspaceRoot && getTaskPath(workspaceRoot);
  if (!taskPath) return { decision: 'block', reason: 'Design Reviewer cannot stop: no active Feature task was found.' };

  // 从返回消息解析目标 designType
  const match = message.match(/Design type:\s*(\S+)/);
  const target = match && match[1];

  if (target && DESIGN_TYPE_KEYS.includes(target)) {
    const result = validatePersistedReview(taskPath, target, { allowBlocked: true });
    return result.valid ? null : { decision: 'block', reason: `Design Reviewer cannot stop: ${result.reason}.` };
  }

  // 解析不到合法 designType → block 并提示格式问题
  return { decision: 'block', reason: 'Design Reviewer cannot stop: could not identify the reviewed design type from the return message.' };
}
```

- [ ] **Step 4: Clean up unused imports**

检查 `scripts/devsphere-guard.js` 顶部的 import（第 8-13 行）。当前导入：

```javascript
const {
  DESIGN_TYPE_KEYS,
  readDraftRef,
  readArtifactRef,
  validatePersistedReview,
} = require('./devsphere-design');
```

`readDraftRef` 和 `readArtifactRef` 在修改后的 `checkDesignReviewerStop` 中不再使用。搜索文件中其他位置是否引用这两个函数。如果 guard 的其他函数不使用它们，则从 import 中移除：

```javascript
const {
  DESIGN_TYPE_KEYS,
  validatePersistedReview,
} = require('./devsphere-design');
```

- [ ] **Step 5: Run all guard-related tests to verify they pass**

Run: `node --test scripts/test/feature-design-skill-first.test.js`
Expected: PASS for the 4 new stop hook tests. Pre-existing lint failures (4 tests) are unrelated and remain as-is.

Run: `node --test scripts/test/skill-contracts.test.js`
Expected: PASS — the hook contract test verifies `hooks.json` structure which is unchanged.

- [ ] **Step 6: Commit**

```bash
git add scripts/devsphere-guard.js scripts/test/feature-design-skill-first.test.js
git commit -m "fix(guard): parse designType from reviewer return message in stop hook

Replaces the candidates.length !== 1 check with designType parsing from
last_assistant_message, fixing the deadlock when multiple un-baselined
designs exist simultaneously.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 新建 `design-reopen` Skill

**Files:**
- Create: `skills/design-reopen/SKILL.md`
- Create: `scripts/test/design-reopen-skill-contract.test.js`

- [ ] **Step 1: Write the skill contract test**

创建 `scripts/test/design-reopen-skill-contract.test.js`：

```javascript
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

test('design-reopen skill has correct frontmatter and CLI references', () => {
  const skill = fs.readFileSync(path.join(root, 'skills', 'design-reopen', 'SKILL.md'), 'utf8');
  assert.match(skill, /^name: design-reopen$/m);
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.match(skill, /仅用户在主会话显式调用/);
  // Uses plugin CLI launcher
  assert.match(skill, /"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/devsphere"/);
  // No bare CLI calls or direct script references
  assert.doesNotMatch(skill, /\$\{CLAUDE_(?:SKILL_DIR|PROJECT_DIR)\}/);
  assert.doesNotMatch(skill, /node\s+[^\n]*scripts\/[\w/-]+\.js/);
  const bareCli = /(^|[\s`])devsphere\s+(?:workspace|workflow|design|approval|knowledge|state|guard)\b/m;
  assert.doesNotMatch(skill, bareCli);
});

test('design-reopen skill references required CLI commands', () => {
  const skill = fs.readFileSync(path.join(root, 'skills', 'design-reopen', 'SKILL.md'), 'utf8');
  // Gets taskPath from CLI, not from calling context
  assert.match(skill, /state get-task-path/);
  // Inspects workspace for baselined designs
  assert.match(skill, /design inspect-workspace/);
  // Executes reopen
  assert.match(skill, /design reopen/);
  // Transfers to feature-design
  assert.match(skill, /feature-design/);
});

test('design-reopen skill enforces change reason requirement', () => {
  const skill = fs.readFileSync(path.join(root, 'skills', 'design-reopen', 'SKILL.md'), 'utf8');
  assert.match(skill, /变更说明必填|变更说明.*必填|必填.*变更说明/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/test/design-reopen-skill-contract.test.js`
Expected: FAIL — `skills/design-reopen/SKILL.md` does not exist.

- [ ] **Step 3: Create the Skill definition**

创建 `skills/design-reopen/SKILL.md`：

```markdown
---
name: design-reopen
description: 重开指定任务中已基线的设计。选择已发布 Baseline 的设计类型，确认后旧 Baseline 归档、新 Draft 版本提升，自动转入 feature-design 继续修订到发布。禁止模型自动调用，仅用户在主会话显式调用。
disable-model-invocation: true
---

# Design Reopen — 设计重开

重开指定任务中已基线的设计，旧 Baseline 归档到历史目录，新 Draft 提升主版本，随后转入 `feature-design` 完成修订、Review、批准和重新发布。

## 集成契约

- **入口:** `/scc-dev-sphere:design-reopen`
- **入参:** 无调用上下文参数；taskPath 由 CLI 从当前活跃任务获取
- **输出:** 旧 Baseline 已归档，新 Draft 已生成，`feature-design` 已接管后续流程
- **完成标准:** `feature-design` 返回"当前 Design Baseline 已获用户批准并发布"

## 执行步骤

1. 定位当前任务：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" state get-task-path --workspace-root "<workspaceRoot>"`，从返回 JSON 取 `taskPath`。无活跃任务时提示"未找到活跃任务，请先使用 `/scc-dev-sphere:feature-init` 创建"并终止。

2. 枚举可重开的设计：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design inspect-workspace --task-path "<taskPath>"`，从返回 JSON 的 `completed` 数组中取出已基线的设计类型，以单选列表呈现给用户。列表为空时提示"当前没有已发布的 Design Baseline 可重开"并终止。

3. 收集变更说明：以自然语言向用户提问"请说明本次重开的原因和预期变更内容"。变更说明必填——reopen 是设计变更决策，不可无理由执行。

4. 确认重开：向用户展示目标设计类型、当前版本号、变更说明，通过 `AskUserQuestion`（`confirm_gate` 模式）明确请求确认。用户拒绝时终止，不执行任何修改。

5. 执行 reopen：`"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design reopen --task-path "<taskPath>" --design-type <designType>`，解析脚本输出的 JSON。脚本报错（任务不存在、无 Baseline 等）时透传错误并终止。向用户展示归档路径和新 Draft 版本。

6. 转入 feature-design：直接执行 `/scc-dev-sphere:feature-design`，调用上下文中传入 `taskPath`、`designType`（刚 reopen 的）和变更说明（作为设计目标的一部分）。`feature-design` 步骤1 `inspect-workspace` 会看到"Draft 存在、Baseline 不存在"，识别为恢复进行中的设计；步骤2 使用变更说明作为本次设计修订的输入。

## 规则

- **仅用户显式调用**：不得被模型自动触发；只在用户在主会话输入 `/scc-dev-sphere:design-reopen` 时执行。
- **只重开有 Baseline 的设计**：无 Baseline 的设计不需要 reopen，直接用 `feature-design` 恢复。
- **变更说明必填**：重开是设计变更决策，不可无理由执行。
- **确定性执行**：reopen 操作全部由 `devsphere` CLI 完成；Skill 不自行拼接路径或执行文件操作。
- **下游影响不自动处理**：Skill 只重开用户选定的那一个设计。下游设计的重开由用户在 `feature-design` 完成后自行判断。

## 完成

旧 Baseline 已归档到历史目录，新 Draft 已生成，`feature-design` 已接管修订到发布的完整流程后完成。
```

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `node --test scripts/test/design-reopen-skill-contract.test.js`
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Run the global skill-contracts test to verify no regression**

Run: `node --test scripts/test/skill-contracts.test.js`
Expected: PASS — the `design-reopen` skill passes the same bare-CLI / `CLAUDE_PLUGIN_ROOT` checks as other skills.

- [ ] **Step 6: Commit**

```bash
git add skills/design-reopen/SKILL.md scripts/test/design-reopen-skill-contract.test.js
git commit -m "feat(skill): add design-reopen as explicit entry point for reopening baselined designs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 更新文档

**Files:**
- Modify: `README.md:164`
- Modify: `docs/guides/scc-dev-sphere-user-guide.md:564-573`

- [ ] **Step 1: Add `design-reopen` to README skill table**

打开 `README.md`，找到第 164 行：

```
| 设计通用能力 | [`design-draft`](skills/design-draft/SKILL.md) |
```

替换为：

```
| 设计通用能力 | [`design-draft`](skills/design-draft/SKILL.md)、[`design-reopen`](skills/design-reopen/SKILL.md)、[`design-archive`](skills/design-archive/SKILL.md) |
```

注意：如果 `design-archive` 不在该行中，确认它不在其他行。若 `design-archive` 尚未在 README 表格中，加上它（此处一并补上）。若已在其他位置，则只加 `design-reopen`。

- [ ] **Step 2: Update user guide reopen section**

打开 `docs/guides/scc-dev-sphere-user-guide.md`，找到第 564 行 `### 7.4 单个 Design reopen`。当前内容：

```markdown
### 7.4 单个 Design reopen

底层设计流程可以重开一个已经发布的 Design：

- 旧 Baseline 保存到历史目录；
- 新 Draft 提升主版本；
- 重新 Review 和批准；
- 在仍处于设计或总体批准阶段时，可重新同步到 `designing`。

这不是完整的用户级回退功能。进入实现规划后，当前没有自动退回设计阶段的流程。
```

在"底层设计流程可以重开一个已经发布的 Design："前插入一段：

```markdown
### 7.4 单个 Design reopen

重开已基线的设计有两个入口：

- **快捷入口**：直接运行 `/scc-dev-sphere:design-reopen`，选择要重开的设计类型并说明变更原因。插件执行 reopen 后自动转入 `feature-design` 继续修订到发布。
- **语义触发**：运行 `/scc-dev-sphere:feature-design` 并在指令中说明要重开的设计类型和变更内容。`feature-design` 在 publish 时检测到已有 Baseline 会确认重开。

底层设计流程可以重开一个已经发布的 Design：

- 旧 Baseline 保存到历史目录；
- 新 Draft 提升主版本；
- 重新 Review 和批准；
- 在仍处于设计或总体批准阶段时，可重新同步到 `designing`。

这不是完整的用户级回退功能。进入实现规划后，当前没有自动退回设计阶段的流程。
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/guides/scc-dev-sphere-user-guide.md
git commit -m "docs: add design-reopen skill to README and user guide

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 全量回归验证

**Files:** 无修改，仅验证

- [ ] **Step 1: Run all tests**

Run: `node --test scripts/test/*.test.js`
Expected: 所有测试通过，除了 4 个 pre-existing lint 测试失败（与本次改动无关）。新增的 stop hook 测试和 design-reopen 契约测试全部通过。

- [ ] **Step 2: Verify the guard function manually**

Run: `node -e "const {checkDesignReviewerStop}=require('./scripts/devsphere-guard'); console.log(checkDesignReviewerStop({agent_type:'design-reviewer',last_assistant_message:'# Design Review Failure\n\n- Design type: businessDesign\n- Reason: test'}))"`
Expected: `null`（failure returns pass through）

Run: `node -e "const {checkDesignReviewerStop}=require('./scripts/devsphere-guard'); console.log(checkDesignReviewerStop({agent_type:'design-reviewer',last_assistant_message:'# Design Review\n\n- Design type: businessDesign',cwd:'/nonexistent'}))"`
Expected: `{ decision: 'block', reason: '...no active Feature task...' }`

- [ ] **Step 3: Final commit if any remaining changes**

```bash
git status
# If clean, done. If not, review and commit remaining changes.
```
