# Feature Clarify 歧义挖掘策略设计

- **状态:** 已通过设计对话，待用户审阅文档
- **日期:** 2026-07-11
- **范围:** `skills/feature-clarify/SKILL.md`（仅此一处实质改动）；确定性 script、测试、`inputs/requirement.md` 契约不变
- **关联文档:** `docs/superpowers/specs/2026-07-11-feature-requirement-clarification-design.md`（澄清硬门禁基线设计）

## 1. 背景与目标

现行 `feature-clarify` 在主会话按固定顺序遍历六项维度（businessGoal → usersAndScenarios → functionalScope → nonGoalsAndBoundaries → acceptanceCriteria → constraintsAndRisks），对技术型/混合型补技术契约，以 `validateClarification` 作硬闸门。问题在于提问是**流程驱动**而非**歧义驱动**：每个维度不论该需求文本是否真的含糊都被机械问一遍，无法主动从原始需求里挖掘隐藏的模糊点、未声明假设、缺失分支与点间依赖。

本设计给 skill 增加一套**歧义挖掘策略**（brainstorming 式的策略文字，非确定性引擎），目标是：把需求拆成具体需求点，按轻量歧义分类法逐点找模糊，映射到记录维度，**一次只问一个歧义、每个问题带推荐答案与来源标注**，循环到挖尽为止。六项固定维度从“提问顺序”降级为“记录落点 + 完整性闸门”。

非目标：

- 不引入持久化的需求树（节点 id / 依赖边 / 节点状态机）。挖掘在主会话运行期推理完成，落盘仍走现有维度结论。
- 不改确定性 script、不改 `clarification` schema、不改 `requirement.md` 契约。
- 不改设计阶段的 teammate 编排与评审机制。

## 2. 歧义挖掘策略（新增到 SKILL.md 的核心章节）

### 2.1 拆解 Decompose

读取原始需求与初始 EV/gap 后，把需求拆成一组**具体需求点**（运行期推理，不落盘）。一个“点”= 一个用户可见能力 / 一条业务规则 / 一个约束 / 一个交互。例：*“用户可以上传背景图片”* 是一个点；*“上传后立即生效”* 是另一个点。

### 2.2 挖歧义 Mine — 轻量分类法

对每个点逐条扫描以下六类模糊，命中即产出一条**待澄清歧义**：

| 类别 | 典型信号 | 示例 |
|---|---|---|
| 模糊量词/程度 | “快速 / 大量 / 友好 / 一般”无指标 | “快速上传” → 多快？指标？ |
| 未定义术语 | 业务/领域名词无明确含义 | “会员” → 定义？范围？ |
| 隐含假设 | 未声明的前置/环境/权限/时序 | 假设有网络、假设单租户 |
| 缺失分支 | 只有成功路径，缺失败/回滚/空/并发/边界 | 上传失败怎么办？已删图片怎么办？ |
| 可选 vs 必选 | “应该支持 / 可以”模糊 | 必须还是 nice-to-have？ |
| 冲突/依赖 | 与其它点矛盾或依赖未澄清的点 | A 依赖 B，但 B 未定 |

### 2.3 映射 Map

每条歧义映射到记录维度（落点）：

- 用户行为/边界/规则 → `functionalScope` / `nonGoalsAndBoundaries`
- 成功/失败/边界的可验收结果 → `acceptanceCriteria`
- 隐含环境/时序/依赖假设、风险 → `constraintsAndRisks`
- 接口/协议/数据/部署契约 → 技术契约（仅 technical/mixed）
- 业务目标层 → `businessGoal`；用户场景层 → `usersAndScenarios`

### 2.4 逐条问，带推荐答案

**Ask one mined ambiguity at a time.** 每个问题必须含：① 推荐结论 ② 推荐理由 ③ 2–3 个候选 ④ 每个候选与推荐的来源标注（`[knowledge: EV-001]` / `[inference: …]` / `[user: …]`）。用户确认后 `recordConclusion` 到对应维度。

### 2.5 循环直到挖尽

每轮用户反馈后：

1. `shouldRequery(feedback)` 为真 → **必须先派发一次性 `knowledge-query` 子 Agent**，等结构化 EV/gap 回来；
2. 用新事实 + 新 gap **重新拆解/重新挖歧义**（用户答案可能引入新点、消除旧点、暴露新依赖）；
3. 继续逐条问。

**停止条件**：再挖不出新歧义 **且** `validateClarification` 六维度 + 适用技术契约全部确认 **且** 用户最终确认 → 写入 `clarified`。

## 3. 与现有步骤的衔接

### 3.1 步骤重构

| 现步骤 | 新步骤 | 变化 |
|---|---|---|
| 1. 加载/初始化 | 1. 加载/初始化 | 不变 |
| 2. 获取初始知识证据 | 2. 获取初始知识证据 | 不变（仍强制首轮派发） |
| 3. 确认需求类型 | 3. 确认需求类型 | 不变 |
| 4. 按固定顺序问六维度 | 4. 歧义挖掘循环 | **替换**：六维度降级为“记录落点 + 闸门”，提问由挖掘驱动 |
| 5. 反馈后重查 + 缺口 | 并入第 4 步循环 | **合并**：重查成为循环内强制子步骤 |
| 6. 验证 + 最终确认 | 5. 验证 + 最终确认 | 不变 |

### 3.2 第 4 步伪流程

