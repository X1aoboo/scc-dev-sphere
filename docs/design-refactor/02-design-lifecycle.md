# Feature Design 重构：目标工作流与设计生命周期

## 1. 文档状态

- 设计阶段：阶段二
- 状态：已对齐
- 前置约束：[01-goals-and-scope.md](./01-goals-and-scope.md)

## 2. 两层工作流

目标工作流分为两层：

1. 业务、方案、实现、测试四个设计环节之间的主流程；
2. 每个设计环节内部共享的设计生命周期。

第一版保留四个设计环节严格顺序执行：

```text
业务设计
→ 方案设计
→ 实现设计
→ 测试设计
→ 集成检查
→ 设计阶段完成
```

正式设计不跨阶段并行。上游尚未基线时，下游不生成正式设计；允许并行的仅是输入边界明确的信息调查，不改变正式设计顺序。

## 3. 统一设计生命周期

四个设计环节共享以下生命周期：

```text
Analyze
→ Discover
→ Design
→ Validate
→ Review
→ Revise
→ Baseline
```

统一的是生命周期语义和完成证据，不是复制四套编排逻辑。

| 生命周期活动 | 业务设计 | 方案设计 | 实现设计 | 测试设计 |
|---|---|---|---|---|
| Analyze | 理解目标、范围、角色、规则 | 理解业务输入、架构目标和约束 | 理解方案输入和代码影响 | 理解需求、方案、实现风险 |
| Discover | 业务规则、历史需求、现状 | 架构、接口、数据、规范 | 仓库结构、调用链、实现模式 | 历史缺陷、测试规范、环境 |
| Design | 业务流程、规则、验收标准 | 架构、接口、数据、NFR | 模块、文件、调用链、回滚 | 策略、场景、数据、准入 |
| Validate | 业务完整性和追溯 | 架构完整性和可验证性 | repo 绑定和实现完整性 | 风险和测试追溯 |
| Review | 方案可承接性视角 | 业务、实现、测试等视角 | 方案、开发、测试等视角 | 业务、方案、实现等视角 |
| Revise | 修订业务设计 | 修订方案设计 | 修订实现设计 | 修订测试设计 |
| Baseline | 冻结业务设计版本 | 冻结方案设计版本 | 冻结实现设计版本 | 冻结测试设计版本 |

## 4. Analyze：形成调查计划

### 输入

- 当前阶段的上游产物；
- requirement；
- 已有 decisions/evidence；
- 当前阶段模板。

### 活动

1. 明确本阶段需要回答的问题。
2. 提取上游输入和约束。
3. 识别信息缺口、冲突和未知项。
4. 判断哪些信息可从仓库、知识库或已有文档获得。
5. 判断哪些问题必须由用户决定。
6. 形成调查清单。

### 输出

结果写入当前阶段 `work/<stage>/analysis.md`：

- 阶段目标；
- 已知输入；
- 初步理解；
- 待调查问题；
- 待用户确认问题；
- 调查范围。

Analyze 完成只表示调查问题已经明确，不表示当前理解已经得到证明。

## 5. Discover：收集并综合设计上下文

### 活动

1. 按调查清单查询知识、代码、规范和历史设计。
2. 将实际采用的事实保存为 evidence。
3. 识别证据冲突、证据缺失和不确定结论。
4. 将未经证明的前提记录为 assumption。
5. 将需要用户取舍的问题记录为 decision。
6. 将调查结果综合为正式设计输入。

综合结果写入当前阶段 `work/<stage>/discovery.md`，原始事实继续保存在 `evidence/`。

### 完成条件

- 必要调查项已有结论，或者明确标记为缺口；
- 关键事实有 evidence；
- 高风险未知项已形成待确认 decision；
- `discovery.md` 已形成正式设计输入摘要。

发现新的重大未知项时允许返回 Analyze 补充调查计划：

```text
Analyze ⇄ Discover
```

这是调查活动内部的迭代，不新增工作流状态。

## 6. 统一 Decision Checkpoint

用户交互不作为独立设计阶段。Analyze、Discover、Validate、Review 中需要用户判断时，统一形成 pending decision：

```text
当前活动
→ Router 派生 ask_decision
→ 主会话请求用户确认
→ 写回 decision
→ 重新计算下一动作
```

Decision 至少记录：

