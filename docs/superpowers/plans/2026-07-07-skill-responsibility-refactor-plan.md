# Skill 职责正交化重构 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 剥离 7 个设计类 skill 中的 Agent 调用和状态写入，workflow 支持多 Agent 派发和显式状态同步，resolver 简化设计子阶段路由。

**Architecture:** 按层自底向上：先改 script 和 skill（被依赖层）→ 再改 resolver（中间层）→ 最后改 workflow（顶层编排）。每层改动独立可验证。

**Tech Stack:** Markdown 文件修改（skill）、JavaScript 修改（script/resolver）、`grep` + `git diff` 验证。

## Global Constraints

- Agent 定义文件（agents/*.md）不改动 — Agent → Skill 方向本身正确
- hooks/hooks.json 不改动 — 保持纯闸口定位
- devsphere-state.js、devsphere-guard.js、devsphere-review-matrix.js、devsphere-workspace.js 不改动
- `.devsphere/` 目录结构、state.json schema、nextAction schema 不变
- 每个 task commit 独立，可单独 review

---

## 文件结构

```
skills/feature-design-business/SKILL.md     (修改) — 剥离 Agent 调用 + 状态写
skills/feature-design-solution/SKILL.md     (修改) — 同上
skills/feature-design-implementation/SKILL.md (修改) — 同上
skills/feature-design-test/SKILL.md         (修改) — 同上
skills/feature-assess/SKILL.md              (修改) — 剥离状态写
skills/feature-review/SKILL.md              (修改) — 剥离 Agent 调用 + 状态写
skills/feature-design/SKILL.md              (修改) — 重构为子编排器
scripts/workflows/feature-workflow.js       (修改) — 新增 sync-stage-status + 简化 resolveDesigning
skills/workflow/SKILL.md                    (修改) — 多 Agent 派发 + 状态同步
```

---

### Task 1: 剥离四个阶段 skill 的 Agent 调用和状态写

**Files:**
- Modify: `skills/feature-design-business/SKILL.md:19-28`
- Modify: `skills/feature-design-solution/SKILL.md:19-28`
- Modify: `skills/feature-design-implementation/SKILL.md:19-28`
- Modify: `skills/feature-design-test/SKILL.md:19-28`

**Interfaces:**
- Produces: 纯指令 skill，Agent 读取后自主执行

四个文件改动模式相同，以 business-design 为例。

- [ ] **Step 1: feature-design-business — 删除「加载 SA Agent」**

**old_string:**
```
1. 加载 SA Agent。
2. 读取 `inputs/requirement.md` 和业务设计模板 `templates/artifacts/business-design.md`。
```

**new_string:**
```
1. 读取 `inputs/requirement.md` 和业务设计模板 `templates/artifacts/business-design.md`。
```

- [ ] **Step 2: feature-design-business — 删除「更新 state.json」**

**old_string:**
```
7. 更新 `evidence/evidence-registry.json` 添加新条目。
8. 在 design 文档中将无证据前提标记为 `assumption`。
9. 更新 `state.json` → `stages.businessDesign.status = 'drafted'`。
```

**new_string:**
```
7. 更新 `evidence/evidence-registry.json` 添加新条目。
8. 在 design 文档中将无证据前提标记为 `assumption`。
```

- [ ] **Step 3: feature-design-solution — 同样两处删除**

**old_string:**
```
1. 加载 SE Agent。
2. 读取 `artifacts/business-design.md` 获取业务上下文，读取方案设计模板 `templates/artifacts/solution-design.md`。
```

**new_string:**
```
1. 读取 `artifacts/business-design.md` 获取业务上下文，读取方案设计模板 `templates/artifacts/solution-design.md`。
```

**old_string:**
```
6. 标记无证据前提为 `assumption`。
7. 更新 `state.json` → `stages.solutionDesign.status = 'drafted'`。
```

**new_string:**
```
6. 标记无证据前提为 `assumption`。
```

- [ ] **Step 4: feature-design-implementation — 同样两处删除**

**old_string:**
```
1. 加载 MDE Agent。
2. 读取 `artifacts/solution-design.md`，读取实现设计模板 `templates/artifacts/implementation-design.md`。
```

**new_string:**
```
1. 读取 `artifacts/solution-design.md`，读取实现设计模板 `templates/artifacts/implementation-design.md`。
```

**old_string:**
```
6. 标记无证据前提为 `assumption`。
7. 更新 `state.json` → `stages.implementationDesign.status = 'drafted'`。
```

**new_string:**
```
6. 标记无证据前提为 `assumption`。
```

- [ ] **Step 5: feature-design-test — 同样两处删除**

**old_string:**
```
1. 加载 TSE Agent。
2. 读取方案设计和实现设计获取测试上下文，读取测试设计模板 `templates/artifacts/test-design.md`。
```

**new_string:**
```
1. 读取方案设计和实现设计获取测试上下文，读取测试设计模板 `templates/artifacts/test-design.md`。
```

**old_string:**
```
6. 标记无证据前提为 `assumption`。
7. 更新 `state.json` → `stages.testDesign.status = 'drafted'`。
```

**new_string:**
```
6. 标记无证据前提为 `assumption`。
```

- [ ] **Step 6: 验证四个 skill 无残留**

```bash
grep -n '加载.*Agent\|更新.*state.json.*status.*drafted' skills/feature-design-business/SKILL.md skills/feature-design-solution/SKILL.md skills/feature-design-implementation/SKILL.md skills/feature-design-test/SKILL.md || echo "PASS"
```

- [ ] **Step 7: Commit**

```bash
git add skills/feature-design-business/SKILL.md skills/feature-design-solution/SKILL.md skills/feature-design-implementation/SKILL.md skills/feature-design-test/SKILL.md
git commit -m "refactor: 四个阶段 skill 剥离 Agent 调用和状态写入"
```

---

### Task 2: 剥离 feature-assess 的状态写

**Files:**
- Modify: `skills/feature-assess/SKILL.md:96-103`

**Interfaces:**
- Produces: 纯评估 skill，状态同步由 workflow 执行

- [ ] **Step 1: 删除步骤6的状态写入，改为提示**

**old_string:**
```
### 步骤6：记录决策并更新状态

更新 `state.json`：
- 设置 `workflowMode` 为确认的模式
- 设置 `humanGateStages` 为确认的阶段列表（若无则为空数组）
- 设置 `status` 为 `assessed`

展示确认信息并建议使用 `/scc-dev-sphere:workflow` 进入下一步。
```

**new_string:**
```
### 步骤6：记录决策并确认

展示确认信息：

```
✅ 评估完成

**推荐模式:** {推荐模式}
**命中的风险:** {count} 个
```
建议使用 `/scc-dev-sphere:workflow` 进入下一步。
```

- [ ] **Step 2: 验证无残留**

```bash
grep '更新.*state.json' skills/feature-assess/SKILL.md || echo "PASS: 已移除状态写"
```

- [ ] **Step 3: Commit**

```bash
git add skills/feature-assess/SKILL.md
git commit -m "refactor: feature-assess 剥离状态写入"
```

---

### Task 3: 剥离 feature-review 的 Agent 调用和状态写

**Files:**
- Modify: `skills/feature-review/SKILL.md:28-34`
- Modify: `skills/feature-review/SKILL.md:40-46`
- Modify: `skills/feature-review/SKILL.md:76-79`

**Interfaces:**
- Produces: 纯评审方法 skill，Agent 派发和状态同步由 workflow 处理

- [ ] **Step 1: 删除步骤2的 Agent 调用**

**old_string:**
```
### 步骤2：并行执行评审

对每个需要的评审 Agent，加载该 Agent 并使用 `feature-review` skill 上下文和目标产物。各 Agent 从自身职责视角评审并输出：
- 阻塞项（必须修复）
- 建议项（需人工决策）
- 风险候选项（需人工接受）
```

**new_string:**
```
### 步骤2：执行评审

以自身 Agent 职责视角评审目标产物，输出：
- 阻塞项（必须修复）
- 建议项（需人工决策）
- 风险候选项（需人工接受）
```

- [ ] **Step 2: 删除步骤4的 Agent 修订循环指令**

**old_string:**
```
### 步骤4：修订循环

如果 blocking > 0：
1. 将阻塞项反馈给原设计 Agent。
2. 设计 Agent 修订产物。
3. 原评审者复核其阻塞项。
4. 重复直到 blocking=0 或达到 `state.json.designRevisionLimit` 上限（默认 25）。
```

**new_string:**
```
### 步骤4：修订循环

如果 blocking > 0：修订循环由 workflow 驱动——resolver 检测到 blocking 后重新派发设计 Agent 修订，修订完成后重新派发评审 Agent 复核。循环上限由 `state.json.designRevisionLimit` 控制，默认 25 轮。
```

- [ ] **Step 3: 删除步骤6的状态更新**

**old_string:**
```
### 步骤6：更新状态

- 如果 blocking=0：更新 `stages.<phase>.status = 'ai_review_passed'`。
- 对于集成评审：检查所有阶段是否达到要求状态 → 如果满足，可以推进到 `design_ready`。
```

**new_string:**
```
### 步骤6：完成

- 如果 blocking=0：评审通过，状态同步由 workflow 显式执行。
- 如果 blocking > 0 且未达上限：workflow 将自动进入修订-复核循环。
- 如果达到上限：标记未解决的阻塞项待人工处理。
```

- [ ] **Step 4: 验证无残留**

```bash
grep -n '加载.*Agent\|反馈给.*Agent\|更新.*stages.*status' skills/feature-review/SKILL.md || echo "PASS: 已移除"
```

- [ ] **Step 5: Commit**

```bash
git add skills/feature-review/SKILL.md
git commit -m "refactor: feature-review 剥离 Agent 调用和状态写入"
```

---

### Task 4: 重构 feature-design 为设计子编排器

**Files:**
- Modify: `skills/feature-design/SKILL.md` — 整体重写

**Interfaces:**
- Consumes: state.json (stages, workflowMode, humanGateStages)
- Produces: 结构化子阶段路由结果 `{ stage, skill, agent, reason }`，供 workflow 直接派发 Agent

- [ ] **Step 1: 重写 SKILL.md 内容**

**完整 new content:**

```markdown
---
name: feature-design
description: 设计阶段子编排器。读取 state.json，确定下一步应推进的设计子阶段并返回结构化路由结果。不调用 Agent，不写状态。
---

# Feature Design — 设计子编排

本 skill 是设计阶段的子编排器。在 main 会话中运行（agents=[]），根据 state.json 判断当前该推进哪个设计子阶段，输出结构化路由结果供 workflow 派发 Agent。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-design`
- **入参:** state.json
- **输出:** 结构化路由结果 `{ stage, skill, agent, reason }`
- **完成标准:** 返回路由结果

## 执行步骤

### 步骤1：读取状态

读取 `state.json`，获取 `workflowMode`、`humanGateStages` 和 `stages`。

### 步骤2：阶段顺序

按顺序检查：businessDesign → solutionDesign → implementationDesign → testDesign

### 步骤3：阶段→Skill 映射

| 阶段 | Skill | Agent |
|------|-------|-------|
| businessDesign | feature-design-business | sa |
| solutionDesign | feature-design-solution | se |
| implementationDesign | feature-design-implementation | mde |
| testDesign | feature-design-test | tse |

### 步骤4：Mode 门禁判断

阶段已就绪的条件（按 mode）：
- `auto-design`：阶段 status == `ai_review_passed` 或 `human_approved`
- `collaborative-design`：列入 `humanGateStages` 的阶段需 `human_approved`，其余 `ai_review_passed`
- `strict-human-loop`：阶段 status == `human_approved`

### 步骤5：遍历阶段

对每个阶段按顺序：
1. 如阶段不存在 → 跳过
2. 如阶段未就绪：
   - `status=not_started` → 返回路由结果，通知 workflow 派发对应 Agent 开始该阶段设计
   - `status=drafted` → 检查 review matrix 是否有未关闭 blocking
     - 有 blocking → 返回路由结果，skill=对应阶段 design skill（修订模式），agent=对应设计 Agent
     - 无 blocking 但未通过评审 → 返回路由结果，skill=feature-review，agent=对应评审者列表
   - `status=ai_review_passed` 但 mode 要求 human_approved → 返回 `human_confirm`
3. 如阶段已就绪 → 继续下一阶段

### 步骤6：全部阶段完成

如果全部 4 个阶段都满足 mode 要求的就绪状态：
1. 检查 `artifacts/integrated-design.md` 是否存在
   - 不存在 → 返回路由结果，skill=feature-design（集成模式），agent=[sa, se, mde, tse]
2. 检查集成设计评审
   - 未评审或有 blocking → 返回路由结果，skill=feature-review，target=integrated-design
3. 全部通过 → 返回完成状态

### 步骤7：输出格式

```json
{
  "stage": "businessDesign",
  "skill": "feature-design-business",
  "agent": "sa",
  "reason": "businessDesign is not_started"
}
```

多 Agent 场景（集成设计、评审）：

```json
{
  "stage": "solutionDesign",
  "skill": "feature-review",
  "agents": ["sa", "mde", "tse"],
  "reason": "solutionDesign is drafted and ready for formal review"
}
```

## 约束

- 不调用 Agent tool
- 不修改 state.json 或任何状态文件
- 不覆盖已 `human_approved` 的阶段（除非 `--mode revise`）
- 修订模式规则不变：记录原因、影响范围，重置受影响阶段
```

- [ ] **Step 2: 验证**

```bash
grep -n 'Agent tool\|加载.*Agent\|更新.*state.json' skills/feature-design/SKILL.md || echo "PASS: 无 Agent 调用和状态写"
```

- [ ] **Step 3: Commit**

```bash
git add skills/feature-design/SKILL.md
git commit -m "refactor: feature-design 重构为设计子编排器"
```

---

### Task 5: feature-workflow.js — 新增状态同步命令 + 简化 resolveDesigning

**Files:**
- Modify: `scripts/workflows/feature-workflow.js` — 新增 `sync-stage-status` CLI 命令 + 简化 `resolveDesigning`

**Interfaces:**
- Consumes: workspaceRoot, state.json, review-matrix.json, taskPath
- Produces: 更新后的 state.json（确定性事实同步）+ 简化的 nextAction

- [ ] **Step 1: 在 main() 函数中新增 sync-stage-status CLI 命令**

在 `feature-workflow.js` 的 `main()` 函数 switch 块末尾（`default` 之前）新增：

```javascript
case 'sync-stage-status': {
  const workspaceRoot = args[1];
  const current = readCurrentTask(workspaceRoot);
  if (!current || !current.activeTaskId) {
    process.stdout.write(JSON.stringify({ synced: false, reason: 'No active task' }));
    process.exit(0);
  }
  const taskPath = getTaskPath(workspaceRoot);
  const state = readState(taskPath);
  if (!state || !state.stages) {
    process.stdout.write(JSON.stringify({ synced: false, reason: 'No stages in state' }));
    process.exit(0);
  }

  const updated = [];
  for (const [stageName, stageData] of Object.entries(state.stages)) {
    if (!stageData.artifact) continue;
    const artifactPath = path.join(taskPath, stageData.artifact);

    // 确定性事实：artifact 存在 + not_started → drafted
    if (fs.existsSync(artifactPath) && stageData.status === 'not_started') {
      stageData.status = 'drafted';
      updated.push({ stage: stageName, from: 'not_started', to: 'drafted' });
    }
  }

  // 评审状态同步
  const matrix = readMatrix(taskPath);
  if (matrix && matrix.artifacts) {
    for (const [stageName, stageData] of Object.entries(state.stages)) {
      if (stageData.status !== 'drafted') continue;
      const artifactTarget = stageToArtifact(stageName);
      const artifactMatrix = matrix.artifacts[artifactTarget];
      if (artifactMatrix && artifactMatrix.issues && artifactMatrix.issues.blocking === 0 && artifactMatrix.status !== 'pending') {
        stageData.status = 'ai_review_passed';
        updated.push({ stage: stageName, from: 'drafted', to: 'ai_review_passed' });
      }
    }
  }

  writeState(taskPath, state);
  process.stdout.write(JSON.stringify({ synced: true, updated }));
  break;
}
```

需要先在文件顶部添加依赖引用：`const { readCurrentTask, readState, writeState, getTaskPath } = require('./devsphere-state');`

- [ ] **Step 2: 替换 resolveDesigning 函数体**

**old_string（第103-213行，整个 resolveDesigning 函数体）:**

**new_string:**

```javascript
function resolveDesigning(taskPath, state, stages, mode, humanGates) {
  // All design sub-stage routing delegated to feature-design skill.
  // resolver only decides the top-level entry point.
  return makeAction('run_skill', state, 'design', null,
    'feature-design', {}, [],
    'Task is in designing phase. Delegate to feature-design for sub-stage routing.',
    [], []);
}
```

- [ ] **Step 3: 验证**

```bash
# 确认新命令已注册
grep 'sync-stage-status' scripts/workflows/feature-workflow.js
# 确认 resolveDesigning 已简化
grep -A3 'function resolveDesigning' scripts/workflows/feature-workflow.js
```

- [ ] **Step 4: Commit**

```bash
git add scripts/workflows/feature-workflow.js
git commit -m "feat: feature-workflow 新增 sync-stage-status + 简化 resolveDesigning"
```

---

### Task 6: workflow SKILL — 多 Agent 派发 + 状态同步

**Files:**
- Modify: `skills/workflow/SKILL.md:93-148`（步骤5 run_skill 部分）

**Interfaces:**
- Consumes: nextAction (from resolver or feature-design output)
- Produces: Agent 派发 + 状态同步

- [ ] **Step 1: 重写步骤5的 run_skill 处理逻辑**

**old_string (步骤5 run_skill 的派发部分，第126-144行):**

```
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
```

**new_string:**

```
**用户确认后（选择继续）：**

#### 无 Agent 场景（agents 为空）

在 main 会话中直接执行 `nextAction.skill`。完成后根据输出继续派发。

特别地，如果 `nextAction.skill === 'feature-design'`，执行其子编排逻辑得到结构化路由结果（`{ stage, skill, agent/agents, reason }`），然后按下方 Agent 派发逻辑处理该路由结果。

#### 单 Agent 场景（agents 含 1 个元素）

使用 **Agent tool** 派发单个 Agent（`background: true`）：

- agentName: `nextAction.agents[0]`
- model: `"sonnet"`
- prompt 包含：
  - 任务 ID 和路径
  - skill 名称和参数
  - 产物路径

#### 多 Agent 场景（agents 含 2+ 个元素）

**并行**使用 **Agent tool** 派发所有 Agent（每个 `background: true`）：

- 对 `nextAction.agents` 中的每个 agentName，各派发一个 Agent tool
- 每个 Agent 的 prompt 包含相同的 skill 和任务上下文，但注明自身职责视角

#### Agent 完成后

所有 Agent 完成后，显式运行状态同步：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js sync-stage-status ${CLAUDE_PROJECT_DIR}
```

然后回到步骤4 重新运行 resolver 计算下一步 nextAction。
```

- [ ] **Step 2: 验证 workflow skill 无语法问题**

```bash
grep -n 'nextAction' skills/workflow/SKILL.md | head -5
```

- [ ] **Step 3: Commit**

```bash
git add skills/workflow/SKILL.md
git commit -m "feat: workflow 支持多 Agent 并行派发和显式状态同步"
```

---

### Task 7: 最终验证

**Files:**
- 无（只读验证）

- [ ] **Step 1: 全项目扫描 Agent 调用残留**

```bash
grep -rn '加载.*Agent\|Agent tool' skills/feature-design*/SKILL.md skills/feature-assess/SKILL.md skills/feature-review/SKILL.md || echo "PASS: 设计 skill 中无 Agent 调用残留"
```

- [ ] **Step 2: 全项目扫描状态写入残留**

```bash
grep -rn '更新.*state.json' skills/feature-design*/SKILL.md skills/feature-assess/SKILL.md skills/feature-review/SKILL.md || echo "PASS: 设计 skill 中无状态写入残留"
```

- [ ] **Step 3: 确认 hooks.json 未改动**

```bash
git diff --name-only HEAD~6..HEAD | grep hooks.json && echo "WARNING" || echo "PASS: hooks.json 未改动"
```

- [ ] **Step 4: 确认 agent 定义未改动**

```bash
git diff --name-only HEAD~6..HEAD | grep '^agents/' && echo "WARNING" || echo "PASS: agents/ 未改动"
```

- [ ] **Step 5: 最终 diff 统计**

```bash
git diff --stat HEAD~6..HEAD
```

预期：约 10 个文件。
