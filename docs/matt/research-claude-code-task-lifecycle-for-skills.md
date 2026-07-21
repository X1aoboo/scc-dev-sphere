# Claude Code Skill 中的 Task 生命周期调研

调研日期：2026-07-21

## 调研范围与结论标记

本报告只使用以下一手来源：

- Anthropic 的 Claude Code 官方文档；
- Anthropic 官方 `claude-code` / `skills` 仓库；
- Agent Skills 官方规范与官方创作指南。

文中结论分为两类：

- **官方事实**：来源直接陈述或由官方类型定义明确规定；
- **设计推断**：官方没有直接规定具体 Skill 应怎样编排 Task，结论由官方能力边界和本项目观察共同推导。

## 结论摘要

1. **官方事实**：Task 的用户可见生命周期是 `pending → in_progress → completed`；`pending` 表示任务已识别，`in_progress` 表示工作已经开始，`completed` 表示成功完成。`deleted` 是删除操作，不是正常业务阶段。[Todo lifecycle](https://code.claude.com/docs/en/agent-sdk/todo-tracking#todo-lifecycle) [TaskUpdate 类型](https://code.claude.com/docs/en/agent-sdk/typescript#taskupdate)
2. **官方事实**：`TaskCreate` 每次创建一个 Task 并返回新 ID；`TaskUpdate` 按 ID patch；`TaskList` 返回当前列表快照。官方 API 没有 upsert、按标题查找或幂等键。[Task tool API](https://code.claude.com/docs/en/agent-sdk/typescript#taskcreate)
3. **官方事实**：Task 支持 `blocks` / `blockedBy` 依赖；官方把“阻塞任务完成后自动解锁、供其他 Agent 认领”作为 Agent Teams 的协调能力。官方同时明确说，顺序任务或依赖很多的工作更适合单会话或 subagent，而非 Agent Team。[Agent Teams: assign and claim tasks](https://code.claude.com/docs/en/agent-teams#assign-and-claim-tasks) [When to use agent teams](https://code.claude.com/docs/en/agent-teams#when-to-use-agent-teams)
4. **设计推断**：对单会话、严格串行的 4–5 个里程碑，推荐 **JIT 接力创建**：恢复时先 `TaskList`，没有当前活动的未完成 Task 才创建当前里程碑，立即切到 `in_progress`；完成后再创建下一项。这最贴合官方状态语义，也避免长期 `pending` 形成虚假积压。
5. **设计推断**：若产品必须从一开始展示完整路线图，可以批量创建全清单并用依赖阻塞后项，但 Skill 必须在真实工作开始时及时切换 `in_progress`。依赖只能阻止认领/表达顺序，不能自动保证模型在正确时点更新状态；官方也承认 Task 状态可能滞后。[Agent Teams limitations](https://code.claude.com/docs/en/agent-teams#limitations)
6. **官方事实 + 设计推断**：同一会话再次调用相同 Skill 时，Skill 指令通常仍在上下文中，Task 列表也是 per-session；因此新调用不能把“调用 Skill”当成空白初始化。应先读 `TaskList`，使用带活动身份的标题识别当前未完成 Task，并以正式 Artifact 判断恢复、完成旧项还是创建新项。[Skill content lifecycle](https://code.claude.com/docs/en/slash-commands#skill-content-lifecycle) [Claude directory: tasks](https://code.claude.com/docs/en/claude-directory)

## 1. Task 工具的官方状态语义与能力

### 1.1 状态生命周期

**官方事实。** Claude Agent SDK 的 Task/Todo 跟踪用于组织复杂工作并向用户展示进度。官方定义的生命周期是：

1. 识别任务时，以 `pending` 创建；
2. 工作开始时，激活为 `in_progress`；
3. 任务成功完成时，更新为 `completed`；
4. 一组 Todo 全部完成后可被移除。

来源：[Claude Code Todo Lists — Todo Lifecycle](https://code.claude.com/docs/en/agent-sdk/todo-tracking#todo-lifecycle)。

`TaskUpdate` 的类型还允许 `deleted`，官方解释是“用于删除任务”。因此 `deleted` 是维护操作，不应被解释成被取消、跳过或失败等业务状态。来源：[TypeScript SDK — TaskUpdate](https://code.claude.com/docs/en/agent-sdk/typescript#taskupdate)。

由此可以确定：

- `pending` 不是“当前正在做”，而是已经识别但尚未开始；
- `in_progress` 的切换点应是实际工作开始；
- `completed` 的切换点应是成功完成，而不是“准备完成”或“稍后补记”；
- 官方没有 `waiting_for_user`、`blocked`、`failed` 等独立状态。等待用户或 Reviewer 时，如果当前里程碑尚未结束，仍只能结合 `in_progress` 与 `blockedBy`/描述来表达。

最后一条关于如何表示“等待用户”是**设计推断**；状态枚举本身是**官方事实**。

### 1.2 Create、Update、Get、List

**官方事实。** 当前 Task API 是细粒度、增量式 API：

- `TaskCreate({ subject, description, activeForm?, metadata? })`：创建单个 Task，返回 `{ id, subject }`；
- `TaskUpdate({ taskId, ...patch })`：按 ID patch 状态、标题、描述、依赖、owner 或 metadata；
- `TaskGet({ taskId })`：返回单项完整信息或 `null`；
- `TaskList({})`：返回当前列表快照，包括 `id`、`subject`、`status`、可选 `owner` 和 `blockedBy`。

来源：[TypeScript SDK task inputs](https://code.claude.com/docs/en/agent-sdk/typescript#taskcreate) 与 [task outputs](https://code.claude.com/docs/en/agent-sdk/typescript#taskcreate-2)。迁移文档也明确说，新的 Task 工具把旧 `TodoWrite` 的整表覆盖拆成“每项创建”和“每次状态 patch”。来源：[Migrate to Task tools](https://code.claude.com/docs/en/agent-sdk/todo-tracking#migrate-to-task-tools)。

`TaskUpdate` 的返回值包含 `success`、`updatedFields`、可选 `error` 和 `statusChange.from/to`。因此，工具返回成功后可以把该转换视为已落地事实；重复提交相同状态没有官方价值。来源：[TaskUpdate output](https://code.claude.com/docs/en/agent-sdk/typescript#taskupdate-2)。

**官方没有提供**：

- 按 subject 查询；
- create-if-absent / upsert；
- 调用方提供的 Task ID；
- 官方定义的幂等键；
- 自动把“模型已开始某段工作”同步成 `in_progress` 的保证。

因此，防重复必须由使用方先 `TaskList` 后判断，或借助 Hook 阻止不符合规则的创建；这是能力边界上的**设计推断**。

### 1.3 依赖能力

**官方事实。** `TaskUpdate` 支持：

- `addBlocks: string[]`；
- `addBlockedBy: string[]`。

`TaskGet` 和 `TaskList` 返回 `blocks` / `blockedBy`。来源：[TaskUpdate and TaskGet types](https://code.claude.com/docs/en/agent-sdk/typescript#taskupdate)。

在 Agent Teams 中，官方进一步定义：有未解决依赖的 `pending` Task 不能被认领；被依赖 Task 完成后，系统自动解锁阻塞项。来源：[Assign and claim tasks](https://code.claude.com/docs/en/agent-teams#assign-and-claim-tasks) 与 [Agent Teams architecture](https://code.claude.com/docs/en/agent-teams#architecture)。

但这个事实不能扩大解释为“依赖会自动把单会话中的下一 Task 切成 `in_progress`”。官方只承诺解锁/可认领，没有承诺状态焦点自动转移。并且官方把 Agent Teams 定位为适合可以独立并行的任务；顺序任务、同文件修改或依赖很多的工作更适合单会话或 subagent。来源：[When to use Agent Teams](https://code.claude.com/docs/en/agent-teams#when-to-use-agent-teams)。

### 1.4 Task 的典型用途与已知限制

**官方事实。** Todo/Task 适合：

- 三个及以上不同动作的复杂多步骤工作；
- 用户给出的多项任务清单；
- 需要向用户展示进度的非简单操作；
- 用户明确要求组织 Todo 的情况。

很短或单步骤请求可以不建 Task。来源：[When Todos Are Used](https://code.claude.com/docs/en/agent-sdk/todo-tracking#when-todos-are-used)。

**官方事实。** 官方 Agent Teams 文档明确列出已知限制：Task 状态可能滞后；Agent 有时没有把实际已完成的任务标记为 completed，从而阻塞依赖项。官方建议此时检查实际工作是否完成并手动更新，或提醒 Agent。来源：[Agent Teams limitations](https://code.claude.com/docs/en/agent-teams#limitations)。

这与实际日志中“工作已经跨入后一里程碑，而 Task 状态仍停在前项”一致。它说明 Skill 需要给状态转换提供更明确的步骤，但不能证明某一种编排方式是 Anthropic 官方推荐方案。

## 2. Skill 如何提升执行可预测性

### 2.1 顺序步骤应留在 SKILL.md 主路径

**官方事实。** Agent Skills 规范建议 SKILL.md body 包含 step-by-step instructions、输入输出示例和常见边界；Skill 激活后完整 SKILL.md 会进入上下文。来源：[Agent Skills Specification — Body content](https://agentskills.io/specification#body-content)。

官方创作指南进一步指出：简洁、逐步的指令配合有效示例，通常优于穷举式文档；当操作脆弱、必须一致或必须遵循特定顺序时，应使用规定性更强的明确顺序。来源：[Best practices — Aim for moderate detail](https://agentskills.io/skill-creation/best-practices#aim-for-moderate-detail) 与 [Match specificity to fragility](https://agentskills.io/skill-creation/best-practices#match-specificity-to-fragility)。

**设计推断。** Task 状态同步是已被真实日志证明不稳定的脆弱操作，因此应放进 SKILL.md 主执行路径，写成短而明确的先后步骤，而不是散落在每个里程碑末尾的提醒。例如：

```text
TaskList 恢复当前活动
→ 创建或复用当前里程碑
→ 在任何属于该里程碑的实质动作前切为 in_progress
→ 验证完成条件
→ completed
→ 再创建下一里程碑
```

### 2.2 完成条件：官方支持“可执行 Gate”，但未规定写法

Agent Skills 开放规范没有专门定义“completion criterion”字段；这点必须避免误称为官方格式要求。

不过，Claude Code 官方提供 `TaskCompleted` Hook：在 Task 即将被标记完成时运行，可检查测试或 lint 等完成条件；exit code 2 可以阻止完成并把反馈发回模型。来源：[Hooks — TaskCompleted](https://code.claude.com/docs/en/hooks#taskcompleted)。

因此：

- **官方事实**：Claude Code 支持在完成转换处执行确定性 Gate；
- **设计推断**：即使本项目不使用 Hook，也应让每个 Skill 里程碑具备可检查的完成条件，并要求完成转换发生在条件验证之后；
- **设计推断**：Artifact hash、Lint、Review、Approval、Baseline 等正式事实应继续作为完成依据，Task 只是用户可见投影，不应成为业务真相来源。

### 2.3 渐进披露的正确用途

**官方事实。** Agent Skills 采用三级渐进披露：启动时加载 metadata，激活时加载完整 SKILL.md，需要时再加载 references/scripts/assets。官方建议 SKILL.md 保持在 500 行、5000 tokens 以内，把详细 reference 移出，并用明确条件告诉 Agent 何时读取。来源：[Agent Skills Specification — Progressive disclosure](https://agentskills.io/specification#progressive-disclosure) 与 [Best practices — Structure large skills](https://agentskills.io/skill-creation/best-practices#structure-large-skills-with-progressive-disclosure)。Claude Code 官方同样要求支持文件的引用说明“包含什么、何时加载”。来源：[Claude Code Skills — Add supporting files](https://code.claude.com/docs/en/slash-commands#add-supporting-files)。

**设计推断。** Task 状态协议是每次运行都需要的核心执行纪律，应留在 SKILL.md；详细的各 Design Type checklist 或专业参考可按条件披露。不能把关键状态转换规则藏进只有特定分支才会读取的 reference，否则恢复/重复调用时更易丢失。

### 2.4 应用真实执行 Trace 做迭代

**官方事实。** 官方创作指南建议用真实任务反复执行和改进 Skill，并读取 execution traces，而不只检查最终输出；含糊指令、无关指令、选项过多且无默认值都是常见浪费来源。来源：[Best practices — Refine with real execution](https://agentskills.io/skill-creation/best-practices#refine-with-real-execution)。

这直接支持本次基于会话日志修改 Skill，并要求后续真实会话验收，而不是只通过静态字符串测试。

## 3. 严格串行 4–5 个里程碑的三种方案

官方没有发布“Skill 的 4–5 个严格串行里程碑必须采用哪一种 Task 创建策略”的规范。以下比较把直接证据和推断分开。

| 方案 | 官方能力支持 | 优点 | 限制与风险 | 判断 |
|---|---|---|---|---|
| 启动时批量创建全部 Task | `TaskCreate` 可逐项创建；`pending` 表示已识别未开始；可加依赖 | 用户一开始看到完整路线；依赖能表达顺序 | 后续项会长期 pending；依赖只负责阻塞/解锁，不保证状态及时切换；同会话重复调用会累积同名 Task | 仅在“完整路线可见”是明确产品需求时使用 |
| JIT：只创建当前里程碑 | `TaskCreate` 是单项增量 API；状态语义支持开始时 in_progress、完成时 completed | 状态与真实焦点最容易一致；无长期 pending；自然表达严格串行；重复调用时更容易恢复唯一当前项 | 起初看不到完整路线；必须先 TaskList 防重复；Skill 文字仍需列出后续里程碑作为 reference | **本项目推荐** |
| 先建全清单，只激活当前项 | 与批量创建相同；`pending`/依赖可区分未开始项 | 同时保留路线和当前焦点 | 正是当前实现的近似形态；日志证明状态更新可能滞后；大量 pending 对用户形成虚假积压；重复 Design 活动标题冲突 | 不推荐作为默认 |

### 3.1 为什么推荐 JIT 不是“官方规定”

推荐 JIT 的直接依据是三个官方事实：

1. `TaskCreate` 的新模型就是每次新增一项，而不是必须整表声明；
2. `in_progress` 的语义是工作已经开始；
3. 官方承认 Agent 可能漏掉状态更新。

从这些事实推断，减少同时存在的未完成 Task，能缩小模型需要维护的状态面，并让唯一未完成 Task 更接近真实工作焦点。但 Anthropic 官方没有对 JIT 与批量创建做过对照实验，也没有宣称 JIT 更可靠。因此“JIT 更适合本项目”是**工程推断**，需要用真实会话复验。

### 3.2 依赖图是否值得引入

**设计推断。** 本项目的 4–5 项是单会话严格线性里程碑，不存在多个 Agent 自主认领的竞争。此时依赖边只重复表达顺序；JIT 创建已经通过“前一项完成后才创建后一项”编码顺序。引入完整依赖图会增加 Task 创建和恢复复杂度，却不会自动解决 `in_progress` 更新滞后。

如果未来需要一开始展示完整路线，或多个 Agent 从共享清单自助认领，才有充分理由使用 `addBlockedBy`。

## 4. 同一会话重复调用 Skill 时的恢复与防重

### 4.1 官方生命周期事实

**官方事实。** Skill 被调用后，其渲染后的 SKILL.md 作为一条消息进入会话并在会话剩余时间中保留。相同内容再次调用时，Claude Code 通常只提示 Skill 已加载，不重复追加完整内容；不同参数或动态上下文导致内容变化时才追加新版。来源：[Skill content lifecycle](https://code.claude.com/docs/en/slash-commands#skill-content-lifecycle)。

**官方事实。** Claude Code 的 `~/.claude/tasks/` 是 per-session task lists。来源：[Explore the .claude directory](https://code.claude.com/docs/en/claude-directory)。

因此，同一会话第二次进入 `feature-design` 时：

- 指令可能仍在上下文；
- 前一次 Business Design Task 也仍在本会话 Task 列表；
- “Skill 再次调用”不等价于“一套空白 Task 列表”。

### 4.2 推荐恢复协议

以下是基于官方 API 边界的**设计推断**：

1. **每次 Skill 调用或恢复首先调用 `TaskList`。** 官方提供它正是为了读回当前完整快照。
2. **Task 标题必须包含活动身份。** 例如 `Business Design：完成并确认核心设计` 与 `Solution Design：完成并确认核心设计`，避免只靠通用里程碑名匹配。
3. **只复用当前活动的未完成 Task。** 先按标题前缀/活动身份定位，再用 `TaskGet` 检查详情和依赖；已完成的上一设计活动不得阻止创建下一活动 Task。
4. **正式 Artifact 决定恢复位置。** Task 可能滞后，因此 Task 不是权威游标。若 Artifact 已满足当前 Task 的完成条件，补齐完成转换后再创建下一项；若 Artifact 不满足，则继续该项。
5. **TaskUpdate 成功后不重复同一转换。** 依据返回值中的 `success` 与 `statusChange` 推进，不因参数格式猜测再次提交。
6. **发现重复或陈旧的未完成 Task 时先收敛为一个。** 保留与正式 Artifact 匹配的一项；其余可更新为 completed（仅当完成条件真实满足）或 `deleted`（确为误建时）。`deleted` 的机械能力是官方事实，如何清理由 Skill 定义。

### 4.3 metadata 的适用边界

`TaskCreate` / `TaskUpdate` 输入支持任意 `metadata`，这是**官方事实**。但当前官方 `TaskList` 和 `TaskGet` 输出类型没有展示 metadata 字段。因此不能把“通过 TaskList 读取 metadata 作为可靠恢复键”写成本项目的核心协议。来源：[Task input types](https://code.claude.com/docs/en/agent-sdk/typescript#taskcreate) 与 [TaskList output](https://code.claude.com/docs/en/agent-sdk/typescript#tasklist-2)。

**设计推断。** 当前应优先使用清晰、稳定、用户可见的标题前缀识别活动；metadata 只能作为额外信息，不能作为唯一恢复依据，除非在目标 Claude Code 版本上实测确认读回行为。

## 5. 对现有 feature-clarify / feature-design 的修改建议

以下均为基于调研的**设计建议**，不是 Anthropic 官方规定。

### 5.1 在 SKILL.md 主路径增加短的“接力 Task”协议

建议用正向、顺序化、可观察的步骤替换“启动后立即创建全部任务，并按完成条件更新”：

```markdown
### 接力 Task

Task 只投影当前会话进度，正式完成事实以 Draft、Review、Approval 和
Baseline 为准。

1. 每次调用或恢复先用 TaskList 读取当前列表，并依据正式产物确定当前里程碑。
2. 若当前设计活动已有一个匹配的未完成 Task，复用它；否则只创建当前立即
   执行的里程碑。
3. 在执行属于该里程碑的调查、提问、写入或 Review 前，将当前 Task 标记为
   in_progress。
4. 完成条件全部实际满足后，将当前 Task 标记为 completed；工具返回成功后
   不重复提交同一转换。
5. 当前 Task 完成后，仍有后续里程碑时，才创建下一 Task 并立即开始接力。
6. 任意时刻，一个设计活动最多保留一个未完成的顶层 Task。
```

注意：TaskCreate 默认产生 `pending`，再 TaskUpdate 到 `in_progress` 是符合官方生命周期的明确两步。Skill 不应声称“TaskCreate 直接创建为 in_progress”，因为官方 `TaskCreate` 输入没有 status 字段。

### 5.2 保留里程碑目录，但不在启动时全部实例化

里程碑标题、进入条件、完成条件继续留在 SKILL.md，供 Agent 知道完整流程；实例化则采用 JIT。这样同时保留流程可预测性和用户界面的准确性。

每项都应同时写：

- **进入条件**：何时创建并切入该 Task；
- **完成条件**：哪些事实都成立才可 completed。

例如批准发布项的进入点应是“准备向用户请求最终批准时”，而不是用户已批准、发布完成之后。

### 5.3 Design Task 带活动类型前缀

第一项可为：

```text
Feature Design：恢复工作空间并识别当前设计活动
```

识别后所有项使用具体前缀：

```text
Business Design：完成并确认核心设计
Solution Design：完成并确认核心设计
```

这样既方便用户识别，也使 `TaskList` 恢复协议在当前公开 API 下可实施。

### 5.4 不为线性流程新增持久 Task 图

不建议当前增加：

- 持久 task cursor；
- 额外 JSON 状态机；
- 为全部线性 Task 建立 `blockedBy` 链；
- 用 Task 替代 Draft hash、Review、Approval、Baseline 的正式事实；
- 固定最短 `in_progress` 时间。

Task 的持续时间不是正确性标准；状态与真实工作边界一致才是。

### 5.5 可选的确定性 Hook，不作为第一步

若仅靠 Skill 文字经过真实会话复验仍不稳定，Claude Code 官方 Hook 可以加强两个边界：

- `TaskCreated`：强制标题前缀或 description；
- `TaskCompleted`：在完成前验证 Lint/Artifact 等确定性条件。

来源：[TaskCreated](https://code.claude.com/docs/en/hooks#taskcreated) 与 [TaskCompleted](https://code.claude.com/docs/en/hooks#taskcompleted)。

但 Hook 是额外运行时机制，会扩大插件配置与维护面。当前应先用更清晰的 Skill 顺序步骤和真实会话验证；只有重复观察到同一失败模式且可用确定性条件检查时再引入。

## 6. 验证建议

### 静态合同

验证 Skill：

- 不再要求启动时一次创建全部 4/5 个 Task；
- 明确 `TaskList → 复用或创建 → in_progress → 完成条件 → completed → 下一项`；
- 每项都有进入条件和完成条件；
- Design Task 使用具体 Design Type 前缀；
- 明确 TaskUpdate 成功后不重复转换；
- 明确 Artifact 是权威事实，Task 是进度投影。

### 真实会话 Trace

至少覆盖：

1. 首次 `feature-clarify`；
2. Clarify 中等待用户多轮回答；
3. Business Design 完成后同会话再次调用进入 Solution Design；
4. Reviewer 等待与返回；
5. 用户批准等待；
6. 中断后恢复；
7. 故意制造重复/陈旧 Task 后恢复。

核心验收不变量：

> 当前活动中唯一未完成的顶层 Task，必须准确描述 Agent 当前正在推进或等待完成的交付里程碑；正式 Artifact 与 Task 冲突时，以 Artifact 为准并及时修正 Task 投影。

这是一条本项目的**设计验收标准**，而不是官方 API 保证。

## 7. 官方事实与工程推断对照

| 结论 | 分类 |
|---|---|
| `pending → in_progress → completed` 分别对应识别、开始、成功完成 | 官方事实 |
| `deleted` 用于删除 Task | 官方事实 |
| TaskCreate 单项创建且返回 ID；TaskUpdate 按 ID patch；TaskList 返回快照 | 官方事实 |
| Task 支持 blocks / blockedBy；Agent Teams 中依赖未完成则不可认领 | 官方事实 |
| Task 状态可能滞后 | 官方已知限制 |
| Skill 内容在同会话中持续存在，相同内容重调通常不重复注入 | 官方事实 |
| Task 列表是 per-session | 官方事实 |
| Skills 应使用简洁逐步指令；脆弱顺序应更明确；细节按需披露 | 官方指南 |
| 对本项目采用 JIT 接力创建 | 基于官方事实的工程推断 |
| 任意时刻每个设计活动最多一个未完成顶层 Task | 本项目设计不变量 |
| 等待用户/Reviewer 时保持当前 Task in_progress | 状态枚举边界下的工程推断 |
| 用 Design Type 标题前缀做恢复身份 | 当前 API 可观察字段下的工程推断 |
| 不建立完整线性依赖图或持久 Task cursor | YAGNI 与当前串行语义下的工程判断 |
