# Feature Design Evidence/Decision 维护重构规格

## 文档状态

- 状态：已确认，待实施
- 适用范围：`feature-design` 主 Skill、Decision 持久化脚本及直接测试接缝
- 实施方式：评审确认后，由 `writing-great-skills` 原则指导具体重构
- 上位约束：遵循 `06-skill-first-feature-design-refactor.md`，不改变既有 Skill-first 架构
- 调研依据：`docs/matt/research-feature-design-evidence-decision-placement.md`
- 权威性：本规格是本次增量重构的实施合同；调研记录只提供依据，后续对齐结论以本规格为准

## 1. 背景与问题

当前 `feature-design` 已经形成稳定的五项执行任务和主会话语义分析循环，也会读取设计实际采用的 Evidence/Decision，但没有定义以下维护动作：

- `knowledge-query` 候选被主会话采用后，何时登记 Evidence；
- 用户确认实质取舍后，何时登记 Decision；
- Review 引入新知识或推翻既有取舍后，如何维护记录；
- 写入失败时如何揭示，同时保持 Evidence/Decision 非门禁；
- Decision 文件不存在时，如何避免把兼容性初始化暴露给 Skill 和 Agent。

因此，当前流程可以在没有新增任何 Evidence/Decision 的情况下完成 Task 2、Task 4 和 Baseline 发布。问题不是缺少数据模型，而是既有知识模型没有进入 Agent 实际执行的步骤和完成条件。

## 2. 目标

- 让主会话在采用知识和确认实质取舍时稳定维护 Evidence/Decision；
- 将维护动作共置于真实语义事件，不依赖一条跨越长流程的宽泛全局要求；
- 保持 Evidence/Decision 定义和准入边界只有一个语义来源；
- 让维护成为轻量、静默、单条原子的持久化副作用，不破坏现有设计流程；
- 保留设计对话、design tree/frontier、Design Sections、Draft、Review、批准和发布的既有职责；
- 让 Review 推翻既有取舍时具有明确、可追溯的 Decision 替代语义；
- 通过确定性测试和聚焦 Agent 前向测试验证行为，而不只检查关键词存在。

## 3. 非目标

- 不新增外部 Evidence/Decision Skill；
- 不新增第六个顶层任务、维护子流程或持久化 design tree ID；
- 不把 EV/DEC ID 加入当前设计模型；
- 不把 Evidence/Decision 变成 Draft、Lint、Review、批准或发布门禁；
- 不建设 Evidence 与 Decision 的跨文件事务；
- 不建设重试幂等、语义去重、pending、补偿队列或恢复状态机；
- 不要求 Draft 固定生成 Evidence/Decision 清单或逐条映射；
- 不修改任何 Design Guide、Design Spec 或 Review Checklist；
- 不修改 `knowledge-query` 的查询、合并、Evidence 数据模型或登记接口；
- 不重新设计跨任务长期知识库、全文检索或自动知识合并机制。

## 4. 核心设计原则

### 4.1 原子副作用

Evidence/Decision 维护附着在已经发生的设计语义事件之后：

```text
采用知识结论
→ 原子登记一条 Evidence
→ 继续现有设计流程

确认实质取舍
→ 原子登记一条 Decision
→ 继续现有设计流程
```

维护动作不是设计问题、Design Section、顶层任务或设计模型元素。成功写入不插入额外用户对话；失败按本规格揭示，但不改变设计流程的主线和状态。

一条 Evidence 和一条 Decision 分别构成独立原子动作。即使 Decision 引用刚登记的 Evidence，两次写入也不组成联合事务；后续 Decision 写入失败时，不回滚已经成立的 Evidence。

### 4.2 信息层级

依据 `writing-great-skills`：

- Evidence/Decision 的定义、准入边界、主会话所有权和非门禁原则，作为简短的 in-skill Reference 集中定义一次；
- 真正的登记行为放入 Task 2 和 Task 4 的步骤及完成条件，明确何时执行和怎样判断已经处理；
- CLI 模板与对应触发条件共置，降低脆弱持久化动作的自由度；
- Task 4 引用 Task 2 的登记合同，不复制完整定义和命令；
- 不把本规格或调研文档变成运行时 Reference，避免 Agent 为执行基本维护再加载外部文档。

### 4.3 当前设计模型保持纯语义

当前设计模型继续只维护已核验事实、已确认设计、暂定理解、开放事项、关键取舍和残余风险。

EV/DEC ID 是持久化记录的技术句柄，不进入设计模型、design tree/frontier 或工作笔记的新结构。Agent 仅在创建引用关系时即时使用命令返回值，或按需从持久化记录重新读取：

