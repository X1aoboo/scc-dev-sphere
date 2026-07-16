# V1 实施 Backlog

## 1. 使用方式

本 backlog 用于后续逐项指挥 Codex 或 Claude Code 实现。每个任务都包含背景、目标、范围、设计说明、步骤、验收、测试、风险、依赖和人工确认要求。

## 2. P0：必须先做

### P0-001 Artifact Frontmatter 与 Registry

**背景**：当前 artifact 只有 Markdown 正文，workflow 无法判断版本、hash、依赖和失效。

**目标**：为关键产物增加 frontmatter，并维护 `artifact-registry.json`。

**涉及文件或目录**：`templates/artifacts/`、`scripts/devsphere-artifact.js`、`.devsphere/tasks/.../artifact-registry.json`、`skills/feature-design-*`。

**设计说明**：Markdown frontmatter 保存 artifactId、type、taskId、version、status、ownerAgent、dependsOn、evidenceRefs、decisionRefs。registry 是 workflow 查询入口。

**实现步骤**：

1. 新增 `scripts/devsphere-artifact.js`，支持 init/register/read/update-hash/list。
2. 更新 artifact 模板，加入 frontmatter 占位字段。
3. 修改 `feature-init` 约定初始化空 registry。
4. 修改阶段 Skill 完成标准，要求调用 register/update-hash。
5. 对旧任务无 registry 时提供 lazy init。

**验收标准**：

- 新任务创建后存在 `artifact-registry.json`。
- 生成 business-design 后 registry 有一条 artifact 记录。
- artifact hash 与文件内容一致。
- 缺 frontmatter 时校验失败。

**测试建议**：Node 单元测试覆盖 register/update-hash；手工创建 feature task 验证。

**风险**：frontmatter 修改会影响模板可读性。

**依赖任务**：无。

**是否需要人工确认**：需要，确认 artifact metadata 字段集。

### P0-002 Trace / Workflow Run 数据结构

**背景**：当前无法复盘每次 Agent/Skill 工作。

**目标**：新增 trace event、workflow run、episode 记录。

**涉及文件或目录**：`scripts/devsphere-trace.js`、`skills/workflow/SKILL.md`、`.devsphere/tasks/.../trace/`。

**设计说明**：每次 workflow 计算 nextAction 记录 run；Skill/Agent 工作记录 episode；关键动作写 JSONL event。

**实现步骤**：

1. 新增 `scripts/devsphere-trace.js`，支持 start-run、append-event、end-run、start-episode、end-episode。
2. 更新 `workflow` Skill，在 resolver 前后记录 run。
3. 更新阶段 Skill 完成标准，要求记录 skill_started/artifact_written/gate_executed。
4. Trace 文件路径固定在 task workspace。

**验收标准**：

- `/workflow` 执行后生成 `trace/workflow-runs/WR-*.jsonl`。
- trace 包含 workflow_resolved 事件。
- artifact 写入后可追溯到 episodeId。

**测试建议**：脚本单元测试；快照测试 JSON schema。

**风险**：如果全靠 Skill 记 trace，可能遗漏；后续可由 hooks 补强。

**依赖任务**：P0-001。

**是否需要人工确认**：不需要。

### P0-003 Quality Gate Engine

**背景**：当前章节完整性、证据引用、决策引用主要靠提示词。

**目标**：新增可执行质量门禁。

**涉及文件或目录**：`scripts/devsphere-quality-gate.js`、`quality-gates/`、`docs/governance/quality-gates.md`。

**设计说明**：Gate 校验结构性规则，输出 `quality-gates/QG-*.json`；业务判断保留人工评审。

**实现步骤**：

1. 实现 validate-artifact。
2. 实现 validate-approval。
3. 实现 validate-knowledge-candidate。
4. 输出 gate result 并更新 artifact registry。
5. 将 `sync-stage-status` 改为要求 gate pass 后才能进入正式 review。

**验收标准**：

