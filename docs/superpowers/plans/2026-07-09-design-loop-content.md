# 设计循环内容层 (skill/agent 采纳) — Plan B2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Plan A/B1 的确定性骨干真正被 skill/agent 层使用——重写编排 skill 调 `resolve-design-loop`、给 4 个阶段 owner agent 加 teammate scope/draft 协议、加 `decision_loop` 交互模式、`feature-assess` 写 `ciCdRisk`、更新 CLAUDE.md。

**Architecture:** 职责分层：skill=领域动作（轻改去架构污染）、agent=角色+teammate 交互策略（scope/draft 协议+硬契约）、`feature-design` skill=设计循环执行器（调 `resolve-design-loop` 按 kind 派发）。`workflow` skill 对 `designing` 仍委托 `feature-design`，但 `feature-design` 现在自驱整个循环（agent-teams 派发 + AskUserQuestion 代理）。依赖 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`。

**Tech Stack:** Node.js (CommonJS) 脚本（Task 1，TDD）；其余为 Markdown skill/agent/reference 内容（场景验证 + review 对照 spec）。

## Global Constraints

- 不新增 npm 依赖、不新增 package.json、不新增构建步骤。
- 不改 Plan A/B1 已落地的脚本逻辑（`resolveDesignLoop`/`resolveDesignStageAction`/guard/sync-stage-status），**除 Task 1 给 `set-task-status` 加 `ciCdRisk` 参数**。
- gated decision 字段结构以 `templates/decisions/README.md` 和 Plan A 的 `devsphere-decisions.js` 为准（`type=gated` 必含 `options` 2-4 + `askMode`）。
- decisions 文件是 **JSON**（`decisions/<slug>-decisions.json`），不是 `.md`——agent 里旧的 `.md` 引用要改。
- 阶段 owner = sa/se/mde/tse（加 teammate 协议）；cie/dev = 评审者（不加协议，加回流说明）。
- 中文 UI：所有面向用户的 skill/agent 文本用中文；选项交互必须用 AskUserQuestion（遵循 `references/interaction-guidelines.md`）。
- 主会话（team-lead）独占 AskUserQuestion；teammate 不直接问用户。
- 内容任务的验证 = review 对照 spec + resolver 契约；Task 1 用 `node:test` TDD。

## Spec 覆盖映射（Plan B spec `2026-07-09-design-loop-plan-b.md`）

| Spec 节 | 任务 |
|---|---|
| §2 `resolve-design-loop` 已落地（B1） | —（不改） |
| §3 agent teammate 协议 + cie/dev 回流 | Task 3 |
| §6 `decision_loop` 字段映射 | Task 2 |
| §7 skill 轻改（去架构污染） | Task 5 |
| §8 影响面：编排 skill 接线 + feature-assess ciCdRisk | Task 1（脚本）+ Task 4（skill） |
| §8 CLAUDE.md | Task 6 |

---

## File Structure

| 文件 | 责任 | 任务 |
|---|---|---|
| `scripts/workflows/feature-workflow.js` (改) | `set-task-status` 加 `ciCdRisk` 参数 | Task 1 |
| `scripts/test/feature-workflow-decisions.test.js` (改) | ciCdRisk CLI 测试 | Task 1 |
| `references/interaction-guidelines.md` (改) | 新增 `decision_loop` 模式 + 字段映射 | Task 2 |
| `agents/{sa,se,mde,tse}.md` (改) | teammate scope/draft 协议 + 硬契约 + `.md→.json` | Task 3 |
| `agents/{cie,dev}.md` (改) | 评审回流说明 | Task 3 |
| `skills/feature-design/SKILL.md` (改) | 重写为设计循环执行器 | Task 4 |
| `skills/workflow/SKILL.md` (改) | feature-design 委托说明 + ciCdRisk 入 set-task-status | Task 4 |
| `skills/feature-assess/SKILL.md` (改) | 输出 ciCdRisk 布尔评估 | Task 4 |
| `skills/feature-design-{business,solution,implementation,test}/SKILL.md` (改) | 去架构污染轻改 | Task 5 |
| `CLAUDE.md` (改) | 设计循环 / 模式 / 动作模型说明 | Task 6 |

---

## Task 1: `set-task-status` 支持 `ciCdRisk`（TDD）

**Files:**
- Modify: `scripts/workflows/feature-workflow.js`（`main()` 的 `case 'set-task-status'`）
- Modify: `scripts/test/feature-workflow-decisions.test.js`（追加测试）

**Interfaces:**
- Consumes: 既有 `set-task-status` CLI（args: workspaceRoot, newStatus, workflowMode, humanGateStages）。
- Produces: `set-task-status` 接受第 5 个可选 arg `ciCdRisk`（`'true'`/`'false'`），写入 `state.ciCdRisk`（boolean）。B1 的 `resolvePostArtifact` 读 `state.ciCdRisk === true` 触发 CIE。

- [ ] **Step 1: 追加失败测试**

在 `scripts/test/feature-workflow-decisions.test.js` 末尾追加：
```javascript
test('set-task-status 写入 ciCdRisk=true', () => {
  const { workspaceRoot, taskPath } = makeTask();
  execFileSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'set-task-status', workspaceRoot, 'assessed', 'strict-human-loop', '', 'true',
  ], { encoding: 'utf-8' });
  const { readState } = require('../devsphere-state');
  const st = readState(taskPath);
  assert.strictEqual(st.status, 'assessed');
  assert.strictEqual(st.workflowMode, 'strict-human-loop');
  assert.strictEqual(st.ciCdRisk, true);
});

