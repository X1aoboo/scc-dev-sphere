# Agent / Skill / Template 优化实施 Backlog

## P0：先消除职责边界和质量约束风险

### P0-AST-001：修复 `feature-design` 子编排派发契约 ✅ 已完成 (2026-07-08)

> **状态**: ✅ 已完成。`feature-workflow.js` assessed 分支 `agents: ['sa']` → `[]`；workflow/SKILL.md 经核查已一致（无需改动）。通过 `resolveNextAction` 单元验证（assessed/designing → agents=[]，initialized 仍保留 sa）。

**背景**：`skills/feature-design/SKILL.md` 声明子编排器在 main session 运行、不调用 Agent；但 `scripts/workflows/feature-workflow.js` 在 `assessed` 状态返回 `agents: ['sa']`。  
**目标**：保证 `feature-design` 永远不被错误派发为 SA Agent 任务。  
**涉及文件**：`scripts/workflows/feature-workflow.js`、`skills/workflow/SKILL.md`、`skills/feature-design/SKILL.md`、相关测试或脚本 fixture。  
**修改内容**：将 `assessed -> feature-design` 的 nextAction `agents` 改为空数组，或直接把设计子阶段路由下沉到 resolver。  
**实现步骤**：
1. 为 `resolveNextAction(status=assessed)` 写最小脚本测试。
2. 验证当前输出包含 `agents: ['sa']`。
3. 修改 resolver。
4. 更新 `workflow/SKILL.md` 的执行说明。
5. 运行脚本测试。
**验收标准**：`feature-design` nextAction 的 `agents` 始终为空；单 Agent 设计任务只由子编排结果派发。  
**测试建议**：`node scripts/devsphere-workflow.js <fixture-workspace>`。  
**风险**：若 workflow Skill 依赖旧行为，需要同步文档。  
**依赖任务**：无。  
**是否需要人工确认**：不需要。  
**建议子 Prompt**：`修复 feature-design 子编排派发契约，只修改 resolver 和相关 skill 文档，保证 feature-design 在 main session 执行，补最小验证命令。`

### P0-AST-002：建立 Artifact Frontmatter 与 Registry 字段集 ✅ 已完成 (2026-07-08)

> **状态**: ✅ 已完成（**按 YAGNI 精简**：12 字段 → 2 字段）。仅保留 `artifactId` + `version`；`status/ownerAgent/dependsOn/artifactType/taskId` 与所有 `*Refs` 因与 state.json/正文/文件名重复而裁掉（`status` 复制到 frontmatter 会与 state.json 双写）。5 个模板已加 2 字段 frontmatter；新增 `docs/governance/artifact-registry-contract.md`（含未来扩展字段与 registry 示例，**未实现脚本**）。验收标准已据此修订。

**背景**

### P0-AST-003：重构设计 Skill 为可执行契约 ✅ 已完成 (2026-07-08)

> **状态**: ✅ 已完成。4 个 feature-design-* Skill 按 12 节统一骨架重写（前置条件/输入与写入范围/执行步骤/专业方法与图示/Evidence-Decision-Assumption/质量门禁/失败处理/修订模式/下游交接契约/完成标准/禁止事项）。修复步骤编号跳号；`写入范围` 显式纳入 evidence（解决"只写 artifact/decision"冲突）；完成标准不再只是"文档已生成"；gate 前向引用 design-template-check/design-quality-gate（AST-005 引入，标注未就绪时跳过以保 MVP）。暂不拆 references（YAGNI）。req 11–14 关键词覆盖校验通过。

