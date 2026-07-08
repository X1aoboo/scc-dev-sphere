# 优化后的设计模板草案

> 本文件是草案，不覆盖 `templates/artifacts/*.md`。

## 1. 通用 Frontmatter 草案

```yaml
---
artifactId: ART-{{ARTIFACT_SEQ}}
artifactType: business-design
taskId: {{TASK_ID}}
version: 1
status: drafted
ownerAgent: sa
dependsOn: []
evidenceRefs: []
decisionRefs: []
assumptionRefs: []
riskRefs: []
qualityGateRefs: []
createdAt: {{CREATED_AT}}
updatedAt: {{UPDATED_AT}}
---
```

## 2. Business Design 草案结构

```markdown
# Business Design: {{TASK_ID}}

## 1. 文档元信息
写 artifact 元数据、版本、owner、状态和引用。质量标准：frontmatter 与正文一致。

## 2. 需求背景
写需求来源、触发原因、现有痛点。证据要求：引用输入需求或 EV。

## 3. 业务目标
写可衡量业务目标和成功标准。常见错误：只写“提升体验”。

## 4. 干系人与用户角色
表格：角色、目标、影响、确认责任。

## 5. 业务范围
In Scope / Out of Scope / Not Decided。

## 6. 当前业务现状
必须引用 evidence。无 evidence 写 assumption。

## 7. 目标业务流程
使用 Mermaid flowchart，图后解释正常流、异常流、替代流。

## 8. 业务规则清单
| BR ID | Rule | Source | Validation | Priority |

## 9. 决策表
| Rule | Condition | Result | Test Hint |

## 10. 状态模型
使用 stateDiagram 或说明不适用。

## 11. 领域术语
| Term | Definition | Alias | Evidence |

## 12. 数据输入输出
| Data | Direction | Owner | Validation | Privacy |

## 13. 验收标准
| AC ID | Acceptance Criteria | BR ID | Test Hint |

## 14. 需求追溯矩阵
| REQ ID | BR ID | AC ID | Evidence | Status |

## 15. 假设与开放问题
| ASM ID | Assumption | Confidence | Impact | Needs Confirmation |

## 16. 对 Solution Design 的交接契约
列出 SE 必须消费的规则、范围、术语、数据、未决问题。
```

## 3. Solution Design 草案结构

```markdown
# Solution Design: {{TASK_ID}}

## 1. 架构目标与约束
## 2. 需求到架构追溯
## 3. 系统上下文图 / C4 Context
## 4. C4 Container
## 5. C4 Component
## 6. 4+1 视图覆盖矩阵
## 7. 模块边界
## 8. 接口契约
| API ID | Consumer | Provider | Request | Response | Error | Auth | Compatibility |
## 9. 数据模型与数据流
## 10. 集成设计
## 11. 兼容性与迁移
## 12. 质量属性场景
| QA ID | Attribute | Source | Stimulus | Environment | Response | Measure |
## 13. 安全设计 / STRIDE
## 14. 架构决策和权衡
## 15. 架构风险
## 16. 对 Implementation/Test 的交接契约
```

## 4. Implementation Design 草案结构

```markdown
# Implementation Design: {{TASK_ID}}

## 1. 实现目标与范围
## 2. 模块影响
| MOD ID | Module | Impact | Evidence | Solution Ref |
## 3. 文件影响
| File | Change Type | Reason | Owner | Risk |
## 4. 类 / 接口 / 函数设计
## 5. DTO / Entity / 配置对象影响
## 6. 关键流程时序图
## 7. 数据流图
## 8. 状态机
## 9. 算法与业务规则实现
## 10. API / DB / 配置变更
## 11. 错误处理、并发、事务、幂等
## 12. 性能、安全、兼容
## 13. 日志、监控、测试钩子
## 14. 回滚策略
## 15. 实现风险
## 16. 对 DEV/TSE 的交接契约
```

## 5. Test Design 草案结构

```markdown
# Test Design: {{TASK_ID}}

## 1. 测试目标与范围
## 2. 测试策略和金字塔映射
## 3. 需求/规则/接口/模块/风险追溯矩阵
| Source ID | Source Type | Test ID | Level | Priority | Status |
## 4. 业务规则测试
## 5. 接口契约测试
## 6. 集成测试
## 7. 端到端与回归测试
## 8. 边界值和异常路径
## 9. 权限、安全、性能、兼容性
## 10. 测试数据
## 11. 测试环境
## 12. Mock / Stub
## 13. 自动化建议
## 14. 不可测项与风险接受
## 15. 转测准入标准
```

## 6. Integrated Design 草案结构

```markdown
# Integrated Design: {{TASK_ID}}

## 1. 阶段产物状态
| Artifact | Version | Hash | Status | Gate | Review |
## 2. 总体设计摘要
## 3. Business -> Solution 一致性
## 4. Solution -> Implementation 一致性
## 5. Implementation -> Test 一致性
## 6. 业务规则覆盖矩阵
## 7. 架构决策汇总
## 8. 风险汇总
## 9. 冲突与解决
## 10. 未关闭问题与人工确认项
## 11. 可开发性结论
## 12. 可测试性结论
## 13. 可发布性初判
## 14. 设计完整性评分
## 15. 门禁结论
```