test('set-task-status 不传 ciCdRisk 时不改该字段', () => {
  const { workspaceRoot, taskPath } = makeTask();
  execFileSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'set-task-status', workspaceRoot, 'assessed', 'auto-design',
  ], { encoding: 'utf-8' });
  const { readState } = require('../devsphere-state');
  const st = readState(taskPath);
  assert.strictEqual(st.ciCdRisk, undefined);
});
```
（确保文件顶部已 `const { execFileSync } = require('child_process')` 且 `path`/`makeTask`/`assert` 已引入——Task 5 的既有测试已引入 `execFileSync` 与 `path`，确认即可。）

- [ ] **Step 2: 运行确认失败**

Run: `node --test scripts/test/feature-workflow-decisions.test.js`
Expected: 两条新测试 FAIL（ciCdRisk 未被写入 / undefined≠true）

- [ ] **Step 3: 改 `case 'set-task-status'`**

定位 `case 'set-task-status':`（当前参数：`workspaceRoot=args[1]`, `newStatus=args[2]`, `workflowMode=args[3]`, `humanGateStages=args[4]`）。在 `humanGateStages` 解析之后、`if (newStatus) ...` 之前，加入 `ciCdRisk` 解析；并在写入段加一行：

```javascript
      const humanGateStages = args[4] ? args[4].split(',') : [];
      const ciCdRiskRaw = args[5];
      // ...（保持现有的 current-task / state 读取逻辑不变）...
      if (newStatus) state.status = newStatus;
      if (workflowMode) state.workflowMode = workflowMode;
      if (humanGateStages.length > 0) state.humanGateStages = humanGateStages;
      if (ciCdRiskRaw !== undefined) state.ciCdRisk = (ciCdRiskRaw === 'true');
```

（仅新增 `ciCdRiskRaw` 一行声明 + `if (ciCdRiskRaw !== undefined) ...` 一行写入。其余不变。）

- [ ] **Step 4: 运行确认通过**

Run: `node --test scripts/test/feature-workflow-decisions.test.js`
Expected: PASS（既有 + 2 新）

- [ ] **Step 5: 全量回归**

Run: `node --test scripts/test/devsphere-decisions.test.js scripts/test/devsphere-decisions-resolve.test.js scripts/test/devsphere-guard-decisions.test.js scripts/test/feature-workflow-decisions.test.js scripts/test/design-loop-resolver.test.js`
Expected: 全部 PASS（57 + 2 = 59）

- [ ] **Step 6: 提交**

```bash
git add scripts/workflows/feature-workflow.js scripts/test/feature-workflow-decisions.test.js
git commit -m "feat(workflow): set-task-status accepts ciCdRisk flag"
```

---

## Task 2: `decision_loop` 交互模式（interaction-guidelines）

**Files:**
- Modify: `references/interaction-guidelines.md`（文末追加模式 4）

**Interfaces:**
- Consumes: `resolve-design-loop` 返回的 `ask_decisions` 动作里的 `decisions[]`（每项 `{id, summary, options, recommendation, askMode}`，来自 B1 `toQuestionData`）。
- Produces: `decision_loop` 模式文档，供主会话把每条 gated decision 机械转成 AskUserQuestion、回写 `resolution`。

- [ ] **Step 1: 在 `references/interaction-guidelines.md` 末尾追加**

```markdown
---

