# Skill 职责正交化重构 — 设计文档

**日期:** 2026-07-07
**状态:** approved

## 1. 背景

当前设计类 skill 存在两个违反正交原则的问题：

1. **反向依赖（Skill → Agent）**：Skill 通过 Agent tool 创建 Agent，而 Agent 又去调用 Skill，形成调用环。agent=[sa] 的 skill 仍然在 skill 内部说「加载 SA Agent」
2. **职责混杂（Skill 管状态）**：设计类 skill 直接写 `state.json`（`status=drafted`、`ai_review_passed` 等），状态管理分散在 7 个 skill 文件中

技术方案已明确定义了正交模型（第 3/13/14 节）:
- **Skill** = 执行方法（做什么、怎么做、产出什么）
- **Agent** = 职责视角（谁来做），调用 Skill
- **Hook** = 守门、登记、一致性校验
- **Workflow** = 主编排，状态同步由 workflow 在 Agent 完成后显式执行

## 2. 修正后架构

```
workflow（main 会话，主编排入口）
  │
  │ 1. 运行 resolver → nextAction { skill, agents[] }
  │ 2. 如 agents=[]: main 会话执行 skill
  │ 3. 如 agents 非空: Agent tool 并行派发各 Agent
  │ 4. Agent 完成后: 显式调用 updateStageStatus 同步状态
  │ 5. 回到步骤 1（评审-修订循环由 resolver 自然驱动）
  │
  ├─→ SA Agent ← 读取 feature-design-business SKILL → 产出 business-design.md
  ├─→ SE Agent ← 读取 feature-design-solution SKILL → 产出 solution-design.md
  ├─→ MDE Agent ← 读取 feature-design-implementation SKILL → ...
  ├─→ TSE Agent ← 读取 feature-design-test SKILL → ...
  └─→ 评审时并行派发多个 Agent（各读 feature-review + 自身视角）
```

**feature-design SKILL** 是设计阶段子编排器：resolver 对 `status=designing` 统一返回 `feature-design`，workflow 在 main 会话执行它，它判断当前该推进的阶段并返回结构化路由结果。workflow 不区分子路由场景。

## 3. 改动明细

### 3.1 受影响文件总览

| 层 | 文件 | 改动类型 |
|----|------|---------|
| **Skill** | `skills/feature-design/SKILL.md` | 重构为设计子编排器 |
| **Skill** | `skills/feature-design-business/SKILL.md` | 剥离 Agent 调用和状态写 |
| **Skill** | `skills/feature-design-solution/SKILL.md` | 同上 |
| **Skill** | `skills/feature-design-implementation/SKILL.md` | 同上 |
| **Skill** | `skills/feature-design-test/SKILL.md` | 同上 |
| **Skill** | `skills/feature-assess/SKILL.md` | 剥离状态写 |
| **Skill** | `skills/feature-review/SKILL.md` | 剥离 Agent 调用和状态写 |
| **Workflow** | `skills/workflow/SKILL.md` | 多 Agent 派发、状态同步 |
| **Resolver** | `scripts/workflows/feature-workflow.js` | 简化 resolveDesigning |
| **脚本** | `scripts/devsphere-state.js` | 新增 updateStageStatus CLI（workflow 显式调用） |

