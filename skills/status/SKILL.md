---
name: status
description: 展示当前任务状态、各阶段进度、待确认事项、阻塞项、风险项和下一步建议。只读 —— 不修改任何状态。
---

# Status — 只读状态查看

展示当前活跃任务的完整状态摘要。本 skill 是只读的 —— 绝不修改文件、推进状态或写入决策。

## 集成契约

- **入口:** `/scc-dev-sphere:status`
- **入参:** 无
- **输出:** 状态摘要展示给用户
- **完成标准:** 状态已展示

## 执行步骤

### 步骤1：读取当前任务

从 workspace 根目录读取 `.devsphere/current-task.json`。如果无活跃任务，显示「无活跃任务」并终止。

### 步骤2：读取状态

从 current-task.json 指定的任务路径读取 `state.json`。

### 步骤3：读取评审矩阵

从任务路径读取 `reviews/review-matrix.json`。

### 步骤4：计算 nextAction（只读）

运行 `node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-workflow.js ${CLAUDE_PROJECT_DIR}` 获取下一步建议。仅用于展示 —— 不执行任何动作。

### 步骤5：展示状态摘要

对于 `taskType=feature`，展示：

```
# 📊 任务状态: {taskId}

**类型:** feature
**工作流模式:** {workflowMode}
**整体状态:** {status}

## 设计阶段
| 阶段 | 状态 | 产物 |
|-------|--------|----------|
| 业务设计 | {businessDesign.status} | {businessDesign.artifact} |
| 方案设计 | {solutionDesign.status} | {solutionDesign.artifact} |
| 实现设计 | {implementationDesign.status} | {implementationDesign.artifact} |
| 测试设计 | {testDesign.status} | {testDesign.artifact} |
| 集成设计 | {存在/不存在} | artifacts/integrated-design.md |

## 评审状态
- 阻塞项: {total blocking count}
- 建议项待确认: {total advisory count}（已确认 {confirmed}/{total}）
- 风险候选项: {count}

## 待人工处理
{需要人工确认的事项列表}

## 批准记录
- 设计最终批准: {存在/不存在}
- 实现计划批准: {存在/不存在}

## 代码仓绑定
{已绑定的 repo 列表 或 "尚未绑定"}

## 下一步
{nextAction.reason}
```

对于其他 taskType，显示：「Task type '{taskType}' 的状态展示在 MVP 中尚未实现。」

### 步骤6：结束

状态展示后建议：「使用 `/scc-dev-sphere:workflow` 推进到下一步。」
