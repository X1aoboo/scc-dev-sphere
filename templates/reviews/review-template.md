# Review: {{ARTIFACT_NAME}} by {{REVIEWER}}

**Date:**
**Reviewer Role:** {{REVIEWER_ROLE}}
**Artifact:** {{ARTIFACT_PATH}}
**Review Type:** stage-review | integrated-review
**Review Round:** {{ROUND}}

> **状态/决策的事实源是 `reviews/review-matrix.json`**（由 feature-review 经脚本维护）。本文件记录评审**叙述**（标题、位置、描述、预期修复、理由），issue ID（B-/ADV-/RISK-NNN）与 matrix 一一对应。下方的 Status / Human Decision 为人类可读镜像，以 matrix 为准。

## Review Summary
<!-- Overall assessment -->

## Blocking Issues
<!-- Issues that MUST be fixed before proceeding. 记录到 matrix type=blocking. -->

### B-001: {{ISSUE_TITLE}}
- **Location:** {{SECTION_OR_LINE}}
- **Description:**
- **Expected Fix:**
- **Round:** {{ROUND}}
- **Status:** open | closed（matrix 事实源）
- **Closure Evidence:** <!-- 关闭时必填：EV-/DEC-/commit ref 或验证说明 -->

## Advisory Items
<!-- Suggestions that require human decision. 记录到 matrix type=advisory. -->

### ADV-001: {{ADVICE_TITLE}}
- **Location:**
- **Suggestion:**
- **Rationale:**
- **Round:** {{ROUND}}
- **Human Decision:** pending | apply | no_change（matrix 事实源）
- **Closure Evidence:** <!-- 决策后填：决策依据/确认记录 -->

## Risk Candidates
<!-- Potential risks identified during review. 记录到 matrix type=risk_candidate. 不得自动变 accepted_risk。 -->

### RISK-001: {{RISK_TITLE}}
- **Description:**
- **Potential Impact:**
- **Suggested Mitigation:**
- **Round:** {{ROUND}}
- **Human Decision:** pending | apply | accepted_risk | mitigated | rejected（matrix 事实源）
- **Closure Evidence:** <!-- 决策后填：接受/缓解依据 -->

## Review Attestation
- [ ] All required sections of the artifact have been reviewed
- [ ] Blocking issues are clearly documented with expected fixes
- [ ] Every raised issue has a matching entry in `review-matrix.json` (same ID)
- [ ] Advisory items include clear rationale for human decision
