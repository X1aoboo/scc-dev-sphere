# Workflow 主动编排改造 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 workflow 从「被动推荐者」改造为「主动编排者」，feature-design 成为设计阶段唯一编排入口。

**Architecture:** workflow 的 run_skill 分支使用 AskUserQuestion 获取确认后自动派发 Agent 执行；feature-design 内部循环推进设计阶段，按 workflowMode 自动暂停或继续；resolver 对设计阶段统一输出 `feature-design`。

**Tech Stack:** Markdown (SKILL.md) + JavaScript (feature-workflow.js)

## Global Constraints

- AskUserQuestion 选项数量上限 4 个
- `confirm_gate` / `single_select` 模式遵循 `references/interaction-guidelines.md`
- 不覆盖已 `human_approved` 的阶段（除非 `--mode revise`）
- 所有 Agent 派发使用 Agent tool 异步 background 模式

---

## 文件结构

```
scripts/workflows/feature-workflow.js  (修改) — 设计阶段 skill 统一输出 feature-design
skills/workflow/SKILL.md               (修改) — run_skill 分支改为 AskUserQuestion + 自动 Agent 派发
skills/feature-design/SKILL.md         (修改) — 单阶段推进 → 循环编排
```

---

### Task 1: 修改 Resolver — 设计阶段 skill 统一为 feature-design

**Files:**
- Modify: `scripts/workflows/feature-workflow.js`

**Interfaces:**
- Produces: 设计阶段 resolver 输出的 `skill` 字段统一为 `feature-design`，不再输出 `feature-design-business/solution/implementation/test`
- 评审阶段的 skill 输出（`feature-review`）保持不变
- human_confirm 逻辑保持不变

- [ ] **Step 1: 修改 assessed 状态输出**

将第 28-33 行：
```js
if (status === 'assessed') {
    return makeAction('run_skill', state, 'businessDesign', 'business-design',
      'feature-design-business', {}, ['sa'],
      'Assessment complete. Begin business design.',
      [], ['artifacts/business-design.md']);
  }
```

改为：
```js
if (status === 'assessed') {
    return makeAction('run_skill', state, 'design', null,
      'feature-design', {}, ['sa'],
      'Assessment complete. Begin design phase.',
      [], ['artifacts/business-design.md']);
  }
```

- [ ] **Step 2: 修改 resolveDesigning 中 not_started 分支**

在第 153-157 行，将：
```js
if (stage.status === 'not_started') {
    return makeAction('run_skill', state, stageName, artifactTarget,
      getDesignSkill(stageName), {}, [designAgent],
      ...
```

改为：
```js
if (stage.status === 'not_started') {
    return makeAction('run_skill', state, 'design', null,
      'feature-design', {}, [designAgent],
      `Stage ${stageName} is not started. Begin design.`,
```

注意移除对 artifactTarget 的依赖（null），以及 skill 改为 `feature-design`。

- [ ] **Step 3: 验证修改**

```bash
grep -n "feature-design-" scripts/workflows/feature-workflow.js || echo "PASS: 无具体设计 skill 残留"
grep -n "'feature-design'" scripts/workflows/feature-workflow.js
```

预期：`feature-design-` 无匹配，`feature-design` 匹配 2 处（assessed + not_started）。

- [ ] **Step 4: 运行 resolver 测试确认不报错**

```bash
node -e "const { resolveNextAction } = require('./scripts/workflows/feature-workflow.js'); console.log('Module loads OK:', typeof resolveNextAction)"
```

预期：输出 "Module loads OK: function"

- [ ] **Step 5: 提交**

```bash
git add scripts/workflows/feature-workflow.js
git commit -m "feat: resolver 设计阶段 skill 统一输出 feature-design"
```

---

### Task 2: 修改 workflow SKILL.md — run_skill 改为 AskUserQuestion + 自动派发

**Files:**
- Modify: `skills/workflow/SKILL.md`

**Interfaces:**
- Consumes: `references/interaction-guidelines.md` 中的 `confirm_gate` 模式
- Consumes: Task 1 产出的 resolver（skill 输出已统一）
- Produces: workflow 的 run_skill 分支变为主动编排，不再让用户手动操作

- [ ] **Step 1: 替换 run_skill 分支内容**

将第 93-121 行（`#### run_skill` → 引导用户手动执行 + Agent tool 调用的说明）：

```markdown
#### `run_skill`

展示：
```
📋 **下一步动作:** {nextAction.reason}

**任务:** {nextAction.taskId}
**状态:** {nextAction.status}
**阶段:** {nextAction.stage || 'N/A'}
**目标:** {nextAction.target || 'N/A'}

**建议动作:**
  Skill: /scc-dev-sphere:{nextAction.skill}
  Agent(s): {nextAction.agents.join(', ')}

**需要的产物:**
{nextAction.requiredArtifacts.map(a => '  - ' + a).join('\n')}

