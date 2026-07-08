# 目标设计模板模型

## 1. 通用模板规则

所有设计产物模板必须具备：

1. frontmatter：artifactId、artifactType、taskId、version、status、ownerAgent、dependsOn、evidenceRefs、decisionRefs、assumptionRefs、riskRefs、qualityGateRefs。
2. 章节说明：每章写什么、质量标准、证据要求、图示要求、常见错误、是否必填、下游用途、对应 Gate。
3. ID 体系：REQ、BR、NFR、EV、DEC、ASM、RISK、API、MOD、TEST、QG。
4. Mermaid 图示和图后说明。复杂信息优先图示表达，但小任务允许写“不适用，理由：...”。
5. 下游交接契约。每个产物必须声明下一阶段需要消费哪些字段。

## 2. `business-design.md`

| 章节 | 写什么 | 质量标准 | 证据/图示 | 常见错误 | Gate |
|---|---|---|---|---|---|
| 文档元信息 | task、owner、version、status、refs | frontmatter 完整 | hash/refs | 缺 version | QG-TPL-001 |
| 需求背景 | 需求来源、触发原因、上下文 | 可追溯到输入 | REQ/EV | 只复述一句话 | QG-BD-001 |
| 业务目标 | 可衡量目标 | 与验收相关 | REQ/NFR | 目标空泛 | QG-BD-002 |
| 干系人/用户角色 | 角色、影响、关注点 | 覆盖主要使用者和运营/审核方 | 可用表格 | 只写“用户” | QG-BD-003 |
| 业务范围 | In/Out of Scope | 边界明确 | DEC/ASM | out-of-scope 缺失 | QG-BD-004 |
| 当前业务现状 | 存量流程和规则 | 现状必须有 evidence | EV、flowchart | 凭空推断 | QG-EV-001 |
| 目标业务流程 | 正常/异常/替代流 | 可执行、可测试 | Mermaid flowchart | 只写 happy path | QG-BD-005 |
| 业务规则清单 | BR ID、规则、来源、优先级 | 每条规则可验证 | EV/ASM | 无编号 | QG-BD-006 |
| 决策表 | 条件组合和结果 | 覆盖关键分支 | 表格 | 混入实现逻辑 | QG-BD-007 |
| 状态模型 | 业务状态和转移 | 含异常/终止状态 | stateDiagram | 状态与流程不一致 | QG-BD-008 |
| 领域术语 | 术语、定义、别名 | 与知识库一致 | EV | 同词多义 | QG-BD-009 |
| 输入输出数据 | 业务输入/输出/所有者 | 数据 owner 明确 | 表格 | 混入 DB 设计 | QG-BD-010 |
| 验收标准 | 可验证条件 | 可转测试场景 | BR/TEST | 不可测 | QG-BD-011 |
| 需求追溯矩阵 | REQ -> BR -> AC | 无孤儿需求 | 表格 | 漏掉 out-of-scope | QG-TR-001 |
| 假设/开放问题 | ASM、问题、阻断级别 | 高风险需确认 | ASM | assumption 当事实 | QG-ASM-001 |
| 交接契约 | 给 solution 的输入 | SE 可直接消费 | refs | 无下游字段 | QG-HO-001 |

## 3. `solution-design.md`

| 章节 | 写什么 | 质量标准 | 证据/图示 | Gate |
|---|---|---|---|---|
| 文档元信息 | artifact refs | frontmatter 完整 | refs | QG-TPL-001 |
| 架构目标/约束 | 目标、限制、非目标 | 对齐 business | REQ/DEC | QG-SD-001 |
| 需求到架构追溯 | REQ/BR -> ARCH/API/MOD | 无孤儿规则 | table | QG-TR-002 |
| 系统上下文 / C4 Context | 系统、用户、外部系统 | 边界清晰 | Mermaid C4-like | QG-SD-002 |
| C4 Container / Component | 容器、组件、职责、交互 | 层级不混乱 | flowchart | QG-SD-003 |
| 4+1 视图覆盖矩阵 | logical/development/process/physical/scenario | 中高风险覆盖受影响视图 | table/sequence/deployment | QG-SD-004 |
| 模块边界 | 模块职责和依赖 | 单一职责、依赖方向清楚 | diagram | QG-SD-005 |
| 接口契约 | request/response/error/version/auth | 可测试、可兼容 | OpenAPI/AsyncAPI refs | QG-API-001 |
| 数据模型/数据流 | 数据对象、所有权、迁移 | 迁移/回滚明确 | ER/data flow | QG-DATA-001 |
| 集成设计 | 同步/异步、超时、重试、幂等 | 失败路径明确 | sequence | QG-SD-006 |
| 质量属性场景 | source/stimulus/env/response/measure | 可验证 | table | QG-NFR-001 |
| 安全/STRIDE | trust boundary、威胁、缓解 | 与数据流绑定 | DFD + table | QG-SEC-001 |
| 架构决策/权衡 | 备选、取舍、后果 | 有 DEC ID | decisions refs | QG-DEC-001 |
| 架构风险 | RISK、影响、缓解、owner | 可闭环 | table | QG-RISK-001 |
| 交接契约 | 给 MDE/TSE 的输入 | 可实现、可测试 | refs | QG-HO-002 |