## 模式 4: `decision_loop` — 设计决策逐项问询

**适用场景：** 设计阶段决策循环中，主会话（team-lead）把 SA/SE/MDE/TSE 在 scope 阶段出土的 gated decision 逐项抛给用户确认。问题与选项由设计 agent 作者，主会话只机械转译——不做设计判断。

**数据来源：** `resolve-design-loop` 返回的 `ask_decisions` 动作里的 `decisions[]`，每项形如 `{id, summary, options, recommendation, askMode}`。

**字段映射（decision → AskUserQuestion）：**

| decision 字段 | AskUserQuestion 字段 |
|---|---|
| `summary` | `question`（可补上下文前缀，如「[业务设计] ...」） |
| `options[]` | `options[]`（`label`/`description` 直传） |
| `recommendation` | 推荐项置首，`label` 后加 `(Recommended)` |
| `askMode` | `single_select`→`multiSelect:false`；`multi_select`→`true`；`confirm_gate`→构造两选项确认式（`multiSelect:false`） |

**构造规则：**
- 每条 decision = 一次 AskUserQuestion 调用（`options` 数 2-4 已由 `devsphere-decisions.js` 强校验保证）。
- `header` ≤12 字，可用阶段名（如「业务决策」）。
- 用户回答（含 Other 自定义）写回该 decision 的 `resolution`：
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-decisions.js resolve <taskPath> <slug> <decisionId> '{"chosen":"<用户选择>","note":"<可选备注>","decidedAt":"<ISO 时间>"}'
  ```
- 全部 decision `status=decided` 后，回到 `resolve-design-loop`（得 `draft`）。

**示例：** gated decision `{id:'BD-DEC-001', summary:'博客是否需要注册登录？', options:[{label:'需要',description:'...'},{label:'不需要',description:'...'}], recommendation:'需要', askMode:'single_select'}` →
```
header: "业务决策"
question: "[业务设计] 博客是否需要注册登录？"
options:
  - label: "需要 (Recommended)"
    description: "..."
  - label: "不需要"
    description: "..."
multiSelect: false
```
用户选「需要」→ `resolve ... BD-DEC-001 '{"chosen":"需要","decidedAt":"2026-07-09T..."}'`
```

- [ ] **Step 2: 校验 Markdown 结构完整**

Run: `grep -n "模式 4" references/interaction-guidelines.md`
Expected: 输出标题行。

- [ ] **Step 3: 验证（review）**

对照 spec §6 字段映射逐项核对；确认与 B1 `toQuestionData` 输出字段（id/summary/options/recommendation/askMode）一致。

- [ ] **Step 4: 提交**

```bash
git add references/interaction-guidelines.md
git commit -m "docs(interaction): add decision_loop pattern for design decisions"
```

---

## Task 3: 阶段 owner agent 加 teammate 协议 + cie/dev 回流 + `.md→.json`

**Files:**
- Modify: `agents/sa.md`, `agents/se.md`, `agents/mde.md`, `agents/tse.md`, `agents/cie.md`, `agents/dev.md`

**Interfaces:**
- Consumes: B1 `resolve-design-loop` 的 `dispatch_agent`(mode scope/draft, humanGated) 动作；`devsphere-decisions.js` CLI。
- Produces: 4 个阶段 owner agent 在 scope/draft 模式下的行为契约；cie/dev 的评审回流说明。

### 阶段 owner（sa/se/mde/tse）

- [ ] **Step 1: 在每个阶段 owner agent 的「人机交互规范」段**之前**插入 teammate 协议**

在 `agents/sa.md`、`agents/se.md`、`agents/mde.md`、`agents/tse.md` 的 `## 人机交互规范` 行**之前**，各插入以下**完全相同**的块（协议用「你的 design skill / 你的主产物 / 你的 slug」泛指，各 agent 自身的产物/skill 已在其「核心职责」「产物责任」段定义）：

