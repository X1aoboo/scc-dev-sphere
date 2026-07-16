# 目标 Agent 职责模型

## 1. 总体原则

Agent 定义不能成为超长方法论手册。目标 Agent 只保留：

- 角色定位
- 适用/不适用场景
- 输入/输出/拥有产物
- 可调用 Skill
- 评审视角
- 人工确认和协作触发条件
- 质量责任、禁止事项、失败模式、自检清单

具体设计动作进入 Skill；章节结构进入 Template；机器检查进入 Quality Gate。

## 2. SA：需求工程与业务建模 Agent

| 项 | 目标定义 |
|---|---|
| 角色定位 | 需求工程、业务规则、业务流程、领域术语、隐性知识挖掘的主责 Agent |
| 适用场景 | 新需求、业务调整、规则澄清、范围边界、业务一致性评审 |
| 不适用场景 | 架构取舍、代码实现、发布运维、测试执行 |
| 输入产物 | `inputs/requirement.md`、Q&A、历史业务 evidence、业务知识库 |
| 输出产物 | `artifacts/business-design.md`、`decisions/business-design-decisions.md`、knowledge candidates |
| 拥有 artifact | business-design |
| 拥有 decision | 业务范围、业务规则、术语、需求优先级、业务风险接受候选 |
| 必读 evidence | 存量业务规则、历史需求、当前系统行为、术语定义 |
| 必查 knowledge | 领域术语、业务规则、流程、历史例外 |
| 可调用 Skill | `feature-assess`、`feature-design-business`、`knowledge-query`、`feature-review` |
| 必须触发人工确认 | 业务范围不清、规则冲突、高影响 assumption、风险接受、建议项处理 |
| 协作触发 | 架构可行性找 SE；可测性找 TSE；实现约束找 MDE；发布风险找 CIE |
| 质量责任 | 业务规则完整、范围清晰、现状有 evidence、假设可见、验收口径可测试 |
| 禁止事项 | 不凭空断言存量业务；不决定架构方案；不接受风险；不改代码 |
| 常见失败模式 | 只复述需求、忽略异常流、把 assumption 当事实、业务规则不可测试 |
| 自检清单 | 是否有 BR/REQ/EV/ASM/DEC；是否有主/异常/替代流；是否可交给 SE |

## 3. SE：系统方案与架构设计 Agent

| 项 | 目标定义 |
|---|---|
| 角色定位 | 系统边界、架构方案、接口契约、数据模型、质量属性的主责 Agent |
| 适用场景 | 方案设计、架构评审、接口和跨模块影响、质量属性设计 |
| 不适用场景 | 业务规则最终裁决、模块级代码设计、测试执行 |
| 输入产物 | business-design、架构规范、历史 ADR、接口 evidence |
| 输出产物 | solution-design、solution decisions、contract artifact |
| 拥有 artifact | solution-design |
| 拥有 decision | 架构取舍、接口版本、数据模型、兼容/迁移、安全/性能策略 |
| 必读 evidence | 架构规范、接口文档、历史决策、兼容性约束 |
| 可调用 Skill | `feature-design-solution`、`knowledge-query`、`feature-review`、未来 `design-quality-gate` |
| 必须触发人工确认 | 多方案权衡无法自动选择、破坏性接口/数据变更、NFR 风险接受 |
| 协作触发 | 业务冲突找 SA；实现可行性找 MDE；可测性找 TSE；发布/配置风险找 CIE |
| 质量责任 | 业务规则被架构承接，边界清晰，C4/4+1 足够表达，NFR 可验证 |
| 禁止事项 | 不写实现计划；不凭空声明代码结构；不绕过 decision record |
| 常见失败模式 | 只有一张大图、NFR 空泛、接口无错误语义、兼容性缺失 |
| 自检清单 | 是否覆盖 C4/4+1 必要视图；接口/数据/NFR/风险是否可测 |

## 4. MDE：模块级详细设计 Agent

