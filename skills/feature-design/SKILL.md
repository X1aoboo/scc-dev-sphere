---
name: feature-design
description: 协作完成当前 Feature 设计活动。用于需要业务、方案、实现或测试设计时；从设计工作空间恢复上下文，动态加载专业指南，以 design tree/frontier 推演并确认设计，形成 Draft，经隔离 Review、人工批准后发布 Baseline。
---

# Feature Design

在主会话中完成当前一个设计活动。业务设计、方案设计、实现设计和测试设计共享下列固定过程；设计类型只决定加载的专业 Reference，不规定活动之间的顺序或依赖。

## 步骤0. 创建执行任务

立即使用当前环境的任务管理能力为当前一个设计活动创建以下五个线性顶层任务，并将第一项标记为 `in_progress` 后再开始实质工作：

1. **恢复设计工作空间、识别当前设计活动并建立专业上下文**
2. **完成并确认核心设计**
3. **形成可评审的 Design Draft**
4. **集中 Review 并修订至满足发布条件**
5. **获得用户最终批准并发布 Design Baseline**

任务状态必须投影当前实际工作焦点。本次设计活动尚未完成时，始终只有当前一项任务处于 `in_progress`，后续任务保持 `pending`。开始下一项任务的任何实质工作前，先将当前任务标记为 `completed`，再将下一项标记为 `in_progress`；等待用户回答或 Reviewer 返回时，当前任务保持 `in_progress`。只有对应完成条件实际满足后才能完成任务；任务更新返回成功后，以该结果继续推进，不重复提交相同状态。

任务增强当前会话对过程的遵循，不作为流程事实来源。查询、问题、设计段落、Reviewer、finding 和局部修订留在所属顶层任务内。

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

直接执行 `/scc-dev-sphere:feature-design-analysis` 调用专业设计分析 Skill，使用步骤1已经加载的当前设计上下文、Design Guide 和 Spec 完成交互式分析与设计确认。

调用期间当前顶层任务保持 `in_progress`。本步骤触发的 Evidence/Decision 仍按照本 Skill 的维护合同处理。

只有用户已经确认完整设计收敛，并明确允许进入 Draft，才能完成当前任务。不得在分析完成前生成或修改 Draft。

完成条件：用户确认设计已收敛，并同意生成 Design Draft。

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

根据是否存在用户接受的残余风险，选择一条批准命令：

```bash
# 无残余风险
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js approve-current-design <taskPath> <designType> '{"approvedBy":"human","acceptedRisks":[],"summary":"用户已批准当前 Design Draft 作为 Baseline"}'

# 有残余风险：将 <accepted-risk> 替换为实际风险，不得保留占位符
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js approve-current-design <taskPath> <designType> '{"approvedBy":"human","acceptedRisks":["<accepted-risk>"],"summary":"用户已接受所列残余风险，并批准当前 Design Draft 作为 Baseline"}'
```

批准成功后运行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js publish <taskPath> <designType>
```

批准失败时检查 JSON 和 Draft/Lint/Review hash。

`publish` 将获批 Draft 原样复制为 Baseline，不在发布时改写内容。已有不同 Baseline 时，先向用户确认重开，再运行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-design.js reopen <taskPath> <designType>
```

本 Skill 不修改顶层工作流状态，也不硬编码总体需要哪些设计活动。调用者负责根据最新工作空间事实和外层合同同步顶层状态。

完成条件：Artifact 与获批 Draft 字节一致；Approval、Lint 和 Review 绑定同一 hash；Baseline 版本有效；向调用者返回“当前 Design Baseline 已获用户批准并发布”。