```markdown
## teammate 交互协议（设计阶段决策循环）

在 `strict-human-loop` 或 `collaborative-design`（门禁阶段）模式下，你作为 teammate 被 team-lead（主会话）派发，每次只跑一个模式，由派发 prompt 指明（编排器由 `resolve-design-loop` 驱动）：

### scope 模式（出土决策）
- 按你的 design skill 做上游分析：调 `knowledge-query` 查受影响领域知识 → 拆功能点候选 → 识别所有不确定/待采纳假设。
- 据派发 prompt 的 `humanGated` 标志落 `decisions/<你的 slug>-decisions.json`：
  - `humanGated=true`：每个需用户拍板的点写成 `type=gated` decision（含 `options` 2-4、`recommendation`、`askMode`、`rationale`、`evidence`、`impact`）。
  - `humanGated=false`：写成 `type=autonomous` + assumption 标记（自决，不进闸口）。
- **写完 decisions 即停当轮。绝不写主产物、绝不擅自编答案。** 发消息给 lead：「gated 决策就绪，N 项待决」。

### draft 模式（基于决议定稿）
- 读 `decisions/<你的 slug>-decisions.json` 的 `resolution`（lead 已逐项问过用户）。
- 按你的 design skill 产出完整主产物，所有 gated 项必须按 `resolution` 落实。
- 写完主产物即停当轮。

### 硬契约
- 不确定 → gated decision，不臆测。
- scope 不碰主产物；draft 不改 decisions 的 `resolution`。
- 违约时 PreToolUse 守卫会拦下主产物写入（见 `hooks/hooks.json`）。

> gated decision 字段结构见 `templates/decisions/README.md`；写入用 `scripts/devsphere-decisions.js`（init/add/resolve）。

```

- [ ] **Step 2: 修正 4 个 agent 的 decisions 文件引用 `.md → .json`**

在各 agent 的「产物责任」段，把 `decisions/<slug>-decisions.md` 改为 `decisions/<slug>-decisions.json`：
- `agents/sa.md`：`decisions/business-design-decisions.md` → `decisions/business-design-decisions.json`
- `agents/se.md`：`decisions/solution-design-decisions.md` → `decisions/solution-design-decisions.json`
- `agents/mde.md`：`decisions/implementation-design-decisions.md` → `decisions/implementation-design-decisions.json`
- `agents/tse.md`：`decisions/test-design-decisions.md` → `decisions/test-design-decisions.json`

### cie / dev（评审者）

- [ ] **Step 3: 在 `agents/cie.md` 和 `agents/dev.md` 的「人机交互规范」段之前插入回流说明**

在 `agents/cie.md`、`agents/dev.md` 的 `## 人机交互规范` 行**之前**，各插入：

```markdown
## 评审回流约定（设计阶段决策循环）

你作为评审者，若发现「需用户拍板」的部署/配置/实现不确定点，**不要**自行决定，也**不要**直接写 gated decision——提为 **blocking 评审项**（经 `feature-review` + review-matrix）。编排器会派阶段 owner（draft 模式）把它补成 gated decision，再进 ask 循环。决策创作权始终在阶段 owner。

```

- [ ] **Step 4: 验证（review）**

逐文件确认：4 个 owner 都插入了 teammate 协议 + 改了 `.json`；cie/dev 插入了回流说明；协议里的 `humanGated`/scope/draft/硬契约与 spec §3、B1 resolver 契约一致。

- [ ] **Step 5: 提交**

```bash
git add agents/sa.md agents/se.md agents/mde.md agents/tse.md agents/cie.md agents/dev.md
git commit -m "feat(agents): teammate scope/draft protocol + cie/dev review backflow"
```

---

## Task 4: 编排 skill — feature-design 重写为循环执行器 + workflow 委托 + feature-assess 写 ciCdRisk

**Files:**
- Modify: `skills/feature-design/SKILL.md`（重写）
- Modify: `skills/workflow/SKILL.md`（feature-design 委托段 + set-task-status 加 ciCdRisk）
- Modify: `skills/feature-assess/SKILL.md`（输出 ciCdRisk）

**Interfaces:**
- Consumes: B1 `resolve-design-loop` CLI（返回 dispatch_agent/ask_decisions/dispatch_reviewers/human_confirm/all_design_stages_ready/show_status）；Task 1 的 `set-task-status ... ciCdRisk`。
- Produces: `feature-design` 作为设计循环执行器；`workflow` 对 `designing` 委托给它；`feature-assess` 评估并输出 ciCdRisk。

