# Feature Design Skill-first 重构设计规格

## 文档状态

- 状态：已确认，实施中
- 适用范围：`feature-design`、设计工作空间及其直接状态接缝
- 权威性：本文件取代此前将业务、方案、实现、测试设计编排成固定顺序阶段的设计

## Problem Statement

现有实现能够控制文件、Lint、Review、批准和 Baseline，却把设计活动编排成固定阶段，并让脚本和结构化状态侵入专业设计方法。Agent 容易关注命令、模板和状态，而不是持续分析设计矛盾、调查事实、提出有判断力的方案、挑战薄弱假设并根据用户回答继续深入。

`feature-design` 应当使 Agent 可预测地采用同一套专业设计过程，同时允许业务设计、方案设计、实现设计和测试设计保持独立。设计类型只决定加载哪组专业 Reference，不决定 Skill 的流程。

## Solution

保留一个运行在主会话中的 `feature-design` Skill。每次调用只完成当前一个设计活动，并执行固定五步流程：

```text
恢复设计工作空间并建立专业上下文
→ 完成并确认核心设计
→ 形成可评审 Draft
→ 隔离 Review 并修订
→ 批准、发布 Baseline 并同步状态
```

业务设计、方案设计、实现设计、测试设计是独立的 `design type`。Skill 从工作空间持久化产物和调用上下文识别当前类型，按需加载对应 Design Guide、Spec 和 Review Checklists。外层 Feature Workflow 决定需要哪些设计活动以及何时总体 `design_ready`；`feature-design` 负责入口恢复和出口状态同步，但不硬编码设计类型的顺序或依赖。

设计质量来自以下语义分析循环：

```text
调查事实
→ 建立 design tree 与 frontier
→ 选择最高价值 frontier
→ 形成理解、推荐、理由、替代方案和代价
→ 与用户讨论并确认
→ 根据回答重算整体设计和 frontier
→ 动态组织并逐段确认设计
→ 收敛
```

该循环是主 Skill 的核心行为，不得下沉为可选 Reference、固定问卷或程序化 Router。

## Goals

- 让同一设计流程适用于不同设计类型，并按需注入专业能力。
- 让 Agent 先调查、分析、推荐和挑战，再向用户请求决策。
- 让用户回答真实改变后续分析，而不是执行预制问题清单。
- 让 Work、Draft、Review、Approval、Artifact 和顶层状态支持可靠恢复与提交。
- 让确定性脚本只保护适合机器判断的接缝。
- 让 Reviewer 独立应用具体评审规则和检查项。

## Non-goals

- 不建设独立 Agent Runtime、设计内部 Router 或持久化 design tree。
- 不维护业务、方案、实现、测试之间的固定依赖图。
- 不建设 Review Matrix、finding disposition 状态机或 Reviewer 精确失效图。
- 不为无损恢复保存对话、问题游标或设计章节依赖关系。
- 不生成复制多个设计正文的 integrated design。

## 1. 职责边界

### Feature Workflow

- 保存总体任务状态和外部流程策略。
- 决定当前任务需要哪些设计活动。
- 根据最新工作空间事实判断保持 `designing` 或进入 `design_ready`。
- 负责设计完成后的总体批准、实现和验证阶段。

### Feature Design Skill

- 从工作空间事实恢复当前设计活动。
- 识别设计类型并加载对应专业 Reference。
- 在主会话中完成语义分析、用户协作、Draft、Review、批准和 Baseline。
- Baseline 后调用确定性状态同步并验证结果。

### 确定性脚本

- 识别 Work、Draft、Review、Approval 和 Artifact 的一致性。
- 初始化当前设计活动工作区。
- 执行结构 Lint、hash 绑定、原样发布、版本历史和状态同步。
- 不判断专业质量，不选择设计问题，不规定设计类型顺序。

## 2. Skill 信息层级

`skills/feature-design/SKILL.md` 保留每次运行都需要的内容：

- 五个线性执行任务及其完成条件；
- 工作空间恢复规则；
- design tree/frontier 语义分析循环；
- 专业判断和用户交互规则；
- 分段确认、Draft、Review、批准和状态同步流程。

