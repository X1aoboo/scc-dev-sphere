# Agent / Skill / Template 专业化业界调研

## 1. 调研结论

本轮调研用于回答一个具体问题：`scc-dev-sphere` 的 Agent、Skill、Template 应该如何分工，才能让设计阶段输出从“按模板生成文档”升级为“可评审、可追溯、可派生开发和测试任务的专业设计工作流”。

核心结论：

1. Agent 不应承载完整方法论。Agent 应保持专业视角、责任边界、评审关注点和升级条件。
2. Skill 应承载可复用工程动作。设计步骤、证据处理、修订模式、失败处理、质量门禁和下游交接应写进 Skill。
3. Template 应约束产物结构和章节质量。模板不能只是标题列表，必须说明章节目的、写法、证据、图示、常见错误和下游用途。
4. Quality Gate 应承担机器可检查规则。章节完整性、ID 格式、evidence/decision/assumption 引用、traceability、review closure 不应只依赖 Agent 自觉。
5. Docs / Knowledge 是 system of record。关键事实、规范、ADR、证据、决策和知识候选都必须落盘，不能依赖对话记忆。

## 2. 来源索引

| 来源 | 链接 | 对本仓库的用途 |
|---|---|---|
| OpenAI Harness Engineering | https://openai.com/index/harness-engineering/ | repo knowledge as system of record、agent legibility、lint/gate/harness 约束 |
| Codex Skills | https://developers.openai.com/codex/skills | Skill 作为可复用工作流和 progressive disclosure 单元 |
| Codex AGENTS.md | https://developers.openai.com/codex/guides/agents-md | repo-local 指令入口，不把全部知识塞进 Agent |
| C4 Model | https://c4model.com/ | Context / Container / Component / Code 分层架构图 |
| 4+1 View Model | https://www.computer.org/csdl/magazine/so/1995/06/s6042/13rRUxcsYJI | Logical / Development / Process / Physical / Scenario 多视图 |
| arc42 | https://arc42.org/ | 架构文档结构、质量目标、约束、运行视图、风险债务 |
| ADR | https://adr.github.io/ | 决策记录格式与轻量化架构决策历史 |
| SEI Quality Attribute Workshop | https://www.sei.cmu.edu/library/quality-attribute-workshop-collection/ | 质量属性场景和可验证 NFR |
| SEI ATAM | https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/ | 架构权衡、风险、敏感点、trade-off |
| OpenAPI | https://www.openapis.org/ | HTTP API contract-first 设计与测试依据 |
| AsyncAPI | https://www.asyncapi.com/docs/reference/specification/latest | 事件/消息接口 contract-first 设计 |
| Microsoft STRIDE | https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats | 数据流与 trust boundary 驱动的威胁建模 |
| Test Pyramid | https://martinfowler.com/bliki/TestPyramid.html | 测试层级组合和快速反馈 |
| ISTQB Risk-based Testing | https://glossary.istqb.org/en_US/term/risk-based-testing | 风险优先级驱动测试范围 |
| DORA Platform Engineering | https://dora.dev/capabilities/platform-engineering/ | Golden Path、平台能力和交付可观测指标 |
| Thoughtworks Agentic SDLC | https://www.thoughtworks.com/en-us/insights/articles/preparing-your-team-for-agentic-software-development-life-cycle | Agentic SDLC 的组织、治理、知识网络和生命周期观点 |
| AWS Operational Readiness Reviews | https://docs.aws.amazon.com/wellarchitected/latest/operational-readiness-reviews/wa-operational-readiness-reviews.html | 运维就绪、告警、回滚、runbook、发布门禁 |
| Google SRE PRR | https://sre.google/sre-book/evolving-sre-engagement-model/ | 生产就绪评审和早期介入 |

## 3. 实践对标与落地建议