## 4. `implementation-design.md`

| 章节 | 写什么 | 质量标准 | 证据/图示 | Gate |
|---|---|---|---|---|
| 实现目标/范围 | 实现边界、非目标 | 对齐 solution | DEC | QG-ID-001 |
| 模块影响 | MOD ID、模块、影响类型 | 来自 repo evidence | EV-REPO | QG-ID-002 |
| 文件影响 | 文件、变更类型、owner | 路径可定位 | table | QG-ID-003 |
| 类/接口/函数设计 | 签名、职责、输入输出 | 可编码 | code-like table | QG-ID-004 |
| DTO/Entity/配置对象 | 字段、兼容、默认值 | 数据影响明确 | table | QG-ID-005 |
| 关键流程时序图 | 调用顺序和失败路径 | 覆盖主要链路 | sequenceDiagram | QG-DIA-001 |
| 数据流/状态机 | 数据变化和状态转移 | 与 solution 一致 | flow/stateDiagram | QG-ID-006 |
| 算法与规则实现 | 业务规则如何实现 | BR 可追溯 | BR refs | QG-ID-007 |
| DB/API/配置变更 | schema/API/config | 迁移/回滚 | refs | QG-ID-008 |
| 错误处理/并发/事务/幂等 | 边界和策略 | 高风险不可空 | table | QG-ID-009 |
| 日志监控/测试钩子 | log/metric/test seam | 可验证 | table | QG-ID-010 |
| 回滚策略/风险 | 回滚、降级、残余风险 | owner 明确 | RISK | QG-RISK-002 |
| DEV/TSE 交接 | 实现计划输入、测试输入 | 可派生任务/用例 | table | QG-HO-003 |

## 5. `test-design.md`

| 章节 | 写什么 | 质量标准 | 证据/图示 | Gate |
|---|---|---|---|---|
| 测试目标/范围 | 测什么、不测什么 | 与业务和风险对齐 | refs | QG-TD-001 |
| 测试策略 | 层级、自动化、人工 | pyramid 平衡 | table | QG-TD-002 |
| 需求追溯矩阵 | REQ/BR/API/MOD/RISK -> TEST | 无关键孤儿 | table | QG-TR-003 |
| 业务规则测试 | 正常/异常/替代规则 | 覆盖关键规则 | BR refs | QG-TD-003 |
| 接口契约测试 | request/error/auth/compat | 可执行 | API refs | QG-TD-004 |
| 集成/E2E/回归 | 场景和边界 | 避免只靠 E2E | table | QG-TD-005 |
| 边界/异常/权限/安全/性能/兼容 | 负向和 NFR | 高风险覆盖 | RISK refs | QG-TD-006 |
| 测试数据/环境 | 数据、账号、环境、Mock | 可准备 | table | QG-TD-007 |
| 自动化建议 | 测试类型、命令、owner | 可进入 DEV plan | command refs | QG-TD-008 |
| 不可测项/风险接受 | 原因、影响、缓解、owner | 需人工确认 | DEC/RISK | QG-RISK-003 |
| 转测准入 | 进入验证/转测条件 | 可检查 | checklist | QG-HO-004 |

## 6. `integrated-design.md`

| 章节 | 写什么 | 质量标准 | Gate |
|---|---|---|---|
| 阶段产物状态 | artifact/version/hash/status/gate | 全部可追溯 | QG-IG-001 |
| 总体设计摘要 | 只汇总，不引入新事实 | 引用来源 artifact | QG-IG-002 |
| 需求->方案一致性 | BR/REQ 是否被架构承接 | 无关键缺口 | QG-TR-004 |
| 方案->实现一致性 | API/data/module 是否承接 | 无冲突 | QG-TR-005 |
| 实现->测试一致性 | MOD/RISK 是否有测试策略 | 高风险覆盖 | QG-TR-006 |
| 业务规则覆盖矩阵 | BR -> TEST | 关键规则全覆盖 | QG-TR-007 |
| 决策/风险汇总 | DEC/RISK/accepted_risk | accepted risk 有人工确认 | QG-RISK-004 |
| 冲突与解决 | 冲突来源、处理方式 | unresolved 不得批准 | QG-IG-003 |
| 未关闭问题/人工确认项 | open question/advisory | 状态明确 | QG-IG-004 |
| 可开发/可测试/可发布结论 | DEV/TSE/CIE 消费 | 条件化结论 | QG-IG-005 |
| 门禁结论 | 进入开发/转测/发布 | 由 gate/review 支撑 | QG-IG-006 |

