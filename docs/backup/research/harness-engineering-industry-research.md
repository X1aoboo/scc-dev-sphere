# Harness Engineering 业界调研与对标

## 1. 调研结论摘要

本次调研用于校准 `scc-dev-sphere` 从 MVP 走向 V1 的架构方向。核心结论是：Agentic SDLC 不是把更多角色提示词串起来，而是把软件研发活动改造成可被 Agent 理解、执行、校验和复盘的工程系统。真正可落地的机制通常包含五类能力：

1. **结构化产物**：需求、设计、计划、测试、发布和知识更新都必须成为版本化产物。
2. **确定性 harness**：状态机、脚本、hook、lint、质量门禁负责约束 Agent，而不是依赖 Agent 自觉。
3. **渐进式上下文**：短入口、索引、repo-local docs、skills、evidence snapshot 共同避免一次性塞入大上下文。
4. **可观测反馈回路**：trace、测试、日志、评审和失败原因都要可查询，才能持续改进 Agent 与 Skill。
5. **人类判断上移**：人不再逐字编写或审查所有输出，而是定义目标、验收标准、风险接受和治理边界。

对 `scc-dev-sphere` 的直接启发是：V1 不应急于新增大量 Agent，而应优先补强 artifact registry、trace registry、quality gate、knowledge candidate flow 和 resolver 校验能力。

## 2. 来源索引

| 来源 | 链接 | 主要用途 |
|---|---|---|
| OpenAI Harness Engineering | https://openai.com/index/harness-engineering/ | Agent-first 工程环境、repo 知识系统、可观测反馈、架构约束 |
| OpenAI Codex Skills | https://developers.openai.com/codex/skills | Skill 的 progressive disclosure、插件分发、可复用工作流 |
| OpenAI Codex Workflows | https://developers.openai.com/codex/workflows | Codex 工作流需要明确上下文、步骤和 verification |
| OpenAI AGENTS.md | https://developers.openai.com/codex/guides/agents-md | repo-local 指令链、项目上下文发现 |
| Anthropic Agent Skills | https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills | Skill 作为指令、脚本、资源的可组合能力包 |
| Claude Code Features | https://code.claude.com/docs/en/features-overview | Skill、Subagent、Hook、Plugin 的职责边界 |
| Claude Code Hooks | https://code.claude.com/docs/en/hooks-guide | Hook 提供确定性控制和自动化 |
| Thoughtworks Agentic SDLC | https://www.thoughtworks.com/en-us/insights/articles/preparing-your-team-for-agentic-software-development-life-cycle | 组织、治理、知识网络与多 Agent 工作模型 |
| DORA Platform Engineering | https://dora.dev/capabilities/platform-engineering/ | 平台作为 AI 速度的治理与分发层 |
| Martin Fowler SDD | https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html | Spec/Plan/Tasks 与 checklist 驱动的 AI 开发 |
| SWE-agent Paper | https://proceedings.neurips.cc/paper_files/paper/2024/file/5a7c947568c1b1328ccc5230172e1e7c-Paper-Conference.pdf | Agent-Computer Interface、LM 友好工具与反馈格式 |
| OpenHands Paper | https://arxiv.org/abs/2407.16741 | 沙箱、agent coordination、benchmark/evaluation |
| Aider Repository Map | https://aider.chat/docs/repomap.html | 精简代码库地图与上下文预算 |
| ADR 经典文 | https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions | 架构决策记录的动机和格式 |
| Google SRE PRR | https://sre.google/sre-book/evolving-sre-engagement-model/ | 生产就绪评审和早期介入 |

## 3. 业界案例对标

### 3.1 OpenAI Harness Engineering / Codex Agent-first Engineering

**核心做法**

OpenAI 的 harness engineering 实践强调：人类设计环境、约束和反馈回路，Agent 执行具体工程任务。仓库知识被当成 system of record，`AGENTS.md` 只做地图，深层规范进入结构化 `docs/`。代码、测试、CI、文档、observability 都对 Agent 可见。架构一致性通过 custom lint、结构测试和可执行规则维护，而不是靠口头约定。

