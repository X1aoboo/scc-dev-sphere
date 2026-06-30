# scc-dev-sphere PRD

## 1. 产品定位

`scc-dev-sphere` 是一个面向 Claude Code 的软件开发流程插件，目标是把团队现有的需求开发协作流程转化为可审计、可控制、可渐进自动化的 AI 辅助工作流。

插件不自建 Agent runtime，而是基于 Claude Code plugin 支持的 `skills`、`agents/custom subagents`、`hooks`、脚本和 MCP 配置组合实现。

MVP 聚焦 **需求从设计到代码落地**：

```text
需求输入 -> 业务设计与评审 -> 方案设计与评审 -> 实现/测试设计与评审 -> 集成一致性评审 -> 人工最终批准 -> 开发执行计划 -> 代码落地 -> 转测包
```

需求开发既包括全新需求，也包括存量能力调整、功能扩展、功能替换或废弃。所有这类场景统一作为 feature task 复用同一套需求开发工作流，不引入父任务/子任务流程分支。问题修改、重构、性能优化等流程在 MVP 中只预留任务类型和工作区扩展骨架，不作为第一版完整闭环。

## 2. 目标用户

- SA：业务分析师，关注业务流程、业务规则、需求边界。
- SE：软件系统设计师，关注系统方案、架构一致性、接口契约。
- MDE：模块开发 Owner，关注模块实现方案、影响面、功能点拆解。
- DEV：开发工程师，关注代码实现、本地验证、开发风险反馈；默认作为统一开发责任角色，按需启用前端/后端专项上下文。
- TEST：测试工程师，关注测试策略、验收点、回归风险。
- CIE：构建、CI/CD、部署和环境管理，按风险触发参与。

## 3. MVP 范围

### 3.1 包含

- 创建需求开发任务工作区。
- 评估需求复杂度和风险，推荐工作流模式。
- 支持 Claude Code plugin `agents/custom subagents` 的按需调用。
- 支持需求开发设计阶段：
  - 需求业务设计
  - 需求方案/系统方案设计
  - 实现设计
  - 测试设计
- 支持存量功能调整作为普通 feature task 复用需求开发流程。
- 支持各 Agent 在设计/实现阶段按需查询知识库和代码仓，并保存证据过程件。
- 支持 AI 内部交叉评审和修订闭环。
- 支持人工最终评审和批准。
- 支持代码落地前的开发执行计划。
- 支持批准后代码落地。
- 支持转测包生成。
- 支持私域知识库 MCP 接入预留。
- 支持任务过程资产、评审记录、决策记录持久化。

### 3.2 不包含

- 完整 bugfix 工作流闭环。
- 完整重构/性能优化工作流。
- 自建多 Agent 调度引擎。
- 完整 CI/CD 或部署自动化。
- 独立知识库服务实现。
- 复杂 subagent 并行调度和 agent-team 编排。
- LSP、monitor、status line 等增强能力。

## 4. 核心原则

### 4.1 Human-in-loop 是核心机制

插件不是全自动需求工厂。MVP 中，AI 可以自动推进设计和内部评审修订，但以下节点必须有人参与：

- 工作流模式确认。
- 设计建议项最终确认。
- AI 无法判断的问题决策。
- 设计最终评审和批准。
- 高风险开发执行计划确认。

### 4.2 过程产物可追溯

需求输入、设计产物、评审记录、阻塞项、建议项、人工决策、批准记录、验证结果都必须落盘到任务工作区，不能只存在于聊天上下文。

### 4.3 Agent 是角色上下文，不是流程主轴

插件采用双层映射：

- 外层保留 SA、SE、MDE、DEV、TEST、CIE 等团队熟悉的岗位语义。
- 内层按产物责任定义边界。

Command/workflow 负责阶段推进，Skill 负责能力复用，Agent 负责角色视角，Hook 负责硬闸口。

Agent 与 Skill 的边界规则：

```text
Agent 决定职责视角，Skill 决定执行方法。
```

同一个 Skill 可以被不同 Agent 加载，但输出必须体现 Agent 的职责视角。例如 DEV 使用评审 Skill 时关注可编码性、代码影响和开发风险；MDE 使用评审 Skill 时关注模块边界、实现拆解和技术一致性；TEST 使用评审 Skill 时关注可测性、验收标准和回归风险。MVP 不设计 Skill 权限矩阵。

