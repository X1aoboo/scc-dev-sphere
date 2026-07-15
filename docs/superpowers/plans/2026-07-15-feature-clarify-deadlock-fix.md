# feature-clarify 死锁修复与流程完善 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 feature-clarify skill 的7个问题 — 解除 P0 死锁、消除模板伪造确认、引入 reserved/waived/reviewVersion 数据模型、对齐流程文档与测试。

**Architecture:** 核心变更是 checklist JSON 数据模型扩展（`reserved`、`waived`、`reviewVersion`），配合 `feature-clarify.js` 脚本新增/修改5个命令，以及 SKILL.md / reviewer-prompt.md / requirement.md 模板 / guard 消息的文档对齐。

**Tech Stack:** Node.js (内置 `fs`, `path`), `node:test` + `node:assert` 测试框架。

## Global Constraints

- 确认状态由 checklist 单一来源承载，requirement.md 不再维护确认章节
- `evidence` 字段仅由评审子 Agent 写入，主会话（confirm-final）不碰
- 确认时间由 checklist 文件 mtime 隐式承载（不写入额外字段）
- `reserved` 项仅主会话可更新，`update-checklist` CLI 硬拒绝
- `waived` 状态仅主会话可设置，评审子 Agent 只能设 `pass | fail`

---

### Task 1: Checklist 模板数据模型变更

**Files:**
- Modify: `skills/feature-clarify/requirement-checklist.json`

**Interfaces:**
- Produces: `reviewVersion: 0` (顶层), `reserved: true` (7.8.8 item) — 后续所有 Task 依赖此模型

- [ ] **Step 1: 在 checklist 模板顶层添加 reviewVersion**

在 `skills/feature-clarify/requirement-checklist.json` 的 `"categories"` 前插入 `"reviewVersion": 0,`：

```json
{
  "reviewVersion": 0,
  "categories": [
```

- [ ] **Step 2: 给 7.8.8 添加 reserved 标记**

将 `requirement-checklist.json` 中 7.8.8 的 item 改为：

```json
{"id": "7.8.8", "check": "用户已完成最终确认", "result": "fail", "reserved": true, "evidence": "", "note": ""}
```

- [ ] **Step 3: 验证 JSON 合法**

```bash
node -e "JSON.parse(require('fs').readFileSync('skills/feature-clarify/requirement-checklist.json','utf8')); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 4: 运行现有测试确认模板变更不破坏 init**

```bash
node scripts/test/feature-clarify.test.js
```
Expected: 全部 pass（init 测试会读取新模板，验证 categories 仍存在）

- [ ] **Step 5: Commit**

```bash
git add skills/feature-clarify/requirement-checklist.json
git commit -m "feat: add reviewVersion and reserved fields to clarify checklist template"
```

---

### Task 2: 删除 requirement.md 模板的 §11 最终确认章节

**Files:**
- Modify: `skills/feature-clarify/requirement.md`

**Interfaces:**
- Produces: requirement.md 模板不含确认章节，后续 checkComplete 不再检查文件内容

- [ ] **Step 1: 删除 §11 最终确认章节**

删除 `skills/feature-clarify/requirement.md` 的第 91-95 行：

```
## 11. 最终确认

以上内容已经过用户确认，可作为后续复杂度评估、方案设计和测试设计的正式需求输入。

