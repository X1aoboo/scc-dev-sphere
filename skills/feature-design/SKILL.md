---
name: feature-design
description: 协作完成当前 Feature 设计活动。用于需要业务、方案、实现或测试设计时；从设计工作空间恢复上下文，动态加载专业指南，以 design tree/frontier 推演并确认设计，撰写 Draft，经隔离 Review、人工批准后发布 Baseline。
---

# Feature Design

在主会话中完成当前一个设计活动。业务设计、方案设计、实现设计和测试设计共享下列固定过程；设计类型只决定加载的专业 Reference，不规定活动之间的顺序或依赖。

## 步骤0. 创建执行任务

立即使用当前环境的任务管理能力为当前一个设计活动创建以下五个线性顶层任务，并将第一项标记为 `in_progress` 后再开始实质工作：

1. **恢复设计工作空间、识别当前设计活动并建立专业上下文**
2. **完成并确认核心设计**
3. **撰写可评审的 Design Draft**
4. **集中 Review 并修订至满足发布条件**
5. **获得用户最终批准并发布 Design Baseline**

任务状态必须投影当前实际工作焦点。本次设计活动尚未完成时，始终只有当前一项任务处于 `in_progress`，后续任务保持 `pending`。开始下一项任务的任何实质工作前，先将当前任务标记为 `completed`，再将下一项标记为 `in_progress`；等待用户回答或 Reviewer 返回时，当前任务保持 `in_progress`。只有对应完成条件实际满足后才能完成任务；任务更新返回成功后，以该结果继续推进，不重复提交相同状态。

任务增强当前会话对过程的遵循，不作为流程事实来源。查询、问题、设计段落、Reviewer、finding 和局部修订留在所属顶层任务内。

## 步骤1. 恢复工作空间并加载专业上下文

从调用上下文取得 `<taskPath>`，运行：

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design inspect-workspace --task-path "<taskPath>"
```

结合检查结果和用户目标识别当前设计活动：

- 唯一未完成 Work/Draft 优先作为恢复候选；
- Draft 与 Baseline 不一致表示可能重开；
- 调用上下文明确指定的设计目标可以确定当前类型；
- 多个候选、持久化事实冲突或证据不足时，展示候选与依据，请用户确认。

以唯一未完成 Work/Draft、调用目标和用户确认组成当前活动的正向证据。确认 `<designType>` 后运行：

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design init-design --task-path "<taskPath>" --design-type <designType>
```

根据返回的 `slug` 读取且只读取当前类型的：

- `references/design-guides/<slug>.md`：专业方法、透镜、风险和收敛标准；
- `references/specs/<slug>.md`：Draft 内容合同。

完整读取调用上下文 `requiredArtifacts` 中的全部文件。`inputs/` 目录内的所有文件都是当前需求输入，不得只读取 `proposal.md`、`requirement-clarification.md` 或自行筛选其中一部分。另读取当前阶段所需的上游 Design Baseline、现有 Draft/notes、被设计实际采用的既有 Evidence，以及项目代码和文档。

完成条件：当前设计类型和恢复位置有可靠证据；工作区已恢复或初始化；Design Guide、Spec 和必要事实已进入上下文。

## 步骤2. 完成并确认核心设计

直接执行 `/scc-dev-sphere:feature-design-analysis` 调用专业设计分析 Skill，使用步骤1已经加载的当前设计上下文、Design Guide 和 Spec 完成交互式分析与设计确认。

调用期间当前顶层任务保持 `in_progress`。本步骤采用外部知识时，只有实际支持或改变设计的结论才登记为 Evidence。

只有用户已经确认完整设计收敛，并明确允许进入 Draft，才能完成当前任务。不得在分析完成前生成或修改 Draft。

完成条件：用户确认设计已收敛，并同意生成 Design Draft。

## 步骤3. 撰写可评审 Draft

直接执行 `/scc-dev-sphere:design-draft`，将当前会话中已经确认的完整设计作为设计来源，将步骤1加载的当前 Spec 作为模板，并将 `work/<slug>/draft.md` 作为目标文件、`work/<slug>/<slug>-assets/` 作为可选配套资产目录。Draft 使用 `<slug>-assets/...` 相对路径引用线框图、原型快照和标注图；不需要配套资产时保持目录为空。

