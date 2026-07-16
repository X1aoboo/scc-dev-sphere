# Review: {{ARTIFACT_NAME}} by {{REVIEWER}}

**Date:**
**Reviewer Role:** {{REVIEWER_ROLE}}
**Artifact:** {{ARTIFACT_PATH}}
**Artifact Version:** {{ARTIFACT_VERSION}}
**Review Type:** stage-review | integrated-review
**Review Round:** {{ROUND}}（叙述字段；机器批次键使用 artifact version）

> **本角色机器结论写入 `reviews/<artifact>/<role>.json`**，由 Lead 在全部 Reviewer 完成后合并到 `reviews/review-matrix.json`。本文件只保留当前角色的评审**叙述历史**，同一角色的新 artifact version 追加章节，不覆盖旧版本。新发现先使用角色内 `findingId`；全局 B-/ADV-/RISK-NNN 由 Lead 合并时分配，复评已有 issue 时使用原 issue ID。

## Review Summary
<!-- Overall assessment -->

## Blocking Issues
<!-- Issues that MUST be fixed before proceeding. 记录到 matrix type=blocking. -->

### {{FINDING_ID}}: {{ISSUE_TITLE}}
- **Location:** {{SECTION_OR_LINE}}
- **Description:**
- **Expected Fix:**
- **Round:** {{ROUND}}
- **Review Finding Type:** blocking
- **Closure Decision:** <!-- 复评已有 issue 时填写原 issue ID、open/closed 和证据；新发现不填 -->
- **Closure Evidence:** <!-- 关闭时必填：EV-/DEC-/commit ref 或验证说明 -->

## Advisory Items
<!-- Suggestions that require human decision. 记录到 matrix type=advisory. -->

### {{FINDING_ID}}: {{ADVICE_TITLE}}
- **Location:**
- **Suggestion:**
- **Rationale:**
- **Round:** {{ROUND}}
- **Review Finding Type:** advisory
- **Human Decision:** <!-- 由 Lead 在 ask_review 阶段记录，不由 Reviewer 决定 -->

## Risk Candidates
<!-- Potential risks identified during review. 记录到 matrix type=risk_candidate. 不得自动变 accepted_risk。 -->

### {{FINDING_ID}}: {{RISK_TITLE}}
- **Description:**
- **Potential Impact:**
- **Suggested Mitigation:**
- **Round:** {{ROUND}}
- **Review Finding Type:** risk_candidate
- **Human Decision:** <!-- 由 Lead 在 ask_review 阶段记录，不由 Reviewer 决定 -->

## Review Attestation
- [ ] All required sections of the artifact have been reviewed
- [ ] Blocking issues are clearly documented with expected fixes
- [ ] Every finding has a matching `findingId` in the role JSON snapshot
- [ ] Existing issues use the original issue ID in `closureDecisions`
- [ ] Advisory/risk items include clear rationale for Lead's human decision
