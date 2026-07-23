---
name: feature-design
description: 协作完成当前 Feature 设计活动。用于需要业务、方案、实现或测试设计时；从设计工作空间恢复上下文，动态加载专业指南，以 design tree/frontier 推演并确认设计，形成 Draft，经隔离 Review、人工批准后发布 Baseline。
---

# Feature Design

在主会话中完成当前一个设计活动。业务设计、方案设计、实现设计和测试设计共享下列固定过程；设计类型只决定加载的专业 Reference，不规定活动之间的顺序或依赖。

## 执行任务

每次调用本 Skill，都立即使用当前环境的任务管理能力为当前一个设计活动创建以下五个线性顶层任务，并将第一项标记为 `in_progress` 后再开始实质工作：

1. **恢复设计工作空间、识别当前设计活动并建立专业上下文**：当前设计类型、恢复位置、持久化事实和专业 Reference 都有可靠依据。
2. **完成并确认核心设计**：语义分析循环已收敛，专业覆盖完整，用户确认完整设计内容；符合准入条件的 Evidence/Decision 已登记，或未解决的写入失败已揭示。
3. **形成可评审的 Design Draft**：Draft 可脱离聊天独立理解、只表达已确认设计，并通过确定性 Lint。
4. **集中 Review 并修订至满足发布条件**：所有适用 Checklist 已由单个隔离 `design-reviewer` 完整执行，blocking findings 已关闭，语义修订后已完整复评；Review 引入的新知识和新取舍已按同一合同维护。
5. **获得用户最终批准并发布 Design Baseline**：获批 Draft 已原样发布，并向调用者返回明确完成事实。

任务状态必须投影当前实际工作焦点。本次设计活动尚未完成时，始终只有当前一项任务处于 `in_progress`，后续任务保持 `pending`。开始下一项任务的任何实质工作前，先将当前任务标记为 `completed`，再将下一项标记为 `in_progress`；等待用户回答或 Reviewer 返回时，当前任务保持 `in_progress`。只有对应完成条件实际满足后才能完成任务；任务更新返回成功后，以该结果继续推进，不重复提交相同状态。

任务增强当前会话对过程的遵循，不作为流程事实来源。查询、问题、设计段落、Reviewer、finding 和局部修订留在所属顶层任务内。

## Evidence 与 Decision

Evidence/Decision 是主会话在语义事件发生后的单条原子副作用，不进入当前设计模型、design tree/frontier 或顶层任务；EV/DEC ID 只作创建引用时的即时技术句柄。不要把写入结果、ID 或 `supersedes` 映射回写到当前设计模型或 work notes；notes 只按既有结构记录相应的事实、已确认设计和开放事项。

- **Evidence**：仅当 `knowledge-query` 返回并附来源的知识结论被主会话结合完整上下文明确采用，且实际支持或改变当前设计判断时才登记。用户对同一知识主题的事实补充可作为 `user` source 合并。未采用的查询结论、未找到的信息、可直接恢复的代码或 Artifact 事实、普通设计讨论中的用户事实、临时理解、建议和 Reviewer finding 不是 Evidence。
- **Decision**：仅当存在合理替代方案，或需要接受残余风险或高成本约束，且不同选择会实质改变行为、边界、契约、实现或测试范围、成本或风险，并由用户明确确认最终选择时才登记。整段普通确认、事实或术语澄清、例行参数和必然实现细节不是 Decision。

只有主会话执行维护。单条写入成功时静默继续当前设计；失败时先修正并重试，仍失败则揭示未持久化内容、原因及对恢复的影响，然后继续现有流程。Evidence/Decision 不成为 Draft、Lint、Review、批准或发布门禁。

## 步骤1. 恢复工作空间并加载专业上下文

从调用上下文取得 `<taskPath>`，运行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js inspect-workspace <taskPath>
```

结合检查结果和用户目标识别当前设计活动：

- 唯一未完成 Work/Draft 优先作为恢复候选；
- Draft 与 Baseline 不一致表示可能重开；
- 调用上下文明确指定的设计目标可以确定当前类型；
- 多个候选、持久化事实冲突或证据不足时，展示候选与依据，请用户确认。

以唯一未完成 Work/Draft、调用目标和用户确认组成当前活动的正向证据。确认 `<designType>` 后运行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js init-design <taskPath> <designType>
```

