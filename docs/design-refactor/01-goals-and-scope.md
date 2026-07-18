# Feature Design 重构：目标与范围

## 1. 文档状态

- 设计阶段：阶段一
- 状态：已对齐
- 适用范围：`feature-design` 及其直接依赖的设计门禁、评审、修订、基线和设计变更能力

## 2. 问题定义

当前设计环节的原始目标是通过上下文隔离，支撑需求分析、知识查询、方案设计、多轮评审、修订和基线的长周期设计活动，降低上下文压缩造成的信息丢失和幻觉。

实际实现逐渐演变为以稳定角色 Agent 为核心，围绕 Agent bootstrap、派发、等待、唤醒、转发、评审快照和合并构建协同系统，由此产生以下问题：

1. Agent 协同机制占据了主要开发和调试成本。
2. 需要人工交互的设计活动必须经主会话转发，形成复杂控制流。
3. 插件开发重心从提高设计质量漂移为保证多 Agent 正常协作。

本次优化不否定上下文隔离的价值，而是重新选择更低成本的上下文隔离与任务卸载方式。

## 3. 原始目标

建立一套能够按阶段完成分析、信息收集、设计、验证、评审、修订、基线和设计变更的轻量设计工作流，在控制上下文开销的同时，提高设计结果的完整性、可追溯性和可落地性。

必须保留以下原始诉求：

1. 支撑长周期设计活动。
2. 避免单会话持续堆积全部原始信息。
3. 设计结果必须遵循 Spec。
4. 设计必须经过验证、评审、修订和基线，不能一次生成即完成。

## 4. 优化目标

### G1：设计生命周期成为主轴

设计流程围绕以下生命周期组织：

```text
分析 → 信息收集 → 设计 → 质量验证 → 评审 → 修订 → 基线
```

Agent、Skill 和脚本是生命周期中的执行机制，不决定流程结构。

### G2：主会话拥有交互与流程控制权

所有需要用户参与的活动统一由主会话完成，包括：

- 需求澄清；
- 关键假设确认；
- 方案选择；
- 风险接受；
- 评审建议处理；
- 基线批准；
- 设计变更确认。

不再让子 Agent 暂停后经过主会话转发，再恢复长生命周期工作。

### G3：Subagent 只用于有界工作

第一版 Subagent 只处理：

- 知识和代码调查；
- 独立设计评审；
- 有明确输入输出的影响分析。

Subagent 不拥有设计阶段、不推进工作流、不直接与用户交互、不作为设计状态载体、不要求长期存活，也不相互协作。

### G4：控制上下文开销

通过外部化设计上下文解决窗口问题：

- evidence 保存调查事实；
- work 保存阶段分析、调查综合、设计推演和待发布 Draft；
- artifact 只保存已 Baseline 的正式设计；
- decision 保存设计取舍；
- assumption 保存未确认前提；
- review issue 保存评审问题；
- design change decision 保存基线后变更原因和影响。

主会话按需读取，不长期携带全部调查过程。

### G5：优先保证快速落地

第一版优化必须：

- 基于现有四个设计 Skill 改造；
- 尽可能复用现有 artifact、decision、review matrix 和 version；
- 不依赖新的 Agent Runtime；
- 不要求一次性重写所有 Router 和状态脚本；
- 先跑通最小闭环，再逐步补充自动化。

## 5. 非目标

### NG1：不建设通用 Agent 编排平台

本次不设计：

- Agent 注册中心；
- 持久化 Agent 身份；
- Agent 恢复协议；
- Agent 间通信协议；
- 通用分布式任务调度；
- 自定义 Agent Runtime。

### NG2：不模拟完整软件组织

不追求让 SA、SE、MDE、TSE、DEV、CIE 成为持续在线的虚拟成员。角色只保留为专业设计规则、Reviewer profile 和风险检查维度。

### NG3：不重构整个 Feature Workflow

本次只优化 `feature-design` 设计环节及其直接相关能力：

- 四阶段设计；
- 设计门禁；
- 设计评审；
- 设计修订；
- 设计基线；
- 设计变更。

不主动改造 `feature-init`、`feature-clarify`、`feature-assess`、`feature-implement`、`feature-verify` 和知识库整体架构。若设计变更需要与其他阶段增加最小接口，只定义接口，不扩大重构范围。

### NG4：不一次实现全部自动化 Gate

第一版允许部分 Gate 继续由 AI 按 checklist 执行。只优先脚本化：

- 状态合法性；
- artifact/version 一致性；
- 评审是否属于当前版本；
- blocking 是否关闭；
- 上游变更导致的下游失效。

### NG5：Work 只按四类必要信息拆分

每个业务、方案、实现、测试设计环节固定保留四份工作文件：

```text
work/<stage>/
├── analysis.md
├── discovery.md
├── design.md
└── draft.md
```

- `analysis.md` 保存问题理解和调查计划；
- `discovery.md` 保存调查综合和 evidence 引用；
- `design.md` 保存候选方案、取舍和设计推演；
- `draft.md` 保存完整、待 Gate/Review/Baseline 的正式候选文档。

不再按角色、Subagent、评审轮次或其他内部动作增加过程文件。Evidence、Decision、Gate 和 Review 继续复用现有目录。

Work 是内部过程信息，Artifact 是外部可消费的正式基线。所有 Gate、Review 和 Approval 直接针对 Draft；Baseline 只将已批准 Draft 原样发布到 Artifact。

信息权威顺序为：

```text
正式基线 Artifact
  > 已确认 Decision
  > Evidence
  > Work 工作记录
  > 会话内容
```

## 6. 核心设计原则

### P1：流程状态属于文件和脚本，不属于会话

主会话或 Subagent 都可以中断，恢复时必须能够从持久化产物还原状态。

### P2：主会话是唯一交互入口

任何需要用户判断的事项都形成结构化 decision，由主会话处理。

### P3：Subagent 无状态、无流程权、无用户交互

Subagent 只接收工作包并返回结构化结果。

### P4：专业角色与执行载体解耦

SA、SE、MDE、TSE 等角色视角可以由主会话加载专业规则、Reviewer Prompt 加载 checklist，或在必要时由独立 Subagent 执行，不要求存在对应的长期 Agent。

### P5：先实现设计闭环，再增加并发优化

优先保证以下闭环正常运行：

```text
设计 → Gate → Review → Revise → Re-review → Baseline
```

是否并行派发 Reviewer 属于执行优化，不影响生命周期语义。

### P6：设计变更是生命周期的一部分

基线后的变化必须经过：

```text
变更识别 → 影响分析 → 用户确认 → 受影响产物失效 → 修订 → 重新验证 → 重新基线
```

第一版只支持设计阶段内的变更传播，不扩展到代码实施后的完整变更管理。

## 7. 已确认的架构边界

1. `feature-design` 从 Agent 中心改为 Design Lifecycle 中心。
2. 主会话负责设计收敛、用户交互和流程推进。
3. 稳定设计团队退出默认流程，Agent 收缩为按需 Subagent。
4. Subagent 第一版只用于调查、独立评审和影响分析。
5. 保留并复用现有四阶段产物、version、decision 和 review issue 模型。
6. 本次纳入设计阶段内的基线后变更，但不扩展为覆盖代码实施阶段的完整变更管理。
7. 每个设计环节固定保留 analysis、discovery、design、draft 四类 Work；Artifact 只保存 Baseline 后的正式设计。