- 问题；
- 为什么现在必须决定；
- 候选项；
- 推荐项和理由；
- 不决定的影响；
- 用户选择。

低风险、可逆且不改变目标范围的问题可以按配置策略自主决定；高风险、不可逆、改变范围或影响关键设计的问题必须由用户决定。具体分级规则在产物与变更模型中定义。

`decision_pending` 不作为持久化阶段状态。是否需要询问由 pending gated decision 事实派生。

## 7. Design：完成设计推演并生成 Draft

Design 只在 analysis 和 discovery 达到可设计条件后开始。

### 输入

- 上游基线产物；
- 当前阶段 `analysis.md`、`discovery.md`；
- evidence；
- 已确认 decisions；
- Artifact template。

### 输出

```text
work/<stage>/design.md
work/<stage>/draft.md
```

### 规则

- `design.md` 保存候选方案、取舍和设计推演；
- `draft.md` 完整符合最终 Artifact 模板，只包含已经收敛的设计；
- 未确认事实必须明确标记 assumption；
- 不把原始查询过程复制到 Draft；
- 关键事实引用 evidence；
- 关键取舍引用 decision；
- Draft 使用下一目标 Baseline version；
- 同一 Baseline 轮次内修订 Draft 不递增 version，通过 hash 使旧 Gate/Review 失效。

## 8. Validate：先验证，再正式评审

正式评审前必须依次经过：

```text
Template Check
→ Quality Gate
```

Template Check 验证 frontmatter、必填章节、必填结构和必要引用字段。

Quality Gate 验证 evidence、decision、assumption、traceability、阶段专业完整性以及与上游产物的一致性。

结果统一为：

```text
pass | warn | fail | requires_human
```

处理规则：

- `pass`：进入 Review；
- `warn`：允许进入 Review，但警告必须传递给 Reviewer；
- `fail`：Router 派生 revise；
- `requires_human`：Router 派生 ask_decision。

第一版允许 AI 执行专业内容检查，但门禁结果必须持久化，不能只在会话中声明检查通过。

## 9. Review：对冻结 Draft 独立评审

Review 输入必须绑定 Draft：

```text
artifactId + version + draft hash
```

评审期间 Draft 视为冻结。Reviewer 可以读取 Work、Evidence、Decision 和上游 Artifact 作为依据，但所有正式 finding 必须指向 Draft。评审输出继续使用：

- `blocking`；
- `advisory`；
- `risk_candidate`。

处理规则：

- blocking 必须修订；
- advisory 由用户或策略决定 `apply` / `no_change`；
- risk candidate 由用户决定接受、缓解、应用或拒绝。

当前 Draft hash 改变后旧 Review 自动失效，必须重新 Gate 和 Review。

## 10. Revise：统一修订后重新验证

以下事实会使 Router 派生 revise：

- Template Check 失败；
- Quality Gate 失败；
- Review 存在 blocking；
- advisory 被选择为 apply；
- risk candidate 需要修改设计；
- 用户拒绝当前设计。

修订输入统一汇总为 revision items，不按来源进行多轮零散修改。

修订活动：

1. 读取全部 revision items。
2. 必要时更新 analysis、discovery、design。
3. 修改 Draft。
4. 记录关键修订 decision。
5. 重新计算 Draft hash，使旧 Gate 和 Review 失效。
6. 重新进入 Validate。

闭环为：

```text
Validate
→ Review
→ Revise
→ Validate
→ Review
```

修订后不得跳过 Gate 直接复评。`revision_required` 不作为持久化阶段状态；是否需要修订由 Gate 和 Review 事实派生。

## 11. Baseline：发布已批准 Draft

进入 Baseline 前必须满足：

- 当前 Draft 的 artifactId、version 和 hash 存在；
- Template Check 可接受；
- Quality Gate 可接受；
- 当前版本要求的 Review 已完成；
- blocking 为零；
- advisory/risk 已处理；
- 所需人工批准已完成。

Baseline 不生成或修改设计内容，只校验 Draft，原样复制到对应 Artifact，验证二者 hash 一致，并在 `state.json` 记录 version、hash、上游输入版本和批准时间。

是否要求人工批准沿用工作流策略：

- 自动模式：Gate 和 Review 满足即可基线；
- 协作模式：指定阶段需要用户批准；
- 严格模式：每个阶段都需要用户批准。