**背景**：当前设计 Skill 多为阶段说明，步骤偏薄且约束冲突。  
**目标**：将 `feature-design-business/solution/implementation/test` 升级为专业设计动作契约。  
**涉及文件**：`skills/feature-design-business/SKILL.md`、`skills/feature-design-solution/SKILL.md`、`skills/feature-design-implementation/SKILL.md`、`skills/feature-design-test/SKILL.md`。  
**修改内容**：增加前置条件、允许写入范围、专业动作、evidence/decision/assumption、质量门禁、失败处理、修订模式、下游交接。  
**实现步骤**：
1. 先统一章节骨架。
2. 逐个 Skill 加专业动作。
3. 修复步骤编号跳号。
4. 移除“只写 artifact/decision”与 evidence 写入冲突。
5. 用 `rg` 检查入口和完成标准。
**验收标准**：4 个 Skill 均具备完整契约；不再只有“按模板生成”。  
**测试建议**：`rg -n "^## 前置条件|^## 失败处理|^## 下游交接契约" skills/feature-design-*`。  
**风险**：Skill 过长；可用 references 渐进披露。  
**依赖任务**：P0-AST-002。  
**是否需要人工确认**：需要确认是否拆 references。  
**建议子 Prompt**：`按 docs/design/target-skill-model.md 重写四个 feature-design-* Skill 的执行契约，禁止修改模板和脚本。`

### P0-AST-004：结构化 Review Issue 与 Review Matrix ✅ 已完成 (2026-07-08)

> **状态**: ✅ 已完成。matrix 每 artifact 新增 `issuesList`（**7 字段状态索引**：id/type/reviewerAgent/status/round/humanDecision/closureEvidence，**不含叙述**——叙述留在 review .md，用 id 关联）。`issues.{blocking,advisory,risk_candidate}` 改为**派生计数**（recomputeCounts），现有消费者（hasBlocking / sync-stage-status / approval）零改动。新增 CLI `add`/`list`/`close`/`set-status` + 函数 addIssue/closeIssue/listIssues/setArtifactStatus/getPendingHumanDecisions。"advisory/risk 不能无人工决策进入 approval" 由 `set-status` 内置门禁确定性强制（blocking>0 或待决策时拒绝设为 reviewed；未碰 approval.js）。review-template 加 Round/Closure Evidence 并标注 matrix 为事实源；feature-review 重写为多角色结构化评审 + 修订闭环 + 人工确认触发。

**背景**：`review-matrix.json` 当前只有计数，无法追踪 issue、round、owner、closure。  
**目标**：建立 blocking/advisory/risk_candidate 的结构化模型。  
**涉及文件**：`templates/reviews/review-template.md`、`skills/feature-review/SKILL.md`、`scripts/devsphere-review-matrix.js`。  
**修改内容**：增加 issue ID、artifactId、version、reviewerAgent、type、status、round、expectedFix、humanDecision、closureEvidence。  
**实现步骤**：
1. 更新 review template。
2. 更新 feature-review 契约。
3. 扩展 review matrix schema，保留旧计数兼容。
4. 新增 add/list/close issue 命令。
5. 添加脚本测试。
**验收标准**：review matrix 可列出 open blocking；advisory/risk 不能无人工决策进入 approval。  
**测试建议**：`node scripts/devsphere-review-matrix.js init <task>` 后执行新增命令。  
**风险**：schema 迁移；需兼容旧任务。  
**依赖任务**：P0-AST-002。  
**是否需要人工确认**：确认 issue 字段。  
**建议子 Prompt**：`实现结构化 review issue model，兼容旧 review matrix 计数，更新模板和 feature-review 文档。`

### P0-AST-005：落地 Design Template Check 与 Quality Gate 结果模型 ✅ 已完成 (2026-07-08)

> **状态**: ✅ 已完成。新增 `skills/design-template-check`（结构门禁→`quality-gates/TPL-*.json`）与 `skills/design-quality-gate`（内容/追溯门禁→`quality-gates/QG-*.json`），统一 QG 结果 JSON schema 写入 `docs/governance/design-quality-gates.md` §5–§7。fail 强度 = catalog §3 已有失败条件（不新增更严 fail）。4 个 feature-design-* 的 gate 前向引用已闭环（"未就绪时跳过" → 实际 skill 名）。**未实现脚本**（按 sub-prompt，P0 由 AI 按 Skill 契约执行）。
>
> **新发现风险（catalog 与 target-model 不一致）**：`docs/design/target-design-template-model.md` 章节表引用了 `QG-SD-003/ID-003/DIA-001/RISK-001/002/TD-003/004` 等 gate，但 `docs/governance/design-quality-gates.md` §3 catalog **未枚举**这些 gate（无 fail 条件）。design-quality-gate 当前仅执行 catalog 已定义的 gate，缺定义的按章节标准 warn 提示。**建议 P1 补齐 catalog**（或与 target-model 对齐），再升级为 fail。