- [ ] **Step 1: 重写 `skills/feature-design/SKILL.md` 全文**

替换整个文件内容为：

```markdown
---
name: feature-design
description: 设计阶段循环执行器。在主会话运行，调 resolve-design-loop 确定性路由，按动作类型派发 teammate / 代问用户 / 派评审，直到设计阶段完成。依赖 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1。
---

# Feature Design — 设计循环执行器

你在主会话运行（agents=[]），驱动设计阶段决策循环。**路由完全由确定性脚本决定**，你只负责「执行脚本返回的动作」。

## 集成契约

- **入口:** 被 workflow skill 在任务处于 `designing` 状态时调用。
- **依赖:** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`（用 agent-teams 派发 teammate）。未启用则降级提示用户启用。
- **入参:** 当前活跃任务（`.devsphere/current-task.json`）。
- **输出:** 设计阶段全部就绪（`all_design_stages_ready`）→ 返回 workflow 进入 integrated-design；或 `human_confirm` 暂停等用户。
- **完成标准:** `resolve-design-loop` 返回 `all_design_stages_ready`。

## 执行循环

重复步骤 1–3，直到动作不需再循环：

### 步骤1：运行确定性路由

先解析当前任务的绝对 taskPath（记为 `$TP`）——读 `.devsphere/current-task.json` 的 `taskPath` 字段并拼上 `${CLAUDE_PROJECT_DIR}`，或：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-state.js get-task-path ${CLAUDE_PROJECT_DIR}
# 输出 {"taskPath":"<abs path>"}，取 taskPath 作为 $TP
```

然后运行路由：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js resolve-design-loop "$TP"
```

解析 stdout JSON 为 `action`。

### 步骤2：按 `action.kind` 派发

| kind | 动作 |
|---|---|
| `dispatch_agent` (mode=`scope`) | 用 Agent tool 派发 `action.agent` 为 teammate，prompt 指明：跑 `action.skill` 的 **scope 模式**、stage=`action.stage`、**humanGated=`action.humanGated`**、只写 decisions 不碰主产物。完成后到步骤3。 |
| `dispatch_agent` (mode=`draft`) | 派发 `action.agent` 跑 **draft 模式**：读 decisions 的 resolution、按 skill 写主产物。**若 `action.requiresReReview===true`：draft 完成后不要直接回步骤1**——先执行一次 `dispatch_reviewers`（派 `action` 对应阶段的评审者跑 `feature-review`），待 review-matrix 更新后再回步骤1。否则到步骤3。 |
| `ask_decisions` | 对 `action.decisions[]` **逐项**按 `decision_loop` 模式（见 `references/interaction-guidelines.md`）调 AskUserQuestion，回写 `resolution`（`devsphere-decisions.js resolve`）。全部 resolved 后到步骤3。 |
| `dispatch_reviewers` | 用 Agent tool **并行**派发 `action.reviewers` 跑 `feature-review`。完成后到步骤3。 |
| `human_confirm` | 用 AskUserQuestion（confirm_gate）请用户批准该阶段。批准后到步骤3。 |
| `all_design_stages_ready` | 设计阶段全部完成，**返回 workflow**（进入 integrated-design / `design_ready`）。 |
| `show_status` | 展示 `action.reason`，停止并提示用户。 |

### 步骤3：阶段状态同步后回步骤1

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js sync-stage-status ${CLAUDE_PROJECT_DIR}
```

然后回步骤1（resolver 将基于更新后的磁盘事实重算）。

## 约束

- **不自行决定路由**——一切以 `resolve-design-loop` 返回为准。
- **不在主会话写设计产物**——产物由 teammate 写；主会话只写 `resolution`（代问用户后）。
- **revise（`requiresReReview`）后必须先 re-review 再回 resolver**——否则 blocking 仍 open 会死循环。
- teammate 持久上下文跨 scope/draft 两轮（agent-teams）；不原地阻塞等用户。
```

- [ ] **Step 2: 改 `skills/workflow/SKILL.md` 的 feature-design 委托段**

