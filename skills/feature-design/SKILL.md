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
