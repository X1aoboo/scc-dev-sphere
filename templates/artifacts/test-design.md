---
artifactId: "TD-{{TASK_ID}}"
version: "0.1.0"
---

# 测试设计 · Test Design: {{TASK_ID}}

<!-- 元信息见 frontmatter。风险驱动：每类测试须说明防什么风险。不可测项/风险候选不得自动变 accepted_risk，需人工确认。质量标准详见 docs/design/target-design-template-model.md §5。 -->

## 1. 测试目标与范围  <!-- Goals & Scope -->
<!-- 写什么：测什么、不测什么；与业务和风险对齐 -->
- 测什么：
- 不测什么（理由）：

## 2. 测试策略 · 测试金字塔  <!-- Strategy & Pyramid · Gate: QG-TD-002 -->
<!-- 写什么：层级、自动化、人工；pyramid 平衡，非仅 E2E -->
| 层级(unit/contract/integration/e2e) | 重点 | 自动化 | 理由 |
|-----------------------------------|------|--------|------|

## 3. 需求追溯矩阵  <!-- RTM · Gate: QG-TR-003 -->
<!-- 写什么：REQ/BR/API/MOD/RISK → TEST；无关键孤儿 -->
| REQ/BR/API/MOD/RISK | TEST ID | 覆盖说明 |
|--------------------|---------|---------|

## 4. 业务规则测试  <!-- Business Rule Tests -->
<!-- 写什么：正常/异常/替代规则；覆盖关键规则 -->
| TEST ID | 关联 BR | 场景 | 预期 |
|---------|---------|------|------|

## 5. 接口契约测试  <!-- Contract Tests -->
<!-- 写什么：request/error/auth/compat；可执行 -->
| TEST ID | 关联 API | 契约点 | 预期 |
|---------|---------|--------|------|

## 6. 集成 / E2E / 回归  <!-- Integration/E2E/Regression -->
<!-- 写什么：场景和边界；避免只靠 E2E -->
| TEST ID | 类型 | 场景 | 预期 |
|---------|------|------|------|

回归范围（EV/缺陷）：

## 7. 边界与负向测试  <!-- Boundary & Negative -->
<!-- 写什么：边界、异常、权限、安全、性能、兼容；高风险覆盖 -->
| TEST ID | 类型 | 场景 | 预期 |
|---------|------|------|------|

## 8. 测试数据与环境  <!-- Test Data & Env · Gate: QG-TD-007 -->
<!-- 写什么：数据、账号、环境、Mock；可准备 -->
| 项 | 说明 | 准备方式 |
|----|------|---------|
| 测试数据 | | |
| 账号 | | |
| 环境 | | |
| Mock/Stub | | |

## 9. 自动化建议  <!-- Automation Suggestions -->
<!-- 写什么：测试类型、命令、owner；可进入 DEV plan -->
| 自动化项 | 命令 | owner |
|---------|------|-------|

## 10. 不可测项与风险接受  <!-- Untestable & Risk Acceptance · Gate: QG-RISK-003 -->
<!-- 写什么：原因、影响、缓解、owner；需人工确认 -->
| 项 | 不可测原因 | 影响 | 缓解 | owner | 人工决策 |
|----|----------|------|------|-------|---------|

## 11. 转测准入  <!-- Handoff to Verification -->
<!-- 写什么：进入验证/转测条件；可检查 checklist -->
- [ ] 关键业务规则全覆盖
- [ ] 高风险项有测试或经确认的不可测项
- [ ] 回归范围明确
- [ ] 测试数据/环境就绪
- [ ] 自动化任务已入 DEV plan

## 依据汇总  <!-- Evidence References -->
依据：