### 4.4 Hook 不是隐藏工作流引擎

Hook 的定位是：

```text
Hook = guard + registry + consistency checker
```

Hook 可以做结构校验、闸口阻断、确定性状态同步、过程件登记和一致性校验。Hook 不负责生成设计、不修改设计正文、不替代评审判断、不自动接受 assumption/accepted_risk、不跨阶段自动推进流程。

Command/Skill 决定状态应该变成什么；Hook 校验状态变更是否合法，并把确定性结果同步落盘。

## 5. 工作流模式

### 5.1 auto-design

适合简单需求。AI 可以自动推进设计阶段和内部交叉评审修订，但编码前必须人工最终评审和批准。

### 5.2 strict-human-loop

适合高风险或管理要求严格的需求。每个阶段完成后都需要人工评审确认。

### 5.3 collaborative-design

适合复杂需求。需求分析和方案设计阶段采用 AI 与人协同对话方式逐步澄清。

`collaborative-design` 默认阶段产物达到 `ai_review_passed` 后即可作为后续 AI 设计输入。对于需要人工确认的复杂阶段，使用 `humanGateStages` 配置局部人工门禁；被列入 `humanGateStages` 的阶段必须达到 `human_approved` 后才能推进依赖它的后续阶段。

## 6. 模式选择

启动任务时，AI 先根据需求材料进行复杂度和风险评估，推荐工作流模式，用户确认后进入对应流程。

当用户选择 `collaborative-design` 时，`feature-assess` 必须让用户指定 `humanGateStages`，或明确确认为空。该配置写入任务状态，后续 workflow 只根据该配置判断阶段推进门槛，不由 Agent 在执行中临时改变规则。如设计过程中确需调整，必须由人工决策后更新配置，并写入对应决策记录。

命中高风险条件时，插件默认推荐 `strict-human-loop`，但不强制锁死模式。用户可以人工确认后降级为 `collaborative-design` 或 `auto-design`，降级原因和接受的风险必须写入决策记录。插件不得在未人工确认的情况下把高风险任务静默降级。

硬触发高风险条件包括：

- 跨系统或跨模块影响
- 数据迁移或数据模型变更
- 权限、安全、审计变化
- 对外接口或兼容性变化
- 性能、容量、稳定性指标
- 核心业务链路
- 不可逆操作
- 发布、部署、配置或环境影响
- 需求输入明显不完整或存在歧义

## 7. 需求开发流程

### 7.1 初始化

用户通过需求开发任务命令创建 feature task。插件创建任务工作区，记录输入材料，生成任务状态文件。

feature task 不区分“新需求”和“变更需求”的流程分支。存量功能调整、历史功能扩展、部分功能点重设计都作为普通 feature task 处理。历史设计和现状代码通过知识库与代码仓按需查询获得。

### 7.2 复杂度评估

AI 读取需求输入，输出：

- 复杂度判断
- 风险命中规则
- 推荐工作流模式
- 需要补充的信息

用户确认模式后进入设计阶段。

`feature-assess` 不预加载完整知识上下文，也不提前固定上下文来源。知识库和代码仓查询跟随具体设计/实现任务发生，由对应 Agent 按需查询。

### 7.3 设计阶段

设计阶段包含：

- `businessDesign`：SA 负责需求业务设计。
- `solutionDesign`：SE 负责需求方案/系统方案设计。
- `implementationDesign`：MDE 负责实现设计。
- `testDesign`：TEST 负责测试设计。

各设计 Agent 在自己的阶段按需查询知识：

- SA：查询业务流程、业务规则、历史需求。
- SE：查询存量功能设计、架构规范、接口规范。
- MDE：查询模块历史实现方案、代码结构、技术规范。
- TEST：查询历史缺陷、测试规范、验收规则。
- DEV：在代码落地阶段查询代码仓、开发规范、已有实现模式。

查询到并实际使用的知识必须作为证据过程件保存到任务工作区。

设计命令语义必须保持可预测：

- `feature-design` 是设计编排命令，只推进当前任务中下一个允许推进的设计阶段。
- `feature-design-business`、`feature-design-solution`、`feature-design-implementation`、`feature-design-test` 是阶段命令，只处理对应单一设计产物。
- 已人工批准的阶段产物默认只读，`feature-design` 不能自动覆盖。
- 如需修改已人工批准的阶段，必须显式调用对应阶段命令的修订参数模式，例如 `/scc-dev-sphere:feature-design-solution --mode revise`，并记录原因、影响范围和重新评审要求。
- 普通设计推进不得跳过当前工作流模式要求的前置状态，也不得跳过代码落地前的最终人工批准闸口。

