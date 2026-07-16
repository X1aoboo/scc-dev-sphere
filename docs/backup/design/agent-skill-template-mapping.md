# Agent / Skill / Template / Traceability 映射

## 1. Agent -> Skill 映射

| Agent | 主责 Skill | 参与 Skill | 触发条件 | 输入 | 输出 | 人工确认点 | 失败处理 | 质量责任 |
|---|---|---|---|---|---|---|---|---|
| SA | `feature-design-business` | `feature-assess`、`knowledge-query`、`feature-review` | 需求输入、业务评审、业务冲突 | requirement、Q&A、business evidence | business-design、business decisions、knowledge candidates | 范围、规则冲突、assumption、风险接受 | 记录 open question，回业务设计修订 | 业务规则完整可测 |
| SE | `feature-design-solution` | `knowledge-query`、`feature-review`、`design-quality-gate` | business ready、架构评审 | business-design、架构 evidence | solution-design、contracts、architecture decisions | 多方案取舍、破坏性接口/数据变更 | 回 business 或暂停人工决策 | 架构边界、NFR、接口契约 |
| MDE | `feature-design-implementation` | `knowledge-query`、`feature-review` | solution ready、实现可行性评审 | solution-design、repo evidence | implementation-design、repo evidence | repo 不可读、超范围、不可行 | 回 solution 或人工拆分 | 模块/文件/调用链可实现 |
| TSE | `feature-design-test` | `knowledge-query`、`feature-review` | implementation drafted/ready、可测性评审 | business/solution/implementation、测试 evidence | test-design | 覆盖成本、不可测项、残余风险 | 回上游补信息或人工接受风险 | 风险驱动覆盖 |
| DEV | `feature-plan-implementation`、`feature-implement`、`feature-verify` | `feature-review`、frontend/backend/fullstack skills | design approved、implementation planned | approved design、repo binding | plan、code diff、log、handoff | 首次代码变更、范围偏差、验证失败 | 回 implementing 或 blocked | 设计到代码一致、验证落盘 |
| CIE | P2 `release-readiness` | `feature-review`、`design-quality-gate` | 配置、部署、迁移、CI/CD、环境风险 | solution/implementation、CI evidence | deployment checklist、CIE review | 发布风险、回滚不可行 | requires_human 或 release gate fail | 发布和运维就绪 |

## 2. Skill -> Template 映射