按设计类型变化的内容使用渐进加载：

```text
skills/feature-design/references/
├── design-guides/
│   ├── business-design.md
│   ├── solution-design.md
│   ├── implementation-design.md
│   └── test-design.md
├── specs/
│   ├── business-design.md
│   ├── solution-design.md
│   ├── implementation-design.md
│   └── test-design.md
└── review-checklists/
```

Design Guide 提供专业边界、原则、分析透镜、高价值矛盾、失败模式、风险缩放、Checklist 导航和专业收敛标准。Spec 是独立 Draft 内容合同。Review Checklist 自身定义适用条件、评审规则和具体检查项。

## 3. 固定执行任务

Skill 启动后立即使用 Claude Code Task 能力建立五个线性顶层任务：

1. 恢复设计工作空间、识别当前设计活动并建立专业上下文。
2. 完成并确认核心设计。
3. 形成可评审的 Design Draft。
4. 独立 Review 并修订至满足发布条件。
5. 获得用户最终批准、发布 Design Baseline 并同步状态。

任务只增强会话对流程的遵循，不作为流程事实来源。查询、单个问题、设计章节、Reviewer、finding 和局部修订不创建额外任务。

## 4. 工作空间恢复与设计类型识别

进入 Skill 时读取当前任务、`state.json`、全部已发布 Artifact，以及现有 Work、Draft、Lint、Review 和 Approval。按持久化事实识别：

- 唯一未完成 Work/Draft 对应的设计活动；
- Draft 与 Baseline 不一致所表示的可能重开；
- 已完成 Baseline 和仍缺少的设计上下文；
- 调用上下文明确指定的设计目标。

多个设计活动同时存在未完成产物、Draft 与 Baseline 冲突或证据不足时，向用户展示候选和依据，请用户确认。不得通过“固定顺序中第一个缺少的 Artifact”推断当前活动，也不新增内部阶段游标。

识别后初始化或恢复 `work/<design-slug>/`，同步顶层状态为 `designing`，读取当前 Design Guide 和 Spec。只在 Review 时加载实际适用的 Checklist。

## 5. 核心语义分析流程

### 建立当前设计模型

综合用户目标、需求、代码、文档、已有 Artifact、Evidence 和可用知识，形成当前设计模型：目标、事实、约束、已确认设计、暂定理解、开放事项、风险和关键取舍。能查询的事实由 Agent 调查；只有用户掌握的上下文和真正的设计决策才询问用户。

### Design tree 与 frontier

把设计问题按决策依赖组织成当前会话中的 design tree。前提已经满足、现在无需猜测即可讨论的问题构成 frontier。design tree/frontier 不持久化，不分配 ID，不成为状态机。

每轮：

1. 重新检查整体设计模型和 Design Guide 的专业透镜。
2. 选择最可能改变设计、阻塞其他判断、风险最高或返工代价最大的 frontier。
3. 补充调查该问题所需的事实。
4. 形成当前理解、推荐方案、理由、可行替代方案和主要代价。
5. 指出矛盾、薄弱假设和风险，并在需要时挑战用户方案。
6. 默认只与用户深入讨论一个高价值问题；只有真正独立、低耦合的问题才同轮批量讨论。
7. 根据用户回答更新已确认设计、暂定理解和开放事项，重新计算整个 design tree/frontier。

问题必须影响设计判断；模板章节不是提问清单。简单设计允许很短，但仍需完成事实调查、专业判断和明确确认。

### 动态分段与确认

按依赖、内聚性、复杂度和风险组织 Design Sections。每次呈现一个完成内部推演的段落，说明推荐、替代方案和代价，获得用户确认后再继续。

已确认设计不能静默改写。新事实或 Review finding 需要修改时，先说明原设计、拟修改内容、原因和影响，再取得用户重新确认。影响范围不可靠时向用户确认，不建设自动传播图。

### 收敛标准

同时满足以下条件后完成核心设计：