Baseline 复用现有批准模式，不新增另一套人工批准机制。Baseline 时如果还需要修改内容，必须返回 Revise。

## 12. 集成检查

四个阶段全部 Baseline 后必须执行集成检查，不能直接进入 `design_ready`：

```text
Business Baseline
Solution Baseline
Implementation Baseline
Test Baseline
        ↓
Integrated Design Check
        ↓
Design Ready
```

集成检查只验证跨阶段关系：

- 业务要求是否被方案承接；
- 方案接口、数据、模块是否被实现承接；
- 关键需求、接口和风险是否被测试承接；
- 四个 artifact 的 version、Gate、Review 和 Baseline 是否一致。

`integrated-design` 是批准视图和引用汇总，不重新描述全部设计，也不引入新设计事实。

## 13. 基线后变更入口

任一 Baseline Artifact 需要变更时，不直接覆盖：

```text
Baseline
→ Change Requested
→ Impact Analysis
→ Change Decision
```

批准变更后：

```text
从当前 Artifact 创建下一版本 Draft
→ 按固定范围重开当前阶段及下游
→ Revise
→ Validate
→ Review
→ Rebaseline
→ Integrated Design Check
```

变更原因和影响复用 design change decision；第一版不引入独立 Change Record、`stale` 状态或递归依赖算法。

## 14. 线性里程碑视图

设计环节采用统一的线性里程碑视图：

```text
not_started
→ analysis_ready
→ discovery_ready
→ drafted
→ validated
→ reviewed
→ baselined
```

里程碑优先由持久化事实计算，不要求全部作为可写状态保存在 `state.json`：

| 里程碑 | 计算依据 |
|---|---|
| `not_started` | 当前阶段 Work 尚未建立 |
| `analysis_ready` | `analysis.md` 达到完成条件 |
| `discovery_ready` | `discovery.md` 达到完成条件 |
| `drafted` | `draft.md` 存在且具有 artifactId/version/hash |
| `validated` | 当前 Draft hash 的 Gate 结果可接受 |
| `reviewed` | 当前 Draft hash 的 Review 已完成且问题闭合 |
| `baselined` | Artifact 与已批准 Draft hash 一致，且 state 记录有效 Baseline ref |

Router 可以返回统一阶段快照：

```json
{
  "stage": "solutionDesign",
  "milestone": "reviewed",
  "draftVersion": "0.3.0",
  "draftHash": "sha256:...",
  "analysisReady": true,
  "discoveryReady": true,
  "gateAcceptable": true,
  "reviewComplete": true,
  "baselineCurrent": false,
  "nextAction": "baseline"
}
```

该快照是计算结果，不是由多个组件分别修改的状态集合。

## 15. 派生动作与判断优先级

`ask_decision`、`revise`、`blocked` 不是阶段状态，而是 Router 根据当前事实返回的动作。

判断优先级固定为：

```text
1. 基础事实不可解析
   → blocked

2. 存在必须由用户处理的 pending decision
   → ask_decision

3. 当前版本存在 Gate fail 或 open revision item
   → revise

4. 根据里程碑完成证据
   → analyze / discover / design / validate / review / baseline / next stage
```

其中：

- pending gated decision 是 `ask_decision` 的事实来源；
- Gate fail、open blocking、apply advisory/risk 是 `revise` 的事实来源；
- 输入缺失、版本矛盾、修订超过上限等不可恢复条件使 Router 返回 `blocked` 及 recovery；
- 问题修复后重新计算即可，不需要保存暂停前状态或执行恢复转换。

基线后变更由 design change decision 和固定下游重开规则处理，不引入 `stale` 状态。

## 16. 已确认决策

1. 四个设计环节第一版严格顺序执行，不做正式设计并行。
2. 每个设计环节统一采用 Analyze、Discover、Design、Validate、Review、Revise、Baseline 生命周期。
3. 用户交互采用统一 decision checkpoint，不为不同提问场景设计多套控制流。
4. Gate 必须在 Review 前执行，Revise 后必须重新 Gate。
5. Gate、Review 和 Approval 绑定 Draft version/hash；Baseline 将通过检查的 Draft 原样发布为 Artifact。
6. 四个阶段全部 Baseline 后必须执行 Integrated Design Check，不能直接进入 `design_ready`。
7. 采用线性里程碑计算视图；`ask_decision`、`revise`、`blocked` 是派生动作，不作为持久化阶段状态。