调用期间当前顶层任务保持 `in_progress`。只有 `design-draft` 已完成对照检查，确认最终有效设计及必要上下文均已充分写入 Draft，才能运行：

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design lint --task-path "<taskPath>" --design-type <designType>
```

Lint 只检查 frontmatter、固定结构、映射关系、适用性说明、明显占位符和格式等确定性事实，不判断方案是否具体、专业或语义成立。Lint 失败时由主会话修复确定性问题并重新运行；Lint `pass` 后才能调用 Reviewer。专业完整性仍由 Design Guide 收敛标准、隔离 Reviewer 和用户评审确认。

Lint `pass` 后运行以下命令，确认 Lint 状态绑定的是当前 Draft：

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design validate-draft --task-path "<taskPath>" --design-type <designType>
```

命令失败时，需重新运行`design lint` 对Design Draft进行Lint检查。

如果 `design-draft` 或 Lint 修复过程发现设计冲突、缺口、未决事项，或者必须新增设计语义才能完成 Draft，不得自行补全或继续 Lint。将任务 3 恢复为 `pending`，将任务 2 恢复为 `in_progress`，重新调用 `feature-design-analysis` 完成分析和用户确认，再重新进入步骤 3。

完成条件：最终有效设计及必要上下文已完整、忠实地写入 Draft 及其配套资产；Draft 可脱离当前会话上下文独立评审；不存在未确认语义；`validate-draft` 运行成功。

## 步骤4. 集中 Review 并修订

创建 `design-reviewer` Agent 评审当前冻结的 Design Draft，并等待它完成。向它提供：
- `<taskPath>` 和当前 `<designType>`；
- 本轮 Review brief：评审轮次与目标、Draft 修改内容及位置、明确未修改范围，以及用户选择继续解决的 advisory/risk；
- 如果需要重建评审基线，补充用户已经明确授权重建的事实。

评审前先向用户公开本轮 Review brief信息：

```text
评审轮次：...
本轮目标：...
修改内容：...
明确未修改：...
本轮选择解决的 advisory/risk：...
```

Reviewer 返回后向用户公开实际复评项、关闭 finding、仍活动 finding、新增 finding、未复评而保留的 finding 和整体 `pass|blocked`；评审范围以 Reviewer 的实际结果为准。

根据 Reviewer 返回的 findings 处理设计影响：
- `blocking` 必须修订，未关闭前不得进入批准；
- `advisory` 应说明影响，决定采纳或保留当前设计；
- `risk` 应向用户揭示；需要修改设计时完成修订，接受的残余风险留待最终批准记录。

修订只改变文档表达、不改变已确认设计时，返回步骤3重新形成 Draft。修订涉及新的设计判断、取舍、边界或风险时，返回步骤2重新分析并取得用户确认，再重新形成 Draft。

每次 Draft 或配套资产变化后，都必须重新运行 Lint；Lint 通过后再次调用 `design-reviewer`。

Review 返回 `pass` 后运行：

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design validate-review --task-path "<taskPath>" --design-type <designType>
```

命令失败时，根据返回问题继续修订和 Review，不得完成当前步骤。

完成条件：`validate-review` 运行成功。

## 步骤5. 批准并发布 Baseline

向用户展示设计目标、最终方案、关键取舍、Lint、Review 结论、已修订问题和残余风险，通过 `AskUserQuestion` 明确请求最终批准。

用户明确批准后，由主会话直接落盘，无需外部审批接口。`approvedBy` 固定为 `"human"`，表示批准决定来自用户。

根据是否存在用户接受的残余风险，构造对应的 Approval JSON，并将其作为 stdin 传给批准命令：

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design approve-current-design --task-path "<taskPath>" --design-type <designType> --input-file -
```

无残余风险输入：

```json
{"approvedBy":"human","acceptedRisks":[],"summary":"用户已批准当前 Design Draft 作为 Baseline"}
```

存在残余风险时，将 `<accepted-risk>` 替换为实际风险，不得保留占位符：

```json
{"approvedBy":"human","acceptedRisks":["<accepted-risk>"],"summary":"用户已接受所列残余风险，并批准当前 Design Draft 作为 Baseline"}
```

批准成功后运行：

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design publish --task-path "<taskPath>" --design-type <designType>
```

批准失败时检查 JSON 和 Draft/Lint/Review hash。

`publish` 将获批 Draft 原样复制为 Baseline，不在发布时改写内容。

完成条件：`publish` 运行成功；向调用者返回“当前 Design Baseline 已获用户批准并发布”。