**解决的问题**

解决了高吞吐 Agent 生成代码后的上下文漂移、架构腐化、人类 QA 瓶颈和知识不可见问题。失败不被解释为“模型不努力”，而被解释为 harness 缺少能力、约束或反馈信号。

**对 scc-dev-sphere 的启发**

`scc-dev-sphere` 当前已经有 `.devsphere` 工作区、状态文件、review matrix 和 approval 记录，但 repo-local knowledge system、质量 lint、trace 和可观测反馈不足。V1 应把 docs/knowledge/workflows/templates 设计成 Agent 可读的系统记录，而不是静态说明。

**可落地机制**

- 将 `artifacts/*` 增加 frontmatter：artifactId、type、version、status、owner、dependsOn、evidenceRefs、decisionRefs。
- 增加 `artifact-registry.json` 和 `trace/workflow-runs/*.jsonl`。
- 增加 `scripts/devsphere-quality-gate.js` 校验 artifact、evidence、decision、review、approval 的一致性。
- 增加 `docs/index.md` 或 `docs/knowledge/index.md` 作为短入口，而不是扩写 `CLAUDE.md`。

**不适合照搬的部分**

OpenAI 实践依赖强平台、可观测栈、CI 和大量 agent-generated tooling。`scc-dev-sphere` 是 Claude Code 插件，不能假设有自建 runtime、云端 agent 调度或完整 observability stack。V1 只应先做本地文件、脚本和 hook 层面的可追溯。

### 3.2 Claude Code / Anthropic Skills 与插件机制

**核心做法**

Claude Code 的扩展机制把能力拆成 Skills、Subagents、Hooks、MCP 和 Plugins。官方文档明确：Skill 是可复用的知识、工作流和指令；Subagent 用于隔离上下文和并行工作；Hook 用于确定性事件自动化；Plugin 是打包分发层。Anthropic 的 Agent Skills 强调 progressive disclosure：先加载 metadata，需要时再读 `SKILL.md` 和引用文件；确定性任务可以放进脚本。

**解决的问题**

避免把所有知识塞进 always-on prompt；避免把确定性控制交给模型；避免每个任务都重复粘贴流程。

**对 scc-dev-sphere 的启发**

当前 `scc-dev-sphere` 的 `skills/`、`agents/`、`hooks/` 已符合插件形态，但 Skill 中仍承担较多流程语义，脚本层校验偏轻。V1 应明确：Agent 是职责视角，Skill 是工作方法，Docs 是事实源，Hook/Script 是确定性 harness。

**可落地机制**

- Skill 文件只保留触发、输入、输出、执行规则、失败处理，不写跨阶段全局状态推理。
- 子阶段 routing 从 `feature-design` 提示词逐步下沉到 deterministic resolver。
- Hook 只做准入、登记、校验和索引更新，不生成语义内容。
- 对长参考文档采用 `docs/index.md -> deeper docs` 的 progressive disclosure。

**不适合照搬的部分**

不能把 Claude Code 的 subagent/agent team 当成稳定脚本级 runtime。当前仓库应继续坚持 `scripts/workflows/feature-workflow.js` 输出 nextAction，`workflow` Skill 在会话中引导执行。

### 3.3 Thoughtworks Agentic SDLC

**核心做法**

Thoughtworks 强调 Agentic SDLC 是组织、流程、治理和知识网络的变化，而不只是工具替换。Agent 被视为混合劳动力的一部分，必须嵌入迭代、评审、测试、治理等成熟生命周期；共享记忆和知识网络是关键能力。

**解决的问题**

避免 AI 工具只在编码环节提速，却把瓶颈转移到需求、治理、测试、发布和组织协作。

**对 scc-dev-sphere 的启发**

`scc-dev-sphere` 不应只做“需求到代码”的长链提示，而要覆盖需求发现、知识萃取、架构、实现、测试、发布、运维和复盘。当前 MVP 到 V1 的重点应是 SDLC stage model，而不是新增更多代码生成能力。