`stages` 是可选的 workflow-specific 细分进度结构，不是所有任务类型都必须具备的全局固定结构。MVP 中的 `businessDesign / solutionDesign / implementationDesign / testDesign` 只服务 `feature` 需求开发工作流的设计阶段。

其他 workflow 默认优先复用任务整体状态；只有确实需要阶段可视化、阶段评审或阶段批准时，才定义自己的 `stages`。

feature 的 `stages` 不包含实现和验证阶段。实现与验证由任务整体状态、开发执行计划、验证结果和转测包表达。

feature 需求开发工作流的阶段状态只记录稳定边界，不记录“正在生成中”、等待人工反馈、协同补信息、设计返工这类过程。各设计阶段采用 4 个持久状态：

```text
not_started
drafted
ai_review_passed
human_approved
```

`ai_review_passed` 只表示 AI 内部评审无阻塞，不代表人工批准。它在 `auto-design` 和 `collaborative-design` 中可以作为后续 AI 设计阶段的输入，但不能作为代码落地依据。阶段级 `human_approved` 表示该阶段设计已人工确认，是 `strict-human-loop` 阶段推进的硬依据；代码落地依据是最终批准后的 `approved_for_implementation`。

feature 阶段状态由对应命令或确定性 Hook/脚本维护：没有产物时是 `not_started`；设计产物生成或修订后进入 `drafted`；评审存在阻塞、人工反馈问题、等待补充信息或设计返工时保持或回到 `drafted`；正式 AI 评审无未关闭阻塞后进入 `ai_review_passed`；人工确认后进入 `human_approved`。

设计阶段采用有依赖的部分并行：

- 业务设计先完成，并经过 SE 评审闭环后稳定。
- 方案设计在业务设计稳定后展开，并经过 SA、MDE、TEST 评审闭环。
- 在 `auto-design` 中，方案设计达到 `ai_review_passed` 后，实现设计和测试设计可以并行展开；在 `collaborative-design` 中，如果 `solutionDesign` 未列入 `humanGateStages`，达到 `ai_review_passed` 后即可并行展开，如果已列入则必须达到 `human_approved`；在 `strict-human-loop` 中，必须达到 `human_approved`。
- `strict-human-loop` 不引入额外阶段状态，只提高阶段推进门槛：AI 正式评审通过后必须暂停等待人工确认；用户回复 `OK` 后进入 `human_approved`，用户反馈问题后回到或保持 `drafted`。
- 实现设计和测试设计各自完成交叉评审和必要修订。
- 所有阶段产物完成后，需要进入集成一致性评审。

### 7.4 交叉评审

评审主体是设计产物，不是 Agent。

基础评审矩阵：

```text
business-design -> SE
solution-design -> SA、MDE、TEST
implementation-design -> SE、DEV、TEST
test-design -> SA、SE、MDE
```

风险增强规则可以追加评审者，例如涉及部署时追加 CIE。

评审发生在每个关键设计阶段之后：

- `business-design review`：SE 评审业务设计质量。
- `solution-design review`：SA、MDE、TEST 评审方案设计。
- `implementation-design review`：SE、DEV、TEST 评审实现设计。
- `test-design review`：SA、SE、MDE 评审测试设计。
- `integrated-design consistency review`：检查业务、方案、实现、测试之间的一致性。

评审问题只采用 3 类：

- `blocking`：阻塞项，必须由原设计 Agent 修订，并由提出问题的评审 Agent 复核关闭。
- `advisory`：建议项，AI 不强制修复，但必须由人工选择 `accept`、`reject` 或 `convert_to_blocking`。
- `accepted_risk`：人工明确接受的风险，必须进入决策记录和 `integrated-design.md` 风险汇总；若代码落地后仍相关，必须进入转测包。

`advisory` 的人工确认结果必须写入机器可读的确认索引，例如 `reviews/advisory-confirmation.json`。Markdown 评审文件保存意见详情，确认索引用于 workflow/hook 判断是否允许进入批准。