| Skill | 读取模板 | 生成产物 | 必填章节 | 必须图示 | evidence | decision | assumption | 下游交接 | 完成标准 |
|---|---|---|---|---|---|---|---|---|---|
| `feature-design-business` | business-design | business-design | 目标、范围、规则、流程、RTM、assumption、handoff | flowchart/stateDiagram 按需 | 现状/规则 | 范围/规则取舍 | 所有未证实前提 | 给 solution | gate pass |
| `feature-design-solution` | solution-design | solution-design、contract refs | C4、4+1、接口、数据、NFR、风险、handoff | C4/sequence/data flow | 架构/接口 | 架构取舍 | 架构约束缺口 | 给 implementation/test | gate pass |
| `feature-design-implementation` | implementation-design | implementation-design | 模块、文件、函数、调用链、数据流、风险、handoff | sequence/data/state | repo evidence | 实现取舍 | repo 不可读等 | 给 DEV/test | gate pass |
| `feature-design-test` | test-design | test-design | strategy、RTM、场景、数据、环境、不可测项 | 可选流程/覆盖图 | 缺陷/资产 | 覆盖取舍 | 测试资产缺口 | 给 verify | gate pass |
| `feature-review` | review-template | reviews/* | blocking/advisory/risk | 无强制 | 引用被评审证据 | advisory/risk 决策 | 未确认项 | 给 owner revise | issue 结构化 |
| `design-template-check` | all artifact templates | TPL report | 必填章节 | Mermaid 存在性 | ID 格式 | ID 格式 | 表结构 | 给 quality gate | pass/warn/fail |
| `design-quality-gate` | gate docs | QG result | 依 target | 图示规则 | refs 存在 | refs 存在 | 状态检查 | 给 review/resolver | pass/warn/fail |
| `design-integration-check` | integrated-design | integrated-design | 一致性、风险、确认项、结论 | trace flow | 全阶段 refs | accepted risk | open assumptions | 给 approval | integrated gate pass |

## 3. Template -> Quality Gate 映射

| 模板 | 章节 | Gate ID | 检查规则 | 通过 | 警告 | 失败 | 责任 Agent | 执行 Skill |
|---|---|---|---|---|---|---|---|---|
| business | 业务范围 | QG-BD-004 | In/Out of Scope 都存在 | 边界清楚 | out-of-scope 少但有理由 | 无范围 | SA | design-quality-gate |
| business | 业务规则 | QG-BD-006 | BR 有 ID、来源、验证方式 | 全部完整 | 次要规则缺来源 | 关键规则缺来源 | SA | design-quality-gate |
| solution | C4/4+1 | QG-SD-003/004 | 中高风险任务有受影响视图 | 视图和说明完整 | 小任务仅文字替代 | 跨系统无图 | SE | design-quality-gate |
| solution | 接口契约 | QG-API-001 | request/response/error/auth/version | 完整 | 内部接口可简化 | 对外接口缺契约 | SE | design-quality-gate |
| solution | NFR | QG-NFR-001 | 质量属性场景可验证 | source/stimulus/measure 完整 | 次要 NFR 空泛 | 关键 NFR 空泛 | SE | design-quality-gate |
| implementation | repo evidence | QG-ID-002 | 模块/文件来自 repo evidence | 全部可追溯 | 局部假设 | 无 evidence 声明现状 | MDE | design-quality-gate |
| implementation | 调用链 | QG-DIA-001 | 跨模块变更有 sequence/data flow | 有图有说明 | 单模块文字说明 | 跨模块无图 | MDE | design-quality-gate |
| test | RTM | QG-TR-003 | REQ/BR/API/MOD/RISK 有 TEST | 关键项覆盖 | 次要项未覆盖有理由 | 关键项孤儿 | TSE | design-quality-gate |
| test | 不可测项 | QG-RISK-003 | 原因、影响、缓解、确认 | 全部完整 | 低风险未确认 | 高风险未确认 | TSE | design-quality-gate |
| integrated | 跨阶段一致性 | QG-TR-004/005/006 | 上下游承接无缺口 | 全部闭环 | 次要缺口有 decision | 关键缺口 | workflow + all | design-integration-check |
| integrated | accepted risk | QG-RISK-004 | 风险来自 decision | 全部可追溯 | 描述不完整 | 无人工确认 | all | design-quality-gate |

## 4. Artifact -> Traceability 映射

| Artifact | requirement ID | evidence ID | decision ID | assumption ID | risk ID | downstream artifact | review result | state transition |
|---|---|---|---|---|---|---|---|---|
| `inputs/requirement.md` | REQ-* | EV-REQ-* | DEC-WF-* | ASM-* | RISK-* | business-design | assess review | initialized -> assessed |
| `business-design.md` | REQ/BR | EV-BIZ-* | DEC-BIZ-* | ASM-BIZ-* | RISK-BIZ-* | solution/test | business review | not_started -> drafted -> ai_review_passed |
| `solution-design.md` | REQ/BR/NFR | EV-ARCH/API-* | DEC-ARCH-* | ASM-ARCH-* | RISK-ARCH-* | implementation/test | solution review | drafted -> ai_review_passed |
| `implementation-design.md` | REQ/API/MOD | EV-REPO-* | DEC-IMPL-* | ASM-IMPL-* | RISK-IMPL-* | test/implementation-plan | implementation review | drafted -> ai_review_passed |
| `test-design.md` | REQ/BR/API/MOD | EV-TEST-* | DEC-TEST-* | ASM-TEST-* | RISK-TEST-* | verification/test-handoff | test review | drafted -> ai_review_passed |
| `integrated-design.md` | all | all | accepted DEC | open ASM | accepted RISK | approval | integrated review | designing -> design_ready |
| `implementation-plan.md` | selected REQ/MOD | EV-REPO-* | DEC-PLAN-* | ASM-PLAN-* | RISK-DEV-* | code diff/log | plan approval | approved_for_implementation -> implementation_planned |
| `test-handoff.md` | TEST-* | verification evidence | DEC-VERIFY-* | ASM-VERIFY-* | residual RISK | completed | verify result | verification_ready -> completed |

