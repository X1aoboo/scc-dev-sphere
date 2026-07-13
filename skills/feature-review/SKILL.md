---
name: feature-review
description: 多角色 AI 交叉评审与修订闭环。对设计产物输出结构化 blocking/advisory/risk_candidate issue，经人工确认与修订循环驱动设计达到可批准状态。issue 状态以 review-matrix.json 为事实源。
---

# Feature Review — 多角色交叉评审与修订闭环

对设计产物执行正式 AI 评审，输出**结构化 issue**（blocking / advisory / risk_candidate），驱动评审-修订闭环直到 blocking 归零、advisory/risk 经人工决策。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-review --target <artifact> [--round N]`
- **入参:** 目标产物、`reviews/review-matrix.json`、评审者矩阵、当前轮次
- **输出:** `reviews/<target>/<agent>-review.md`（叙述）、更新后的 `review-matrix.json`（结构化 issue + 状态）
- **完成标准:** 见文末

## 前置条件

- 存在 active feature task。
- 目标产物文件存在且阶段状态为 `drafted`（或修订后待复核）。
- `--target` 为 `business-design`/`solution-design`/`implementation-design`/`test-design`/`integrated-design` 之一。

## 输入与写入范围

**读取：** 目标产物、上游产物（跨阶段一致性时）、`review-matrix.json`、`state.json`。
**允许写入：**
- `reviews/<target>/<agent>-review.md`（评审叙述）
- `reviews/review-matrix.json`（**只能经 `devsphere-review-matrix.js` 命令写入**，不直接编辑 JSON）
- `reviews/advisory-confirmation.json`（advisory 决策记录，兼容审批）

**禁止写入：** 设计产物本身、`state.json`、`approvals/`、`decisions/`。

## 执行步骤

1. **确定评审者**：按 `BASE_REVIEWERS`（见评审视角矩阵）+ 风险增强（部署/配置/迁移风险 → 加 CIE）。
2. **多角色评审**：每位评审者以自身专业视角评审目标产物，识别 blocking / advisory / risk_candidate。每个 issue 在叙述文件中写明标题、位置、描述、预期修复/理由。
3. **记录结构化 issue**（经脚本，**不手编 JSON**）：
   ```bash
   node scripts/devsphere-review-matrix.js add <taskPath> <artifact> '{"type":"blocking","reviewerAgent":"se","round":N}'
   ```
   返回的 ID（B-/ADV-/RISK-NNN）回填到 `<agent>-review.md` 对应条目，保证叙述与 matrix 一一对应。
4. **完成评审并通知 Lead**（读取派生计数）：
   ```bash
   node scripts/devsphere-review-matrix.js read <taskPath>
   ```
   本 teammate 不调用 `AskUserQuestion`，不替用户写 advisory/risk 的 `humanDecision`，也不设置 artifact `reviewed`。
5. **统一修订闭环**：Lead 在完成 pending advisory/risk 决策后，由 router 一次性派发设计 Agent，`reviewItems` 同时包含 open blocking 和用户选择 `apply` 的 advisory/risk。本 skill 不直接修改设计产物。
6. **修订复评**：复评时检查本轮传入的所有 review issue：
   - 确认已修复 → 使用原 issue ID 执行：
     ```bash
     node scripts/devsphere-review-matrix.js close <taskPath> <issueId> --status closed --closure "复评确认已修复"
     ```
     apply issue 保留原 `humanDecision=apply`。
   - 未修复 → 保持 issue open，通知 Lead 继续 revise，不创建重复 issue。
   - 新发现的独立问题 → 经脚本 `add` 新 issue。
7. **人工决策**：pending advisory/risk 由 Lead 的 `ask_review` 动作逐项询问：
   - advisory：`apply` / `no_change`；
   - risk_candidate：`apply` / `accepted_risk` / `mitigated` / `rejected`。
8. **设为评审通过**：所有 issue 已复评且人工决策完成后，通知 Lead 调用：
   ```bash
   node scripts/devsphere-review-matrix.js set-status <taskPath> <artifact> reviewed
   ```
   脚本内置门禁：blocking>0、pending advisory/risk 或 open apply issue 时会**拒绝**设置。
9. **集成评审**（`--target integrated-design`）：执行跨阶段一致性检查（business→solution→implementation→test 追溯无关键缺口、冲突已解决、accepted_risk 均有 DEC 来源），同样按步骤 2-8 记录 issue、复评并通知 Lead。

## 评审视角矩阵

| 产物 | 基础评审者 | 风险增强 |
|------|-----------|---------|
| business-design | SE | — |
| solution-design | SA, MDE, TSE | 部署/迁移/数据 → CIE |
| implementation-design | SE, DEV, TSE | — |
| test-design | SA, SE, MDE | — |
| integrated-design | SA, SE, MDE, TSE | — |

## 人工确认触发

- pending advisory/risk 由 Lead 通过 `ask_review` 逐项询问。
- advisory：`apply` / `no_change`。
- risk_candidate：`apply` / `accepted_risk` / `mitigated` / `rejected`。
- 本 skill 不调用 `AskUserQuestion`。

## 失败处理

- 评审者之间不可调和冲突 → 标记待人工决策，停止。
- 目标产物明显不完整（缺关键章节）→ 直接提 blocking，不强行评审。
- 脚本命令失败（如 issue 未找到）→ 输出错误，不静默跳过。

## 完成标准

- 每条 issue 在 matrix 与叙述文件中 ID 一一对应。
- 所有本轮 issue 已复评：已修复 issue 已由评审 Agent 关闭，未修复 issue 保持 open。
- advisory / risk_candidate 全部经 Lead 决策（`getPendingHumanDecisions` 为空）。
- 产物是否 `reviewed` 由 Lead 通过 `set-status` 门禁决定。

## 禁止事项

- 不直接编辑 `review-matrix.json`（必须经脚本命令）。
- 不自动把 risk_candidate 变为 accepted_risk。
- 不把 apply issue 转换为 blocking，不创建 blocking 影子 issue。
- 不修改设计产物、`state.json`、`approvals/`、`decisions/`。
- 不在 blocking 未归零时设 `status` 为非 pending（脚本会拒绝）。