定位步骤5「无 Agent 场景」里那段：
```
特别地，如果 `nextAction.skill === 'feature-design'`，执行其子编排逻辑得到结构化路由结果（`{ stage, skill, agent/agents, reason }`），然后按下方 Agent 派发逻辑处理该路由结果。
```
替换为：
```
特别地，如果 `nextAction.skill === 'feature-design'`：在主会话执行 `feature-design` skill，它内部调 `resolve-design-loop` **自驱整个设计循环**（派发 agent-teams teammate / 代用户 AskUserQuestion / 派评审），直到返回 `all_design_stages_ready`（设计完成）或 `human_confirm`（暂停等用户）。**workflow 不直接派发设计 agent**。feature-design 执行一轮后，运行阶段状态同步，再回步骤4 重算 nextAction。依赖 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`。
```

- [ ] **Step 3: 改 `skills/workflow/SKILL.md` 的 set-task-status 调用加 ciCdRisk**

定位步骤5「任务状态同步（仅 feature-assess 完成后）」里的命令：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status ${CLAUDE_PROJECT_DIR} assessed <workflowMode> <humanGateStages>
```
在其后补一句说明并改为可选第 5 个参数：
```
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status ${CLAUDE_PROJECT_DIR} assessed <workflowMode> <humanGateStages> <ciCdRisk>
```
并在该段说明里加一行：
```
- `<ciCdRisk>` 为 `'true'`/`'false'`（来自 feature-assess 的 CI/CD 风险评估；仅当评估命中部署/配置/CI/CD/环境风险时为 `'true'`）。`<humanGateStages>` 为空时传空串。
```

- [ ] **Step 4: 改 `skills/feature-assess/SKILL.md` 输出 ciCdRisk**

在步骤3（风险评估）末尾，把「CI/CD 与环境风险」从展示项升级为**布尔结果变量**。在步骤3 末尾加：
```markdown
**CI/CD 与环境风险评估（布尔结果）：** 若命中以下任一触发，记 `ciCdRisk=true`，否则 `false`：部署流程变更、配置/环境变量变更、CI/CD 流水线修改、数据库迁移/数据模型变更、发布策略/环境影响、基础设施/平台变更。此值在步骤4/5 后由 workflow 经 `set-task-status` 写入 `state.ciCdRisk`，用于设计评审阶段触发 CIE。
```
并在步骤6 的确认展示里把 `**CI/CD 与环境风险:** {是/否}` 改为 `**CI/CD 与环境风险 (ciCdRisk):** {true/false}`。

- [ ] **Step 5: 验证（端到端走查 + review）**

手动走查：建一个 strict 任务，依次
```bash
T=$(mktemp -d) && node scripts/devsphere-workspace.js create-feature-task "$T" FEAT-W strict-human-loop
TP="$T/.devsphere/tasks/feature/FEAT-W"
node scripts/workflows/feature-workflow.js resolve-design-loop "$TP"   # 期望 dispatch_agent scope
```
确认 feature-design 文本里步骤2 的每种 kind 都能在该 resolver 输出上正确对应。对照 spec §2/§3 核对 workflow/feature-assess 改动。

- [ ] **Step 6: 提交**

```bash
git add skills/feature-design/SKILL.md skills/workflow/SKILL.md skills/feature-assess/SKILL.md
git commit -m "feat(skills): feature-design as design-loop executor; workflow delegation; assess outputs ciCdRisk"
```

---

## Task 5: 4 个 design skill 轻改（去架构污染）

**Files:**
- Modify: `skills/feature-design-business/SKILL.md`、`skills/feature-design-solution/SKILL.md`、`skills/feature-design-implementation/SKILL.md`、`skills/feature-design-test/SKILL.md`

**Interfaces:**
- Consumes: 无新接口。skill 保持领域动作。
- Produces: skill 明确「scope 模式做上游子集 / draft 模式产出主产物」，模式由编排器派发决定。

- [ ] **Step 1: 在每个 design skill 的「集成契约」段补一句**

在 4 个 `skills/feature-design-*/SKILL.md` 的「集成契约」段（`## 集成契约` 下，`- **入口:**` 之前或之后）各加一行：
```markdown
- **模式:** 本 skill 是领域参考。agent 在 **scope 模式**做上游分析子集（查知识 / 拆功能点 / 出土 decisions），在 **draft 模式**产出完整主产物；模式由编排器（`resolve-design-loop`）派发决定，见 agent 的 teammate 协议。
```

- [ ] **Step 2: 松开「一次性产出主产物」措辞**

