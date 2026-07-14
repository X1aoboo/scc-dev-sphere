---
name: feature-review
description: 多角色 AI 交叉评审与修订闭环。Reviewer 按角色写入当前 artifactVersion 的独立评审快照和 Markdown，由 Lead 在全部 Reviewer 完成后统一合并 issue 结论。
---

# Feature Review — 多角色 AI 交叉评审与修订闭环

本 Skill 在 design team 的 Reviewer teammate 中运行。它只负责当前产物版本的独立评审，不负责派发其他 Reviewer、不推进流程、不直接写共享 review matrix。

## 集成契约

- **入口:** Lead 发送 `review_request`，包含目标产物、`artifactVersion`、reviewer role 和评审路径。
- **输入:** 目标产物、上游产物、当前 `artifactVersion`、`reviews/review-matrix.json`、自己的角色评审快照。
- **机器输出:** `reviews/<target>/<reviewer>.json`（只由当前 Reviewer 更新）。
- **历史输出:** `reviews/<target>/<reviewer>-review.md`（保留现有文件，按 artifactVersion 追加章节）。
- **Lead 合并:** 全部 required Reviewer 完成后，由 Lead 调用 `devsphere-review-state.js merge`，一次性更新 `review-matrix.json`。

## 前置条件

- 当前 task 存在且目标 artifact 存在；
- 当前 artifact 的 frontmatter 包含 `version`；
- 角色快照已经由 Lead 以当前 `artifactVersion` 授权；
- `artifactVersion` 不匹配时立即停止，不能使用旧版本评审结果。

## 评审步骤

1. **显式加载 Skill**：必须显式加载 `scc-dev-sphere:feature-review`，不依赖 Agent definition 的 `skills` frontmatter 是否在 teammate 路径生效。
2. **读取产物**：从自身专业视角评审目标产物及必要的上游产物。
3. **形成角色结论**：识别 `blocking`、`advisory`、`risk_candidate`。本次发现使用角色内 `findingId`（例如 `se-001`），全局 B-/ADV-/RISK- issue ID 由 Lead 合并时分配。
4. **记录复评结论**：对已存在的 issue，在 `closureDecisions` 中填写原 issue ID、`status` 和 `closureEvidence`；不直接调用 `close`。
5. **写入角色快照**：使用：

   ```bash
   node scripts/devsphere-review-state.js complete <taskPath> <artifact> <reviewer> '<review-result-json>'
   ```

   示例：

   ```json
   {
     "artifactId": "business-design",
     "artifactVersion": "0.2.0",
     "issueFindings": [
       {"findingId": "se-001", "type": "blocking", "round": 1}
     ],
     "closureDecisions": [
       {"issueId": "B-001", "status": "closed", "closureEvidence": "复评确认接口错误分支已补齐"}
     ],
     "summary": "..."
   }
   ```

6. **保留 Markdown 历史**：在 `reviews/<target>/<reviewer>-review.md` 中追加当前 `artifactVersion` 的评审章节，不覆盖已有版本叙述。
7. **通知 Lead**：角色快照和 Markdown 均写入成功后，通知 Lead 当前 artifact/version 评审完成。通知丢失时，Lead 仍可通过角色快照恢复状态。

## 评审矩阵

| 产物 | 基础评审者 | 风险增强 |
|------|-----------|---------|
| business-design | SE | — |
| solution-design | SA, MDE, TSE | 部署/迁移/数据 → CIE |
| implementation-design | SE, DEV, TSE | — |
| test-design | SA, SE, MDE | — |
| integrated-design | SA, SE, MDE, TSE | — |

## Issue 与修订规则

- `blocking`：保持 open 时阻断，进入统一 revise；
- `advisory`：由 Lead 按 workflow policy 决定 `apply` / `no_change`；
- `risk_candidate`：由 Lead 按 workflow policy 决定 `apply` / `accepted_risk` / `mitigated` / `rejected`；
- `apply` issue 保留原 ID，不转换为 blocking；
- 统一 revise 的 `reviewItems` 同时包含 open blocking 和 open apply advisory/risk；
- 设计 Agent 修订后递增 artifact version，Reviewer 重新评审新版本；
- Reviewer 只判断是否修复并写入 closure decision，Lead 只做机械合并，不重新判断。

## 通信和流程边界

- Lead 直接并行派发所有 Reviewer；
- Reviewer 不向设计 Agent 发送正式评审结果；
- 全部 Reviewer 完成前，设计 Agent 不得 revise；
- Reviewer 之间可以进行事实澄清，但不能以 peer 消息替代角色快照；
- Reviewer 不调用 `AskUserQuestion`；需要用户决策时保留 issue pending，由 Lead 执行 `ask_review`；
- Reviewer 不修改 `state.json`、artifact status、stage status 或 `review-matrix.json`。

## 完成标准

- 当前 artifactVersion 的所有 required Reviewer 均有 `status=completed` 的角色快照；
- 评审 Markdown 已按版本追加；
- 所有新发现和 closure decision 均可由 Lead 合并；
- Lead 合并前不触发 revise；
- Lead 合并后，router 再判断人工决策、统一 revise 或 reviewed 门禁。

## 禁止事项

- 不直接编辑 `reviews/review-matrix.json`；
- 不直接调用 `devsphere-review-matrix.js add/close`；
- 不替用户写 advisory/risk 的 `humanDecision`；
- 不创建重复 issue；
- 不把 apply issue 转换为 blocking；
- 不修改设计产物、`state.json`、`approvals/`、`decisions/`；
- 不在全部 required Reviewer 完成前通知设计 Agent revise。