- **确认时间**：YYYY-MM-DD HH:mm
```

文件以第 90 行 `| 编号 | 澄清主题 | 最终结论 |` 结束。

- [ ] **Step 2: 验证文件以正确内容结尾**

```bash
tail -1 skills/feature-clarify/requirement.md
```
Expected: `| 编号 | 澄清主题 | 最终结论 |`

- [ ] **Step 3: Commit**

```bash
git add skills/feature-clarify/requirement.md
git commit -m "fix: remove §11 final confirmation section from requirement.md template"
```

---

### Task 3: feature-clarify.js — updateChecklist 强化（reserved 拒绝 + reviewVersion 递增）

**Files:**
- Modify: `scripts/feature-clarify.js:135-173`

**Interfaces:**
- Consumes: checklist 模板含 `reserved` 字段（Task 1）, `reviewVersion` 字段（Task 1）
- Produces: `updateChecklist(taskPath, payload)` — 拒绝 reserved 项、支持 `incrementReviewVersion`

- [ ] **Step 1: 在 updateChecklist 函数开头添加 reserved 拒绝逻辑**

在 `updateChecklist` 的 payload 校验后（line 146 之后），添加 reserved 检查：

```javascript
  // Reject updates to reserved items
  for (const update of payload.items) {
    for (const cat of checklist.categories) {
      const item = cat.items.find(i => i.id === update.id);
      if (item && item.reserved) {
        throw new Error(`item ${update.id} is reserved — only main session can update`);
      }
    }
  }
```

- [ ] **Step 2: 添加 incrementReviewVersion 支持**

在 `updateChecklist` 的 fs.writeFileSync 之前（line 171 之前），添加：

```javascript
  if (payload.incrementReviewVersion) {
    checklist.reviewVersion = (checklist.reviewVersion || 0) + 1;
  }
```

- [ ] **Step 3: 返回 reviewVersion**

将 `return { updated }` 改为：

```javascript
  return { updated, reviewVersion: checklist.reviewVersion };
```

- [ ] **Step 4: 更新 CLI 的 update-checklist 分支**

在 CLI switch 的 `update-checklist` case（line 196-199），payload 解析改为支持 incrementReviewVersion：

```javascript
    case 'update-checklist': {
      const payload = JSON.parse(args[1]);
      console.log(JSON.stringify(updateChecklist(taskPath, payload)));
      break;
    }
```

无需改 CLI 解析（`incrementReviewVersion` 是 payload 内的字段，JSON.parse 自然支持）。

- [ ] **Step 5: 运行现有测试确认 updateChecklist 仍然正常**

```bash
node scripts/test/feature-clarify.test.js
```
Expected: 现有 updateChecklist 测试全部 pass（payload 不含 `incrementReviewVersion` 时行为不变）

- [ ] **Step 6: Commit**

```bash
git add scripts/feature-clarify.js
git commit -m "feat: reject reserved items in updateChecklist, support incrementReviewVersion"
```

---

### Task 4: feature-clarify.js — confirmFinal 简化

**Files:**
- Modify: `scripts/feature-clarify.js:109-131`

**Interfaces:**
- Consumes: 设计决策 — confirmFinal 不写 evidence/note
- Produces: `confirmFinal(taskPath)` — 仅设 result='pass'，返回 `{ confirmed: true }`

- [ ] **Step 1: 删除 evidence 和 note 赋值**

在 `confirmFinal` 函数中，删除 lines 119-120：

```javascript
        item.evidence = '§11 最终确认';
        item.note = '';
```

保留：
```javascript
        item.result = 'pass';