**预期输出:**
{nextAction.expectedArtifacts.map(a => '  - ' + a).join('\n')}
```

然后引导用户执行推荐的 skill。例如：
- 如果 `skill=feature-design-business` 且 `agents=[sa]`：调用 SA Agent，指示其执行 `feature-design-business` skill。
- 如果 `skill=feature-review` 且 `agents=[se]`：调用 SE Agent，使用 `feature-review` skill 及 `--target` 参数（来自 `nextAction.args.target`）。

使用 Agent tool 调用推荐的 Agent，将 skill 名称和参数作为上下文传入。

**重要：** workflow 本身不生成设计、不执行评审、不修改状态。它只告诉用户下一步该做什么。
```

替换为：

```markdown
#### `run_skill`

展示状态摘要：

```
📋 **下一步动作:** {nextAction.reason}

**任务:** {nextAction.taskId}
**状态:** {nextAction.status}
**阶段:** {nextAction.stage || 'N/A'}
**目标:** {nextAction.target || 'N/A'}

**需要的产物:**
{nextAction.requiredArtifacts.map(a => '  - ' + a).join('\n')}

**预期输出:**
{nextAction.expectedArtifacts.map(a => '  - ' + a).join('\n')}
```

然后使用 **AskUserQuestion 工具**获取用户决策（遵循 `references/interaction-guidelines.md` 中的 `single_select` 模式）：

- `header`: "下一步"（≤12字）
- `question`: "{nextAction.reason} 是否继续？"
- `options`:
  - `label: "✅ 继续执行" (Recommended)` `description: "自动执行 {nextAction.skill} skill，加载 {nextAction.agents.join(', ')} Agent"`
  - `label: "⏸️ 暂停"` `description: "暂不执行，稍后手动处理"`
- `multiSelect`: false
- 用户可通过 Other 输入自定义指令

**用户确认后（选择继续）：**
使用 **Agent tool** 自动调用 `nextAction.agents` 中的第一个 Agent（使用 `background: true`），将 skill 名称和参数作为上下文传入：

- 构造 Agent 的 prompt，包含：
  - 当前任务的任务 ID 和路径
  - 需要执行的 skill 名称（`nextAction.skill`）和模式参数（`nextAction.args`）
  - 需要的产物路径（`nextAction.requiredArtifacts`）
  - 预期输出产物路径（`nextAction.expectedArtifacts`）
- 使用 `agents` 字段中的第一个 agent 名
- 使用 `model: "sonnet"`（编排任务需要中等推理能力）

示例 dispatch 结构：
```
Skill: 执行 {nextAction.skill}
任务: {nextAction.taskId}
阶段: {nextAction.stage || 'N/A'}
需要的产物: {nextAction.requiredArtifacts}
预期输出: {nextAction.expectedArtifacts}
```

**如果用户选择暂停：**
保持当前状态，等待用户稍后再次运行 `/scc-dev-sphere:workflow`。
```

- [ ] **Step 2: 删除「只提供建议」约束**

将第 199-203 行（约束部分）：

```markdown
## 约束

- Workflow 不直接执行 agent/skill 动作 —— 只提供建议
- Workflow 不修改状态文件 —— 这是 skill 和 hook 的职责
- Workflow 始终从当前持久化状态重新计算 nextAction（不跨调用缓存）
```

改为：

```markdown
## 约束

- Workflow 不修改状态文件 —— 这是 skill 和 hook 的职责
- Workflow 始终从当前持久化状态重新计算 nextAction（不跨调用缓存）
- Workflow 通过 AskUserQuestion 获取用户确认后，自动派发 Agent 执行；如果用户选择暂停，则不做任何操作
```

- [ ] **Step 3: 验证**

```bash
grep -c "AskUserQuestion" skills/workflow/SKILL.md
```

预期：≥3（human_confirm + run_skill + 其他引用）。

```bash
grep "只提供建议" skills/workflow/SKILL.md || echo "PASS: 已移除"
```

预期：已移除。

```bash
grep "feature-design-business\|feature-design-solution\|feature-design-implementation\|feature-design-test" skills/workflow/SKILL.md || echo "PASS: 无具体 design skill 引用"
```

预期：无（之前仅作为示例出现在 run_skill 分支）。

- [ ] **Step 4: 提交**

```bash
git add skills/workflow/SKILL.md
git commit -m "feat: workflow run_skill 改为 AskUserQuestion + 自动 Agent 派发"
```

---

### Task 3: 修改 feature-design SKILL.md — 循环编排

**Files:**
- Modify: `skills/feature-design/SKILL.md`

**Interfaces:**
- Consumes: 由 Task 2 的 workflow 调用；读取 state.json；Resolver 的阶段引用已统一为 `feature-design`
- Produces: 内部循环推进设计阶段，在需要时暂停