- 创建 Decision 时使用实际支持它的 EV ID；
- Review 推翻决定时读取当前有效 DEC ID并填写 `supersedes`；
- Draft 按当前 Spec 和可读性需要引用重要 ID，不形成通用强制映射。

## 5. Evidence 准入与维护合同

### 5.1 准入边界

只有同时满足以下条件的知识结论才登记 Evidence：

1. 来源于一次独立知识主题的 `knowledge-query` 候选；
2. 已由主会话结合完整设计上下文明确采用；
3. 实际支持或改变当前设计判断。

用户对同一知识主题的事实补充可以作为 `user` source 合并进该条多来源 Evidence。

以下内容不登记 Evidence：

- 未采用的候选、冲突中的未选结论和 `gap`；
- 普通代码调查结果、正式 Artifact 内容和项目内可直接恢复的事实；
- 用户在普通设计讨论中给出的、未成为同一知识主题来源的事实；
- 临时理解、开放问题、假设、建议和设计结论；
- Reviewer finding 本身。

代码、Artifact 和用户事实仍可作为当前设计模型中的已核验事实。较窄的 Evidence 边界避免把 Evidence registry 退化为事实日志。

### 5.2 主会话所有权

Knowledge Query Subagent 只返回候选、来源、冲突和 gap，不写 Evidence。只有掌握完整设计上下文的主会话能够作出采用判断并登记。

主会话确认采用后立即执行现有 `register-evidence-record` 命令，不推迟到 Design Section、Task 2 或整个设计结束。Skill 实施时应在触发说明旁提供完整 CLI 模板，并明确 JSON payload 通过 stdin 传入：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/knowledge-query.js register-evidence-record <workspaceRoot> <<'JSON'
<evidence-json>
JSON
```

命令返回的 EV ID只作为后续即时引用句柄，不写入设计模型。

## 6. Decision 准入与维护合同

### 6.1 实质取舍

只有同时满足以下条件的结论才登记 Decision：

1. 存在合理替代方案，或需要明确接受一项残余风险或高成本约束；
2. 不同选择会实质改变设计行为、责任边界、技术契约、实现或测试范围、成本或风险；
3. 用户已经明确确认最终选择。

下列情况属于 Decision：

- 用户接受 Agent 推荐的一个实质方案；
- 用户选择推荐之外的候选方案；
- 用户明确接受一项会影响设计的残余风险或约束。

下列情况不属于 Decision：

- 用户笼统确认一整段设计，但其中没有独立实质取舍；
- 澄清事实、确认术语、普通参数或必然结论；
- 临时理解、尚未确认的建议和开放事项；
- 没有合理替代方案且不会改变重要边界的普通实现细节。

Decision 的 `evidence` 只包含实际支撑该决定的 EV ID。没有知识型 Evidence 时使用空数组，不得为了填充引用而制造 Evidence。

### 6.2 即时登记

用户确认实质取舍后，主会话立即调用 Decision `add`。Skill 实施时在 Task 2 的触发说明旁提供完整 CLI 模板：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-decisions.js add <taskPath> <slug> '<decision-json>'
```

初始化是脚本兼容性策略。Skill 和 Agent 不检查 Decision 文件是否存在，不调用 `init`，也不把初始化写入 Task 1 或任何完成条件。

### 6.3 不可变追加与替代关系

Decision 保持不可变追加模型：

- 已存在记录不原地修改或删除；
- Review、重开或新事实推翻既有决定时，新增一条 Decision；
- 新记录通过可选 `supersedes` 数组引用被替代的 Decision；
- 只是细化既有决定且没有改变原语义时，不使用 `supersedes`；
- 当前有效 Decision 是未被任何后续记录替代的记录。

`supersedes` 的确定性约束：

- 输入为可选字符串数组，缺省为空；
- 目标 ID 必须存在于当前设计类型的 Decision 文档；
- 目标必须是当前仍有效的 Decision；
- 不允许跨设计类型引用；
- 不允许重复目标；
- 一条新 Decision 可以同时替代多条当前有效 Decision；
- 被替代记录不增加 `status`，有效性由追加关系推导。

例如 `SD-DEC-003` 已替代 `SD-DEC-001` 后，后续变更必须替代当前有效的 `SD-DEC-003`，不能再次指向历史记录 `SD-DEC-001`。

## 7. Skill 修改合同

### 7.1 顶层任务 Harness

保持五个顶层任务的数量、顺序和主名称不变，不新增 Evidence/Decision 任务。只增强 Task 2、Task 4 的顶层完成描述：

1. Task 2 继续以“完成并确认核心设计”为主语，并增加：符合准入条件的 Evidence/Decision 已登记，或未解决写入失败已揭示。
2. Task 4 继续以“独立 Review 并修订”为主语，并增加：Review 引入的新知识和新取舍已经按同一合同维护。