**可落地机制**

- 引入 `workflow-stage` 通用模型：goal、input、output、gate、state transition、human confirmation。
- 为需求发现和复盘增加知识候选产物：`knowledge-candidates/*.jsonl`。
- 增加 release/operations readiness 的模板和质量门禁。

**不适合照搬的部分**

Thoughtworks 面向组织转型和企业平台，范围很大。`scc-dev-sphere` V1 应先做单仓库/单任务工作区内的可审计闭环，不直接建设企业知识网络或集中式平台。

### 3.4 Platform Engineering / Internal Developer Platform / Golden Path

**核心做法**

DORA 和平台工程实践把平台视为内部产品，通过高质量工具链、workflow 和 golden path 降低认知负担、提高安全合规和交付一致性。AI 会放大组织已有能力，也会放大下游混乱；平台质量低时，AI 提速会被测试、安全、部署瓶颈抵消。

**解决的问题**

把个体效率转化为系统吞吐，避免每个团队各自发明流程和治理。

**对 scc-dev-sphere 的启发**

插件本质上是研发活动的 lightweight IDP/golden path：它不替代业务仓库，而是提供可复用流程、产物契约、质量门禁和状态管理。

**可落地机制**

- 把 feature workflow 定义为第一个 golden path。
- 新增 bugfix/refactor/performance 只通过新 resolver 和新 artifact schema 扩展，不复制整套提示词。
- backlog 按 P0/P1/P2/P3 建设平台能力，而不是一次性覆盖所有 SDLC 细节。

**不适合照搬的部分**

传统 IDP 常依赖门户、服务目录、Kubernetes、CI/CD。当前插件不应建设重平台；应先用文件系统、脚本和 Markdown/JSON 达成最小可治理。

### 3.5 Spec-driven Development / GitHub Spec Kit / Kiro

**核心做法**

SDD 倾向于先写 specification，再把 plan、tasks、implementation 建立在 spec 之上。Martin Fowler 对比的工具中，Spec Kit 使用 Constitution、Specify、Plan、Tasks，并通过 workspace 内文件和 checklist 驱动 AI 协作。

**解决的问题**

减少“vibe coding”的不可控性，让 AI 和人类围绕同一组产物协作。checklist 不是绝对机器保证，但能形成清晰的完成标准。

**对 scc-dev-sphere 的启发**

当前 feature workflow 已有 business/solution/implementation/test/integrated design，但缺少统一 artifact schema、checklist 结果、需求到任务的可追溯矩阵。V1 应补齐 spec repository 能力。

**可落地机制**

- 每个 artifact 模板增加 `Quality Checklist` 和 `Trace Links`。
- 增加 `traceability-matrix.json`：requirement -> design -> implementation unit -> test -> verification。
- 任务拆解必须引用已批准 artifactId/version。

**不适合照搬的部分**

不要把 Constitution 设计成巨大的 always-on 规则文件。更适合使用短 `docs/index.md`、ADR、quality gates 和可执行脚本分散承载。

### 3.6 SWE-agent / Agent-Computer Interface

**核心做法**

SWE-agent 的研究表明，Agent 不只是需要更强模型，也需要 LM-friendly interface：小而明确的命令、可解释反馈、搜索/编辑/测试工具和 guardrails。界面设计会影响 Agent 表现。

**解决的问题**

原始 shell 对 Agent 太低层、反馈不友好，容易造成错误编辑和无效探索。

**对 scc-dev-sphere 的启发**

`devsphere-*` scripts 应成为 Agent-friendly interface。当前脚本只覆盖状态读写和少量 guard，V1 应扩展为可查询、可校验、可解释的工具集。

**可落地机制**

- `devsphere status --json` 输出当前 gate、nextAction、blocking reasons。
- `devsphere validate-artifact <path>` 给出明确错误和修复建议。
- `devsphere trace append-event` 统一记录 Agent 动作。