`advisory accept` 不等于 `accepted_risk`。前者表示人工确认该建议不采纳或暂不处理；后者表示人工明确接受一个会进入设计批准视图的风险。`accepted_risk` 必须进入决策记录和 `integrated-design.md` 风险汇总；若代码落地后仍相关，必须进入转测包。

MVP 不引入 `minor/major/critical` 等额外严重级别。第一版只判断问题是否阻塞流程。

### 7.5 AI 内部评审-修订闭环

`feature-review` 支持阶段评审和集成评审。默认执行 AI 内部闭环：

`feature-review` 是正式评审能力，可以由用户显式调用，也可以由 workflow 在设计 Agent 返回 `ready_for_review` 后自动调度。设计 Skill 内部自检不等于正式评审，不能单独把阶段推进到 `ai_review_passed`。

```text
设计产物生成
  -> AI 交叉评审
  -> 发现 blocking/advisory/accepted_risk
  -> 将 blocking 回传给对应设计 Agent 修订
  -> 原评审 Agent 复核
  -> blocking 未关闭则继续循环
  -> blocking 归零后整理 advisory 人工确认清单
  -> 暂停并提示人工评审
  -> 用户 OK：记录阶段人工确认
  -> 用户反馈问题：记录问题并回到对应设计阶段修订
```

阶段评审闭环用于单个设计产物；集成评审闭环用于所有设计产物完成后的整体一致性检查。

阶段级人工确认不生成 approval 文件。用户回复 `OK` 后，对应阶段进入 `human_approved`；用户反馈问题后，对应阶段保持或回到 `drafted`，workflow 再调度对应设计 Agent 修订。最终代码落地批准仍只由 `feature-approve` 生成。

退出条件：

- 所有 `blocking` 关闭，`advisory` 整理成人工确认清单。
- 达到默认最大 3 轮 AI 内部修订。
- 评审 Agent 之间出现无法自动调和的冲突。
- 需要业务或技术负责人决策。
- 需要补充需求信息。

非正常退出时不新增人工决策状态。可继续推进的信息补充或人工决策记录到对应 `decisions/*-decisions.md`；只有当前任务无法在本插件流程内继续推进，且不能通过普通人工补充信息、人工决策或记录假设解决时，才进入 `blocked`。

`blocked` 是任务级兜底异常状态，不是协同设计的常规状态：

- 缺业务信息、缺历史设计、知识库不可访问、代码仓暂时查不到信息、Agent 判断不确定、评审有分歧、需要人工选择方案，都不进入 `blocked`。
- 这些问题通过继续对话、记录 decision 或记录 assumption 处理，任务仍保持当前稳定状态。

### 7.6 人工最终评审和批准

任务进入 `design_ready` 后，用户进行最终评审。

阶段级人工确认只更新对应阶段状态为 `human_approved`。`feature-approve` 默认只处理代码落地前的最终设计批准：只能在 `state.status=design_ready` 时执行，批准对象是 `integrated-design.md` 及其引用的阶段设计产物，批准后任务进入 `approved_for_implementation`。不使用 `feature-approve` 承担单个阶段批准语义。

如果设计被修订，任务整体状态从 `design_ready` 回到 `designing`，并重新完成受影响阶段评审和集成一致性评审。

批准必须落盘：

- 在 `approvals/` 下生成批准记录。
- 更新 `state.json`。
- 记录批准的产物版本、范围、限制和批准时间。

聊天中的“同意”不能作为唯一批准依据。

### 7.7 开发执行计划

设计批准后，DEV Agent 不能直接编码，必须先生成开发执行计划。

DEV Agent 默认不拆分为固定的前端/后端常驻 Agent。实现计划阶段根据影响面按需启用专项上下文：

- `backend-development`：后端代码、接口、数据、服务逻辑。
- `frontend-development`：前端页面、交互、状态、接口适配。
- `fullstack-change-planning`：前后端联动变更、接口契约和联调顺序。

开发执行计划包括：

- 关联代码仓库
- 预计修改模块/文件
- 实现步骤顺序
- 测试与验证命令
- 回滚/恢复策略
- 风险点与控制措施
- 是否需要 CIE 或额外专项评审

普通任务在开发执行计划生成后进入 `implementation_planned`。高风险或 `strict-human-loop` 模式必须先生成 `implementation-plan-approval.json`，才能进入 `implementation_planned`。如果计划已生成但仍待人工确认，任务状态保持 `approved_for_implementation`，不能进入代码落地。