| 实践 | 解决的问题 | 核心机制 | Agent 落点 | Skill 落点 | Template 落点 | Quality Gate 落点 | 改造建议 | 不适合照搬 |
|---|---|---|---|---|---|---|---|---|
| Harness Engineering | Agent 输出不可控、知识不可见、架构漂移 | repo knowledge、agent-legible artifacts、lint/gate/trace | 所有 Agent 只引用事实源 | 所有 Skill 强制读写约定产物 | frontmatter + trace refs | artifact/gate/hash/trace 校验 | 新增 artifact registry、gate result、trace event | 不自建云端 runtime |
| C4 | 架构图层级混乱 | Context/Container/Component/Code | SE 主责，TSE/MDE 评审 | feature-design-solution 生成/选择视图 | solution-design C4 章节 | 图层级、边界、接口覆盖 | 强制 C4 level 和图后说明 | Code level 按需，不强制 |
| 4+1 | 单一视图无法覆盖干系人关注点 | logical/development/process/physical/scenario | SE 主责，CIE 参与 physical | solution skill 选择受影响视图 | solution-design 视图覆盖矩阵 | 关键视图缺失 fail/warn | 对中高风险任务要求至少覆盖受影响视图 | 不要求每个小需求画全套图 |
| arc42 | 架构文档结构不稳定 | 目标、约束、上下文、构件、运行、部署、质量、风险 | SE | solution skill | solution-design 章节顺序 | 关键章节完整性 | 用 arc42 精简版重构方案模板 | 不生成长篇静态架构书 |
| ADR | 决策不可追溯 | context/options/decision/consequence/status | SE/MDE/DEV/CIE 记录取舍 | design skills 写 decision refs | decision refs 章节 | 关键取舍无 decision fail | 统一 `DEC-*`，approval 锁定 hash + decision | 不为每个小实现细节写 ADR |
| QAW/ATAM | NFR 空泛，架构风险不可验证 | 质量属性场景、trade-off、risk theme | SE 主责，TSE/CIE 评审 | solution/review skill 执行 mini-ATAM | 质量属性场景表 | NFR 缺量化 fail | 增加 source/stimulus/environment/response/measure | 不引入正式大型评审会议 |
| DDD/EventStorming | 业务规则和术语散乱 | ubiquitous language、bounded context、domain events | SA 主责 | business skill | business-design 术语/事件/规则 | 术语和规则 trace | 高价值规则沉淀 knowledge candidate | 不强套事件驱动实现 |
| BPMN/DMN/Decision Table | 流程和规则不可测试 | 流程图、泳道、决策表 | SA | business skill | business-design 流程/决策表 | 每条规则有测试映射 | 用 Mermaid + Markdown 表格表达 | 不引入 BPMN 引擎 |
| OpenAPI/AsyncAPI | 接口契约晚于实现 | contract-first schema/examples/errors | SE 主责，TSE 评审 | solution skill | contract 章节或独立 artifact | 接口变更无 contract fail | 约定 `artifacts/contracts/*` | 无接口变更不强写 |
| STRIDE | 安全设计后置 | DFD + trust boundary + STRIDE | SE/CIE，未来 Security | solution/review skill | security 章节 | 涉权/PII/外部输入触发 | 将威胁绑定具体数据流 | 不做空 checklist |
| Test Pyramid | 测试只靠 E2E/人工验证 | unit/integration/contract/e2e/manual 分层 | TSE | test skill | test-design 测试层级 | 测试层级缺失 warn/fail | 将风险映射到测试层级 | 不固定比例 |
| Risk-based Testing | 测试资源平均分配 | impact/likelihood/detectability | TSE | test skill | risk coverage table | 高风险无测试 fail | risk -> scenario -> residual risk | 不把低风险当豁免理由 |
| RTM | 需求、设计、代码、测试断链 | requirement -> artifact -> decision -> test | 所有 Agent 引用 ID | integration skill | traceability matrix | 孤儿需求/测试 fail | 生成 traceability matrix | 不手工维护巨型表 |
| DoR/DoD | 准入/完成标准不一致 | Ready / Done 条件 | SA/DEV/TSE | assess/verify/gate skill | approval/test handoff | status gate | 需求准入和 completed 门禁明确化 | 不变成官僚门槛 |
| ORR/PRR | 功能完成但不可发布 | runbook、SLO、告警、回滚、容量 | CIE 按需 | release-readiness/P2 | ops readiness template | 发布风险 gate | P2 加运维就绪产物 | 低风险任务按需裁剪 |
| Platform Engineering / Golden Path | 使用路径靠人记忆 | 默认工作流、模板、脚本、逃生口 | workflow 入口 | workflow/status skills | docs/workflows | state/gate/trace | feature workflow 作为第一条 golden path | 保留人工 override |

## 4. 对 scc-dev-sphere 的落地原则

1. 先补 harness，再补方法论。P0 应优先做 artifact metadata、quality gate、review issue、trace，而不是先扩写 Agent。
2. 方法论进入 Skill 与 Template。4+1、C4、ATAM、STRIDE、Risk-based Testing 是可执行动作和产物结构，不是 Agent 自我介绍。
3. 文档要支持派生。每个业务规则、接口、模块、风险都必须能追溯到测试和开发任务。
4. 复杂度裁剪必须显式。小任务允许用“不适用，理由：...”替代完整图示，但不能留空。
5. 所有关键结论必须有 evidence、decision 或 assumption 标记。