- design tree/frontier 没有会实质改变设计的开放项；
- 关键事实有可核验依据；
- 重要取舍及残余风险已经明确；
- Design Guide 的专业收敛标准逐项满足；
- Spec 的核心内容和适用性已经覆盖；
- 用户确认完整设计内容已收敛。

## 6. Draft 与 Lint

设计收敛后才按当前 Spec 形成完整 Draft。Draft 必须可脱离聊天独立理解，只表达已确认设计，并显式说明条件内容的适用性。

Lint 只检查 frontmatter、核心章节、适用性说明、占位符和明显格式错误。Lint 不给出专业设计结论。Draft 达到完整、可读、可独立评审且 Lint 通过后，才完成第三项任务。

## 7. 隔离 Review

根据 Design Guide 和 Draft 内容判断 Checklist 适用性。适用性不明确时执行；明确不适用时向用户说明理由。

每个适用 Checklist 创建一个新的隔离 Reviewer。Reviewer 只读取冻结 Draft、自己的 Checklist，以及判断该 Checklist 必需的相关正式 Artifact 或事实材料。Reviewer 不询问用户、不修改文件、不读取其他 Reviewer 结果。

Reviewer 完整应用 Checklist 中的所有评审规则和检查项，直接向主会话返回轻量 Markdown：通过，或包含位置、问题、实际影响和建议的 findings。主会话收齐结果后分析重复、关联和冲突，与用户自然讨论并完成修订。

语义修订使当前 Draft 的全部适用 Review 失效；重新 Lint 后创建新的隔离 Reviewer 完整复评。纯排版、错别字和不改变含义的修正只需重新 Lint。所有 blocking finding 关闭、残余风险已向用户揭示且用户确认后，Review 才通过。

工作空间只保存 Checklist、Draft hash、结论和必要 findings 的最小摘要，不保存 Review Matrix 或完整 Reviewer 推理。

## 8. 批准、Baseline 与状态同步

最终批准前展示设计目标、最终方案、关键取舍、Lint、Review 结论、已修订问题和残余风险。用户明确批准后，将最后一轮通过 Review 的 Draft 原样发布为 Baseline Artifact；发布过程不得修改正文。

发布必须验证 Draft、Lint、Review 和人工批准绑定同一 hash。已有不同 Baseline 时要求显式重开，保留历史并递增版本。

Baseline 发布后立即重新检查设计工作空间并同步状态：

- 当前设计活动的 Artifact、Approval 和 hash 成为完成事实；
- 外层 Workflow 的就绪条件未满足时保持 `designing`；
- 外层 Workflow 的就绪条件满足时进入 `design_ready`；
- 状态同步失败时第五项任务保持未完成并报告具体不一致。

`feature-design` 调用状态同步，但不在 Skill 中硬编码总体需要哪些设计活动。

## 9. Knowledge、Evidence 与 Decision

独立知识主题可以调用 `knowledge-query`。查询 Subagent 只返回候选知识、来源、冲突和 gap；主会话决定是否采用。只有实际支持或改变设计的查询结果才登记为 Evidence。

Decision 只记录实质取舍，包括背景、用户补充、候选方案、推荐、最终决定、理由、影响和 Evidence 引用。Evidence 与 Decision 保存知识，不控制对话、Draft、Review 或发布。

## 10. Testing Decisions

自动化验证以下确定性接缝：

- 工作空间从唯一未完成活动恢复，歧义时要求用户确认；
- 设计类型之间没有固定顺序和上游 Baseline 门禁；
- Skill 包含五项 Task Harness 和完整语义分析循环；
- Design Guide、Spec 和 Checklist 按当前类型渐进加载；
- Lint 不判断专业质量；
- Review 绑定冻结 Draft，语义修改使结论失效；
- 发布 Artifact 与获批 Draft 字节一致；
- Baseline 后状态同步成功；
- 总体 Workflow 就绪策略不被编码进主 Skill。

自动化测试不能证明设计体验。使用真实设计任务验证 Agent 是否先分析再提问、主动推荐和挑战、根据回答重算 frontier、逐段确认，并让流程机制退居后台。

