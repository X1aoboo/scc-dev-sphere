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
4. **门禁判断**（读取派生计数）：
   ```bash
   node scripts/devsphere-review-matrix.js read <taskPath>
   ```
   - `blocking > 0` → 进入修订闭环（步骤5）。
   - `blocking = 0` 且 `advisory/risk_candidate = 0` → 跳到步骤7 设为通过。
   - `blocking = 0` 但有待决策 advisory/risk → 步骤6 人工确认。
5. **修订闭环**（blocking > 0）：本 skill 不直接改设计产物。workflow resolver 检测到 blocking 后重新派发**设计 Agent** 修订；修订完成后重新派发评审复核。`round` 递增，**上限 3 轮**。达上限仍未归零 → 标记未解决 blocking 待人工处理，停止。
6. **advisory / risk 人工确认**（blocking = 0，有待决策项）：
   - 用 `AskUserQuestion`（遵循 `references/interaction-guidelines.md`）逐项获取决策。
   - advisory 选项：`apply` / `no_change` / `convert_to_blocking`；risk 选项：`accepted_risk` / `mitigated` / `rejected`。
   - **risk_candidate 不得自动变为 accepted_risk**，必须人工确认。
   - 决策落盘：写 `advisory-confirmation.json` + 经脚本关闭 issue：
     ```bash
     node scripts/devsphere-review-matrix.js close <taskPath> ADV-001 --decision apply --closure "用户确认 apply"
     ```
   - `convert_to_blocking` 的 advisory → 重新 `add` 一条 blocking 并回到步骤4。
7. **设为评审通过**（blocking=0 且全部决策完成）：
   ```bash
   node scripts/devsphere-review-matrix.js set-status <taskPath> <artifact> reviewed
   ```
   脚本内置门禁：blocking>0 或有待决策 advisory/risk 时会**拒绝**设置。设置成功后 `status='reviewed'`（非 pending），`sync-stage-status` 即可将阶段推进到 `ai_review_passed`。
8. **集成评审**（`--target integrated-design`）：执行跨阶段一致性检查（business→solution→implementation→test 追溯无关键缺口、冲突已解决、accepted_risk 均有 DEC 来源），同样按步骤 2-7 记录 issue 并设状态。

## 评审视角矩阵

| 产物 | 基础评审者 | 风险增强 |
|------|-----------|---------|
| business-design | SE | — |
| solution-design | SA, MDE, TSE | 部署/迁移/数据 → CIE |
| implementation-design | SE, DEV, TSE | — |
| test-design | SA, SE, MDE | — |
| integrated-design | SA, SE, MDE, TSE | — |

## 人工确认触发

- advisory：每条需人工 `apply`/`no_change`/`convert_to_blocking`。
- risk_candidate：每条需人工 `accepted_risk`/`mitigated`/`rejected`，**禁止自动接受**。
- 用 `AskUserQuestion` 的 `single_select`（逐项决策）或 `multi_select`（批量筛选待处理项）。

## 失败处理

- 评审者之间不可调和冲突 → 标记待人工决策，停止。
- 目标产物明显不完整（缺关键章节）→ 直接提 blocking，不强行评审。
- 脚本命令失败（如 issue 未找到）→ 输出错误，不静默跳过。

## 完成标准

- 每条 issue 在 matrix 与叙述文件中 ID 一一对应。
- `blocking = 0` 或已达 3 轮上限（未解决项已标记）。
- advisory / risk_candidate 全部经人工决策（`getPendingHumanDecisions` 为空）。
- 通过的产物 `status = reviewed`（经 `set-status` 门禁验证）。

## 禁止事项

- 不直接编辑 `review-matrix.json`（必须经脚本命令）。
- 不自动把 risk_candidate 变为 accepted_risk。
- 不修改设计产物、`state.json`、`approvals/`、`decisions/`。
- 不在 blocking 未归零时设 `status` 为非 pending（脚本会拒绝）。