根据返回的 `slug` 读取且只读取当前类型的：

- `references/design-guides/<slug>.md`：专业方法、透镜、风险和收敛标准；
- `references/specs/<slug>.md`：Draft 内容合同。

同时读取当前需求、相关正式 Artifact、现有 Draft/notes、被设计实际采用的既有 Evidence/Decision，以及项目代码和文档。Decision 文件不存在只表示当前没有既有记录。只加载当前设计目标实际需要的相关 Artifact。

完成条件：当前设计类型和恢复位置有可靠证据；工作区已恢复或初始化；Design Guide、Spec 和必要事实已进入上下文。

## 步骤2. 完成并确认核心设计

### 建立当前设计模型

先调查，再提问。综合目标、现状、约束、相关设计、代码、Evidence 和可用知识，持续维护当前设计模型：

- 已核验事实及来源；
- 已确认设计；
- 暂定理解及可能推翻它的假设；
- 开放事项、关键取舍和残余风险。

能从项目或知识源查到的事实由你调查。只有用户掌握的上下文和真正需要用户承担的设计决策才提问。需要查资料时，调用 `knowledge-query` Agent，用自然语言说明要查明什么以及必要的设计背景。等待查询完成，只使用它返回的最终结果。彼此无关的问题可以分别查询。查询结果中的“未找到”只说明相关来源没有答案。

### 在语义事件后立即持久化

当 `knowledge-query` 返回并附来源的知识结论被主会话采用，并且实际支持或改变当前设计时，立即登记一条 Evidence：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/knowledge-query.js register-evidence-record ${CLAUDE_PROJECT_DIR} <<'JSON'
<evidence-json>
JSON
```

当用户明确确认一个实质取舍时，立即登记一条 Decision：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-decisions.js add <taskPath> <slug> '<decision-json>'
```

Decision 的 `evidence` 只填实际支持该选择的 EV ID；没有这类 Evidence 时使用空数组，不为填充引用制造 Evidence。两类登记成功后不请求额外确认、不单独汇报 ID；失败时执行前述修正、重试和揭示合同。

### 运行语义分析循环

把设计问题按决策依赖组织成当前会话中的 **design tree**。前提已经满足、现在无需猜测即可讨论的问题构成 **frontier**。design tree/frontier 只用于推理，不持久化为游标、ID 或依赖图。

循环执行：

1. 重新审视整个设计模型和 Design Guide 的专业透镜。
2. 从 frontier 选择最可能改变设计、阻塞其他判断、风险最高或返工代价最大的问题。
3. 调查回答该问题所需的事实。
4. 形成当前理解、推荐方案、理由、可行替代方案和主要代价。
5. 指出矛盾、薄弱假设和风险；有依据时直接挑战用户方案。
6. 默认只深入讨论一个高价值问题；只有真正独立、低耦合的问题才同轮批量讨论。
7. 根据用户回答更新整个设计模型，说明变化及影响，重新计算 design tree/frontier。

每个问题必须改变或验证设计判断。模板章节是覆盖约束，不是问题清单。简单设计可以很短，但仍需完成事实调查、专业判断和明确确认。

### 动态组织并确认设计

按依赖、内聚性、复杂度和风险组织 **Design Sections**。每次呈现一个已经完成内部推演的段落，说明推荐、替代方案和代价，获得用户确认后再继续。

把用户确认后的内容视为 **Confirmed Design**。新事实或 Review finding 需要修改时，先说明原设计、拟修改内容、原因和影响，再取得重新确认。影响范围不可靠时请用户确认。

收敛前完整核对：

- frontier 没有会实质改变设计的开放项；
- 关键事实有可核验依据；
- 重要取舍和残余风险已经明确；
- Design Guide 的专业收敛标准逐项满足；
- Spec 核心内容全部覆盖；
- 每项条件内容都有生成位置或明确不适用理由；
- 高风险或有歧义的省略已由用户决定。

向用户呈现完整设计与覆盖结果并取得整体确认。

完成条件：上述收敛项全部可检查地满足，用户明确确认当前设计内容已收敛；所有已触发的维护动作均已成功，或尚未解决的写入失败已揭示。当前设计可以在没有任何符合准入条件的记录时正常收敛。

## 步骤3. 形成可评审 Draft