**背景**：质量门禁目前主要是文档设计，未形成可执行结果。  
**目标**：先定义并落盘 gate result schema，再逐步实现校验。  
**涉及文件**：新增 `skills/design-template-check/SKILL.md`、`skills/design-quality-gate/SKILL.md`、`docs/governance/design-quality-gates.md`、后续 `scripts/devsphere-quality-gate.js`。  
**修改内容**：新增两个 Skill 契约，输出 `quality-gates/QG-*.json`，状态为 `pass/warn/fail/requires_human`。  
**实现步骤**：
1. 新增 Skill 文档。
2. 定义统一 QG JSON。
3. 在设计 Skill 完成标准中引用 gate。
4. 后续实现脚本最小规则。
**验收标准**：所有设计阶段都有 gate 调用点；QG 输出路径统一。  
**测试建议**：文档阶段用 `rg -n "design-quality-gate|quality-gates/QG" skills docs`。  
**风险**：规则过严阻塞流程；先 warn 后 fail。  
**依赖任务**：P0-AST-003。  
**是否需要人工确认**：需要确认首批 fail 规则强度。  
**建议子 Prompt**：`新增 design-template-check 和 design-quality-gate Skill 文档，定义 QG JSON schema，不实现脚本。`

## P1：V1 必须做

### P1-AST-006：升级五类设计模板 ✅ 已完成 (2026-07-08)

> **状态**: ✅ 已完成。5 个 `templates/artifacts/*.md` 按 `target-design-template-model.md` §2–6 重写为**中文标题**结构骨架（保留 AST-002 frontmatter）。每节：中文标题 + EN gloss + Gate ID（仅引用 catalog 已定义的 gate）+ 一行"写什么" + ID 占位表（REQ/BR/NFR/EV/DEC/ASM/RISK/API/MOD/TEST/AC）+ 依据行。采用**精益密度**：质量标准经 Gate ID 关联、常见错误留在 model doc（避免三处漂移）。章节显著扩充（business 10→15、solution 11→14、implementation 8→13、test 8→11、integrated 7→11）。req 17（4+1+C4）、18（时序/数据流/状态机/错误/并发/事务/可测试/回滚）、19（追溯/金字塔/回归/不可测/转测）、20（跨阶段一致性/风险汇总/门禁结论）全覆盖。

**背景**：模板缺专业章节和章节质量标准。
**目标**：将 business/solution/implementation/test/integrated 模板升级为可追溯专业模板。  
**涉及文件**：`templates/artifacts/*.md`。  
**修改内容**：引入 REQ/BR/API/MOD/TEST/RISK/EV/DEC/ASM ID、C4、4+1、质量属性、RTM、交接契约。  
**验收标准**：每个模板有“写什么/质量标准/证据要求/常见错误/下游用途”。  
**测试建议**：doc-lint 检查必填章节。  
**风险**：模板变长；可保留紧凑表格。  
**依赖任务**：P0-AST-002、P0-AST-005。  
**人工确认**：确认模板语言中英文策略。  
**建议子 Prompt**：`按 docs/design/target-design-template-model.md 升级 templates/artifacts/*.md，保持为模板，不填具体业务内容。`

### P1-AST-007：统一 Agent 文档结构

**背景**：Agent 偏岗位简介，缺越权边界。  
**目标**：SA/SE/MDE/TSE/DEV/CIE 具备统一输入、输出、评审、禁止事项和自检清单。  
**涉及文件**：`agents/*.md`。  
**验收标准**：每个 Agent 有输入/输出/禁止事项/评审视角/质量责任。  
**测试建议**：`rg -n "## 禁止事项|## 质量责任|## 自检清单" agents`。  
**风险**：Agent 过长；只保留职责，不写方法论。  
**依赖任务**：P0-AST-003。  
**人工确认**：确认 MDE 名称。  
**建议子 Prompt**：`按 docs/proposals/optimized-agents-draft.md 更新 agents/*.md，不改 frontmatter name。`