```

- [ ] **Step 2: 验证修改后的函数**

`confirmFinal` 函数最终形态：

```javascript
function confirmFinal(taskPath) {
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = readJSON(checklistPath);
  if (!checklist) throw new Error('requirement-checklist.json not found');

  let found = false;
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.8.8') {
        item.result = 'pass';
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

- [ ] **Step 3: 运行现有测试确认（预期 confirmFinal 测试会因 evidence 断言失败，暂不管，Task 11 一并修复）**

```bash
node scripts/test/feature-clarify.test.js
```
Expected: confirmFinal 的 evidence 断言会失败，其余测试 pass。

- [ ] **Step 4: Commit**

```bash
git add scripts/feature-clarify.js
git commit -m "fix: simplify confirmFinal to only set result, remove evidence/note writes"
```

---

### Task 5: feature-clarify.js — checkComplete 适配（waived + 删除内容检查）

**Files:**
- Modify: `scripts/feature-clarify.js:44-84`

**Interfaces:**
- Consumes: `waived` 状态（Task 6 引入）、requirement.md 不再含确认章节（Task 2）
- Produces: `checkComplete(taskPath)` — waived 视为通过，fail 阻塞，不检查文件内容

- [ ] **Step 1: 修改 fail 判定为只阻塞 fail（waived 放行）**

将 line 54-58 的循环：

```javascript
      if (item.result !== 'pass') {
        failures.push(`${item.id}: ${item.note || item.check}`);
      }
```

改为：

```javascript
      if (item.result === 'fail') {
        failures.push(`${item.id}: ${item.note || item.check}`);
      }
```

- [ ] **Step 2: 删除 requirement.md 内容检查**

删除 lines 72-81：

```javascript
  // 3. requirement.md has final confirmation
  const reqPath = path.join(taskPath, 'inputs', 'requirement.md');
  if (!fs.existsSync(reqPath)) {
    failures.push('requirement.md not found');
  } else {
    const content = fs.readFileSync(reqPath, 'utf8');
    if (!content.includes('最终确认')) {
      failures.push('requirement.md missing final confirmation');
    }
  }
```

- [ ] **Step 3: 验证修改后的函数签名**

`checkComplete` 现在只检查两件事：
1. checklist 所有 item.result !== 'fail'（waived 放行）
2. ambiguity-backlog.json 无 open 项

- [ ] **Step 4: Commit**

```bash
git add scripts/feature-clarify.js
git commit -m "fix: checkComplete treats waived as passing, removes content-based confirmation check"
```

---

### Task 6: feature-clarify.js — waiveItem 新命令

**Files:**
- Modify: `scripts/feature-clarify.js`（新增函数 + CLI case + 导出）

**Interfaces:**
- Consumes: `reviewVersion` (Task 1), `designRevisionLimit` from `state.json`
- Produces: `waiveItem(taskPath, payload)` — 设 item.result='waived'，note 记录原因

- [ ] **Step 1: 添加 waiveItem 函数**

在 `updateChecklist` 函数之后（line 173 之后），新增：

```javascript
// --- waiveItem ---

function waiveItem(taskPath, payload) {
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('payload.items must be an array');
  }
  for (const item of payload.items) {
    if (!item.id || !item.reason) {
      throw new Error(`waive item missing id or reason: ${JSON.stringify(item)}`);
    }
  }

  // Read designRevisionLimit from state.json
  const statePath = path.join(taskPath, 'state.json');
  let designRevisionLimit = 25;
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    designRevisionLimit = state.designRevisionLimit || 25;
  }

  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = readJSON(checklistPath);
  if (!checklist) throw new Error('requirement-checklist.json not found');

  if ((checklist.reviewVersion || 0) < designRevisionLimit) {
    throw new Error(
      `cannot waive: reviewVersion ${checklist.reviewVersion || 0} < designRevisionLimit ${designRevisionLimit}`
    );
  }

  let waived = 0;
  for (const update of payload.items) {
    let found = false;
    for (const cat of checklist.categories) {
      for (const item of cat.items) {
        if (item.id === update.id) {
          if (item.result !== 'fail') {
            throw new Error(`item ${update.id} is not fail, cannot waive`);
          }
          item.result = 'waived';
          item.note = `用户接受风险: ${update.reason}`;
          found = true;
          waived++;
          break;
        }
      }
      if (found) break;
    }
    if (!found) throw new Error(`checklist item not found: ${update.id}`);
  }

  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));
  return { waived };
}
```

- [ ] **Step 2: 添加 CLI case**

在 CLI switch 的 default 之前（line 201 之前），新增：

```javascript
    case 'waive-item': {
      const payload = JSON.parse(args[1]);
      console.log(JSON.stringify(waiveItem(taskPath, payload)));
      break;
    }
```

- [ ] **Step 3: 添加导出**

在 `module.exports` 中添加 `waiveItem`：

```javascript
module.exports = { init, checkComplete, readChecklist, confirmFinal, updateChecklist, waiveItem };
```

- [ ] **Step 4: Commit**

```bash
git add scripts/feature-clarify.js
git commit -m "feat: add waive-item CLI for user-accepted risk items after review limit"
```

---

### Task 7: feature-clarify.js — checkStaleConfirmation 新命令

**Files:**
- Modify: `scripts/feature-clarify.js`（新增函数 + CLI case + 导出）

**Interfaces:**
- Consumes: checklist mtime vs requirement.md mtime
- Produces: `checkStaleConfirmation(taskPath)` — 若 requirement.md 更新则重置 7.8.8 为 fail

- [ ] **Step 1: 添加 checkStaleConfirmation 函数**

在 `waiveItem` 函数之后，新增：

```javascript
// --- checkStaleConfirmation ---

function checkStaleConfirmation(taskPath) {
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const reqPath = path.join(taskPath, 'inputs', 'requirement.md');

  if (!fs.existsSync(checklistPath)) {
    return { stale: false, reason: 'checklist not found' };
  }
  if (!fs.existsSync(reqPath)) {
    return { stale: false, reason: 'requirement.md not found' };
  }

  const checklist = readJSON(checklistPath);

  // Find 7.8.8
  let item788 = null;
  for (const cat of checklist.categories) {
    const found = cat.items.find(i => i.id === '7.8.8');
    if (found) { item788 = found; break; }
  }
  if (!item788) return { stale: false, reason: '7.8.8 not found' };
  if (item788.result !== 'pass') return { stale: false, reason: 'not yet confirmed' };

  // Compare mtimes
  const checklistMtime = fs.statSync(checklistPath).mtimeMs;
  const reqMtime = fs.statSync(reqPath).mtimeMs;

  if (reqMtime > checklistMtime) {
    // Stale: reset 7.8.8 to fail
    item788.result = 'fail';
    fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));
    return { stale: true, reason: 'requirement.md modified after confirmation, 7.8.8 reset to fail' };
  }

  return { stale: false };
}
```

- [ ] **Step 2: 添加 CLI case**

在 CLI switch 的 default 之前，新增：

```javascript
    case 'check-stale-confirmation':
      console.log(JSON.stringify(checkStaleConfirmation(taskPath)));
      break;
```

- [ ] **Step 3: 添加导出**

```javascript
module.exports = { init, checkComplete, readChecklist, confirmFinal, updateChecklist, waiveItem, checkStaleConfirmation };
```

- [ ] **Step 4: Commit**

```bash
git add scripts/feature-clarify.js
git commit -m "feat: add check-stale-confirmation to detect and reset stale confirmations"
```

---

### Task 8: reviewer-prompt.md 更新（跳过 reserved + 递增 reviewVersion）

**Files:**
- Modify: `skills/feature-clarify/reviewer-prompt.md`

**Interfaces:**
- Consumes: `reserved` 字段语义 (Task 1), `incrementReviewVersion` (Task 3)

- [ ] **Step 1: 修改评审规则 — 跳过 reserved 项**

将 `reviewer-prompt.md` 第 7 行：

```
1. 读取 `reviews/requirement-checklist.json`，对所有 `result: "fail"` 的项进行复检（首轮全量检查）。
```

改为：

```
1. 读取 `reviews/requirement-checklist.json`，对所有 `result: "fail"` 且 `reserved` 不为 `true` 的项进行复检（首轮全量检查）。`reserved: true` 的项由主会话独占处理，评审子 Agent 不得评审或更新。
```

- [ ] **Step 2: 修改更新评审结果 — 递增 reviewVersion**

将第 22-24 行的 CLI 示例：

```
node ${CLAUDE_SKILL_DIR}/../../scripts/feature-clarify.js update-checklist <taskPath> '<json-payload>'
```

Payload 格式增加 `incrementReviewVersion`：

```json
{"items": [{"id": "7.1.1", "result": "pass", "evidence": "§2.1", "note": ""}], "incrementReviewVersion": true}
```

- [ ] **Step 3: 删除角色边界声明**

确认 reviewer-prompt.md 中不存在"只有评审子 Agent 可以更新"的表述。当前文件（已读）无此表述，无需修改。

- [ ] **Step 4: Commit**

```bash
git add skills/feature-clarify/reviewer-prompt.md
git commit -m "fix: reviewer skips reserved items and increments reviewVersion per round"
```

---

### Task 9: SKILL.md 流程修正（阶段5/7/8）

**Files:**
- Modify: `skills/feature-clarify/SKILL.md`

**Interfaces:**
- Consumes: reserved/waived/reviewVersion 语义, check-stale-confirmation CLI (Task 7)

- [ ] **Step 1: 修正阶段5完成判断原则**

将 `SKILL.md` 第 123-130 行：

```
### 完成判断原则

澄清完成的判断标准：
- 核心模糊点全部 resolved，无遗漏高影响 open 项
- 能完整描述至少一条端到端核心用户旅程
- 核心功能的验收标准可操作判断
- 关键业务规则和边界条件已明确
- 用户已确认需求汇总
```

改为：

```
### 完成判断原则

澄清完成的判断标准：
- 核心模糊点全部 resolved，无遗漏高影响 open 项
- 能完整描述至少一条端到端核心用户旅程
- 核心功能的验收标准可操作判断
- 关键业务规则和边界条件已明确
- 需求信息足够生成结构化需求文档（覆盖业务目标、核心场景、功能范围、验收标准）
```

- [ ] **Step 2: 修正阶段7b — "全部 pass" 改为 "非 reserved 项全部 pass"**

将 `SKILL.md` 第 148 行：

```
- **全部 pass** → 关闭循环，进入阶段8。
```

改为：

```
- **非 reserved 项全部 pass**（`reserved: true` 的项如 7.8.8 不参与评审判定）→ 关闭循环，进入阶段8。
```

- [ ] **Step 3: 修正阶段7b — 增加 waived 退出路径**

将第 157 行：

```
- **达到上限仍有 fail** → 剩余 fail 项带至阶段8，向用户说明后由用户裁决。
```

改为：

```
- **达到上限仍有 fail** → 列出剩余 fail 项，询问用户裁决。用户可选择：
  - 继续澄清 → 回到阶段3
  - 接受风险 → 通过 CLI `waive-item` 将对应项设为 `waived`，关闭循环进入阶段8
```

- [ ] **Step 4: 修正阶段7 — 入口添加 stale confirmation 检查**

在阶段7开头（第 139 行之前）增加：

```
### 7a 前置：检查确认是否过期

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/feature-clarify.js check-stale-confirmation <taskPath>
# 若返回 stale: true，表示 requirement.md 在确认后被修改，需重新确认
```

若 stale=true，标记用户需在阶段8重新确认。
```

原 7a 改为 7b，7b 改为 7c。

- [ ] **Step 5: 修正阶段8 — 添加 stale confirmation 检查**

在阶段8开头（第 159 行 `1. 展示需求汇总` 之前）增加对 stale 结果的说明。

阶段8现有内容已覆盖 confirm_gate → confirm-final → check-complete 流程，check-complete 失败返回阶段7（此时 check-stale-confirmation 会在阶段7入口触发过期检测），无需额外修改。

- [ ] **Step 6: Commit**

```bash
git add skills/feature-clarify/SKILL.md
git commit -m "fix: update SKILL.md phases 5/7/8 for reserved/waived/stale-confirmation flow"
```

---

### Task 10: devsphere-guard.js Hook reason 消息修正

**Files:**
- Modify: `scripts/devsphere-guard.js:228-264`

**Interfaces:**
- Consumes: 设计决策 — 不声称角色边界，只声称文件写保护

- [ ] **Step 1: 修改 checkClarifyChecklistWritesFromStdin 的拒绝消息**

将第 242 行的 reason：

```
${target} 禁止主会话直接 Write/Edit。需求评审清单只能由评审子 Agent（通过 Agent 工具派发）更新。评审失败后应回到阶段3 澄清 → 更新 requirement.md → 重新派发评审子 Agent（阶段7b），不可自行修改 checklist。
```

改为：

```
${target} 禁止直接 Write/Edit。checklist 变更须通过 feature-clarify.js CLI（update-checklist / confirm-final / waive-item）操作。
```

- [ ] **Step 2: 修改 checkClarifyChecklistBashFromStdin 的拒绝消息**

将第 262 行的 reason：

```
requirement-checklist.json 禁止通过 Bash 直接操作；评审子 Agent 使用 feature-clarify.js update-checklist，主会话使用 feature-clarify.js confirm-final。
```

改为：

```
requirement-checklist.json 禁止通过 Bash 直接操作；checklist 变更须通过 feature-clarify.js CLI。
```

- [ ] **Step 3: Commit**

```bash
git add scripts/devsphere-guard.js
git commit -m "fix: update guard hook messages to not claim role-based checklist ownership"
```

---

### Task 11: 修复现有测试

**Files:**
- Modify: `scripts/test/feature-clarify.test.js:53-65, 67-88, 106-127`
- Modify: `scripts/test/skill-contracts.test.js:17-18`

**Interfaces:**
- Consumes: confirmFinal 不写 evidence (Task 4), checkComplete 不检查文件内容 (Task 5), SKILL.md 删除 MUST NOT reuse/teammate

- [ ] **Step 1: 修复 checkComplete 测试 — 删除最终确认文字**

将 `feature-clarify.test.js` 第 57 行：

```javascript
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# 原始需求\n\n## 11. 最终确认\n以上内容已经过用户确认。- **确认时间**：2026-07-14 10:00');
```

改为：

```javascript
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# 原始需求\n\n## 2. 需求概述\n\n### 2.1 业务目标\n\n测试业务目标');
```

- [ ] **Step 2: 修复 checkComplete 全员 pass 测试 — 删除最终确认文字**

将 `feature-clarify.test.js` 第 71 行：

```javascript
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# 原始需求\n\n## 11. 最终确认\n以上内容已经过用户确认。- **确认时间**：2026-07-14 10:00');
```

改为：

```javascript
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# 原始需求\n\n## 2. 需求概述\n\n### 2.1 业务目标\n\n测试业务目标');
```

- [ ] **Step 3: 修复 confirmFinal 测试 — 不再断言 evidence**

将 `feature-clarify.test.js` 第 113-127 行的 confirmFinal 测试改为：

```javascript
test('confirmFinal sets item 7.8.8 to pass without touching evidence', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-006');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  // Set evidence to something existing to verify it is NOT overwritten
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.8.8') {
        item.evidence = 'preexisting-evidence';
        item.note = 'preexisting-note';
      }
    }
  }
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));

  const result = confirmFinal(taskPath);
  assert.deepStrictEqual(result, { confirmed: true });

  const updated = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  for (const cat of updated.categories) {
    for (const item of cat.items) {
      if (item.id === '7.8.8') {
        assert.strictEqual(item.result, 'pass');
        assert.strictEqual(item.evidence, 'preexisting-evidence', 'evidence NOT overwritten by confirmFinal');
        assert.strictEqual(item.note, 'preexisting-note', 'note NOT overwritten by confirmFinal');
      }
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 4: 修复 skill-contracts.test.js — 删除 outdated 断言**

删除 `skill-contracts.test.js` 第 17-18 行：

```javascript
  assert.match(skill, /MUST NOT reuse agent IDs/i);
  assert.match(skill, /MUST NOT use teammate/i);
```

- [ ] **Step 5: 运行测试确认全部通过**

```bash
node scripts/test/feature-clarify.test.js && node scripts/test/skill-contracts.test.js
```
Expected: 全部 pass

- [ ] **Step 6: Commit**

```bash
git add scripts/test/feature-clarify.test.js scripts/test/skill-contracts.test.js
git commit -m "test: update tests for confirmFinal simplification and content-check removal"
```

---

### Task 12: 新增 feature-clarify.js 测试（reserved/waived/reviewVersion/stale-confirmation）

**Files:**
- Modify: `scripts/test/feature-clarify.test.js`（追加测试）

**Interfaces:**
- Consumes: waiveItem (Task 6), checkStaleConfirmation (Task 7), reserved guard (Task 3), reviewVersion (Task 3)
- Produces: 完整测试覆盖新增功能

- [ ] **Step 1: 添加 import**

在 `feature-clarify.test.js` 第 10 行，添加 `waiveItem`, `checkStaleConfirmation`：

```javascript
const { init, checkComplete, readChecklist, confirmFinal, updateChecklist, waiveItem, checkStaleConfirmation } = require('../feature-clarify');
```

- [ ] **Step 2: 测试 updateChecklist 拒绝 reserved 项**

在文件末尾（第 205 行之后）追加：

```javascript
test('updateChecklist rejects reserved items', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-012');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  assert.throws(
    () => updateChecklist(taskPath, { items: [{ id: '7.8.8', result: 'pass', evidence: '', note: '' }] }),
    /reserved/
  );

  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 3: 测试 updateChecklist 支持 incrementReviewVersion**

```javascript
test('updateChecklist increments reviewVersion when requested', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-013');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  // First round
  const r1 = updateChecklist(taskPath, { items: [{ id: '7.1.1', result: 'pass', evidence: 'ok', note: '' }], incrementReviewVersion: true });
  assert.strictEqual(r1.reviewVersion, 1);

  // Second round
  const r2 = updateChecklist(taskPath, { items: [{ id: '7.1.2', result: 'pass', evidence: 'ok', note: '' }], incrementReviewVersion: true });
  assert.strictEqual(r2.reviewVersion, 2);

  // Without increment, version stays
  const r3 = updateChecklist(taskPath, { items: [{ id: '7.1.3', result: 'pass', evidence: 'ok', note: '' }] });
  assert.strictEqual(r3.reviewVersion, 2);

  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 4: 测试 checkComplete 接受 waived**

```javascript
test('checkComplete returns true when items are pass or waived (no fail)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-014');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.1.1' || item.id === '7.1.2') {
        item.result = 'waived';
        item.note = '用户接受风险';
      } else {
        item.result = 'pass';
      }
    }
  }
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));

  const result = checkComplete(taskPath);
  assert.strictEqual(result.complete, true, `expected complete=true, failures: ${JSON.stringify(result.failures)}`);

  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 5: 测试 checkComplete 拒绝仍有 fail 的情况**

```javascript
test('checkComplete returns false when any item is still fail (waived ok)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-015');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.1.1') {
        item.result = 'waived';
        item.note = '用户接受风险';
      } else if (item.id === '7.8.8') {
        // leave as fail — reserved item, still blocks
        item.result = 'fail';
      } else {
        item.result = 'pass';
      }
    }
  }
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));

  const result = checkComplete(taskPath);
  assert.strictEqual(result.complete, false);
  assert.ok(result.failures.some(f => f.includes('7.8.8')), '7.8.8 still blocks when fail');

  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 6: 测试 waiveItem 成功**