- 缺 evidenceRefs 的存量事实会 fail。
- 缺必填章节会 fail。
- gate result 写入 `quality-gates/`。
- workflow 能读取 gate 状态。

**测试建议**：fixture artifact 测试 pass/warn/fail。

**风险**：规则过严会阻塞早期试用，先使用最小规则。

**依赖任务**：P0-001。

**是否需要人工确认**：需要，确认首批 gate 规则强度。

### P0-004 Structured Review Issue Model

**背景**：当前 review matrix 只有计数，无法追踪具体 issue。

**目标**：把 blocking/advisory/risk_candidate 结构化。

**涉及文件或目录**：`scripts/devsphere-review-matrix.js`、`reviews/review-matrix.json`、`skills/feature-review/SKILL.md`。

**设计说明**：issue 有 ID、artifactId、version、reviewerAgent、type、status、summary、closedBy、closedAt。

**实现步骤**：

1. 扩展 review matrix schema，兼容旧计数。
2. 新增 add-issue、close-issue、list-open 命令。
3. 更新 `feature-review` 输出要求。
4. `sync-stage-status` 以 open blocking 数量判断。

**验收标准**：

- 可新增 blocking issue。
- 关闭 issue 后计数同步。
- advisory/risk_candidate 必须能列出待确认项。

**测试建议**：matrix CRUD 单元测试。

**风险**：历史 review 文件需要兼容。

**依赖任务**：P0-001。

**是否需要人工确认**：不需要。

### P0-005 Deterministic Feature Design Resolver

**背景**：当前 `resolveDesigning()` 只委托 `feature-design`，子阶段路由仍在提示词。

**目标**：把 business/solution/implementation/test/integrated 的 nextAction 决策下沉到脚本。

**涉及文件或目录**：`scripts/workflows/feature-workflow.js`、`skills/feature-design/SKILL.md`。

**设计说明**：resolver 根据 stage 状态、artifact registry、gate、review issue、mode/humanGateStages 输出具体 Skill 和 agents。

**实现步骤**：

1. 实现 stage ready 判断。
2. 实现 artifact missing -> design Skill。
3. 实现 gate fail -> design revise。
4. 实现 drafted + gate pass -> feature-review。
5. 实现 ai_review_passed + human gate -> human_confirm。
6. 实现 integrated-design 生成/评审。
7. 降级 `feature-design` 为 integrated 生成或兼容入口。

**验收标准**：

- `designing` 状态下 resolver 能输出具体 stage nextAction。
- business-design drafted 且 gate pass 时输出 feature-review target。
- open blocking 时输出原 owner revise。

**测试建议**：fixture state + matrix + registry 的 resolver 单元测试。

**风险**：与现有 Skill 提示词重复，需同步删减提示词。

**依赖任务**：P0-001、P0-003、P0-004。

**是否需要人工确认**：需要，确认 integrated-design 生成策略。

## 3. P1：V1 必须做

### P1-001 Knowledge Candidate Workflow

**背景**：知识查询只有 evidence，没有入库闭环。

**目标**：新增知识候选、审批、入库机制。

**涉及文件或目录**：`docs/knowledge/`、`knowledge-candidates/`、`scripts/devsphere-knowledge.js`、`skills/knowledge-query`。

**实现步骤**：

1. 创建 `docs/knowledge` 目录和 `knowledge-index.json`。
2. 新增 candidate schema。
3. 新增 extract/approve/reject 命令。
4. 更新 SA/SE/TSE Skill，输出候选。
5. 入库时更新 index。

**验收标准**：候选可生成、审批、入库、索引。

**测试建议**：candidate CRUD 和冲突检测测试。

**风险**：审批人身份在 Claude Code 中需要轻量表达。

**依赖任务**：P0-002、P0-003。

**是否需要人工确认**：必须，知识 approve。

### P1-002 Traceability Matrix

**背景**：需求到设计、实现、测试、验证的关系缺少机器可读矩阵。

**目标**：新增 `traceability-matrix.json`。

**涉及文件或目录**：`scripts/devsphere-traceability.js`、artifact templates。

**实现步骤**：