### P1-AST-008：修正人工交互规范漂移

**背景**：`feature-implement` 仍写纯文本 YES。  
**目标**：高风险选择统一 AskUserQuestion `confirm_gate`。  
**涉及文件**：`references/interaction-guidelines.md`、`skills/feature-implement/SKILL.md`、`skills/feature-approve/SKILL.md`、`skills/feature-review/SKILL.md`。  
**验收标准**：`rg -n "输入 YES|等待用户明确输入" skills references` 无不合规命中。  
**依赖任务**：P0-AST-003。  
**人工确认**：确认是否保留 emoji label。  
**建议子 Prompt**：`统一高风险人工确认写法，移除纯文本 YES 闸口，全部引用 interaction-guidelines.md。`

### P1-AST-009：实现最小文档/模板 lint

**背景**：缺自动检查，后续优化容易回退。  
**目标**：新增 `scripts/devsphere-doc-lint.js`，检查 frontmatter、必填章节、禁用短语、死链。  
**涉及文件**：`scripts/devsphere-doc-lint.js`、`CLAUDE.md`。  
**验收标准**：脚本可运行，失败退出码 1。  
**依赖任务**：P1-AST-006。  
**人工确认**：确认允许新增脚本。  
**建议子 Prompt**：`新增文档 lint 脚本，只用 Node 内置模块，先检查结构，不做语义判断。`

## P2：增强能力

### P2-AST-010：知识候选与审批入库闭环

**目标**：从 Q&A、decision、design 中提取 knowledge candidates，人工审批后进入 `docs/knowledge`。  
**涉及文件**：`skills/knowledge-query/SKILL.md`、新增 `skills/knowledge-extract/SKILL.md`、`docs/design/knowledge-evolution-loop.md`。  
**依赖任务**：P0-AST-002、P0-AST-005。  
**建议子 Prompt**：`设计 knowledge candidate schema 和 knowledge-extract Skill，不自动写入长期知识库。`

### P2-AST-011：CIE 发布与运维就绪模板

**目标**：为配置、迁移、CI/CD、发布风险提供 CIE 输出闭环。  
**涉及文件**：新增 `templates/release/release-readiness.md`、`skills/release-readiness/SKILL.md`。  
**依赖任务**：P1-AST-006。  
**建议子 Prompt**：`新增 release-readiness 模板和 Skill 草案，CIE 按风险触发，不进入默认主链。`

### P2-AST-012：示例 Feature 产物 Fixture

**目标**：提供一套最小完整示例，验证模板可用性。  
**涉及文件**：`docs/examples/feature-task-minimal/**`。  
**依赖任务**：P1-AST-006、P1-AST-009。  
**建议子 Prompt**：`创建 docs/examples/feature-task-minimal，填一套完整但小型的设计产物示例。`

## P3：长期演进

### P3-AST-013：Agentic SDLC 指标与评估

**目标**：基于 trace、gate、review、verification 统计成功率、返工率、缺口类型和知识命中率。  
**涉及文件**：`docs/design/traceability-observability.md`、新增 metrics 脚本。  
**依赖任务**：P0-AST-002、P0-AST-005、P1-AST-009。  
**建议子 Prompt**：`设计并实现最小 metrics 脚本，从 trace/gate/review 中输出 Agentic SDLC 指标。`

### P3-AST-014：多 taskType Golden Path

**目标**：在 feature 之外扩展 bugfix、refactor、release、ops taskType。  
**涉及文件**：`scripts/workflows/*`、`skills/*`、`templates/*`。  
**依赖任务**：P3-AST-013。  
**建议子 Prompt**：`基于 feature workflow 模式设计 bugfix/refactor/release 的 taskType 扩展方案，先写 docs 不实现。`