**不适合照搬的部分**

不需要自建完整 ACI 或替换 Claude Code 工具。只需在插件范围内提供稳定命令和反馈格式。

### 3.7 OpenHands

**核心做法**

OpenHands 关注通用软件开发 Agent 平台：写代码、命令行、浏览器、沙箱、多 Agent 协调和 benchmark/evaluation。

**解决的问题**

提供安全执行环境、可扩展 Agent、评估基准和多任务运行能力。

**对 scc-dev-sphere 的启发**

V1 应为未来评估和回放留出结构：trace、episode、workflow run、成功率、失败模式、上下文缺失、知识命中率。

**可落地机制**

- 每次 workflow 推进生成 `workflowRunId`。
- 每个 Agent/Skill 工作片段生成 episode。
- 质量门禁和失败原因进入指标字段。

**不适合照搬的部分**

OpenHands 是平台和 SDK，`scc-dev-sphere` 是插件包。不要引入自建沙箱、agent executor 或 benchmark runner 作为 V1 前置。

### 3.8 Aider Repository Map

**核心做法**

Aider 用 repository map 把代码库压缩成关键文件、类、函数和调用关系，再根据 token 预算提供最相关片段。

**解决的问题**

避免 AI 在大仓库中盲读或过度加载上下文。

**对 scc-dev-sphere 的启发**

MDE/DEV 阶段不应要求 Agent 全量读仓库，而应生成 repository evidence snapshot 和轻量 index。

**可落地机制**

- `evidence/repository/` 中保存文件路径、符号、调用关系、测试命令，不复制大段源码。
- 后续可增加 `repo-map.json`，由脚本基于 `rg`、语言工具或 LSP 生成。

**不适合照搬的部分**

无需在 V1 实现复杂 graph ranking。先做手工/脚本生成的轻量 repository evidence 即可。

### 3.9 ADR / Traceability / PRR

**核心做法**

ADR 用短文档记录重大架构决策的 context、decision、status、consequence。Traceability 用矩阵或关系图追踪 requirement 到 design、code、test、verification。Google SRE 的 PRR 在服务生命周期中系统评估可靠性、架构、监控、容量、变更和应急响应。

**解决的问题**

防止团队忘记为什么这么做；防止需求、设计、测试、发布割裂；防止发布前才发现运维风险。

**对 scc-dev-sphere 的启发**

V1 的治理体系应从“最终人工批准”扩展为阶段化 quality gates，并在发布/运维设计阶段引入 ORR/PRR 风格检查。

**可落地机制**

- `traceability-matrix.json` 和 Mermaid trace graph。
- `quality-gates.md` 定义每个阶段通过/警告/失败条件。
- 发布设计必须包含 rollback、observability、config、migration、SLO/alert、runbook。

**不适合照搬的部分**

不要复制安全关键系统级 RTM 或完整 SRE PRR。V1 使用 lightweight traceability 和 checklist gate。

## 4. 转化为 scc-dev-sphere 的设计原则

1. **Agent 不拥有流程推进权**：流程推进权属于 resolver、state、artifact registry 和 quality gate。
2. **Skill 不声明成功，产物和校验声明成功**：Skill 生成产物，脚本校验产物和状态。
3. **Docs 是系统记录，不是说明书**：docs 必须可索引、可引用、可过期、可校验。
4. **每个阶段必须有输入、输出、门禁和失败处理**：没有这些字段的阶段不能进入 V1 workflow。
5. **知识入库必须先候选后审批**：Agent 不直接把中间结论写入主知识库。
6. **Trace 是一等产物**：每次用户输入、Agent 决策、Skill 使用、Doc 读取、产物生成、校验结果都要记录。
7. **Hook 只做确定性控制**：不把业务判断、风险接受、方案选择放进 Hook。
8. **先做 feature golden path，再横向扩展 SDLC**：V1 优先打牢 feature 流程，bugfix/refactor/performance 作为后续 resolver 扩展。

