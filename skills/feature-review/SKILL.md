---
name: feature-review
description: 对设计产物执行 AI 交叉评审和修订闭环。支持阶段评审（单个产物）和集成评审（跨阶段一致性检查）。输出阻塞项/建议项/风险候选项。
---

# Feature Review — AI 交叉评审与修订闭环

对设计产物执行正式 AI 评审。本 skill 实现评审-修订闭环：评审 → 发现问题 → 将阻塞项反馈给设计 Agent → 复核 → 重复直到阻塞项归零。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-review --target <artifact>`
- **入参:** 目标产物路径、review-matrix.json、spec 中的基础评审矩阵
- **输出:** `reviews/<target>/` 中的评审文件、更新后的 `review-matrix.json`
- **完成标准:** 所有阻塞项关闭 OR 达到最大 3 轮

## 参数

- `--target`: 以下之一：`business-design`、`solution-design`、`implementation-design`、`test-design`、`integrated-design`

## 执行

### 步骤1：确定评审者

查找目标产物的基础评审矩阵（spec 第 9 节）。检查是否需要风险增强评审者（如 CIE 应对部署风险等）。

### 步骤2：并行执行评审

对每个需要的评审 Agent，加载该 Agent 并使用 `feature-review` skill 上下文和目标产物。各 Agent 从自身职责视角评审并输出：
- 阻塞项（必须修复）
- 建议项（需人工决策）
- 风险候选项（需人工接受）

### 步骤3：汇总评审结果

将所有评审结果汇总到：
- `reviews/<target>/<agent>-review.md` 各评审者的独立文件
- 更新 `review-matrix.json` 中的评审状态、blocking/advisory/risk 计数

### 步骤4：修订循环

如果 blocking > 0：
1. 将阻塞项反馈给原设计 Agent。
2. 设计 Agent 修订产物。
3. 原评审者复核其阻塞项。
4. 重复直到 blocking=0 或达到最大 3 轮。

### 步骤5：建议项汇总

当 blocking=0 时：
1. 将所有建议项整理为确认清单。
2. 写入 `reviews/advisory-confirmation.json`（含待确认建议项）。

3. 使用 **AskUserQuestion 工具**向用户展示建议项并获取决策。

   **第一轮 — 筛选需处理的项（multi_select 模式）：**
   - `header`: "建议项处理"
   - `question`: "以下评审建议项需要你的决策。请勾选你想处理的项："
   - `options`: 每条建议项为一个选项，label 为建议摘要（≤20字），description 说明影响范围
   - `multiSelect`: true
   - 若建议项 >4 个，按影响范围归类后分批提问

   **第二轮 — 逐项决定处理方式（single_select 模式）：**
   对用户选中的每一项，追问：
   - `header`: "建议项决策"
   - `question`: "针对「{建议摘要}」，如何处理？"
   - `options`:
     - `label: "✅ apply"` `description: "采纳此建议，反馈给设计 Agent 修订"`
     - `label: "↩️ no_change"` `description: "不修改，接受当前状态"`
     - `label: "🚫 convert_to_blocking"` `description: "升级为阻塞项，必须修复"`
   - `multiSelect`: false
   - 用户也可通过 Other 输入自定义处理意见

4. 将用户决策结果更新到 `reviews/advisory-confirmation.json`。

### 步骤6：更新状态

- 如果 blocking=0：更新 `stages.<phase>.status = 'ai_review_passed'`。
- 对于集成评审：检查所有阶段是否达到要求状态 → 如果满足，可以推进到 `design_ready`。

## 退出条件

- 所有阻塞项关闭 → 成功
- 达到最大 3 轮修订 → 部分完成，标记未解决的阻塞项待人工处理
- 评审 Agent 之间出现无法调和的冲突 → 标记待人工决策
- 需要人工信息或决策 → 暂停并请求输入