### 7.8 代码落地

代码落地必须满足：

- 当前任务已进入 `implementation_planned` 或 `implementing`。
- 存在批准记录。
- 存在开发执行计划。
- 修改范围不超出批准范围。
- 已绑定目标代码仓库。

### 7.9 转测包

代码落地完成标准是转测包完成。

产物关系保持单一职责：

- 阶段设计文档是事实来源。
- `integrated-design.md` 是设计阶段最终人工评审入口和一致性批准视图。
- `approvals/` 保存批准事实记录。
- 转测包只承担代码落地后的测试交付信息。

`integrated-design.md` 必须汇总所有 `accepted_risk`，作为最终人工批准时的风险总览。风险详情仍以决策记录为事实来源，但批准视图不能遗漏已接受风险。

MVP 不新增 `final-handoff.md`。一页式总览需求由 `integrated-design.md` 的摘要章节承担，避免增加重复事实来源。

转测包包括：

- 本地验证结果
- 运行过的测试/检查命令
- 未运行测试及原因
- 代码变更摘要
- 影响范围
- 回归建议
- 已知风险
- 测试环境/数据准备建议
- 必要时附 CI/CIE 指引

## 8. 决策记录

设计阶段 AI 与人的协同决策必须落盘。决策记录按设计文档类型维护，避免一条决策一个文件导致文档爆炸。

```text
decisions/
  decision-index.json
  business-design-decisions.md
  solution-design-decisions.md
  implementation-design-decisions.md
  test-design-decisions.md
```

MVP 不新增阶段批准文件、单条 ADR 文件或跨阶段决策文件。跨阶段、模式选择、风险接受等决策归并到最相关的阶段决策文件；无法明确归属时，默认记录到 `business-design-decisions.md` 的任务级决策区。

每条决策记录包含：

- 决策 ID
- 关联产物
- 决策时间
- 参与方
- 背景
- 可选方案
- 最终选择
- 选择理由
- 风险
- 后续影响
- 状态

## 9. 证据过程件

知识查询结果和代码分析结果必须作为过程件保存。设计文档不能只写“参考知识库”，必须能追溯到当时使用的证据快照。

```text
evidence/
  evidence-registry.json
  knowledge/
    EV-001-approval-rules.md
  repository/
    EV-010-order-service-impact.md
```

`evidence-registry.json` 记录证据索引：

```json
{
  "evidence": [
    {
      "id": "EV-001",
      "usedBy": "SE",
      "stage": "solutionDesign",
      "sourceType": "knowledge-base",
      "retrievedBy": "knowledge-query",
      "snapshotFile": "evidence/knowledge/EV-001-approval-rules.md",
      "usedIn": ["artifacts/solution-design.md"],
      "confidence": "high"
    }
  ]
}
```

知识库内容会演进，保存查询结果快照是为了保证后续复盘时能还原当时设计依据。

evidence 只约束“声称来自存量事实、外部约束或代码现状”的结论，不要求所有新设计都有引用。设计内容按三类处理：

- 存量事实、外部约束、代码现状判断：必须引用 evidence ID，例如存量业务规则、存量功能行为、接口兼容性、模块边界、代码影响面、测试范围和回归风险。
- 新设计决策：不需要 evidence，但必须说明理由、取舍和影响。
- 无证据前提：必须标记为 `assumption` 并等待人工确认。

引用格式保持轻量：

```text
依据：EV-001, EV-003
```

人工确认后的 assumption 进入决策记录，不能伪装成 evidence。

## 10. 成功标准

MVP 成功标准：

- 能创建并恢复 feature task workspace。
- 能完成需求设计阶段产物生成。
- 能完成产物中心交叉评审。
- 能执行 AI 内部评审-修订闭环。
- 能记录人机协同决策。
- 能保存被设计实际使用的知识/代码证据过程件。
- 能生成并记录人工批准。
- 能阻止未批准编码。
- 能生成开发执行计划。
- 能完成代码落地并输出转测包。

## 11. 明确反模式

- 不做“全功能 AI 团队大而全平台”。
- 不让多个 Agent 直接争抢最终文档。
- 不把知识库查询做成知识库 Agent。
- 不在 assess 阶段预加载完整知识上下文。
- 不把 AI 中间过程自动写入主知识库。
- 不靠聊天上下文作为批准依据。
- 不在未批准设计时允许代码修改。