```javascript
test('waiveItem sets items to waived when reviewVersion >= limit', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-016');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  // Set reviewVersion >= designRevisionLimit (default 25)
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  checklist.reviewVersion = 25;
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));

  const result = waiveItem(taskPath, { items: [{ id: '7.1.1', reason: '低风险' }] });
  assert.deepStrictEqual(result, { waived: 1 });

  const updated = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  for (const cat of updated.categories) {
    for (const item of cat.items) {
      if (item.id === '7.1.1') {
        assert.strictEqual(item.result, 'waived');
        assert.ok(item.note.includes('低风险'), `note contains reason: ${item.note}`);
      }
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 7: 测试 waiveItem 在 reviewVersion 不足时拒绝**

```javascript
test('waiveItem throws when reviewVersion < designRevisionLimit', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-017');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  // reviewVersion is 0, limit is 25
  assert.throws(
    () => waiveItem(taskPath, { items: [{ id: '7.1.1', reason: '低风险' }] }),
    /cannot waive/
  );

  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 8: 测试 waiveItem 拒绝非 fail 项**

```javascript
test('waiveItem throws when item is not fail', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-018');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  checklist.reviewVersion = 25;
  // 7.1.1 is fail by default, change 7.1.2 to pass
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.1.2') item.result = 'pass';
    }
  }
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));

  assert.throws(
    () => waiveItem(taskPath, { items: [{ id: '7.1.2', reason: 'test' }] }),
    /not fail/
  );

  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 9: 测试 checkStaleConfirmation — 过期检测**

```javascript
test('checkStaleConfirmation detects stale confirmation and resets 7.8.8', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-019');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  // Set 7.8.8 to pass (simulate confirmed)
  confirmFinal(taskPath);

  // Verify it's pass
  let checklist = JSON.parse(fs.readFileSync(path.join(taskPath, 'reviews', 'requirement-checklist.json'), 'utf8'));
  let item788 = null;
  for (const cat of checklist.categories) {
    const found = cat.items.find(i => i.id === '7.8.8');
    if (found) { item788 = found; break; }
  }
  assert.strictEqual(item788.result, 'pass');

  // Touch requirement.md to make it newer than checklist
  const now = new Date();
  fs.utimesSync(path.join(taskPath, 'inputs', 'requirement.md'), now, now);

  // Small delay to ensure mtime difference
  const start = Date.now();
  while (Date.now() - start < 10) {} // ~10ms

  // Check stale
  const result = checkStaleConfirmation(taskPath);
  assert.strictEqual(result.stale, true, `expected stale=true, got: ${JSON.stringify(result)}`);

  // Verify 7.8.8 was reset to fail
  checklist = JSON.parse(fs.readFileSync(path.join(taskPath, 'reviews', 'requirement-checklist.json'), 'utf8'));
  for (const cat of checklist.categories) {
    const found = cat.items.find(i => i.id === '7.8.8');
    if (found) { item788 = found; break; }
  }
  assert.strictEqual(item788.result, 'fail', '7.8.8 should be reset to fail');

  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 10: 测试 checkStaleConfirmation — 未过期时不触发**

```javascript
test('checkStaleConfirmation returns stale=false when not yet confirmed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-020');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  // No confirmFinal called, 7.8.8 is still fail
  const result = checkStaleConfirmation(taskPath);
  assert.strictEqual(result.stale, false);

  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 11: 运行全部测试**

```bash
node scripts/test/feature-clarify.test.js
```
Expected: 全部 pass

- [ ] **Step 12: Commit**

```bash
git add scripts/test/feature-clarify.test.js
git commit -m "test: add tests for waive-item, check-stale-confirmation, reserved guard, and reviewVersion"
```

---

### Task 13: 最终验证 — 全量测试 + 插件结构校验

**Files:**
- （无文件变更，纯验证）

- [ ] **Step 1: 运行全量测试**

```bash
node scripts/test/feature-clarify.test.js && node scripts/test/skill-contracts.test.js && node scripts/test/feature-workflow-clarification.test.js && node scripts/test/feature-design-router.test.js
```
Expected: 全部 pass，无失败

- [ ] **Step 2: 插件结构校验**

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js check-plugin-structure
```
Expected: 通过（仅既有根目录 CLAUDE.md 警告，无新增问题）

- [ ] **Step 3: 验证旧测试仍然独立通过**

```bash
# skill-contracts.test.js 无 MUST NOT reuse/teammate 断言后通过
node scripts/test/skill-contracts.test.js
```
Expected: 全部 pass

- [ ] **Step 4: Commit（如有遗漏文件）**

```bash
git status
# 确认所有修改已提交
```