Task 1、Task 3 和 Task 5 的顶层含义不变。

### 7.2 全局语义不变量

在 `SKILL.md` 中新增一个短小、共置的 Evidence/Decision 语义区，且只定义一次：

- Evidence 的较窄准入边界；
- Decision 的实质取舍准入边界；
- 只有主会话执行维护；
- 维护是单条原子副作用，不进入设计模型；
- 成功静默，失败揭示；
- Evidence/Decision 不成为任何设计门禁。

该区域不复制 JSON 字段表、`supersedes` 算法、脚本内部初始化或异常恢复机制。

### 7.3 Task 1：恢复专业上下文

Task 1 继续按当前设计目标读取实际相关的既有 Evidence/Decision，并作为事实输入恢复设计上下文。

- 缺少 Decision 文件表示当前尚无记录，不触发 Agent 初始化；
- 不要求创建空 Decision 文件；
- 不把 EV/DEC ID 维护为当前设计模型的新字段；
- Task 1 的完成条件不增加知识容器存在性要求。

### 7.4 Task 2：共置原子维护动作

在“建立当前设计模型”和语义分析循环相关位置加入两个事件触发：

1. `knowledge-query` 候选被主会话采用，并实际支持或改变设计时，立即按第 5 章登记一条 Evidence；
2. 用户确认一个实质取舍时，立即按第 6 章登记一条 Decision。

登记成功后继续当前设计问题，不另行请求用户确认，不单独汇报 ID。登记失败时先根据错误修正输入或调用方式并重试；仍无法成功时，立即说明未持久化内容、失败原因及对后续恢复的影响，然后继续现有设计流程。

Task 2 完成条件增加可检查结论：所有已经触发的维护动作均已成功，或者尚未解决的写入失败已经明确揭示。该条件不要求“必须存在至少一条 Evidence/Decision”，也不以写入成功阻止 Draft。

### 7.5 Task 4：Review 后的语义维护

Reviewer finding 不直接登记 Evidence/Decision：

- finding 只指出 Draft 问题时，沿用现有 Review 修订流程；
- finding 暴露知识缺口时，主会话调查或调用 `knowledge-query`；只有随后被采用的知识结论才登记 Evidence；
- finding 导致用户确认新的实质取舍时，新增 Decision；
- 新取舍推翻既有 Decision 时，通过 `supersedes` 引用被替代的当前有效记录；
- 纯排版、措辞和不改变语义的修订不产生 Evidence/Decision。

Task 4 引用 Task 2 的登记合同和 CLI，不复制完整命令、准入定义或失败处理。

### 7.6 Draft 与发布

Draft、Lint、Review、批准和发布保持现有合同：

- Draft 不新增固定 Evidence/Decision 章节；
- 是否在正文引用重要 EV/DEC ID由当前 Design Spec 和可读性决定；
- 不要求每条持久化记录映射到 Draft；
- Lint 不检查 Evidence/Decision 数量、引用完整性或写入状态；
- Review 不因缺少记录自动失败；
- Approval、Draft hash、Review hash 和 Baseline 发布不绑定知识记录；
- Task 5 不增加 Evidence/Decision 维护动作。

## 8. 脚本兼容性接缝

### 8.1 `add` 自动初始化

修改 `scripts/devsphere-decisions.js`：

- `addDecision(taskPath, slug, input)` 读取 Decision 文档；
- 文件不存在时，从 `taskPath/state.json` 取得 `taskId`，由 `slug` 推导设计类型/阶段名，并在脚本内部初始化空容器；
- 初始化后继续同一次 `add`，对调用方表现为一个原子写入动作；
- 文件存在时保持原内容并正常追加；
- 现有显式 `init` 函数和 CLI 保留，兼容旧调用方和测试，但不再由 `feature-design` 使用。

缺少有效任务状态、未知 `slug` 或输入结构非法时继续明确失败，不在 Skill 中增加兼容分支。

### 8.2 `supersedes` 数据合同

扩展 Decision 输入和持久化结构：

```json
{
  "context": "...",
  "userInput": "...",
  "candidates": ["..."],
  "recommendation": "...",
  "finalDecision": "...",
  "rationale": "...",
  "impact": "...",
  "evidence": ["EV-001"],
  "supersedes": ["SD-DEC-001"]
}
```

- `supersedes` 对输入可选，新记录按空数组归一化；
- 旧记录没有 `supersedes` 时按空数组解释；
- `validateDecisionInput` 继续检查字段形状；
- `addDecision` 在当前文档上下文中检查目标存在、唯一、同设计类型且当前有效；
- 违反替代关系时拒绝追加，不修改现有文档。