在 4 个 skill 里，把「执行步骤」开头的强完成指令（如「产出 `artifacts/<x>.md`」作为唯一终点）改为兼容两阶段的表述。具体：在「执行步骤」段最上方加一句：
```markdown
> 以下步骤描述完整设计。scope 模式只执行到「出土 decisions」即停（不写主产物）；draft 模式基于已 resolved 的 decisions 执行完整步骤产出主产物。
```
（不删原步骤，只加这句前置说明。）

- [ ] **Step 3: 验证（review）**

确认 4 个 skill 都加了模式说明 + 前置说明；领域内容（章节/质量门/知识查询）未被改动。

- [ ] **Step 4: 提交**

```bash
git add skills/feature-design-business/SKILL.md skills/feature-design-solution/SKILL.md skills/feature-design-implementation/SKILL.md skills/feature-design-test/SKILL.md
git commit -m "docs(design-skills): de-architecture note (scope/draft modes driven by orchestrator)"
```

---

## Task 6: CLAUDE.md 更新

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** 无。

- [ ] **Step 1: 在 CLAUDE.md「Feature task state machine」后补一节「设计阶段决策循环」**

在 CLAUDE.md 的状态机图/说明之后，插入：
```markdown
### 设计阶段决策循环（strict-human-loop / collaborative-design 门禁阶段）

设计阶段不再由 skill prose 路由，而由确定性脚本 `scripts/workflows/feature-workflow.js resolve-design-loop <taskPath>` 驱动整个生命周期，返回精确动作：

| 动作 | 含义 |
|---|---|
| `dispatch_agent` (scope) | 派阶段 owner 查知识 + 出土 gated decisions（`humanGated` 标志传入） |
| `ask_decisions` | 主会话逐项 AskUserQuestion（`decision_loop` 模式），回写 resolution |
| `dispatch_agent` (draft) | 派 owner 基于已 resolved decisions 定稿主产物；`requiresReReview` 时随后须 re-review |
| `dispatch_reviewers` | 派评审者（含 CIE，当 `state.ciCdRisk===true`）跑 feature-review |
| `human_confirm` | 主会话请用户批准该阶段 |
| `all_design_stages_ready` | 设计阶段完成，进 integrated-design |

三模式兼容：`humanGated = strict 全阶段 / collaborative 仅 humanGateStages / auto-design 否`。`ask` 仅在 `humanGated && gated pending>0` 触发。PreToolUse 守卫（`hooks/hooks.json` → `devsphere-guard.js check-decisions-resolved`）stage-aware 强制：gated 未 resolved 时阶段 owner 写不出主产物（auto-design 与非门禁阶段放行）。决策内容持久化在 `decisions/<slug>-decisions.json`（双用途：闸口 + 知识沉淀）。编排由 `feature-design` skill（主会话执行）消费 resolver；agent teammate 协议见 `agents/*.md`。
```

- [ ] **Step 2: 验证（review）**

确认 CLAUDE.md 新节与 spec §2/§4/§4.4 一致；不与既有「Feature task state machine」矛盾。

- [ ] **Step 3: 提交**

```bash
git add CLAUDE.md
git commit -m "docs: document design-stage decision loop in CLAUDE.md"
```

---

## 完成标准（Plan B2）

- Task 1：全量测试 59/59 通过；`set-task-status ... ciCdRisk` 正确写 `state.ciCdRisk`。
- Task 2–6：内容经 review 对照 spec 通过；feature-design 能消费 resolver 的每一种 kind；agent teammate 协议与 B1 resolver 契约一致；`feature-assess` 输出 ciCdRisk 并经 workflow 写入。
- 端到端：strict 任务上，resolver 全生命周期（scope→ask→draft→review→human_confirm→all-ready）在 skill 文本里有明确对应动作；revise 的 `requiresReReview` 有 re-review 后续。
- 不改 Plan A/B1 脚本逻辑（除 Task 1 的 `set-task-status` 加参数）。

## 整体特性（A + B1 + B2）交付态

完成后，「strict-human-loop 模式下 SA 不与用户交互、擅自从一句话需求自作主张完成设计」的问题被端到端修复：SA 在 scope 阶段出土 gated 决策 → 主会话逐项问用户 → 基于决议定稿；gated 未 resolved 时 harness 级守卫拦下主产物。auto-design 流程不受影响。