```
decompose(requirement + EV/gap) → points[]
for each point: mine(point) → ambiguities[]          # 按 §2.2 分类法
while ambiguities 非空 or validateClarification 未通过:
    ambiguity = next(ambiguities)                    # 一次一个
    if ambiguity 需要知识证据 且 无现存 EV 覆盖:
        派发 knowledge-query 子 Agent                # 强制，等 EV/gap
        记录 EV / gap
    map(ambiguity) → dimension 或 technicalContract
    AskUserQuestion(推荐结论 + 理由 + 候选 + 来源标注)
    用户确认 → recordConclusion
    if shouldRequery(feedback):                      # 强制
        派发 knowledge-query 子 Agent
        记录 EV / gap
    re-mine(已确认事实) → 追加新 ambiguities          # 答案引入新点/消旧点/暴露依赖
# 循环结束 → 进第 5 步
```

### 3.3 知识查询的三个强制时机

挖掘循环让知识查询从“首轮 + 反馈重查”扩展为**任何要给知识支撑推荐前都必须先查**：

1. **首轮**（第 2 步）：拆解前先派发，意图从原始需求提取。
2. **循环内按需**：某个挖到的歧义涉及业务规则/系统/模块/接口/数据/权限/性能/部署，且**无现存 EV 覆盖** → 推荐前必须先派发子 Agent；查不到记 gap，推荐回退为 inference + user。
3. **反馈重查**（`shouldRequery`）：用户确认的答案引入新检索线索 → 下一条推荐前必须先派发。

主会话**仍不得直接调用知识库工具**；每次都是新的一次性 `general-purpose` 子 Agent（加载 `scc-dev-sphere:knowledge-query` skill），不复用 agent ID、不作 teammate。该不变式保留。

### 3.4 保留的现有规则

- `functional` 类型**不得**被拖进 API/协议等无关技术契约——挖掘在 functional 上聚焦用户价值/范围/边界/异常分支，分类法中的“缺失分支 / 可选 vs 必选 / 隐含假设”已覆盖。
- `technical`/`mixed` 仍走技术影响清单 + 适用契约（northbound API 的 `apiUrl`/`protocol`/`requestResponse`/`performance` 等子字段必填），挖出的技术歧义映射到这里。
- 恢复：`planClarificationRecovery` 仍按未确认维度返回；skill 读已确认维度 + EV/gap + history 后**重新拆解、只继续未完成维度**的挖掘。

## 4. 实现切面影响

### 4.1 `scripts/feature-requirement-clarification.js` — 不动

| 函数 | 是否改 | 原因 |
|---|---|---|
| `validateClarification` | 否 | 仍校验六维度 + 适用技术契约 + 最终确认；挖掘产物经 `recordConclusion` 进现有维度 |
| `recordConclusion` / `recordTechnicalConclusion` | 否 | 挖出的歧义确认后照常写入对应维度 |
| `shouldRequery` | 否 | 仍是反馈文本正则触发；作为循环内“反馈重查”时机判据 |
| `renderRequirementMarkdown` | 否 | 挖掘结果落在现有“结论/技术契约/澄清记录”区块，无新字段 |
| `planClarificationRecovery` | 否 | 仍按未确认维度返回 |
| `persistAdoptedEvidence` / `recordEvidenceGap` | 否 | 循环内三个查询时机照常复用 |

`clarification` schema 不变，无新函数、无新字段。

### 4.2 `inputs/requirement.md` 契约 — 不变

挖出的歧义经映射后写入既有维度结论；跨点的隐含假设/依赖风险 → `constraintsAndRisks`；技术歧义 → 技术契约。问答过程已在 `## 澄清记录`（history）中审计。**不新增章节、不新增字段。**

### 4.3 测试 — 现有测试照过，不新增

`scripts/test/feature-requirement-clarification.test.js`、`scripts/test/feature-workflow-clarification.test.js` 覆盖的是确定性函数（状态流转、validate 各分支、requery 触发、EV/gap、recovery、functional 不被拖入技术、technical 契约强制、mixed）。script 不变 → 这些测试不受影响。

**可测性边界（如实标注）：** 本次新增的三个能力——① 拆解需求成点 + 按分类法挖歧义，② “循环内按需”查询时机，③ “挖尽才停”的停止判断——都是主会话 prompt 级判断，无法用确定性脚本单测（除非把挖掘状态落盘成结构，而那正是已否决的过度设计）。其质量落在 `SKILL.md` 措辞，靠人工评审与实际运行验证，同 brainstorming skill 不被单测同一性质。

### 4.4 文档

- 本设计文档本身。
- 项目 `CLAUDE.md` 状态机段当前仍写 `initialized → assessed`，未体现已落地的 `clarified`——属既有遗留，不在本次范围；如需可单独跟进。

## 5. 错误处理与不变量

- 主会话不得直接调用知识库工具；三个查询时机均派发一次性子 Agent，不复用 agent ID。
- 任何推荐结论若援引知识，必须先有对应 EV；无 EV 的回退为 inference，且必须经用户确认才记为结论。
- 知识库无结果不阻断：记 gap、向用户说明不确定性、由用户明确结论完成该项。
- functional 需求不被追问无关技术细节；technical/mixed 的适用契约（含 northbound API 子字段）任一未确认不得放行。
- “挖尽”是主会话判断；确定性兜底仍是 `validateClarification` 全维度通过 + 用户最终确认。

## 6. 取舍

把挖掘逻辑放在 `SKILL.md` 策略文字层、而非落盘的需求树 + 依赖解析引擎，换取最小改动与最小风险：script/测试/requirement.md 契约零改动，现有闸门与恢复机制完全复用。代价是挖掘过程本身不可确定性单测、不可结构化审计——这是用户在设计对话中明确接受的取舍（“不过度设计，像 brainstorming 那样说清楚就行”）。若日后发现挖掘质量不稳定，可再评估是否升级为思路 B（加轻量 `openQuestions` 列表并纳入闸门）。