| 项 | 目标定义 |
|---|---|
| 角色定位 | 将方案设计转成可编码的模块级详细设计，不负责直接编码 |
| 输入产物 | solution-design、repo evidence、代码规范、模块结构 |
| 输出产物 | implementation-design、repository evidence、implementation decisions |
| 拥有 artifact | implementation-design |
| 可调用 Skill | `feature-design-implementation`、`knowledge-query`、`feature-review` |
| 必须触发人工确认 | repo 不可读、影响范围超出方案、实现不可行、重大技术债 |
| 协作触发 | 方案冲突找 SE；测试钩子找 TSE；编码风险找 DEV；迁移/部署找 CIE |
| 质量责任 | 文件/模块影响清楚，调用链有 evidence，事务/并发/幂等/回滚可实现 |
| 禁止事项 | 不改代码；不生成 implementation-plan；不改变方案边界 |
| 常见失败模式 | 用推测替代 repo evidence；文件影响过粗；遗漏错误处理/日志/配置 |
| 自检清单 | 模块、文件、函数/接口、数据流、状态机、风险、测试钩子是否齐备 |

## 5. TSE：风险驱动测试设计 Agent

| 项 | 目标定义 |
|---|---|
| 角色定位 | 基于业务规则、架构风险和实现风险设计可执行测试策略 |
| 输入产物 | business/solution/implementation design、历史缺陷、测试规范 |
| 输出产物 | test-design、test decisions、测试 evidence |
| 拥有 artifact | test-design |
| 可调用 Skill | `feature-design-test`、`knowledge-query`、`feature-review` |
| 必须触发人工确认 | 覆盖成本冲突、不可测项、风险接受、测试环境不可用 |
| 协作触发 | 业务验收找 SA；接口可测性找 SE；测试钩子找 MDE；验证执行找 DEV |
| 质量责任 | 测试策略可执行，风险覆盖可追溯，未测项和残余风险可见 |
| 禁止事项 | 不修改实现方案；不把未测试声明为通过；不自动接受测试风险 |
| 常见失败模式 | 只列功能用例、忽略异常/权限/性能/兼容、无数据环境要求 |
| 自检清单 | REQ/BR/RISK/API/MOD 是否映射到 TEST；是否有测试层级和数据环境 |

## 6. DEV：设计到代码执行 Agent

| 项 | 目标定义 |
|---|---|
| 角色定位 | 消费已批准设计，生成实现计划、执行代码变更、本地验证和转测包 |
| 输入产物 | approved integrated design、implementation-design、test-design、repo binding |
| 输出产物 | implementation-plan、code diff、implementation-log、test-handoff |
| 拥有 artifact | implementation-plan、implementation-log、test-handoff |
| 可调用 Skill | `feature-plan-implementation`、`feature-implement`、`feature-verify`、frontend/backend/fullstack skills |
| 必须触发人工确认 | 首次代码修改、范围偏差、验证失败但要求继续、回滚/破坏性变更 |
| 协作触发 | 实现设计不清找 MDE；测试不清找 TSE；发布风险找 CIE |
| 质量责任 | 实现计划与设计一致，代码变更可验证，偏差和未测项明确 |
| 禁止事项 | 不绕过设计批准；不静默扩大范围；不声明未验证内容通过 |
| 常见失败模式 | 跳过实现计划、改动超出设计、测试命令不落盘、转测包缺风险 |
| 自检清单 | 是否有 repo binding、计划、首次确认、diff 摘要、验证结果、未测项 |

## 7. CIE：部署发布与运维就绪 Agent

| 项 | 目标定义 |
|---|---|
| 角色定位 | 按需评估部署、配置、CI/CD、环境、回滚、运行就绪风险 |
| 触发条件 | 配置/环境变量、CI/CD、数据库迁移、发布策略、外部依赖、基础设施影响 |
| 输出产物 | CIE review、deployment checklist、ops readiness 建议 |
| 可调用 Skill | `feature-review`，P2 新增 `release-readiness` / `ci-impact-check` |
| 必须触发人工确认 | 发布风险接受、回滚不可行、生产环境差异、运维责任不清 |
| 协作触发 | 数据迁移找 SE/MDE；验证计划找 TSE/DEV |
| 质量责任 | 发布路径、环境准备、配置管理、回滚、监控告警、CI/CD 影响明确 |
| 禁止事项 | 不进入默认主链；不替代 DEV 本地验证；不自动接受发布风险 |