**不改动：** hooks/hooks.json、agents/*.md、devsphere-guard.js、devsphere-review-matrix.js

### 3.2 feature-design SKILL — 重构为设计子编排器

**定位：** 在 main 会话中运行（agents=[]），确定性地推进设计子阶段。

**删除：**
- 「加载对应 Agent，使用 Agent tool 执行」
- 「加载 SA、SE、MDE、TSE Agent 分别执行集成部分」
- 步骤3 中 mode 分支的 AskUserQuestion 交互（workflow 层面通过 resolver+human_confirm 处理）

**保留并增强：**
- 阶段顺序和跳过逻辑
- mode 门禁判断规则
- 结构化输出：当前该推进的阶段名、对应 skill 名、期望 Agent

**resolver 侧的联动：** `resolveDesigning()` 函数不再做子阶段路由。`status=designing` 时统一返回 `kind=run_skill, skill=feature-design, agents=[]`。

**feature-design 输出契约（workflow 据此派发 Agent）：**

```json
{
  "stage": "businessDesign",
  "skill": "feature-design-business",
  "agent": "sa",
  "reason": "businessDesign is not started"
}
```

workflow 执行 feature-design 后获得此输出，直接按其派发 Agent。workflow 不区分这是「子路由结果」还是「顶层 nextAction」——统一当作 skill+agent 指令处理。

### 3.3 四个阶段 skill — 退化为纯指令

每个 `feature-design-{business,solution,implementation,test}/SKILL.md` 统一改动：

**删除：**
- 步骤1：「加载 X Agent」
- 最后一步：「更新 state.json → stages.X.status = drafted」

**保留：**
- 输入来源和模板路径
- 设计执行流程（读取、查询、生成、标记前提）
- 修订模式规则
- 约束：只修改本阶段产物

**Agent 自主负责的（不在 skill 中描述）：**
- 保存 evidence 快照、更新 evidence-registry.json
- 记录 decisions、标记 assumption
- 处理评审反馈中的阻塞项

### 3.4 feature-assess SKILL — 剥离状态写

**删除：** 步骤6 中更新 state.json 的部分（workflowMode、humanGateStages、status=assessed）

**保留：** 风险评估逻辑、AskUserQuestion 交互、降级决策指导

**状态同步由 workflow 在 main 会话中执行：** 用户确认模式后，workflow 调 `node devsphere-state.js update-status <taskPath> assessed`，并设置 workflowMode 和 humanGateStages。

### 3.5 feature-review SKILL — 剥离 Agent 调用和状态写

**删除：**
- 步骤2：「对每个需要的评审 Agent，加载该 Agent」→ workflow 负责并行派发
- 步骤4：「将阻塞项反馈给原设计 Agent」→ workflow 的 resolver 循环自然处理
- 步骤6：更新 stage 状态 → Hook 不做，workflow 显式同步

**保留：** 评审方法、问题分类标准、修订循环规则（由 `state.json.designRevisionLimit` 控制，默认 25 轮）、建议项确认流程

### 3.6 workflow SKILL — 多 Agent 派发 + 状态同步

**步骤5 派发逻辑改为：**

```
if nextAction.agents 为空:
    在 main 会话中执行 nextAction.skill
else:
    对 nextAction.agents 中每个 Agent:
        Agent tool 并行派发（background: true），传入 skill 名和上下文
    等待全部 Agent 完成后:
        运行 node devsphere-state.js update-stage-status <taskPath>
        回到步骤4 重新运行 resolver
```

**不再要求单 Agent 串行，不再硬编码 agents[0]。**

**AskUserQuestion 交互保持不变。**

### 3.7 Resolver — 简化 resolveDesigning

`scripts/workflows/feature-workflow.js` 的 `resolveDesigning()` 函数中：
- `status=designing` 时不再做阶段迭代路由，统一返回 `kind=run_skill, skill=feature-design, agents=[]`
- 具体阶段判断、mode 门禁逻辑完全移到 feature-design skill

### 3.8 devsphere-state.js — 增强 CLI

新增 `update-stage-status` 命令供 workflow 在 Agent 完成后显式调用：

```
node devsphere-state.js update-stage-status <workspaceRoot>
```

逻辑：读取 state.json → 对每个 stage，若 artifact 文件存在且 status 为 `not_started` → 更新为 `drafted`；若 review-matrix 中该 artifact 的 `blocking=0` 且 status 为 `drafted` → 更新为 `ai_review_passed`。

这是确定性事实同步，不判断设计质量。

## 4. 不变的部分

- **Agent 定义**（agents/*.md）：Agent → Skill 引用方向本身正确，无需修改
- **Hooks**（hooks/hooks.json）：保持纯闸口定位，不做状态写入
- **devsphere-guard.js**：准入检查逻辑不变
- **devsphere-review-matrix.js**：评审矩阵读写不变
- **devsphere-workspace.js**：workspace 创建不变
- **.devsphere/ 目录结构、state.json schema、nextAction schema** 不变

## 5. 评审-修订循环（新流程）

旧流程（skill 内部循环）：
```
feature-review skill → 调 Agent 评审 → 发现 blocking → 调 Agent 修订 → 调 Agent 复核 → ...
```

新流程（workflow 自然循环）：
```
resolver → workflow 并行派发评审 Agent
  → 评审完成 → workflow 同步状态 → 重新 resolver
  → if blocking>0: resolver → workflow 派发设计 Agent 修订
    → 修订完成 → 同步状态 → 重新 resolver
    → resolver → workflow 派发评审 Agent 复核
    → ... 循环直到 blocking=0 或达到 `state.json.designRevisionLimit` 上限（默认 25）
```

循环上限由 resolver/feature-review skill 追踪轮次，workflow 不感知。