1. 定义 requirement/design/implementation/test/verification link schema。
2. 从 artifact frontmatter 和正文标记抽取 link。
3. quality gate 校验关键 requirement 都有 test/verification。
4. integrated-design 展示 trace 摘要。

**验收标准**：每个业务规则至少映射到方案或测试项。

**测试建议**：fixture link extraction。

**风险**：Markdown 抽取不稳定，先以显式 ID 表格为准。

**依赖任务**：P0-001、P0-003。

**是否需要人工确认**：不需要。

### P1-003 Plugin DT Test Suite

**背景**：当前没有插件自身测试和回归。

**目标**：建立最小 DT 测试。

**涉及文件或目录**：`tests/plugin-dt/`、`scripts/`。

**实现步骤**：

1. 新增 test plan/cases。
2. 用临时 workspace 测试 task 创建。
3. 测试 guard：未批准不能 implement。
4. 测试 resolver 主路径。
5. 输出 DT report。

**验收标准**：本地一条命令可跑核心脚本测试。

**测试建议**：Node 内置 `node:test`，避免引入依赖。

**风险**：无 package.json，需决定是否新增。

**依赖任务**：P0-005。

**是否需要人工确认**：需要，确认是否允许新增 `package.json`；默认不新增。

### P1-004 Approval Hash Lock

**背景**：批准记录需要锁定 artifact version/hash。

**目标**：增强 `design-final-approval.json` 校验。

**涉及文件或目录**：`scripts/devsphere-approval.js`、`skills/feature-approve`。

**实现步骤**：

1. approval 写入 artifactId/version/hash。
2. validate-approval 校验 hash 未变。
3. artifact 被修改后 approval 标记 stale。
4. workflow 发现 stale 回到 designing。

**验收标准**：批准后改 artifact，implement gate 失败。

**测试建议**：hash lock 单元测试。

**风险**：旧批准记录需兼容。

**依赖任务**：P0-001、P0-003。

**是否需要人工确认**：不需要。

## 4. P2：增强能力

### P2-001 Release / Operations Readiness

**目标**：新增发布设计和运维就绪模板与 gate。

**涉及文件或目录**：`templates/release/`、`templates/operations/`、`skills/release-design`、`skills/operational-readiness`。

**验收标准**：涉及配置/部署风险时 workflow 追加 CIE review 和 release checklist。

**依赖任务**：P0-005、P1-003。

**是否需要人工确认**：高风险必须。

### P2-002 Code Review Workflow

**目标**：新增代码评审 Skill 和 review issue gate。

**涉及文件或目录**：`skills/feature-review-code`、`reviews/code-review/`。

**验收标准**：diff 与 implementation-plan 偏差能被记录并要求人工确认。

**依赖任务**：P0-004、P1-004。

**是否需要人工确认**：范围偏差需要。

### P2-003 Repository Evidence Generator

**目标**：生成轻量 repo evidence / repo map。

**涉及文件或目录**：`scripts/devsphere-repo-evidence.js`、`evidence/repository/`。

**验收标准**：能输出文件、符号、测试命令和调用线索，不复制大段源码。

**依赖任务**：P0-001。

**是否需要人工确认**：不需要。

## 5. P3：长期演进

### P3-001 New TaskType Resolvers

**目标**：新增 bugfix/refactor/performance resolver。

**验收标准**：每个 taskType 有独立 state schema、artifact types、gate。

**依赖任务**：P1 全部。

**是否需要人工确认**：需要。

### P3-002 Metrics Dashboard

**目标**：基于 trace 输出指标摘要。

**验收标准**：能统计成功率、返工率、知识命中率、失败分类。

**依赖任务**：P0-002。

**是否需要人工确认**：不需要。

### P3-003 External Knowledge / CI MCP

**目标**：对接外部知识库、需求系统、CI/CD。

**验收标准**：MCP 查询结果能保存 evidence snapshot。

**依赖任务**：P1-001、P2-001。

**是否需要人工确认**：需要，涉及外部系统权限。