- [ ] **Step 1: 替换描述和执行段落**

将第 6-28 行（`# Feature Design` → 全部关键规则）替换为：

```markdown
# Feature Design — 设计编排

编排设计阶段的推进。本 skill 是设计阶段的唯一编排入口——读取当前状态，按工作流模式自动推进多个设计阶段，在需要时暂停等待用户确认。

与 `feature-workflow.js` resolver 配合工作：resolver 判断整体状态并推荐 `feature-design`，本 skill 负责内部阶段路由和 Agent 派发的具体执行。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-design [--mode revise]`
- **入参:** 当前 state.json
- **输出:** 推进一个或多个设计阶段（business → solution → implementation → test → integrated）
- **完成标准:** 推进到所有阶段完成或被用户暂停

## 执行

### 步骤1：读取状态

1. 读取 `state.json`，获取 `workflowMode` 和 `stages` 中各个阶段的状态。
2. 按阶段顺序 [businessDesign, solutionDesign, implementationDesign, testDesign] 找出第一个未完成阶段。
3. 如果所有阶段已完成 → 跳到步骤4（生成集成设计）。

### 步骤2：执行当前阶段

1. 根据当前阶段名称确定对应的 Agent：
   - businessDesign → SA Agent（`feature-design-business` skill）
   - solutionDesign → SE Agent（`feature-design-solution` skill）
   - implementationDesign → MDE Agent（`feature-design-implementation` skill）
   - testDesign → TSE Agent（`feature-design-test` skill）

2. **不覆盖已 `human_approved` 的阶段**（除非使用 `--mode revise` 参数）。

3. 加载对应 Agent，使用 Agent tool（`background: true`）执行：
   - agent 名：对应角色的 agent 名称
   - prompt 上下文：当前阶段 skill 名称、任务 ID 和路径
   - `--mode revise`：如果传入该参数，在 Agent 上下文中标记修订模式

### 步骤3：检查轮回（按工作流模式决定）

阶段任务完成后，检查状态并决定是否继续：

**如果 `workflowMode === 'auto-design'`：**
- 自动回到步骤1，推进下一个阶段
- 不向用户展示中间状态，连贯推进直到所有阶段完成或被阻塞

**如果 `workflowMode === 'strict-human-loop'`：**
- 在每阶段完成后暂停
- 使用 **AskUserQuestion**（遵循 `single_select` 模式）：
  - `header`: "阶段完成"
  - `question`: "当前阶段 {阶段名} 已完成。是否继续下一阶段 {下一阶段名}？"
  - `options`:
    - `label: "✅ 继续下一阶段 (Recommended)"` `description: "开始下一阶段设计工作"`
    - `label: "⏸️ 暂停"` `description: "暂停编排流程"`
  - `multiSelect`: false
  - 用户选择继续 → 回到步骤1
  - 用户选择暂停 → 展示步骤5 的完成摘要

**如果 `workflowMode === 'collaborative-design'`：**
- 根据 `state.humanGateStages` 判断下一阶段是否需要人工门禁
- 如果下一阶段在 humanGateStages 中 → 使用同上 AskUserQuestion 暂停
- 如果下一阶段不在 humanGateStages 中 → 自动回到步骤1

### 步骤4：生成集成设计

当全部 4 个阶段达到要求状态后：
1. 加载 SA、SE、MDE、TSE Agent 分别执行各自的集成部分
2. 生成/刷新 `artifacts/integrated-design.md`
3. 如果 `integrated-design.md` 已存在且所有阶段未变更 → 跳过（避免无变更生成）

### 步骤5：完成

展示完成摘要：

```
📋 设计阶段完成摘要

**已完成阶段:**
{列出所有已达 ai_review_passed 或 human_approved 的阶段及状态}

**集成设计:** artifacts/integrated-design.md

**下一步:** /scc-dev-sphere:workflow
  → 进入评审或推进到下一阶段。
```

## 约束

- 绝不覆盖已 `human_approved` 的阶段，除非使用 `--mode revise`
- 不修改状态文件 —— 状态更新由各阶段 skill 负责（通过各自的执行步骤和 hook）
- 不执行评审 —— 评审由 `feature-review` skill 在 workflow 层面处理
- 不处理 `human_confirm` —— 这是 resolver 和 workflow 的职责
```

- [ ] **Step 2: 验证**

```bash
grep "每次调用只推进一个阶段" skills/feature-design/SKILL.md || echo "PASS: 旧规则已移除"
grep "循环\|继续下一阶段" skills/feature-design/SKILL.md
```

预期：旧规则已移除，新文件中包含循环和继续下一阶段的逻辑。

- [ ] **Step 3: 提交**

```bash
git add skills/feature-design/SKILL.md
git commit -m "feat: feature-design 改为循环编排，按 workflowMode 自动暂停/继续"
```
