---
artifactId: "IG-{{TASK_ID}}"
version: "0.1.0"
---

# 集成设计 · Integrated Design: {{TASK_ID}}

<!-- 元信息见 frontmatter。integrated-design 是批准视图：只汇总不引入新事实，引用来源 artifact。任一上游 artifact 新 version 后本文件须刷新。质量标准详见 docs/design/target-design-template-model.md §6。 -->

## 1. 阶段产物状态  <!-- Artifact Status · Gate: QG-IG-001 -->
<!-- 写什么：artifact/version/status/gate/review 都可查 -->
| 阶段 | artifactId | version | status | gate | review |
|------|-----------|---------|--------|------|--------|
| business | BD-{{TASK_ID}} | | | | |
| solution | SD-{{TASK_ID}} | | | | |
| implementation | IMPL-{{TASK_ID}} | | | | |
| test | TD-{{TASK_ID}} | | | | |

## 2. 总体设计摘要  <!-- Summary -->
<!-- 写什么：只汇总，不引入新事实；引用来源 artifact -->

## 3. 需求 → 方案一致性  <!-- Business → Solution · Gate: QG-TR-004 -->
<!-- 写什么：BR/REQ 是否被架构承接；无关键缺口 -->
| BR/REQ | 方案承接 | 状态 |
|--------|---------|------|

## 4. 方案 → 实现一致性  <!-- Solution → Implementation · Gate: QG-TR-005 -->
<!-- 写什么：API/data/module 是否被实现承接；无冲突 -->
| API/data/module | 实现承接 | 状态 |
|----------------|---------|------|

## 5. 实现 → 测试一致性  <!-- Implementation → Test · Gate: QG-TR-006 -->
<!-- 写什么：MOD/RISK 是否有测试策略；高风险覆盖 -->
| MOD/RISK | 测试承接 | 状态 |
|---------|---------|------|

## 6. 业务规则覆盖矩阵  <!-- BR Coverage -->
<!-- 写什么：BR → TEST；关键规则全覆盖 -->
| BR | TEST | 覆盖 |
|----|------|------|

## 7. 决策与风险汇总  <!-- Decisions & Risks -->
<!-- 写什么：DEC/RISK/accepted_risk；accepted risk 必须有人工确认 -->
| 类型 | ID | 来源阶段 | 摘要 | 人工确认 |
|------|----|---------|------|---------|
| DEC | DEC-00x | | | |
| RISK | RISK-00x | | | |
| accepted_risk | | | | ✓ |

## 8. 冲突与解决  <!-- Conflicts & Resolutions -->
<!-- 写什么：冲突来源、处理方式；unresolved 不得批准 -->
| 冲突 | 涉及阶段 | 解决方式 | 状态 |
|------|---------|---------|------|

## 9. 未关闭问题 / 人工确认项  <!-- Open Questions -->
<!-- 写什么：open question/advisory；状态明确 -->
| 项 | 类型 | 状态 | owner |
|----|------|------|-------|

## 10. 可开发 / 可测试 / 可发布结论  <!-- Readiness Conclusions -->
<!-- 写什么：DEV/TSE/CIE 消费；条件化结论 -->
- 可开发（DEV）：
- 可测试（TSE）：
- 可发布（CIE，按需）：

## 11. 门禁结论  <!-- Gate Conclusion -->
<!-- 写什么：进入开发/转测/发布；由 gate/review 支撑 -->
- [ ] 各阶段 gate pass/warn（无 fail）
- [ ] 各阶段 review blocking=0
- [ ] advisory/risk 全部经人工决策
- [ ] accepted_risk 均有 DEC 来源
- 结论：可批准 / 有条件批准 / 不可批准

## 依据汇总  <!-- Evidence References -->
依据：