设计收敛后才按当前 Spec 写入 `work/<slug>/draft.md`。Draft 必须准确表达 Confirmed Design，可脱离聊天独立理解，不添加未讨论的目标、约束或方案。

运行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js lint <taskPath> <designType>
```

Lint 只检查 frontmatter、核心章节、适用性说明、占位符和格式。Lint 失败时修复确定性问题；若修复会改变设计语义，返回任务 2 讨论并确认。

完成条件：Draft 内容完整、无未确认语义、可独立评审，当前 Draft hash 的 Lint 为 `pass`。

## 步骤4. 集中 Review 并修订

根据 Design Guide 的 Checklist 导航和当前 Draft 判断适用性。适用性不明确时执行；明确不适用时向用户说明理由。此时才读取每份适用的 `references/review-checklists/<checklist-id>.md`。

调用 `design-reviewer` Agent 评审当前冻结的 Draft，并等待它完成。Reviewer 在单独的上下文中依次执行全部适用 Checklist。向它提供：

- `<taskPath>`、当前 `designType`，以及由 design type 和 semantic hash 组成的 `reviewKey`；
- 冻结 Draft 的路径、Draft hash 和 semantic hash；
- 全部适用 Checklist 的 ID 与路径，以及明确不适用项的理由；
- Checklist 判断所必需的相关正式 Artifact 或事实材料；
- `reviewScriptPath=${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js`；
- `mode=full-review`。

收到结果后由主会话分析重复、关联和冲突，向用户说明对 Confirmed Design 的影响，再讨论修订。所有 blocking findings 必须关闭；advisory 和残余 risk 必须向用户揭示并形成明确处理结论。主会话可以读取 Review 状态，但不创建、修改或刷新 Review 摘要。

Reviewer finding 本身不直接登记为 Evidence/Decision。finding 暴露知识缺口时，由主会话调查或调用 `knowledge-query` Agent，只有随后被采用的知识结论才按任务 2 的合同登记 Evidence。finding 促使用户确认新的实质取舍时，按任务 2 的合同新增 Decision；新取舍推翻既有决定时，用 `supersedes` 引用被替代的当前有效 Decision。纯排版、措辞和不改变语义的修订不产生新记录。

Draft 发生语义修改时，重新运行 Lint，并再次调用 `design-reviewer` 完整评审全部适用 Checklist。纯排版、错别字或不改变含义的修正重新 Lint 后，以同样输入调用 `design-reviewer`，但传入 `mode=format-refresh`，由它运行刷新命令，不重新执行 Checklist。

临时摘要只保存 Draft hash、Checklist 结论、必要 findings 和明确不适用理由，由 `design-reviewer` 独占维护。

完成条件：摘要绑定当前 Draft hash；每份适用 Checklist 都已执行；所有 blocking findings 已关闭；语义修订后已完整复评；Review 状态为 `pass`；Review 已触发的维护动作已成功，或未解决的失败已按任务 2 的合同揭示。

## 步骤5. 批准并发布 Baseline

向用户展示设计目标、最终方案、关键取舍、Lint、Review 结论、已修订问题和残余风险，通过 `AskUserQuestion` 明确请求最终批准。

用户明确批准后，由主会话直接落盘，无需外部审批接口。`approvedBy` 固定为 `"human"`，表示批准决定来自用户。

`acceptedRisks` 写入用户接受的残余风险；无残余风险时使用 `[]`。以下为无残余风险的批准示例：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js approve-current-design <taskPath> <designType> '{"approvedBy":"human","acceptedRisks":[],"summary":"用户已批准当前 Design Draft 作为 Baseline"}'
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js publish <taskPath> <designType>
```

只有批准成功后才运行 `publish`。失败时检查 JSON 和 Draft/Lint/Review hash。

`publish` 将获批 Draft 原样复制为 Baseline，不在发布时改写内容。已有不同 Baseline 时，先向用户确认重开，再运行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js reopen <taskPath> <designType>
```

本 Skill 不修改顶层工作流状态，也不硬编码总体需要哪些设计活动。调用者负责根据最新工作空间事实和外层合同同步顶层状态。

完成条件：Artifact 与获批 Draft 字节一致；Approval、Lint 和 Review 绑定同一 hash；Baseline 版本有效；向调用者返回“当前 Design Baseline 已获用户批准并发布”。