不增加 `status`、`active`、`obsolete` 或双向回写字段。

### 8.3 `knowledge-query` 保持不变

现有 `registerEvidenceRecord` 已经验证 topic、summary、source 类型、本地 source marker 和任务级 registry，并支持 `user` source。本次只在 Skill 中补齐主会话调用时机和精确命令，不修改：

- `scripts/knowledge-query.js`；
- `skills/knowledge-query/SKILL.md`；
- Evidence schema、registry 路径或 source 类型。

## 9. 文件修改范围

### 9.1 修改

- `skills/feature-design/SKILL.md`
- `scripts/devsphere-decisions.js`
- `scripts/test/design-knowledge-contracts.test.js`
- `scripts/test/feature-design-skill-contract.test.js`

### 9.2 新增

- `docs/design-refactor/08-feature-design-evidence-decision-maintenance.md`

### 9.3 保持不变

- `skills/feature-design/references/design-guides/**`
- `skills/feature-design/references/specs/**`
- `skills/feature-design/references/review-checklists/**`
- `skills/knowledge-query/**`
- `scripts/knowledge-query.js`
- `scripts/devsphere-design.js`
- Feature Workflow、Approval、Review 和发布脚本

## 10. 测试与验收

### 10.1 Decision 确定性测试

扩展 `scripts/test/design-knowledge-contracts.test.js`：

1. 首次直接调用 `addDecision` 时自动创建 Decision 文档并写入第一条记录；
2. 已存在文档时追加记录且保留原内容；
3. 旧记录缺少 `supersedes` 时仍可读取并视为当前有效；
4. 新输入省略 `supersedes` 时按空数组处理；
5. 可以替代一条或多条当前有效 Decision；
6. 不存在、重复、跨设计类型或已失效目标被拒绝；
7. 被替代记录保持原样，不出现 `status` 或其他双向同步字段；
8. Decision 失败或缺失不进入 Draft、Review、Artifact 和发布判定。

保留现有 Evidence schema 与 main-session ownership 测试，不增加所有事实均须登记的断言。

### 10.2 Skill 合同测试

扩展 `scripts/test/feature-design-skill-contract.test.js`，验证：

- 仍然只有五个顶层任务；
- Task 2/4 的顶层完成描述包含 Evidence/Decision 维护结果；
- 全局语义不变量只出现一个权威定义区；
- Task 2 包含 Evidence 和 Decision 的触发条件及精确 CLI；
- Task 4 明确 Reviewer finding 不直接成为 Evidence，并使用 `supersedes` 处理被推翻取舍；
- Skill 不要求 Agent 初始化 Decision；
- Skill 不把 EV/DEC ID 加入设计模型；
- Skill 不新增 Evidence/Decision 门禁、任务、状态机或 Draft 固定章节。

### 10.3 聚焦 Agent 前向测试

在隔离测试任务中实际运行重构后的 `feature-design`，至少覆盖：

1. `knowledge-query` 返回候选但主会话未采用：不登记 Evidence；
2. 候选被采用并影响设计：静默登记一条 Evidence，继续当前设计讨论；
3. 用户确认实质取舍：静默登记一条 Decision；普通确认不登记；
4. Decision 没有知识型 Evidence 时使用空数组，不制造 Evidence；
5. Reviewer 普通 finding 不登记 Evidence/Decision；
6. Reviewer 促成新调查并采用知识时登记 Evidence；
7. Reviewer 促成用户改变既有取舍时新增 Decision，并 `supersedes` 当前有效旧记录；
8. 整个过程不新增顶层任务、不向用户请求记录确认、不把 ID 加入设计模型；
9. 控制一次写入失败，验证 Agent 先修正重试，仍失败时揭示但不阻断现有设计流程。

前向测试关注真实行为和对话主线。Node 合同测试通过不能替代该验收，也不能把模拟输出表述为真实用户体验验证。

## 11. 完成标准

本次重构只有同时满足以下条件才完成：

- 本规格的文件范围无越界修改；
- Skill 保持五任务主线和完整语义分析循环；
- Evidence/Decision 准入语义集中且没有在 Task 2/4 重复漂移；
- 所有登记动作与实际语义事件共置，并提供精确 CLI；
- Decision `add` 对缺失文件自动兼容初始化；
- `supersedes` 能形成无歧义的不可变追加历史；
- Knowledge Query、Design Guide、Spec、Review、Draft 和发布职责保持不变；
- 全部相关自动化测试通过；
- 聚焦 Agent 前向测试证明维护动作会发生、不过度记录且不破坏设计主线；
- 向用户报告自动化验证和真实前向测试各自证明的范围，不混淆两者。
