# scc-dev-sphere 插件设计澄清 Q&A

本文档记录插件设计澄清过程中的关键问题、用户回复、阶段性判断与后续设计影响。

## Q1：插件第一阶段最应该优化哪一个核心瓶颈？

**问题**

在第一阶段，`scc-dev-sphere` 插件到底优先解决哪一个最痛、最可验证的瓶颈？

**背景判断**

当前设想覆盖 SA、SE、MDE、DEV、TEST、CIE 以及需求开发、问题修复、重构、性能优化等多类工作流。范围过宽会导致插件很容易变成“角色扮演平台”，但缺少可验证的产出闭环。第一阶段必须选择一个主战场，否则后续的 Agent、Skill、知识库、Human-in-loop 都无法判断取舍。

**候选方向**

1. **需求到实现方案**：把 SA/SE/MDE 的设计链路做扎实，产出可评审、可开发、可追踪的需求业务设计、系统方案、实现方案。
2. **实现方案到代码落地**：把 MDE/DEV/TEST 的开发链路做扎实，产出任务拆分、代码变更、单测、转测说明。
3. **代码评审与质量门禁**：优先做 CodeReview、规范检查、测试建议、风险扫描，切入点更小、ROI 更容易证明。
4. **问题定位与修复**：围绕 bug report、日志、复现、根因分析、修复方案、回归测试形成闭环，适合快速验证 Agent 协作价值。

**我的推荐**

优先选择 **问题定位与修复** 或 **代码评审与质量门禁** 作为 MVP，而不是一上来做“全功能团队”。原因是这两个方向输入输出更明确、验证成本更低、失败边界更清楚，也更容易倒逼你沉淀真正有用的 Skill 和知识检索接口。

**用户回复**

选择 **1 & 2**：先做需求从设计到开发落地，即覆盖需求设计、方案设计、实现方案、任务拆分、编码落地这条主链路。

**阶段性结论**

MVP 第一阶段不做泛化的“全功能团队”，优先聚焦 **需求从设计到开发落地**。这意味着插件的核心价值不是单点 CodeReview 或 bug fix，而是把一个需求从业务意图逐步转化为可执行的软件变更。

初步范围应覆盖：

- SA：需求业务设计与需求澄清
- SE：系统/特性方案设计
- MDE：模块实现方案与功能点拆解
- DEV：开发任务拆分与代码落地
- TEST：至少参与测试点识别和可测性评审，但第一阶段不一定完整覆盖测试执行

设计风险：该 MVP 范围仍然偏大，后续必须明确“每一阶段的产物契约”和“哪些节点必须 Human-in-loop”，否则会退化为长链路文档生成器。

## Q2：需求落地链路的最终交付物边界是什么？

**问题**

当你说“需求从设计到开发落地”时，第一阶段插件跑完一次任务后，最终必须交付到什么程度才算成功？

**背景判断**

这个边界会直接决定 Agent/Skill 的设计。如果最终只要求产出可开发方案，那 DEV Agent 可以偏任务拆分；如果要求真实改代码并通过测试，那插件必须具备 repo 理解、变更规划、代码编辑、测试执行、失败诊断、回滚策略等能力。两者复杂度不是一个量级。

**候选方向**

1. **方案级落地**：输出需求业务设计、系统方案、实现方案、开发任务清单、测试建议，不直接改代码。
2. **代码级落地**：在方案评审通过后，直接修改代码、补充测试，并输出转测说明。
3. **PR级落地**：完成代码、测试、质量检查，并形成可提交/可评审的 PR 说明，但不自动合并。

**我的推荐**

选择 **PR级落地** 作为长期目标，但 MVP 的第一条端到端链路可以要求做到 **代码级落地 + 本地验证**。原因是如果不触达代码，插件很难证明“设计是否真的可实现”；但如果一开始就追求完整 PR 自动化，会被 CI、权限、分支策略、评审流程拖垮。

**用户回复**

同意 **1 + 2**：先完成方案级落地；在方案完成后，由人工评审确认。确认方案无误后，再可选启动 AI 进行代码级落地，不自动进入编码阶段。

**阶段性结论**

MVP 的端到端边界确定为 **方案级落地 + 人工批准后可选代码级落地**。

这不是全自动流水线，而是带明确阶段闸口的协作式工作流：

1. AI 先完成需求业务设计、系统方案、实现方案、任务拆分、测试建议等方案级产物。
2. 人工进行方案评审，确认是否允许进入实现阶段。
3. 用户显式确认后，AI 才进行代码修改、测试补充和本地验证。

设计影响：

- 工作流必须有 `design_ready` / `approved_for_implementation` 之类的状态边界。
- DEV Agent 不应在方案阶段直接改代码，只能做可行性分析、任务拆分和风险提示。
- 方案产物需要具备“可评审性”，不能只是自然语言说明，必须包含范围、接口、数据、流程、风险、测试点、任务拆分和待确认问题。
- Human-in-loop 不是补丁，而是第一阶段的核心安全机制。

## Q3：是否误解了 Claude Code 插件的真实边界？

**用户问题**

插件就是 Claude Code 支持的 plugin 内容，包含 Agent、skill、hooks 这些，你是否对该插件存在理解错误？

**我的回复**

存在一部分理解偏差，需要纠偏。

之前的讨论里，我把“插件”更多当成一个通用多 Agent 软件工程平台来分析，这是有帮助但不够精确。`scc-dev-sphere` 的真实落地点应该是 **Claude Code plugin 的组件包**，而不是重新发明一个独立 Agent runtime。

Claude Code plugin 的实际设计边界应以官方插件机制为准：

- `skills/`：沉淀可被 Claude 自动或手动调用的工作能力，例如需求分析、方案设计、实现拆解、测试点识别。
- `agents/`：提供专用 subagent，例如 SA、SE、MDE、DEV、TEST，但它们应是 Claude Code subagent 配置，不是独立调度系统。
- `hooks/`：在 Claude Code 生命周期事件上做自动控制，例如阻止未批准编码、方案产物校验、文件变更后格式化/检查。
- MCP servers：连接私域知识库、需求系统、制品库、代码规范查询等外部能力。
- LSP servers：增强代码级落地阶段的语言诊断和代码导航。
- monitors：可选，用于监听日志、CI 状态或任务状态，但 MVP 不应过早依赖。

**阶段性结论**

后续设计必须从“组织角色映射”收敛为“Claude Code plugin 组件组合”：

- Agent 不是顶层架构中心，而是插件中的一种 subagent 组件。
- Skill 应该是最核心的复用单元，因为它更贴近可迁移的工程动作。
- Hook 是阶段闸口和安全控制的关键，尤其用于落实“方案完成后人工批准，才允许进入代码落地”。
- MCP 是知识库和团队系统集成的主要通道，不建议把知识库查询做成一个独立 Agent。

## Q4：前一个问题是否混淆了 Claude Code plugin 格式与运行产物？

**用户问题**

你提出的这个问题和 Claude Code 的插件格式不匹配吧？

**我的回复**

是的，不匹配。这个问题混淆了两层：

1. **Claude Code plugin 自身格式**：`plugin.json`、`skills/`、`agents/`、`hooks/`、`commands/`、`mcpServers` 等，这是插件包的结构。
2. **插件运行后的工作产物**：需求开发包、方案文档、任务清单、评审记录等，这是插件在目标项目里帮助用户生成和维护的内容。

我刚才的问题本意是讨论“插件运行产物的事实源设计”，但措辞上把它说成了“plugin 文件结构设计”，这是错误的。

**阶段性结论**

后续设计必须先固定 **Claude Code plugin 包结构**，再讨论插件生成什么工作产物。正确顺序应是：

1. 插件包含哪些 Claude Code 原生组件：skills、agents、hooks、commands、MCP 等。
2. 每类组件负责什么职责边界。
3. 这些组件在目标项目中读写哪些工作产物。
4. 工作产物是否采用单一事实源、分角色文档或混合模式。

因此，原 Q4 撤回并重写。下一个问题应聚焦 plugin 包内部的组件主轴，而不是直接跳到产物文档形态。

## Q5：Claude Code plugin 的 MVP 主轴应该以哪个组件为核心？

**问题**

在 `scc-dev-sphere` 的 MVP 中，插件内部应该以哪个 Claude Code 原生组件作为架构主轴？

**背景判断**

你最初的设想是 Agent、Skill、docs/tools 三层。但在 Claude Code plugin 里，`agents`、`skills`、`hooks` 都是插件组件，不应该平级堆满。必须明确“谁是主轴、谁是辅助”，否则会变成 agents 里写一套流程、skills 里再写一套流程、hooks 里又补一套规则，维护成本会爆炸。

**候选方向**

1. **Agent 主轴**：SA/SE/MDE/DEV/TEST subagents 是核心，skills 只是它们调用的能力包。
2. **Skill 主轴**：需求分析、方案设计、实现拆解、代码落地等 skills 是核心，agents 只是不同评审视角或执行上下文。
3. **Command/Workflow 主轴**：通过 slash commands 或 commands 编排阶段流程，agents/skills/hooks 都服务于命令。

**我的推荐**

选择 **Command/Workflow 主轴 + Skill 核心能力 + Agent 评审视角 + Hook 安全闸口**。

不建议以 Agent 为主轴。把 SA/SE/MDE/DEV 全部做成中心角色，听起来贴近组织，但在 Claude Code 里很容易变成角色扮演和重复推理。真正稳定可复用的是 workflow 和 skill：例如“生成需求开发包”“评审方案完整性”“拆分实现任务”“批准后代码落地”。Agent 更适合作为专业审查视角，而不是每一步都必须出场的虚拟员工。

**用户回复**

同意 **3：Command/Workflow 主轴**。

补充说明：Agent 并不仅仅是审查视角。例如 DEV Agent 既可以加载方案评审 skill 对 SE 的设计方案进行评审，也可以加载编码 skill 进行需求代码开发。Agent 应该能根据任务加载不同 skill 执行工作。

**阶段性结论**

MVP 架构主轴确定为 **Command/Workflow 主轴**，但需要修正对 Agent 的定位：

- Workflow/Command：负责阶段编排、状态推进、人工确认点和产物准入。
- Skill：负责可复用的工作能力，例如需求分析、系统设计、方案评审、实现拆解、编码落地、测试点识别。
- Agent：不是单纯 reviewer，而是 **带角色职责边界的执行上下文**。同一个 Agent 可以加载不同 skill 执行不同任务，例如 DEV 可做方案评审，也可做编码实现。
- Hook：负责硬性安全闸口，例如未批准方案时禁止进入代码变更。

关键设计原则：Agent 可以执行多种 skill，但不应该自行决定跨阶段推进。阶段推进权应属于 workflow/command 和 human approval，否则会导致流程失控。

## Q6：Agent 的职责边界应该按“组织岗位”固定，还是按“产物责任”收敛？

**问题**

在 Claude Code plugin 中，SA、SE、MDE、DEV、TEST 这些 Agent 的职责边界，是严格复刻你们团队的组织岗位，还是按 AI 工作产物责任重新收敛？

**背景判断**

这是一个容易踩坑的地方。照搬组织岗位的好处是团队容易理解，坏处是可能把人为组织分工中的历史包袱带进插件。例如 SE 和 MDE 分离在你们团队里合理，但在 AI 工作流里，过细的角色边界可能导致重复设计、反复交接、上下文损耗。反过来，如果完全按产物责任重组，又可能和团队既有评审文化脱节。

**候选方向**

1. **岗位复刻**：SA、SE、MDE、DEV、TEST、CIE 都做成独立 Agent，职责贴近真实组织。
2. **产物责任收敛**：减少 Agent 数量，例如需求分析、架构设计、实现落地、质量验证四类 Agent。
3. **双层映射**：对外保留 SA/SE/MDE/DEV/TEST 名称，对内按产物责任定义能力边界，避免机械复刻组织流程。

**我的推荐**

选择 **双层映射**。

我不建议机械复刻岗位。AI 不是公司组织图，不需要为每个现实岗位都配一个常驻角色。更好的做法是：对用户保留熟悉的 SA/SE/MDE/DEV/TEST 角色入口；但内部按照“谁对哪个产物质量负责”来定义 Agent 边界。特别是 SE/MDE 的差异可以保留，但要明确：SE 负责系统级设计一致性，MDE 负责模块级实现可行性和任务拆解，不要让两者都写一份重叠的技术方案。

**用户回复**

同意双层映射。

**阶段性结论**

Agent 设计采用 **外层岗位语义 + 内层产物责任** 的双层映射：

- 对用户保留 SA、SE、MDE、DEV、TEST 等团队熟悉的岗位角色。
- 对插件内部，不机械复刻组织图，而是按产物质量责任定义 Agent 边界。
- Agent 可以加载不同 skill 执行不同任务，但 workflow/command 负责阶段推进，hook 负责安全闸口。

已确认的职责边界：

- SA：业务流程、业务规则、需求边界、术语一致性。
- SE：系统级设计、架构一致性、跨模块边界、接口契约。
- MDE：模块级实现方案、影响面分析、功能点拆解、实现可行性。
- DEV：代码实现、单测/本地验证、实现风险反馈；也可参与设计评审。
- TEST：测试策略、测试场景、验收点、回归风险；第一阶段至少参与方案可测性评审。

## Q7：MVP 第一版是否纳入 CIE Agent？

**问题**

在“需求从设计到开发落地”的 MVP 第一版里，是否要把 CIE 也作为独立 Agent 纳入主流程？

**背景判断**

CIE 的职责很重要，但它和 SA/SE/MDE/DEV/TEST 不完全同频。需求方案和代码落地阶段，CIE 可能只在涉及部署、配置、CI、环境、发布策略时才强相关。如果 MVP 一开始强行加入 CIE Agent，流程会更完整，但也会多出 CI/CD、环境权限、部署验证、制品管理等一串复杂问题。

**候选方向**

1. **纳入主流程**：CIE Agent 固定参与方案评审和落地评审，关注部署、配置、流水线、环境影响。
2. **按需触发**：默认不进入主流程；当需求涉及部署、配置、数据库迁移、流水线、环境变量、运维风险时再启用 CIE Agent。
3. **暂不纳入 MVP**：第一阶段只沉淀 CIE 相关检查清单，不做独立 Agent。

**我的推荐**

选择 **按需触发**。

完全不纳入 CIE 会漏掉真实工程风险，尤其是配置、部署、数据库迁移、环境差异这些问题；但固定让 CIE 参与每个需求又会把 MVP 搞重。更好的方式是：workflow 在方案阶段做一次“CIE 影响判定”，命中条件时再调用 CIE Agent 或 CIE skill。

**用户回复**

同意按需触发。

**阶段性结论**

MVP 第一版中，CIE 不作为固定主流程 Agent，而是 **按需触发**：

- 默认需求开发链路不强制调用 CIE。
- 在方案阶段由 workflow 做 CIE 影响判定。
- 当需求涉及部署、配置、数据库迁移、流水线、环境变量、发布策略、运维风险等事项时，触发 CIE Agent 或 CIE skill。
- 即使不触发 CIE Agent，方案产物也应保留 CIE 影响判定结果，避免隐性遗漏。

## Q8：工作流状态应该由插件维护，还是由目标项目产物维护？

**问题**

为了实现“方案完成后人工批准，才允许 AI 进入代码落地”，工作流状态应该放在哪里？

**背景判断**

这是 MVP 能不能真实可控的关键。仅靠对话上下文记住“已批准”是不可靠的：上下文会丢、会被压缩、会跨会话失效。Hook 也不能凭感觉判断当前是否允许改代码，它必须读取某个稳定状态。否则你以为有 Human-in-loop，实际只是口头约定。

**候选方向**

1. **对话状态**：Claude 在当前会话中记住阶段状态，不落盘。
2. **目标项目状态文件**：在目标项目中生成类似 `.scc-dev-sphere/state/<feature-id>.json` 的状态文件，commands 和 hooks 都读取它。
3. **外部系统状态**：状态存到需求系统、任务系统或私域平台，通过 MCP 查询。

**我的推荐**

选择 **目标项目状态文件作为 MVP 状态源**，长期可以对接外部系统。

对话状态不够硬，不能作为权限控制依据。外部系统更正规，但 MVP 会被集成成本拖慢。目标项目状态文件最实用：可版本化、可审计、hooks 可读取、用户可查看，也方便后续迁移到 MCP/需求系统。

**用户回复**

同意 **2：目标项目状态文件**。

补充要求：需要创建一个独立工作目录，在该工作目录中存放这次工作流任务（需求开发、问题修改）的所有过程文件，做到隔离。

**阶段性结论**

MVP 采用 **目标项目内的任务工作区** 作为工作流状态与过程产物的稳定载体。

这不是单一 state 文件，而是一个独立 task workspace，存放一次工作流任务的所有过程文件，例如：

- 状态文件
- 输入需求材料
- 需求业务设计
- 系统方案设计
- 模块实现方案
- 评审记录
- 人工批准记录
- 开发任务拆分
- 代码落地计划
- 测试建议/验证记录

初步建议目录形态：

```text
.scc-dev-sphere/
  tasks/
    <task-id>/
      state.json
      inputs/
      artifacts/
      reviews/
      approvals/
      implementation/
      verification/
```

设计影响：

- commands 以 task workspace 为输入输出边界。
- hooks 读取 task workspace 的 `state.json` 和批准记录来判断是否允许代码修改。
- task workspace 可以隔离需求开发、问题修改、重构、性能优化等不同工作流。
- 后续知识库沉淀可以从 task workspace 中挑选稳定结论，而不是把所有中间过程直接灌入知识库。

## Q9：任务工作区是否应放在目标项目内并纳入版本管理？

**问题**

这个独立任务工作区应该放在目标项目仓库内，并允许纳入 Git 版本管理吗？

**背景判断**

任务工作区的位置会影响审计、协作、隐私和仓库污染。如果放在目标项目内，它最容易被 hooks、commands、开发者和代码评审流程访问，也方便把方案和代码变更关联起来。但如果所有过程文件都纳入 Git，仓库会被大量中间草稿、模型推理痕迹、敏感信息污染。

**候选方向**

1. **仓库内且全部版本化**：`.scc-dev-sphere/tasks/<task-id>/` 全部提交到 Git。
2. **仓库内但分层版本化**：稳定产物可提交，中间过程、缓存、草稿、敏感信息默认 ignore。
3. **仓库外统一工作区**：例如用户 home 或 Claude 配置目录下统一管理，不污染目标项目。

**我的推荐**

选择 **仓库内但分层版本化**。

原因是插件需要和目标项目代码强关联，放仓库外会增加定位和协作成本；但全部版本化很危险，会把大量 AI 过程垃圾和潜在敏感信息带进主仓库。应该明确哪些文件是正式产物，哪些只是运行过程。

**用户回复**

倾向在 Claude 工作空间下创建 `.devsphere` 目录，将该目录作为根目录，新创建的工作空间统一放置在该根目录下。

理由：工作空间不一定在代码工程目录下。例如需求分析和需求方案设计阶段，不需要查询代码，只需要查询知识库中的存量功能设计等知识即可。

**阶段性结论**

修正原推荐：MVP 不应默认把任务工作区放在目标代码仓库内，而应采用 **Claude 工作空间级 `.devsphere` 根目录**。

推荐结构调整为：

```text
<claude-workspace>/
  .devsphere/
    tasks/
      <task-id>/
        state.json
        inputs/
        artifacts/
        reviews/
        approvals/
        implementation/
        verification/
        links/
```

设计影响：

- 任务工作区独立于代码工程，支持纯需求分析、需求方案设计、问题分析等非代码阶段。
- 当进入代码落地阶段时，通过 `links/` 或 `state.json` 关联一个或多个目标代码仓库。
- hooks 在代码仓库内执行时，需要能定位到当前任务工作区，不能只假设 `.scc-dev-sphere` 在 repo 根目录。
- 版本管理策略需要重写：`.devsphere` 默认是工作区级过程资产，不必天然进入业务代码仓库 Git。
- 如果需要把正式方案随代码一起评审，可以由 workflow 导出一份稳定产物到目标仓库或 PR 描述，而不是把完整过程目录搬进仓库。

## Q10：代码落地阶段如何把当前代码仓库绑定到任务工作区？

**问题**

既然任务工作区放在 Claude 工作空间级 `.devsphere` 下，而不是代码仓库内，那么进入代码落地阶段时，插件应该如何知道“当前代码改动属于哪个任务工作区”？

**背景判断**

这是独立工作区方案必须补上的机制。否则 hook 想阻止未批准编码时，会遇到一个硬问题：它在代码 repo 里触发，但批准状态在 `.devsphere/tasks/<task-id>/state.json` 里。没有稳定绑定关系，hook 就无法判断当前修改是否被允许。

**候选方向**

1. **当前会话绑定**：Claude 在会话中记住 active task，不落盘。
2. **repo 内轻量指针文件**：在代码仓库放一个很小的 `.devsphere-task` 或 `.devsphere/current-task.json`，指向工作区任务 ID。
3. **workspace 全局 active task**：在 `<claude-workspace>/.devsphere/current-task.json` 维护当前活动任务和关联 repo 列表。

**我的推荐**

选择 **workspace 全局 active task + 可选 repo 内轻量指针文件**。

只靠会话绑定不可靠。全局 active task 能支持非代码阶段和多仓库场景；repo 内轻量指针文件能让 hooks 在 repo 内快速定位任务状态。这个指针文件可以默认不提交 Git，避免污染业务仓库。

**用户回复**

同意这种设计思路，不过其中一些设计细节需要后续再对齐。

**阶段性结论**

方向确认：采用 **Claude 工作空间级 `.devsphere` 根目录 + 任务工作区 + repo 轻量绑定** 的设计思路。

当前只确认原则，不锁死细节：

- `.devsphere` 作为任务过程资产和状态的根目录。
- 每次需求开发、问题修改、重构、性能优化等都创建独立 task workspace。
- 需求分析/方案设计阶段可以不绑定代码仓库。
- 进入代码落地阶段后，任务工作区再关联一个或多个 repo。
- hooks/commands 需要通过稳定机制定位 active task 和批准状态。
- repo 内是否放轻量指针、指针文件路径、是否入 Git、状态 schema 等细节后续单独设计。

## Q11：MVP 的需求开发工作流应采用“大命令一键跑完设计”，还是“分阶段命令逐步推进”？

**问题**

对于“需求从设计到开发落地”的 MVP，Claude Code plugin 的 workflow command 应该怎么组织？

**背景判断**

这会决定用户交互方式。如果做成一个大命令，例如 `/devsphere feature-dev`，它内部自动串起 SA、SE、MDE、TEST，再等待批准，用户体验简单，但中间可控性差。如果拆成多个阶段命令，可审计、可插手，但用户操作成本更高。考虑你明确需要 Human-in-loop，命令粒度不能太粗。

**候选方向**

1. **一键式大命令**：一个命令完成需求分析、方案设计、实现拆解、测试建议，然后等待批准。
2. **分阶段命令**：例如 init、analyze、design、review、approve、implement、verify 分开执行。
3. **主入口 + 阶段 skill 命令**：提供一个主 workflow 导航入口，同时允许用户在任意阶段单独执行阶段 skill 命令。

**我的推荐**

选择 **主入口 + 阶段 skill 命令**。

一键式在早期太黑盒，不利于人参与；纯分阶段又太繁琐。更合适的是有一个 workflow 入口提示默认路径，但所有关键阶段都可以通过独立 skill 命令单独执行、重跑、回退和人工修订。例如 workflow 入口负责状态导航和下一步推荐，阶段 skill 命令负责明确阶段动作。

**用户回复**

提出拆分为两种模式：

1. **一键推进模式**：需求分析、方案设计、实现拆解等可以一键推进，但在具体编码前必须人工评审设计。
2. **纯 Human-in-loop 模式**：每个环节都必须经过人工评审。

补充考虑：在需求分析和需求方案设计阶段，也需要两种方式：

- 简单需求：AI 直接全部生成后再评审。
- 复杂需求：采用协同对话方式逐步设计。

**阶段性结论**

MVP workflow 不应只按“命令粒度”设计，而应支持 **控制强度模式**：

- `auto-design`：一键推进到设计完成，但编码前必须人工批准。
- `strict-human-loop`：每个阶段都需要人工确认后才能进入下一阶段。
- `collaborative-design`：需求分析和方案设计阶段采用对话式协同澄清，适合复杂需求。

这三个概念可以组合，而不是互斥。例如一个任务可以是：

- 简单需求：`auto-design` -> 人工评审 -> `implement`
- 复杂需求：`collaborative-design` -> 多轮澄清 -> 方案冻结 -> 人工评审 -> `implement`
- 高风险需求：`strict-human-loop`，每个阶段都停下来确认

设计影响：

- task state 需要记录 `workflowMode` 和 `interactionMode`。
- commands 需要支持创建任务时选择模式，也支持中途从 auto 切到 strict/collaborative。
- hooks 只负责硬闸口，不负责决定采用哪种模式。
- skills 需要适配“直接产出”和“协同澄清”两种执行方式。

## Q12：工作流模式应由用户手动选择，还是由 AI 先评估复杂度后推荐？

**问题**

当用户启动一个需求开发任务时，应该如何决定使用 `auto-design`、`strict-human-loop` 或 `collaborative-design`？

**背景判断**

模式选择会影响体验和风险。如果全部让用户手选，简单明确，但用户可能一开始也判断不准需求复杂度。如果让 AI 自动决定，体验更智能，但 AI 可能低估复杂度，导致该协同澄清的问题被直接跳过。

**候选方向**

1. **用户手动选择**：启动任务时明确指定模式。
2. **AI 推荐，用户确认**：AI 先做复杂度/风险评估，推荐模式，用户确认后进入。
3. **AI 自动选择**：插件根据需求材料自动选择模式并开始执行。

**我的推荐**

选择 **AI 推荐，用户确认**。

不建议 AI 自动选择，因为早期最危险的是“看起来顺滑地错下去”。也不建议完全手选，因为用户未必知道哪些需求会牵涉跨模块、数据迁移、兼容性、权限、性能或发布风险。更稳的是 AI 先给出复杂度判断和推荐模式，但必须由用户确认。

**用户回复**

同意 AI 推荐、用户确认。

**阶段性结论**

启动需求开发任务时，采用 **AI 推荐 + 用户确认** 的模式选择策略：

- AI 先读取需求输入和可用上下文，进行复杂度/风险评估。
- AI 推荐 `auto-design`、`strict-human-loop` 或 `collaborative-design`。
- 用户确认后，workflow 才进入对应模式。
- 早期不允许 AI 完全自动选择模式，避免低估复杂需求并一路错误推进。

## Q13：AI 推荐工作流模式时，复杂度/风险判断标准是什么？

**问题**

AI 在推荐 `auto-design`、`strict-human-loop` 或 `collaborative-design` 时，应该基于哪些判断标准？

**背景判断**

如果没有明确标准，“AI 推荐模式”就会变成看心情。更糟的是，模型通常倾向于把需求说得可控，然后直接往下做。你需要的是一套保守的分流规则：简单需求可以快速推进，复杂或高风险需求必须协同澄清。

**候选方向**

1. **轻量规则**：只判断需求描述完整度、是否跨模块、是否涉及数据/接口/权限/部署。
2. **风险评分矩阵**：按业务复杂度、系统影响面、数据风险、兼容性、测试难度、发布风险打分。
3. **规则 + AI 解释**：先用明确规则触发保守模式，再让 AI 给出解释和推荐。

**我的推荐**

选择 **规则 + AI 解释**。

纯规则太死，纯 AI 太飘。应该有一些硬触发条件：跨系统、数据迁移、权限变更、兼容性要求、性能指标、核心链路、不可逆操作、需求不完整等，一旦命中就不能推荐简单的一键推进。AI 可以解释为什么推荐某个模式，但不能绕过硬规则。

**用户回复**

同意规则 + AI 解释。

**阶段性结论**

AI 推荐工作流模式时采用 **硬规则 + AI 解释**：

- 先用明确规则识别复杂度和风险。
- 命中高风险条件时，不能推荐简单的一键推进。
- AI 需要给出推荐模式、命中规则、风险解释和可选替代模式。
- 用户确认后才进入对应 workflow。

初步硬触发条件包括：

- 跨系统/跨模块影响
- 数据迁移或数据模型变更
- 权限/安全/审计变化
- 对外接口或兼容性变化
- 性能、容量、稳定性指标
- 核心业务链路
- 不可逆操作
- 发布、部署、配置或环境影响
- 需求输入明显不完整或存在歧义

## Q14：MVP 是否只做“需求开发”，还是同时支持“问题修改”作为任务类型？

**问题**

MVP 第一版的 workflow task type 是只支持“需求开发”，还是同时支持“问题修改/缺陷修复”？

**背景判断**

你前面提到任务工作区要支持需求开发、问题修改等任务。但如果 MVP 同时做 feature development 和 bug fix，workflow 会明显分叉：需求开发重在业务/系统/实现设计，问题修改重在复现、根因、影响面、修复验证。两者可以共享 workspace、Agent、Skill 和 Hook，但不应该强行用同一套阶段模板。

**候选方向**

1. **MVP 只做需求开发**：先把需求从设计到代码落地打通。
2. **MVP 同时支持需求开发和问题修改**：从一开始定义两个 task type。
3. **MVP 主做需求开发，预留问题修改骨架**：schema 支持 taskType，但只完整实现 feature-development。

**我的推荐**

选择 **MVP 主做需求开发，预留问题修改骨架**。

如果完全不考虑问题修改，后面可能返工 task workspace 和状态模型；但如果第一版同时完整实现两个 workflow，范围又会膨胀。更务实的是：task schema 从一开始支持 `taskType`，目录结构和命令命名不要写死 feature，但实际可用闭环先做需求开发。

**用户回复**

同意 MVP 主做需求开发，预留问题修改骨架。

**阶段性结论**

MVP 第一版采用 **需求开发优先，问题修改预留骨架**：

- task schema 从一开始支持 `taskType`。
- 第一条完整可用闭环聚焦 `feature-development`。
- `bug-fix` / `issue-fix` 暂不完整实现，但目录结构、状态字段、命令命名避免写死需求开发。
- 后续问题修改 workflow 可以复用 task workspace、Agent、Skill、Hook 机制。

## Q15：私域知识库应作为 MCP 工具接入，还是作为 Skill 封装？

**问题**

团队已有私域知识库。`scc-dev-sphere` 应该如何接入它？

**背景判断**

知识库接入方式会直接决定方案质量。你最初提到可以创建知识查询 Skill，甚至知识查询 Agent。但这里我必须直说：把知识库查询做成 Agent 多半是错的，会把一个检索能力包装成会说话的角色，增加不可控性。知识库更适合作为工具能力，Skill/Agent 根据任务调用它。

**候选方向**

1. **知识查询 Agent**：创建一个专门 Agent 负责问答和知识检索。
2. **知识查询 Skill**：把检索流程、查询策略、引用规范写成 skill。
3. **MCP 工具 + 查询 Skill**：MCP 负责连接知识库和返回结构化结果，Skill 负责如何检索、筛选、引用和使用。

**我的推荐**

选择 **MCP 工具 + 查询 Skill**。

MCP 负责“能查到什么”，Skill 负责“怎么查、怎么引用、怎么判断证据够不够”。Agent 不应该成为知识库本身。SA/SE/MDE/TEST/DEV 都可以通过相同查询 Skill 调用知识库，但查询意图不同。

**用户回复**

同意 MCP 工具 + 查询 Skill。

**阶段性结论**

私域知识库接入采用 **MCP 工具 + 查询 Skill**：

- MCP 负责连接私域知识库并返回结构化检索结果。
- 查询 Skill 负责查询策略、证据筛选、引用规范、证据不足判断。
- SA/SE/MDE/TEST/DEV Agent 都可以使用同一查询 Skill，但查询意图和评估标准不同。
- 不创建“知识库 Agent”，避免把工具能力包装成虚拟角色。

## Q16：任务完成后，知识库应该如何更新？

**问题**

一次需求开发任务完成后，插件是否应该自动把过程文件和最终结论写回私域知识库？

**背景判断**

这是高风险点。知识库不是垃圾桶，不能把 AI 生成的中间过程、未验证设计、临时推理、错误假设都灌进去。否则知识库会快速污染，后续检索出来的内容看似来自团队资产，实际是模型自我循环生成的二手信息。知识库更新必须有准入和人工审核。

**候选方向**

1. **自动全量写回**：任务结束后把所有产物都同步到知识库。
2. **人工挑选写回**：AI 生成知识候选条目，人确认后写入。
3. **分层沉淀**：任务工作区保留全量过程；知识库只接收经过验证的稳定知识，例如最终方案、设计决策、复用规则、踩坑记录，并需要人工批准。

**我的推荐**

选择 **分层沉淀**。

任务工作区是过程资产，知识库是稳定资产。AI 可以在任务结束时生成“知识沉淀候选”，但不能直接写入主知识库。至少需要人工确认，最好还能标注来源任务、适用范围、过期条件和关联代码版本。

**用户回复**

同意分层沉淀。

**阶段性结论**

知识库更新采用 **分层沉淀**：

- task workspace 保存全量过程资产。
- 知识库只接收经过验证的稳定知识。
- AI 可以生成知识沉淀候选，但不能自动写入主知识库。
- 写入前需要人工批准。
- 候选知识应标注来源任务、适用范围、过期条件、关联代码版本或系统版本。

## Q17：方案级产物的最低必备结构是什么？

**问题**

需求开发任务在进入“人工评审/批准编码”之前，方案级产物至少必须包含哪些内容？

**背景判断**

如果不定义最低产物结构，`auto-design` 会很容易生成一篇看起来完整、实际不能指导开发的长文。Hook 也无法判断“设计是否完成”。这里要定义的不是最终模板细节，而是准入门槛：缺了哪些内容，就不能进入 `design_ready`，更不能批准编码。

**候选方向**

1. **轻量结构**：需求背景、业务规则、方案说明、任务拆分、测试点。
2. **工程结构**：业务目标、范围/非范围、现状分析、业务规则、系统设计、接口/数据影响、模块实现方案、任务拆分、风险、测试策略、待确认问题。
3. **强模板结构**：按 SA/SE/MDE/TEST 固定模板完整输出，每个角色都有独立章节和检查清单。

**我的推荐**

选择 **工程结构**。

轻量结构太弱，容易让 AI 混过去；强模板结构又容易文档官僚化。工程结构更适合做准入门槛：既能覆盖需求到代码落地的关键决策，又不会强迫每个角色写重复内容。

**用户回复**

同意工程结构。

**阶段性结论**

方案级产物采用 **工程结构** 作为 `design_ready` 的最低准入结构：

- 业务目标
- 范围 / 非范围
- 现状分析
- 业务规则
- 系统设计
- 接口 / 数据影响
- 模块实现方案
- 开发任务拆分
- 风险与约束
- 测试策略
- 待确认问题

不采用过轻的方案说明，也不强制按岗位生成多份官僚化模板。Agent/Skill 可以按 SA、SE、MDE、TEST 视角补充内容，但最终必须汇总到可评审、可落地的工程结构中。

## Q18：`design_ready` 应该由 AI 自评通过，还是由硬性检查清单控制？

**问题**

当 workflow 要把任务状态推进到 `design_ready` 时，应该如何判断方案级产物已经达到可人工评审的最低质量？

**背景判断**

这是一个容易被忽略的门槛。如果只是让 AI 自己说“方案已完成”，那这个状态基本没有意义。更差的是，后续 hook 会把 `design_ready` 当成进入人工批准甚至编码的前置依据，所以它必须有可检查的结构化标准。

**候选方向**

1. **AI 自评**：AI 判断方案完整后，把状态改为 `design_ready`。
2. **硬性检查清单**：必须检查必备章节、未解决问题、引用证据、风险项、测试点、实现任务等。
3. **硬性检查清单 + AI 质量评审**：先做结构化门槛检查，再由相关 Agent 做质量评审，输出阻塞项和非阻塞建议。

**我的推荐**

选择 **硬性检查清单 + AI 质量评审**。

只做硬性检查会变成“标题齐全但内容空洞”；只做 AI 自评又太软。正确做法是先用检查清单拦住明显不完整的方案，再让 SE/MDE/TEST 等 Agent 从不同责任视角评审方案质量。存在阻塞项时不能进入 `design_ready`。

**用户回复**

同意硬性检查清单 + AI 质量评审。

**阶段性结论**

`design_ready` 判定采用 **硬性检查清单 + AI 质量评审**：

- 先做结构化完整性检查，确保必备章节、证据引用、风险项、测试点、任务拆分、待确认问题等满足最低要求。
- 再由相关 Agent 基于职责边界进行质量评审。
- 评审输出区分阻塞项和非阻塞建议。
- 存在阻塞项时，不能进入 `design_ready`。
- `design_ready` 不是 AI 自称完成，而是 workflow 可审计状态。

## Q19：人工批准应如何落盘，才允许进入代码落地？

**问题**

当人评审设计方案后，如何记录“允许进入代码落地”的批准？

**背景判断**

如果人工批准只存在于聊天上下文，例如用户说“同意，继续开发”，那 hook 和跨会话恢复都无法可靠判断。批准必须成为任务工作区中的一份稳定记录，而且应该指向被批准的方案版本。否则方案后续被修改了，批准记录就失去意义。

**候选方向**

1. **聊天批准**：用户在对话中说同意即可。
2. **状态字段批准**：command 把 `state.json` 的 `approvalStatus` 改为 approved。
3. **批准记录文件**：在 `approvals/` 下生成批准记录，包含批准人、时间、批准的产物版本/摘要/hash、范围和限制，同时更新 `state.json`。

**我的推荐**

选择 **批准记录文件 + state 更新**。

只改 state 太薄，缺少审计信息；只靠聊天更不可控。批准应该是一份明确产物，例如 `approvals/implementation-approval.json` 或 `.md`，记录批准对象和边界。Hook 读取 state 快速判断，必要时追溯 approval 文件。

**用户回复**

同意批准记录文件 + state 更新。

补充发现：设计包含多个阶段（需求业务设计、需求方案设计、实现设计、测试设计等），这些不同设计阶段的状态需要具备区分能力。

**阶段性结论**

人工批准采用 **批准记录文件 + state 更新**。

同时修正状态模型：不能只有单一 `design_ready`，需要区分不同设计阶段的状态。

初步结论：

- 批准必须落盘到 `approvals/`，并更新 `state.json`。
- 批准记录需要指向被批准的产物版本、摘要或 hash。
- 工作流状态应包含整体阶段状态，也应包含各设计阶段状态。
- 需求业务设计、需求方案设计、实现设计、测试设计等阶段应分别具备状态、评审结果和批准记录。

## Q20：设计阶段状态应采用“独立阶段状态机”，还是只在总状态中枚举？

**问题**

针对需求业务设计、需求方案设计、实现设计、测试设计等多个设计阶段，状态模型应该如何表达？

**背景判断**

这是状态模型的关键设计。如果只用一个总状态字段，例如 `stage=design_ready`，就无法表达“业务设计已通过、系统方案待评审、实现设计有阻塞、测试设计未开始”。但如果每个阶段都做一套过度复杂的状态机，MVP 又会变重。

**候选方向**

1. **单一总状态**：只用 `stage` 表示当前流程位置，例如 `business_design`、`solution_design`、`implementation_design`。
2. **阶段状态集合**：总状态 + 每个设计阶段独立状态，例如 `businessDesign.status`、`solutionDesign.status`、`implementationDesign.status`、`testDesign.status`。
3. **完整子工作流状态机**：每个设计阶段都有自己的输入、输出、评审、批准、阻塞项、版本和责任 Agent。

**我的推荐**

选择 **阶段状态集合**，并为后续演进预留子工作流字段。

单一总状态太粗，无法支持你的 Human-in-loop；完整子工作流状态机第一版又太重。阶段状态集合足够表达 MVP 的核心需求：每个阶段是否未开始、进行中、待评审、需返工、已通过，同时整体 workflow 仍有一个当前阶段。

**用户回复**

同意阶段状态集合，并预留后续扩展。

**阶段性结论**

状态模型采用 **整体状态 + 阶段状态集合**：

- 整体状态表达 workflow 当前主阶段。
- 阶段状态集合表达各设计阶段的独立进度和评审结果。
- 第一版不做过重的完整子工作流状态机，但字段设计预留后续扩展。

初步阶段包括：

- `businessDesign`：需求业务设计
- `solutionDesign`：需求/系统方案设计
- `implementationDesign`：实现设计
- `testDesign`：测试设计

阶段状态至少包括：

- `not_started`
- `in_progress`
- `review_ready`
- `rework_required`
- `approved`

## Q21：设计阶段之间是严格串行，还是允许部分并行？

**问题**

需求业务设计、需求方案设计、实现设计、测试设计这些阶段，在 workflow 中应该严格串行推进，还是允许部分阶段并行？

**背景判断**

你原始流程里有明显的串行和并行混合：SA -> SE 基本串行；MDE 实现设计和 TEST 测试设计可以在 SE 方案后并行；评审又会交叉。如果插件强制全串行，会慢且不符合真实协作；如果完全并行，会在上游设计未稳定时制造大量返工。

**候选方向**

1. **严格串行**：业务设计通过后做方案设计，方案设计通过后做实现设计，再做测试设计。
2. **完全并行**：各 Agent 尽早并行产出，再统一合并。
3. **有依赖的部分并行**：业务设计批准后进入方案设计；方案设计达到 review_ready 后，MDE 实现设计和 TEST 测试设计可并行，但最终批准前需要一致性评审。

**我的推荐**

选择 **有依赖的部分并行**。

完全串行太慢，完全并行太乱。合理的依赖是：业务规则和范围必须先稳定；系统方案至少达到可评审状态后，MDE 和 TEST 才并行展开。这样既保留协作效率，也避免在需求还没定时就拆实现任务。

**用户回复**

同意有依赖的部分并行。

**阶段性结论**

设计阶段采用 **有依赖的部分并行**：

- 需求业务设计需要先稳定，至少达到已批准或可评审状态，才能可靠进入后续系统方案设计。
- 系统/需求方案设计达到 `review_ready` 后，MDE 实现设计和 TEST 测试设计可以并行展开。
- 并行阶段结束后，需要做一致性评审，避免实现方案、测试方案和系统方案之间出现口径不一致。
- workflow 需要表达阶段依赖，而不是简单线性推进。

## Q22：多 Agent 产物应由谁合并到最终方案？

**问题**

当 SA、SE、MDE、TEST 等 Agent 分别产出业务设计、系统方案、实现设计、测试设计或评审意见后，谁负责把这些内容合并成最终可批准的方案产物？

**背景判断**

这是多 Agent 系统很容易翻车的地方。如果每个 Agent 都直接写同一个最终文档，会出现互相覆盖、重复、风格混乱和口径漂移。如果让用户手动合并，插件价值会下降。必须有一个明确的“整合者”机制，负责把多方产物整理成一致的工程方案，同时保留原始评审记录。

**候选方向**

1. **各 Agent 直接写最终方案**：谁负责哪个章节就直接修改最终文档。
2. **Workflow 汇总合并**：各 Agent 先输出独立草稿/评审记录，workflow 再调用汇总 skill 生成统一方案。
3. **设置总设计 Agent**：例如 Lead Architect / Tech Lead Agent 作为最终整合者。

**我的推荐**

选择 **Workflow 汇总合并 + 可选 Lead 视角复核**。

不要让多个 Agent 直接争抢最终文档。更稳的是每个 Agent 输出结构化阶段产物和评审记录，workflow 使用汇总 skill 合并为统一方案；如果需求复杂，再调用 Lead/SE 视角做一致性复核。这样既保留多角色专业性，又避免文档混乱。

**用户回复**

指出需要修正：每个 Agent 输出设计文档后，Agent 之间还有交叉评审机制。每个 Agent 评审对象不只一个。评审主体应该是对应的设计文档，而不是 Agent。

例如 SE 输出的设计文档，MDE、TEST、SA 都会评审质量。

**阶段性结论**

修正原模型：多 Agent 评审应采用 **产物中心的交叉评审**，而不是 Agent 中心的单一 review 文件。

关键结论：

- Agent 是评审者，不是评审记录的主体。
- 设计文档才是评审主体，例如 `solution-design.md`、`implementation-design.md`、`test-design.md`。
- 同一份设计文档可以有多个评审者，例如 SA、MDE、TEST 同时评审 SE 的方案。
- 评审记录应能表达“谁评审了哪份产物、发现了什么问题、问题是否阻塞、是否已关闭”。
- 汇总方案只能整合已完成必要交叉评审的产物，不能跳过评审矩阵。

原先示例中的 `se-review.md`、`mde-review.md` 命名不准确，后续应改成按设计产物组织，例如：

```text
reviews/
  solution-design/
    sa-review.md
    mde-review.md
    test-review.md
  implementation-design/
    se-review.md
    test-review.md
    dev-review.md
  test-design/
    sa-review.md
    se-review.md
    mde-review.md
```

## Q23：交叉评审记录应按“被评审产物”组织，还是按“评审者”组织？

**问题**

既然评审主体是设计产物，那么评审记录的文件结构应该如何组织？

**背景判断**

这里会影响后续 workflow 的一致性检查。如果按评审者组织，例如 `mde-review.md`，很难快速看出某份设计文档是否已经被所有必要角色评审完。如果按被评审产物组织，则更容易判断某个设计阶段是否可以推进。

**候选方向**

1. **按评审者组织**：`reviews/mde-review.md`、`reviews/test-review.md`。
2. **按被评审产物组织**：`reviews/solution-design/mde-review.md`、`reviews/solution-design/test-review.md`。
3. **结构化评审矩阵 + Markdown 明细**：用 `reviews/review-matrix.json` 记录评审覆盖、状态、阻塞项；Markdown 文件保存具体评审意见。

**我的推荐**

选择 **结构化评审矩阵 + 按被评审产物组织 Markdown 明细**。

原因是 workflow 和 hooks 需要快速判断“某份产物是否完成必要评审、是否还有阻塞项”，这类判断不适合从一堆 Markdown 里猜。`review-matrix.json` 用于机器判断，Markdown 用于人类阅读。

**用户回复**

同意结构化评审矩阵 + 按被评审产物组织 Markdown 明细。

**阶段性结论**

交叉评审采用 **结构化评审矩阵 + 按被评审产物组织 Markdown 明细**：

- `review-matrix.json` 记录每份产物的必要评审者、评审状态、阻塞项数量、是否通过。
- Markdown 明细按被评审产物组织，用于保存具体评审意见。
- workflow 判断阶段是否可推进时优先读取结构化矩阵。
- 人工查看问题时阅读 Markdown 明细。

推荐结构：

```text
reviews/
  review-matrix.json
  solution-design/
    sa-review.md
    mde-review.md
    test-review.md
  implementation-design/
    se-review.md
    test-review.md
    dev-review.md
  test-design/
    sa-review.md
    se-review.md
    mde-review.md
```

## Q24：必要评审矩阵应该固定内置，还是按任务动态生成？

**问题**

每类设计产物必须由哪些 Agent 评审，这个评审矩阵应该如何确定？

**背景判断**

如果完全固定，简单可靠，但会让所有需求都走同样重的评审流程。如果完全动态，灵活但不稳定，AI 可能为了推进流程而少选评审者。这里需要在规范性和灵活性之间做取舍。

**候选方向**

1. **固定内置矩阵**：每类产物固定评审者，例如 solution-design 必须 SA/MDE/TEST 评审。
2. **AI 动态生成矩阵**：根据需求复杂度、影响面、风险，动态决定评审者。
3. **基础矩阵 + 风险增强**：内置最低评审矩阵；AI 根据风险追加评审者，例如涉及部署时追加 CIE。

**我的推荐**

选择 **基础矩阵 + 风险增强**。

完全固定会过重，完全动态会失控。基础矩阵保证最低质量门槛，风险增强保证复杂需求不会漏掉 CIE、安全、性能、数据等专项评审。

**用户回复**

同意基础矩阵 + 风险增强。

**阶段性结论**

必要评审矩阵采用 **基础矩阵 + 风险增强**：

- 基础矩阵定义每类设计产物的最低必要评审者。
- AI 根据复杂度和风险追加专项评审者。
- 追加规则需要结构化记录到 `review-matrix.json`，不能只写在对话里。
- workflow 只有在必要评审完成且无阻塞项时，才能推进对应阶段。

## Q25：MVP 的基础评审矩阵应该怎么定义？

**问题**

在不考虑风险增强的情况下，MVP 第一版的基础评审矩阵应该如何定义？

**背景判断**

基础矩阵不能太轻，否则评审形同虚设；也不能太重，否则每个简单需求都被流程拖死。这里要按“谁最有能力发现该产物的关键缺陷”来定义，而不是按组织礼貌让所有人都评一遍。

**候选方向**

1. **全员评审所有产物**：SA/SE/MDE/DEV/TEST 都评审每份设计。
2. **关键角色评审**：每份产物只配置最关键的 2-3 个评审者。
3. **分级评审**：简单需求关键角色评审；复杂/高风险需求扩展到更多角色。

**我的推荐**

选择 **分级评审**，MVP 基础矩阵按关键角色评审起步。

初步基础矩阵建议：

- `business-design`：SE、TEST 评审；MDE 按需参与。
- `solution-design`：SA、MDE、TEST 评审。
- `implementation-design`：SE、DEV、TEST 评审。
- `test-design`：SA、SE、MDE 评审。

DEV 是否评审 `solution-design` 可以按团队习惯决定。我的倾向是 DEV 默认不评 SE 方案，除非已绑定具体代码仓库或需求实现风险较高；否则 DEV 太早介入会增加噪音。

**用户回复**

同意分级评审，基础矩阵按关键角色起步。

修正：`business-design` 仅需要 SE 评审，其他建议不变。

**阶段性结论**

MVP 基础评审矩阵确定为 **分级评审 + 关键角色基础矩阵**。

基础矩阵：

- `business-design`：SE 评审。
- `solution-design`：SA、MDE、TEST 评审。
- `implementation-design`：SE、DEV、TEST 评审。
- `test-design`：SA、SE、MDE 评审。

风险增强规则仍可追加评审者：

- 涉及部署、配置、流水线、环境、发布策略：追加 CIE。
- 涉及安全、权限、审计：追加安全/权限专项视角（MVP 可由 SE 或 TEST 兼任，后续可扩展安全 Agent）。
- 涉及性能、容量、稳定性：追加性能/稳定性专项视角（MVP 可由 SE/MDE 兼任）。
- 涉及数据迁移或数据模型变更：追加 MDE/DEV/TEST 的数据影响检查。

## Q26：评审阻塞项应如何关闭？

**问题**

当某个设计文档的交叉评审发现阻塞项后，阻塞项应该如何关闭，workflow 才能继续推进？

**背景判断**

评审不是写意见就结束。真正影响流程的是阻塞项的生命周期：提出、修订、复核、关闭。如果没有明确关闭机制，AI 可能改了文档后自己宣布问题解决；或者评审意见永远挂着，流程无法判断是否可以继续。

**候选方向**

1. **产物作者自闭环**：被评审产物的作者 Agent 修改后，自行标记阻塞项已关闭。
2. **原评审者复核关闭**：谁提出阻塞项，谁负责复核并关闭。
3. **Workflow 统一关闭**：workflow 根据修改记录和 AI 判断统一关闭阻塞项。

**我的推荐**

选择 **原评审者复核关闭**。

阻塞项不能由被批评的人自己关，也不应该由 workflow 盲目关。谁提出阻塞问题，谁最清楚是否修到位。workflow 负责状态流转和提醒，但关闭权应归原评审者 Agent；高风险或人工模式下，还需要人确认。

**用户回复**

同意原评审者复核关闭。

**阶段性结论**

评审阻塞项采用 **原评审者复核关闭**：

- 阻塞项由评审者提出。
- 被评审产物的作者 Agent 负责修订。
- 原评审者 Agent 负责复核并关闭该阻塞项。
- workflow 负责跟踪状态、提醒、阻止未关闭阻塞项的阶段推进。
- 高风险任务或 `strict-human-loop` 模式下，关键阻塞项关闭还需要人工确认。

## Q27：代码落地前是否需要单独的开发执行计划？

**问题**

在人工批准设计方案后，DEV Agent 是否可以直接开始改代码，还是必须先生成一份开发执行计划？

**背景判断**

这是从“设计”进入“编码”的关键桥。实现设计通常还不等于开发计划。开发计划需要明确改哪些仓库、哪些文件/模块、任务顺序、测试命令、回滚点、风险控制。如果跳过这个环节，DEV Agent 很容易边想边改，最后变成不可审计的一坨变更。

**候选方向**

1. **直接编码**：设计批准后，DEV Agent 根据实现设计直接改代码。
2. **生成开发执行计划但无需批准**：DEV 先输出计划，随后自动执行。
3. **生成开发执行计划并可选人工确认**：默认输出计划；简单需求可自动执行，高风险或 strict 模式需人工确认。

**我的推荐**

选择 **生成开发执行计划并可选人工确认**。

设计批准只说明“方向可以做”，不代表“每一步代码改动都已经规划好”。开发执行计划是代码阶段的护栏。简单需求可以计划后自动执行；复杂需求必须让人看一眼，尤其是多仓库、数据迁移、权限、部署相关改动。

**用户回复**

同意生成开发执行计划并可选人工确认。

**阶段性结论**

代码落地前需要生成 **开发执行计划**：

- 设计批准后不能直接进入代码修改。
- DEV Agent 需要先产出开发执行计划。
- 简单需求可在计划生成后自动执行。
- 高风险任务或 `strict-human-loop` 模式下，开发执行计划需要人工确认。

开发执行计划至少包含：

- 关联代码仓库
- 预计修改模块/文件
- 实现步骤顺序
- 测试与验证命令
- 回滚/恢复策略
- 风险点与控制措施
- 是否需要 CIE 或额外专项评审

## Q28：Hook 应该强制拦截哪些行为？

**问题**

在 MVP 中，Claude Code plugin 的 hooks 应该强制拦截哪些行为，哪些行为只做提示？

**背景判断**

Hook 是安全闸口，但不能把它做成过度干预的流程警察。MVP 最关键的硬拦截是：未批准方案时禁止代码落地；未绑定任务时禁止把代码变更混进某个任务；存在未关闭阻塞项时禁止推进批准。其他事项可以先做 warning。

**候选方向**

1. **弱 Hook**：只提示，不阻断。
2. **强 Hook**：所有不符合流程的行为都阻断。
3. **关键硬闸口 + 其他提示**：只强制拦截高风险动作，其余给出 warning。

**我的推荐**

选择 **关键硬闸口 + 其他提示**。

硬拦截建议包括：

- 未绑定 active task 时，阻止执行需求落地相关的代码修改命令。
- 任务未进入 `approved_for_implementation` 时，阻止代码文件修改。
- 设计评审存在未关闭阻塞项时，阻止生成实现批准。
- 开发执行计划缺失时，阻止代码落地。
- 代码修改范围超出批准范围时，阻止或要求用户重新批准。

其他情况先 warning，例如缺少测试建议、CIE 风险未评估、知识引用不足等。

**用户回复**

同意关键硬闸口 + 其他提示。

补充要求：建议项也必须经过人工二次确认通过后才能放行。

**阶段性结论**

Hook 采用 **关键硬闸口 + 提示项人工确认**：

- 硬阻塞项必须修复并由原评审者复核关闭。
- 非阻塞建议项不能由 AI 自动忽略。
- 非阻塞建议项需要人工二次确认，明确选择处理、接受风险或延期处理后，workflow 才能继续放行。
- hook 对硬闸口执行阻断；对提示项检查是否存在人工确认记录。

硬拦截包括：

- 未绑定 active task 时，阻止需求落地相关代码修改。
- 任务未进入 `approved_for_implementation` 时，阻止代码文件修改。
- 设计评审存在未关闭阻塞项时，阻止生成实现批准。
- 开发执行计划缺失时，阻止代码落地。
- 代码修改范围超出批准范围时，阻止或要求重新批准。

提示项需要人工确认，包括：

- 缺少测试建议。
- CIE 风险未评估。
- 知识引用不足。
- 非阻塞设计建议未处理。
- 低风险但存在不确定性的实现建议。

## Q29：代码落地后的验证范围应该到什么程度？

**问题**

DEV Agent 完成代码修改后，MVP 第一版要求验证到什么程度，才算代码落地完成？

**背景判断**

“代码写完”不是完成。至少要有本地验证、测试结果和转测说明。但如果一开始要求完整 CI/CD、部署验证、端到端回归，MVP 会被环境复杂度拖垮。这里要定义一个务实的完成标准。

**候选方向**

1. **代码完成即可**：只要代码修改完成，输出说明。
2. **本地验证完成**：运行相关单测/静态检查/构建，记录结果和失败项。
3. **转测包完成**：本地验证 + 测试说明 + 影响范围 + 回归建议 + 已知风险，必要时附 CI/CIE 指引。

**我的推荐**

选择 **转测包完成**。

MVP 不必强制跑完所有 CI/CD，但必须输出可交给 TEST 的转测包。否则 TEST Agent/真实测试人员拿不到足够信息，只能重新理解一遍需求和代码变更。

**用户回复**

同意转测包完成。

**阶段性结论**

代码落地完成标准采用 **转测包完成**：

- DEV Agent 完成代码修改后，不能只输出“代码已完成”。
- MVP 不强制完整 CI/CD 或部署验证。
- 必须形成可交给 TEST 或真实测试人员的转测包。

转测包至少包含：

- 本地验证结果
- 运行过的测试/检查命令
- 未运行测试及原因
- 代码变更摘要
- 影响范围
- 回归建议
- 已知风险
- 测试环境/数据准备建议
- 必要时附 CI/CIE 指引

## Q30：MVP 插件包第一版应包含哪些 Claude Code 组件？

**问题**

现在架构方向已经基本清晰，MVP 第一版的 Claude Code plugin 包应该实际包含哪些组件？

**背景判断**

这是从产品设计进入插件设计的关键收敛点。你最初提到 Agent、Skill、docs/tools，但现在已经确认还需要 workflow command、hooks、任务工作区、知识库 MCP 接入等。必须明确 MVP 包含哪些、暂不包含哪些，否则设计会继续膨胀。

**候选方向**

1. **轻量插件**：只包含 skills 和 agents，不做 hooks/commands。
2. **流程插件**：commands + skills + agents + hooks + 本地 scripts，MCP 配置预留。
3. **完整插件**：commands + skills + agents + hooks + MCP server + monitors + LSP + status line 等全部铺开。

**我的推荐**

选择 **流程插件**。

轻量插件挡不住未批准编码，也无法管理任务状态；完整插件第一版太重。MVP 应该先把“需求到代码落地”的核心流程跑通：commands 负责入口和推进，skills 负责能力，agents 负责角色上下文，hooks 负责闸口，scripts 负责状态/矩阵/校验等确定性逻辑。MCP 知识库接入可以定义接口和配置，但真实 server 可按团队现有能力接入。

**用户回复**

同意流程插件。

**阶段性结论**

MVP 第一版采用 **流程插件**：

- `commands`：负责任务创建、阶段推进、批准、实现、验证等入口。
- `skills`：负责需求分析、方案设计、评审、实现拆解、编码、测试设计、知识查询等可复用能力。
- `agents`：提供 SA、SE、MDE、DEV、TEST、按需 CIE 等角色上下文。
- `hooks`：负责未批准编码、阻塞项、范围越界等关键闸口。
- `scripts`：负责 task workspace、状态文件、评审矩阵、检查清单、批准记录等确定性逻辑。
- `mcpServers`：预留私域知识库接入配置，真实 MCP server 可后续对接。

暂不作为 MVP 必需：

- monitors
- LSP servers
- status line
- 完整 CI/CD 或部署自动化
- 完整 bug-fix workflow

## Q31：MVP 命令入口应该如何适配 Claude Code 的真实命令格式？

**用户问题**

Claude Code 支持命令中间带空格这种格式吗？同时你提出的这些子命令我理解，但是工作流的命令触发逻辑没看出来。

**背景判断**

需要修正我前面的说法。Claude Code 的 custom commands 已经合并到 skills。官方文档说明，skill 的调用名来自 skill 所在目录或插件命名空间；plugin skills 使用 `plugin-name:skill-name` 的命名空间，例如 `my-plugin/skills/review/SKILL.md` 对应 `/my-plugin:review`。空格后面的内容更适合理解为传给该 skill 的参数，而不是传统 CLI 的原生子命令。

因此，`/devsphere init` 这种写法不是一个天然的“命名空间 + 子命令”结构，而更像调用 `/devsphere` 并传入参数 `init`。如果要获得清晰入口，更符合 Claude Code 的方式是使用多个插件 skill 命令，例如 `/scc-dev-sphere:init`、`/scc-dev-sphere:design`、`/scc-dev-sphere:review`。

**候选方向**

1. **单一 Router Skill**：例如 `/scc-dev-sphere:workflow init`，用 `$ARGUMENTS` 分发 action。
2. **多个插件 Skill 命令**：例如 `/scc-dev-sphere:init`、`/scc-dev-sphere:design`、`/scc-dev-sphere:review`、`/scc-dev-sphere:approve`、`/scc-dev-sphere:implement`、`/scc-dev-sphere:verify`。
3. **混合模式**：保留 `/scc-dev-sphere:workflow` 作为总入口，同时提供常用阶段 skill 命令。

**我的推荐**

选择 **多个插件 Skill 命令 + 一个可选 workflow 总入口**。

不建议把所有动作都塞进 `/scc-dev-sphere:workflow <action>`，因为 discoverability 差，用户也不容易记住参数。更好的 MVP 入口是：

```text
/scc-dev-sphere:init
/scc-dev-sphere:assess
/scc-dev-sphere:design
/scc-dev-sphere:review
/scc-dev-sphere:approve
/scc-dev-sphere:plan-implementation
/scc-dev-sphere:implement
/scc-dev-sphere:verify
/scc-dev-sphere:status
```

同时可保留：

```text
/scc-dev-sphere:workflow
```

作为默认流程入口，由它读取 task state 并提示下一步。

工作流触发逻辑不应该靠“命令名本身自动串流程”，而应该是：

1. 用户调用某个阶段 skill 命令。
2. skill 读取 `.devsphere/current-task.json` 和任务 `state.json`。
3. skill 根据当前状态决定允许执行的动作。
4. 确定性脚本更新状态、评审矩阵、批准记录。
5. hook 在文件修改和阶段推进时执行硬闸口校验。
6. skill 执行完成后提示下一步可调用的命令。

**用户回复**

同意多个插件 Skill 命令 + 一个可选 workflow 总入口。

补充问题：上述 workflow 命令没有体现不同流程的差异。当前做的是需求开发流程，后续新增 bugfix 等流程时无法区分。

**阶段性结论**

修正命令模型：命令入口需要同时表达 **任务类型 task type** 和 **阶段动作 action**，不能只有通用 action。

更合理的 MVP 命令分层：

```text
/scc-dev-sphere:feature-init
/scc-dev-sphere:feature-assess
/scc-dev-sphere:feature-design
/scc-dev-sphere:feature-review
/scc-dev-sphere:feature-approve
/scc-dev-sphere:feature-plan-implementation
/scc-dev-sphere:feature-implement
/scc-dev-sphere:feature-verify
```

通用命令保留为跨流程能力：

```text
/scc-dev-sphere:status
/scc-dev-sphere:workflow
/scc-dev-sphere:task-list
/scc-dev-sphere:task-switch
```

未来扩展：

```text
/scc-dev-sphere:bugfix-init
/scc-dev-sphere:bugfix-diagnose
/scc-dev-sphere:bugfix-plan
/scc-dev-sphere:bugfix-implement
/scc-dev-sphere:bugfix-verify
```

工作流触发逻辑：

1. task-type 命令创建或推进特定类型任务，例如 `feature-development`。
2. 命令读取当前 task workspace 的 `taskType` 和 `stage`。
3. 如果命令和 taskType 不匹配，拒绝执行或提示切换任务。
4. 通用 workflow 命令只负责读取当前状态并推荐下一步，不替代具体 task-type 命令。
5. 后续扩展 bugfix、refactor、performance 时，通过新增 task-type 命令和对应 workflow template 实现。

## Q32：命令命名应采用 task-type 前缀，还是单命令参数指定 task type？

**问题**

为了区分需求开发、问题修复、重构、性能优化等工作流，命令命名应该采用哪种方式？

**背景判断**

这是可发现性和可扩展性的取舍。`/scc-dev-sphere:feature-design` 这种命令清楚但数量会增加；`/scc-dev-sphere:design feature` 命令少但容易把 task type 藏在参数里，用户和模型都更容易误用。

**候选方向**

1. **task-type 前缀命令**：`feature-design`、`bugfix-diagnose`、`refactor-plan`。
2. **通用 action 命令 + 参数**：`design feature`、`plan bugfix`。
3. **混合模式**：MVP 使用 task-type 前缀命令；保留 `workflow` 作为智能导航入口。

**我的推荐**

选择 **混合模式**。

具体流程用 task-type 前缀命令，避免语义混乱；通用 `/scc-dev-sphere:workflow` 只做状态导航和下一步推荐。这样未来扩展 bugfix 不会污染 feature 的阶段语义。

**用户回复**

同意混合模式。

**阶段性结论**

命令命名采用 **task-type 前缀命令 + workflow 导航入口**：

- 具体流程命令显式携带任务类型，例如 `feature-design`、`bugfix-diagnose`。
- 通用命令用于状态查看、任务切换、下一步推荐。
- `/scc-dev-sphere:workflow` 只做智能导航和默认路径提示，不替代具体流程命令。

MVP 需求开发命令建议：

```text
/scc-dev-sphere:feature-init
/scc-dev-sphere:feature-assess
/scc-dev-sphere:feature-design
/scc-dev-sphere:feature-review
/scc-dev-sphere:feature-approve
/scc-dev-sphere:feature-plan-implementation
/scc-dev-sphere:feature-implement
/scc-dev-sphere:feature-verify
```

通用命令建议：

```text
/scc-dev-sphere:workflow
/scc-dev-sphere:status
/scc-dev-sphere:task-list
/scc-dev-sphere:task-switch
```

后续扩展：

```text
/scc-dev-sphere:bugfix-init
/scc-dev-sphere:bugfix-diagnose
/scc-dev-sphere:bugfix-plan
/scc-dev-sphere:bugfix-implement
/scc-dev-sphere:bugfix-verify
```

## Q33：是否进入设计文档二次确认阶段？

**问题**

到目前为止，我认为 MVP 设计的关键架构决策已经基本澄清。是否可以进入“二次确认”阶段：我先汇总完整设计结论给你确认；你确认后，我再把完整 PRD 和技术方案设计文档保存到仓库？

**背景判断**

你最初明确要求：在我认为所有设计方案细节澄清后，向你二次确认，只有得到确认后，再将完整设计文档保存下来。现在还不应该直接生成最终文档，应该先做一次设计收敛确认。

**当前已澄清的关键点**

- MVP 范围：需求从设计到开发落地，问题修改预留骨架。
- 插件形态：Claude Code 流程插件，不是自建 Agent runtime。
- 组件组合：commands/skills/agents/hooks/scripts，MCP 预留。
- 工作区：Claude 工作空间级 `.devsphere` task workspace。
- 工作流模式：auto-design、strict-human-loop、collaborative-design。
- 模式选择：AI 推荐 + 用户确认，硬规则 + AI 解释。
- Agent 模型：双层映射，岗位语义 + 产物责任。
- 状态模型：整体状态 + 各设计阶段状态集合。
- 设计阶段：业务设计、方案设计、实现设计、测试设计。
- 阶段推进：有依赖的部分并行。
- 评审模型：产物中心交叉评审，review matrix + Markdown 明细。
- 阻塞项：原评审者复核关闭；建议项人工确认。
- 批准机制：批准记录文件 + state 更新。
- 代码落地：开发执行计划，必要时人工确认。
- 完成标准：转测包完成。
- 命令模型：task-type 前缀命令 + workflow 导航入口。

**我的建议**

进入二次确认阶段。我下一步应该输出一份“完整设计确认稿摘要”，不直接落盘最终 PRD/技术方案。你确认后，我再创建正式文档。

**用户回复**

同意混合模式。

**阶段性结论**

命令命名采用 **混合模式**：

- 具体工作流命令使用 task-type 前缀，例如 `feature-design`、`bugfix-diagnose`。
- 通用 `workflow` 命令作为智能导航入口，只负责读取当前任务状态并推荐下一步。
- 命令执行时必须校验当前 task workspace 的 `taskType`，避免在 feature 任务中误用 bugfix 命令，或反过来。
- 未来扩展 bugfix、refactor、performance 时，通过新增 task-type 命令和对应 workflow template 实现，不复用 feature 阶段语义。
- 由于后续又发现设计命令粒度和评审闭环需要进一步澄清，暂不进入最终文档生成。

## Q34：单个 `feature-design` 命令是否和多设计 Agent 冲突？

**用户问题**

设计阶段有 SE、MDE、TEST 都会执行，但是命令中只看到了一个设计命令，这块有冲突吗？

**我的回复**

不冲突，但需要修正命令语义。

`/scc-dev-sphere:feature-design` 不应该理解为“只让一个设计 Agent 写一份设计”，而应该理解为 **需求开发设计阶段的编排入口**。它内部根据当前 task state、workflow mode 和阶段状态集合，决定推进哪些设计阶段：

- SA / `businessDesign`：需求业务设计
- SE / `solutionDesign`：需求方案/系统方案设计
- MDE / `implementationDesign`：实现设计
- TEST / `testDesign`：测试设计

因此命令可以分两层：

```text
/scc-dev-sphere:feature-design
/scc-dev-sphere:feature-design-business
/scc-dev-sphere:feature-design-solution
/scc-dev-sphere:feature-design-implementation
/scc-dev-sphere:feature-design-test
```

`feature-design` 是智能编排入口，负责按当前状态推进下一个或一组设计阶段；分阶段命令用于严格人工模式、重跑某个阶段、修订某类设计产物，或者用户明确只想处理某个设计阶段。

**阶段性结论**

命令需要区分 **workflow 编排入口** 和 **阶段动作入口**。`feature-design` 是编排命令，不代表只有一个设计阶段或一个设计 Agent。

## Q35：设计评审是否应该形成 AI 内部循环反馈，再进入人工最终评审？

**用户问题**

在设计完成后的评审环节，整体应该是一个循环反馈的工作流：如果评审有问题，要反馈给设计 Agent 再重新修改设计，修改完成后再重新触发一次评审。这个环节只有当 AI 遇到无法确定、必须人工提供信息输入或者决策的时候再和人交互；当 AI 评审无误后，再让人工进行最终评审。

**我的回复**

同意，这个补充非常关键。`feature-review` 不应该只是“跑一次交叉评审”，而应该是 **AI 评审-修订闭环**。

推荐流程：

```text
设计产物生成
  -> AI 交叉评审
  -> 发现阻塞项/建议项
  -> 回传给对应设计 Agent 修订
  -> 原评审 Agent 复核
  -> 未关闭则继续循环
  -> AI 判定无阻塞项
  -> 建议项整理为人工确认清单
  -> 人工最终评审
  -> 批准后进入实现计划
```

AI 只在这些情况下打断人：

- 需求信息不足，无法继续判断。
- 存在多个合理方案，必须由业务或技术负责人决策。
- 评审 Agent 之间出现无法自动调和的冲突。
- 风险项需要人工接受或改变范围。
- 建议项需要人工确认处理、接受风险或延期。

设计影响：

- `feature-review` 默认执行 AI 内部闭环，而不是每发现一个问题就问人。
- `strict-human-loop` 模式下，每个阶段闭环完成后都需要人工确认。
- `auto-design` 模式下，AI 可以自动循环修订，直到无阻塞项，再进入人工最终评审。
- 所有循环次数、阻塞项、修订记录、复核结果都要写入 task workspace。
- 需要设置最大循环次数，避免 AI 在评审-修订之间无限转圈。达到上限后必须请求人工介入。

**阶段性结论**

设计评审阶段应定义为 **AI 内部评审-修订闭环 + 人工最终评审**，而不是单次评审动作。

**用户回复**

同意。

## Q44：阶段状态是否需要记录 `drafting` 这类过程状态？

**用户问题**

你提出的这些状态能否适配三种工作流模式？这里面对于 `drafting` 这种过程中状态是否有定义的价值？

**我的回复**

这个质疑成立。`drafting` 这种命令执行中的瞬时状态不适合持久化。Claude Code plugin 不是长驻工作流服务，命令执行通常是一次性动作；如果命令中途失败，靠日志、产物存在性和校验结果恢复，比靠 `drafting` 这种半成品状态更可靠。

阶段状态应该表达“产物是否可作为下游正式输入”，而不是表达“AI 正在工作”。

推荐收敛为 8 个持久状态：

```text
not_started
drafted
ai_rework_required
ai_review_passed
human_review_required
human_rework_required
human_approved
blocked
```

三种工作流模式复用同一套状态：

- `auto-design`：AI 可以自动完成 `drafted -> ai_review_passed` 的内部评审修订循环，但不能越过 `human_review_required`。
- `strict-human-loop`：每个阶段产物生成后必须进入 `human_review_required`，可只做轻量 AI 自检。
- `collaborative-design`：差异主要体现在 `drafted` 之前的人机协同澄清和决策记录，不需要独立状态机。

**用户回复**

同意，后续提供的方案不要过度设计。

**阶段性结论**

正式采用 8 个阶段持久状态：

```text
not_started
drafted
ai_rework_required
ai_review_passed
human_review_required
human_rework_required
human_approved
blocked
```

不持久化 `drafting`、`ai_reviewing` 等命令执行过程状态。`ai_review_passed` 只表示 AI 内部无阻塞，不代表阶段完成；只有 `human_approved` 才能作为下游阶段正式输入。

后续设计原则调整为：优先采用最少状态、最少命令、最少文件支撑硬约束，避免把 Claude Code plugin 设计成过重的工作流平台。

## Q43：`feature-design` 与阶段设计命令的关系应如何定义？

**我的问题**

评审发现 `feature-design`、`feature-design-business`、`feature-design-solution`、`feature-design-implementation`、`feature-design-test` 的关系还不够硬。我的推荐是：`feature-design` 只做“下一步推进器”，读取 `state.json` 后只推进当前允许推进的下一个阶段；阶段命令只处理对应单一文档；已人工批准阶段默认只读，如需修改必须显式进入修订模式，并记录原因。

推荐语义：

```text
businessDesign 未达到当前模式要求的可用状态
  -> 只推进 businessDesign

businessDesign 已达到当前模式要求的可用状态，solutionDesign 未达到当前模式要求的可用状态
  -> 只推进 solutionDesign

solutionDesign 已达到当前模式要求的可用状态，implementationDesign/testDesign 未达到当前模式要求的可用状态
  -> 可并行或按命令推进 implementationDesign/testDesign

全部阶段达到当前模式要求的可用状态
  -> 生成/刷新 integrated-design 或提示进入 final approval
```

**用户回复**

同意。

**阶段性结论**

正式采用以下命令语义：

- `feature-design` 是设计编排命令，只推进当前任务中下一个允许推进的设计阶段。
- `feature-design-business`、`feature-design-solution`、`feature-design-implementation`、`feature-design-test` 是阶段命令，只处理对应单一设计产物。
- 已人工批准的阶段产物默认只读，`feature-design` 不能自动覆盖。
- 如需修改已人工批准的阶段，必须显式进入对应阶段命令的修订模式，并记录原因、影响范围和重新评审要求。
- 普通设计推进不得跳过当前工作流模式要求的前置状态，也不得跳过代码落地前的最终人工批准闸口。

## Q39：业务设计和方案设计后是否也需要评审闭环？

**用户问题**

PRD 中有部分内容需要再讨论：需求从设计到代码落地流程中，业务设计和方案设计后需要评审环节，PRD 中只有实现/测试环节后有评审环节。

**我的回复**

这个指出是对的，PRD 表述需要修正。

完整需求开发链路不应该是“所有设计都完成后才统一评审”，而应该是 **每个关键设计阶段都有对应评审闭环**，同时在进入实现前再做一次集成一致性评审。

更准确的阶段流：

```text
需求输入
  -> business-design
  -> business-design review
  -> business-design rework loop
  -> business-design approved

  -> solution-design
  -> solution-design review
  -> solution-design rework loop
  -> solution-design approved / review_ready

  -> implementation-design & test-design
  -> implementation-design review loop
  -> test-design review loop

  -> integrated-design consistency review
  -> human final approval
  -> implementation plan
  -> code implementation
  -> verification / test handoff package
```

基础评审矩阵仍然适用：

```text
business-design -> SE
solution-design -> SA、MDE、TEST
implementation-design -> SE、DEV、TEST
test-design -> SA、SE、MDE
```

这意味着 `feature-review` 也应该支持两种执行方式：

1. **阶段评审**：评审当前阶段产物，例如 `business-design` 或 `solution-design`。
2. **集成评审**：在所有阶段产物完成后，检查业务、方案、实现、测试之间是否一致。

**阶段性结论**

PRD 需要修正：业务设计、方案设计、实现设计、测试设计后都存在对应评审闭环；最终还需要集成一致性评审和人工最终评审。评审不是只发生在实现/测试阶段之后。

## Q40：DEV Agent 是否需要拆分为前端 DEV 和后端 DEV？

**用户问题**

开发工程师分为前后端，Agent 设计是否需要独立分为两个？

**背景判断**

这个问题不能简单回答“拆”或“不拆”。如果一开始固定拆成 Frontend DEV 和 Backend DEV，专业性会更强，但流程复杂度、评审矩阵和代码落地计划都会变重。如果只保留一个 DEV Agent，又可能在前后端技术栈差异明显时表现不够专业。

**候选方向**

1. **单一 DEV Agent**：MVP 只保留 DEV，内部根据 repo/技术栈加载前端或后端 skill。
2. **固定拆分 DEV-FE / DEV-BE**：前端开发和后端开发作为两个独立 Agent。
3. **默认单一 DEV，按需派生前后端执行上下文**：MVP 保留 DEV 作为统一角色；当任务绑定前端/后端仓库或影响面明确时，由 workflow 调用 `frontend-dev` 或 `backend-dev` 专项上下文/skill。

**我的推荐**

选择 **默认单一 DEV，按需派生前后端执行上下文**。

原因：MVP 如果直接把 DEV 固定拆成 FE/BE，会让每个需求都多出一层协调成本；但完全单一 DEV 又会牺牲专业性。更稳的是先把 DEV 作为统一开发责任角色，在实现计划阶段根据影响面决定是否启用前端/后端专项能力。

例如：

```text
DEV Agent
  -> backend-development skill
  -> frontend-development skill
  -> fullstack-change-planning skill
```

如果需求只改后端，只启用 backend 上下文；只改前端，只启用 frontend 上下文；前后端都改，则由 DEV 负责整体实现计划，再分别调用前后端专项执行。

**用户回复**

同意。

**阶段性结论**

DEV Agent 采用 **默认单一 DEV，按需派生前端/后端执行上下文**：

- MVP 不固定拆成 `DEV-FE` 和 `DEV-BE` 两个常驻 Agent。
- DEV 作为统一开发责任角色，负责整体开发执行计划、代码落地协调和本地验证。
- 当实现计划识别出前端或后端影响面时，启用 `frontend-development`、`backend-development` 或 `fullstack-change-planning` 等专项 skill/上下文。
- 只改后端时启用后端上下文；只改前端时启用前端上下文；前后端都改时，由 DEV 统一规划，再分别调用前后端专项能力。

## Q41：上下文来源是否应在 assess 阶段固定落盘？

**用户问题**

`assess` 查询上下文流程可以理解，但是 `contextSources.ref` 不太清楚是什么意思。知识是从知识库 skill 调用 MCP 查询到的，这里怎么拿到？代码仓也是一样，仅靠一个目录怎么定位？为了保证知识准确度，是否应该让对应 Agent 面临具体任务时再按需查找？

**我的回复**

这个质疑成立。之前的 `contextSources` 设计过重，容易造成两个问题：

1. 把 `assess` 阶段误设计成“提前收集完整上下文”的阶段。
2. 让 `ref` 看起来像稳定知识本体，但实际它可能只是一次检索结果、一个文档 ID、一个代码目录或一个候选线索。

更合理的设计是：

- `feature-assess` 不负责把所有上下文一次性查全。
- `feature-assess` 只做需求复杂度评估、风险识别、上下文需求识别和检索计划。
- 具体知识由 SA/SE/MDE/DEV/TEST 在执行具体设计或评审任务时，通过 `knowledge-query` skill + MCP 按需查询。
- 具体代码上下文由 MDE/DEV 在实现设计或代码落地阶段按需分析仓库。
- task workspace 只保存“检索计划、证据索引、引用记录”，不保存一个看似完整的预加载上下文列表。

因此，原来的 `contextSources` 应降级为 `contextPlan` 和 `evidenceRegistry`：

```json
{
  "contextPlan": [
    {
      "neededBy": "SA",
      "purpose": "确认存量审批业务规则",
      "queryIntent": "审批规则 历史设计 业务流程",
      "sourceTypes": ["knowledge-base"],
      "status": "planned"
    },
    {
      "neededBy": "MDE",
      "purpose": "分析审批规则实现影响面",
      "sourceTypes": ["repository"],
      "status": "deferred_until_implementation_design"
    }
  ],
  "evidenceRegistry": []
}
```

Agent 实际查询后，再写入证据索引：

```json
{
  "evidenceRegistry": [
    {
      "id": "EV-001",
      "usedBy": "SE",
      "sourceType": "knowledge-base",
      "sourceId": "kb://approval/design/2025-08",
      "title": "审批规则历史设计",
      "retrievedBy": "knowledge-query",
      "retrievedAt": "2026-06-30T10:30:00+08:00",
      "usedIn": ["artifacts/solution-design.md"],
      "confidence": "high"
    }
  ]
}
```

这里的 `ref/sourceId` 不是用户手写的，也不是插件凭空知道的，而是 MCP 查询结果或代码分析工具返回的稳定定位符。如果知识库没有稳定 ID，就记录查询语句、标题、路径、版本、片段 hash 等证据信息。

**阶段性结论**

正式设计应修正：

- 不在 `feature-assess` 阶段固定完整 `contextSources`。
- 改为 `contextPlan`：描述后续哪些 Agent 需要查什么上下文。
- 改为 `evidenceRegistry`：记录 Agent 实际查询并使用过的知识证据。
- 知识库和代码仓上下文由对应 Agent 在具体任务中按需查询，避免预加载错误上下文。

## Q41：功能点设计变更是否应复用需求开发工作流？

**用户问题**

如果需求已经完成设计及代码实现后，突然发现又有部分功能点要做设计变更，这种场景下应该怎么办？是否可以把功能点变更当作一个小颗粒度的需求来复用需求开发工作流？

**我的回复**

可行，而且比单独新增一套 `feature-change-*` 命令更合理。

功能点变更应作为一个小颗粒度 feature task，复用现有需求开发工作流：

```text
feature-init
feature-assess
feature-design
feature-review
feature-approve
feature-plan-implementation
feature-implement
feature-verify
```

区别是任务状态中增加变更语义：

```json
{
  "taskType": "feature",
  "featureKind": "change",
  "parentTaskId": "FEAT-001",
  "changeReason": "原需求实现后新增部分功能点",
  "changeScope": "只调整审批规则和前端展示"
}
```

变更型 feature task 需要额外做：

1. 关联父任务，读取父任务的设计、批准记录、实现计划、转测包作为上下文。
2. 做变更影响分析，识别影响业务规则、方案设计、实现设计、测试设计、已实现代码和转测包。
3. 输出 delta 产物，不默认重写全量设计。

推荐增量产物：

```text
artifacts/
  change-impact-analysis.md
  business-design-delta.md
  solution-design-delta.md
  implementation-design-delta.md
  test-design-delta.md
```

关键约束：

- 变更任务不能继承父任务批准，必须独立评审和批准。
- 父任务作为上下文和基线，不被覆盖。
- 变更任务的实现计划必须是 delta implementation plan。

**用户回复**

同意。

**阶段性结论**

功能点变更不新增独立 workflow，而是作为 `featureKind=change` 的小颗粒度 feature task 复用需求开发工作流。正式设计应补充 `featureKind`、`parentTaskId`、变更影响分析和 delta 产物。

## Q42：是否应移除父任务和预设上下文来源，改为 Agent 按需查证据？

**用户问题**

父任务是什么概念？知识源应该只有知识库和代码仓。`contextSources.ref` 也不好理解，知识是从知识库 skill 调用 MCP 查询到的，代码仓也不能仅靠目录定位。方案还没设计清楚，为什么能保证提前查询的一定正确？是否应该让对应 Agent 在具体任务中按需查找？同时查询到的知识也要作为过程件保存在工作空间中。

**我的回复**

这个质疑成立，需要修正前面的设计：

- 不引入 `parentTaskId` 作为 MVP 主模型。
- 不引入 `featureKind=change` 作为流程分支。
- 不在 `feature-assess` 阶段预加载或固定完整上下文。
- 不要求用户提前填写上下文来源。
- 所有功能新增、功能调整、存量能力变更都统一作为 feature task。
- 知识源只抽象为知识库和代码仓，具体证据由 Agent 在执行具体阶段时按需查询。

更准确的流程：

```text
feature-assess
  -> 只做复杂度、风险、workflow mode 推荐

feature-design-business
  -> SA 按需查询业务规则/历史设计
  -> 保存查询结果快照和 evidence

feature-design-solution
  -> SE 按需查询存量方案/架构规范/接口规范
  -> 保存查询结果快照和 evidence

feature-design-implementation
  -> MDE 按需查询模块历史方案/代码仓现状/技术规范
  -> 保存查询结果快照和 evidence

feature-design-test
  -> TEST 按需查询测试规范/历史缺陷/验收规则
  -> 保存查询结果快照和 evidence
```

推荐工作区增加：

```text
evidence/
  evidence-registry.json
  knowledge/
    EV-001-approval-rules.md
  repository/
    EV-010-order-service-impact.md
```

`evidence-registry.json` 记录实际被使用的证据：

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

查询结果保存为过程件，不只保存引用 ID。原因是知识库内容会演进，必须能复盘“当时设计依据是什么”。

**阶段性结论**

正式设计改为：统一 feature 工作流，不使用 `parentTaskId` 和 `featureKind=change` 分支；知识和代码上下文由对应 Agent 在具体阶段按需查询；查询结果快照与证据索引作为过程件保存到 task workspace。

## Q36：AI 评审-修订闭环的退出条件是什么？

**问题**

`feature-review` 执行 AI 内部评审-修订闭环时，应该在什么条件下停止循环？

**背景判断**

如果退出条件不明确，AI 可能无限修订，也可能过早宣布无问题。这个闭环需要确定性控制：最大轮次、阻塞项归零、建议项整理、冲突升级。否则 workflow 状态会变得不可预测。

**候选方向**

1. **AI 自行判断停止**：AI 认为无问题就停止。
2. **固定最大轮次**：最多循环 N 次，不管是否解决都停止。
3. **阻塞项归零 + 最大轮次 + 冲突升级**：阻塞项全部关闭即可停止；达到最大轮次或存在无法调和冲突时升级给人。

**我的推荐**

选择 **阻塞项归零 + 最大轮次 + 冲突升级**。

建议 MVP 默认最多 3 轮 AI 内部修订。满足以下任一条件停止：

- 所有阻塞项关闭，建议项已整理成人工确认清单。
- 达到最大循环轮次。
- 评审 Agent 之间出现无法自动调和的设计冲突。
- 需要业务/技术决策或补充信息。

达到非正常停止条件时，任务状态进入 `human_input_required` 或对应阶段的 `blocked`，并输出明确问题，而不是继续猜。

**用户回复**

同意。

**阶段性结论**

AI 评审-修订闭环采用 **阻塞项归零 + 最大轮次 + 冲突升级** 的退出条件。

MVP 默认最多 3 轮 AI 内部修订。满足以下任一条件停止：

- 所有阻塞项关闭，建议项整理成人工确认清单。
- 达到最大循环轮次。
- 评审 Agent 之间出现无法自动调和的设计冲突。
- 需要业务/技术负责人决策。
- 需要补充需求信息。

非正常停止时，任务状态进入 `human_input_required` 或对应阶段 `blocked`，并明确列出需要人工回答或决策的问题。

## Q37：任务工作区是否应按任务类型增加目录层级，并记录人机协同决策？

**用户问题**

工作区目录上应该按照任务类型再加一个层级，例如 feature（需求开发）、bugfix 等。同时需求设计过程中，AI 和人的协同决策过程也很重要，设计阶段 AI 和人的每次决策记录应该要记录下来，放在工作空间中。

**我的回复**

同意。这个优化应该纳入正式设计。

工作区应从：

```text
.devsphere/
  tasks/<task-id>/
```

调整为：

```text
.devsphere/
  current-task.json
  tasks/
    feature/
      <task-id>/
    bugfix/
      <task-id>/
    refactor/
      <task-id>/
    performance/
      <task-id>/
```

这样 task type 不只存在于 `state.json` 字段里，也体现在目录结构上，后续归档、检索、统计和扩展都更清晰。

同时，每个 task workspace 增加协同决策记录目录：

```text
.devsphere/tasks/feature/<task-id>/
  decisions/
    decision-log.json
    ADR-0001-xxx.md
    ADR-0002-xxx.md
  conversations/
    design-collaboration.md
```

记录内容包括：

- 人工提供的关键业务输入。
- AI 提出的设计选项。
- 人工选择的方案及理由。
- AI 和 Agent 之间无法自动调和后交给人的决策点。
- 被接受的风险。
- 被延期处理的建议项。
- 影响后续设计/实现/测试的重要约束。

**阶段性结论**

工作区目录采用 **task type 分层**。设计阶段的人机协同决策必须作为一等过程资产落盘，不能只存在于聊天上下文或最终方案里。

## Q38：决策记录是否应按设计文档类型维护？

**用户问题**

决策记录的持久化文件是不是按照设计文档类型维护更合适些？

**我的回复**

是的，按设计文档类型维护更合适，但建议保留一个全局索引。

如果所有决策都堆在一个 `decision-log.json` 里，后期追溯会很痛苦。比如你想知道“某个接口为什么这么设计”，它本质属于 `solution-design`；“某个模块为什么这么拆”，属于 `implementation-design`；“某个边界场景为什么不测”，属于 `test-design`。按设计产物类型组织，查询和评审都更自然。

初始推荐结构：

```text
.devsphere/tasks/feature/<task-id>/
  decisions/
    decision-index.json
    business-design/
      ADR-0001-business-scope.md
    solution-design/
      ADR-0002-api-contract.md
      ADR-0003-data-model.md
    implementation-design/
      ADR-0004-module-split.md
    test-design/
      ADR-0005-regression-scope.md
    cross-cutting/
      ADR-0006-release-risk.md
```

`decision-index.json` 用于全局检索和机器读取，记录每条决策关联的阶段、产物、状态和影响范围。Markdown ADR 用于人读。

**阶段性结论**

用户认为一条决策一个 ADR 文件粒度过细，大需求会导致文档数量过多。更合适的是按照设计文档类型拆分文件粒度，和每个设计阶段相对应。

最终采用 **按设计文档类型维护决策文件 + 全局索引**：

```text
.devsphere/tasks/feature/<task-id>/
  decisions/
    decision-index.json
    business-design-decisions.md
    solution-design-decisions.md
    implementation-design-decisions.md
    test-design-decisions.md
```

每个 `*-decisions.md` 内部记录多条决策，条目包含：

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

`decision-index.json` 用于检索、状态追踪和自动校验；Markdown 决策文件用于人工阅读和评审追溯。

**用户回复**

同意。

## Q45：`ai_review_passed` 是否可以作为后续设计阶段输入？

**我的问题**

如果所有下游阶段都必须等 `human_approved`，那 `auto-design` 会退化成 `strict-human-loop`。因此建议区分“后续 AI 设计阶段输入”和“代码落地批准输入”：

- `ai_review_passed`：AI 内部评审无阻塞，在 `auto-design` 和 `collaborative-design` 中可以作为后续 AI 设计阶段输入。
- `human_approved`：人工批准，是代码落地前最终批准和 `strict-human-loop` 阶段推进的硬依据。

推荐模式：

```text
auto-design:
businessDesign ai_review_passed
-> solutionDesign ai_review_passed
-> implementationDesign/testDesign ai_review_passed
-> integrated-design human_review_required
-> human_approved
-> implementation plan

strict-human-loop:
businessDesign human_approved
-> solutionDesign human_approved
-> implementationDesign/testDesign human_approved
-> integrated-design human_approved

collaborative-design:
状态和 auto-design 类似，但 drafted 前会有更多人机澄清与 decision 记录；
复杂阶段也可以手动切到阶段级 human_approved。
```

**用户回复**

同意。

**阶段性结论**

正式采用模式敏感的阶段依赖规则：

- `auto-design`：阶段产物达到 `ai_review_passed` 即可作为后续 AI 设计输入，但不能进入代码落地。
- `collaborative-design`：默认同 `auto-design`，差异主要在设计产物生成前的人机协同澄清和决策记录；复杂阶段可手动要求 `human_approved`。
- `strict-human-loop`：每个阶段必须达到 `human_approved` 才能推进后续阶段。
- 代码落地前必须完成 integrated-design 的人工最终批准，进入 `approved_for_implementation`。

## Q46：评审问题是否只采用 `blocking/advisory/accepted_risk` 三类？

**我的问题**

建议评审问题只保留 3 类，不引入 `minor/major/critical` 等复杂严重级别：

```text
blocking
advisory
accepted_risk
```

处理规则：

- `blocking`：必须修复。由原设计 Agent 修订，由提出问题的评审 Agent 复核关闭。
- `advisory`：AI 不强制修复，但不能直接放行。必须由人工选择 `accept`、`reject` 或 `convert_to_blocking`。
- `accepted_risk`：人工明确接受的风险，必须进入 decision 记录和最终交付包。

第一版插件最需要的是判断“是否阻塞流程”，不是做一套缺陷管理系统。

**用户回复**

同意。

**阶段性结论**

正式采用 `blocking/advisory/accepted_risk` 三类评审问题：

- `blocking` 阻塞流程，必须修复并由原评审 Agent 复核关闭。
- `advisory` 不要求 AI 必修，但必须经过人工确认处理。
- `accepted_risk` 必须写入决策记录和最终交付包。

MVP 不设计额外严重级别。

## Q47：关键设计结论是否必须引用 evidence？

**我的问题**

建议 evidence 成为关键设计结论的引用依据，但不做成所有段落都必须引用的论文式系统。

必须引用 evidence ID 的内容：

- 存量业务规则判断。
- 存量功能行为判断。
- 接口兼容性判断。
- 模块边界或代码影响面判断。
- 测试范围和回归风险判断。
- 任何会影响实现方案的关键约束。

引用格式保持简单：

```text
依据：EV-001, EV-003
```

如果没有证据但 Agent 仍需要做判断，必须标记为 `assumption`，等待人工确认。人工确认后，这条 assumption 进入 `decisions/*-decisions.md`，不能伪装成 evidence。

**用户回复**

同意。

**阶段性结论**

正式采用轻量 evidence 引用规则：

- 关键结论必须引用 evidence ID。
- 普通描述段落不强制引用 evidence。
- 无证据判断必须标记为 `assumption`。
- 人工确认后的 assumption 进入决策记录，不进入 evidence。

## Q48：新功能设计没有存量文档时，evidence 规则如何处理？

**用户问题**

对于刚才的引用设计，感觉像是必须要有引用。但是对于新功能设计来说，知识库中是没有相关存量设计文档的，这部分设计中是怎么处理的？

**我的回复**

这个质疑成立。Q47 中“关键结论必须引用 evidence”的表述过宽，会误伤新功能设计。

修正为三分法：

1. **存量事实 / 外部约束 / 代码现状判断**

   例如“当前系统已有审批中心”“订单模块已有状态机”“前端已有权限按钮规范”。这类必须引用 evidence。

   ```text
   依据：EV-001, EV-004
   ```

2. **新设计决策**

   例如“本需求新增审批策略表”“采用事件驱动同步状态”“前端新增审批轨迹组件”。这类不需要 evidence，因为它本来就是新方案。但必须写清楚理由、取舍和影响。

3. **无证据前提**

   例如“假设本期不要求兼容历史审批数据”“假设审批策略不跨租户共享”。这类不能伪装成事实，必须标成 `assumption`，等待人工确认。

**用户回复**

同意。

**阶段性结论**

正式修正 evidence 规则：

```text
存量事实 / 外部约束 / 代码现状判断 -> 必须引用 evidence
新设计决策 -> 不需要 evidence，但必须说明理由、取舍和影响
无证据前提 -> 标记 assumption，人工确认后进入 decision
```

Q47 的“关键结论必须引用 evidence”改为更精确的“声称来自存量事实、外部约束或代码现状的结论必须引用 evidence”。

## Q49：Agent 和 Skill 的职责边界应如何定义？

**我的问题**

建议写入一条硬规则：

```text
Agent 决定职责视角，Skill 决定执行方法。
```

同一个 Skill 可以被不同 Agent 加载，但输出必须体现 Agent 的职责视角。例如：

- `DEV + review-skill`：评审可编码性、代码影响、开发风险。
- `MDE + review-skill`：评审模块边界、实现拆解、技术一致性。
- `TEST + review-skill`：评审可测性、验收标准、回归风险。
- `SE + review-skill`：评审架构一致性、接口契约、跨系统影响。
- `SA + review-skill`：评审业务规则、业务流程、需求边界。

不建议第一版做 Skill 权限矩阵，避免把插件做成权限平台。

**用户回复**

同意。

**阶段性结论**

正式采用：

```text
Agent 决定职责视角，Skill 决定执行方法。
```

MVP 不设计 Skill 权限矩阵。不同 Agent 可以加载同一 Skill，但必须按照各自职责视角输出。

## Q50：Hook 是否负责状态同步和决策记录等过程产物？

**用户问题**

状态同步是否包含状态更新？决策记录这种过程产物也适合使用 hooks 来负责吗？

**我的回复**

包含，但只能是机械状态更新，不能是业务状态决策。

Hook 的边界定义为：

```text
Hook = guard + registry + consistency checker
```

Hook 可以做：

- 结构校验。
- 闸口阻断。
- 确定性状态同步。
- 过程件登记。
- 一致性校验。

Hook 不应该做：

- 生成设计。
- 修改设计正文。
- 替代评审判断。
- 自动接受 `assumption`。
- 自动接受风险。
- 跨阶段自动推进流程。

状态同步边界：

```text
Command/Skill 决定状态应该变成什么。
Hook 校验状态变更是否合法，并把确定性结果同步落盘。
```

决策记录边界：

```text
Command/Skill 生成 decision 内容。
Human 或负责 Agent 确认 decision 语义。
Hook 负责把确认后的 decision 登记、索引、校验一致性。
```

**用户回复**

ok。

**阶段性结论**

正式采用 Hook 边界：

- Hook 可以做 `guard + registry + consistency checker`。
- Hook 可以负责机械状态同步和过程件登记。
- Hook 不能负责内容判断、设计推理、自动接受风险或自动推进跨阶段流程。

## Q51：“普通 Agent 协作”对应 Claude Code 中的什么能力？

**用户问题**

普通 Agent 协作指的是 Claude Code 中的哪个能力？

**我的回复**

“普通 Agent 协作”这个词不严谨，容易让人以为 Claude Code 里有一个同名能力。

更准确的表述应是：

```text
基于 Claude Code plugin 的 agents/custom subagents 的按需调用
```

也就是插件定义：

```text
agents/
  sa.md
  se.md
  mde.md
  dev.md
  test.md
  cie.md
```

Workflow command 在需要某个职责视角时调用对应 Agent。例如：

```text
feature-design-solution
  -> 使用 SE Agent 生成 solution-design.md

feature-review solution-design
  -> 使用 SA Agent 从业务一致性评审
  -> 使用 MDE Agent 从实现可行性评审
  -> 使用 TEST Agent 从可测性评审
```

这不是自建多 Agent runtime，也不是 agent-team。

**用户回复**

ok。

**阶段性结论**

后续术语统一为：

```text
agents/custom subagents 按需调用
```

MVP 必需能力：

- Claude Code plugin `agents/` 中定义角色 Agent。
- Command/Skill 按阶段、按产物、按职责视角调用对应 Agent。

MVP 不包含：

- 复杂 subagent 并行调度。
- agent-team 编排。
- 自建 Agent runtime 或调度平台。

## Q52：是否需要新增 `final-handoff.md`？

**用户问题**

`final-handoff.md` 这个文档之前好像没见过，是这次新加的设计吗？这个文档具体有什么作用，当前不要这个文档有什么负向影响吗？

**我的回复**

`final-handoff.md` 是我为了表达“交付摘要”临时提出的新名字，不是前面已经确认过的正式产物。现在不引入它更好。

当前已经有：

```text
business-design.md
solution-design.md
implementation-design.md
test-design.md
integrated-design.md
verification/转测包
approvals/
```

如果再新增 `final-handoff.md`，会和 `integrated-design.md`、转测包、批准记录发生职责重叠，并增加同步成本。更严重的是，如果 `final-handoff.md` 和阶段设计文档不一致，会破坏“阶段文档是事实来源”的原则。

**用户回复**

同意。

**阶段性结论**

MVP 不新增 `final-handoff.md`。

正式产物关系：

- 阶段设计文档是事实来源。
- `integrated-design.md` 是设计阶段最终人工评审入口和一致性批准视图。
- `approvals/` 保存批准事实记录。
- 转测包只承担代码落地后的测试交付信息。

一页式总览需求由 `integrated-design.md` 的摘要章节承担，不新增独立文档。

## Q53：Claude Code plugin skill 是否支持命令中间带空格？

**用户问题**

命令应该不支持空格吧？请再详细阅读 Claude Code 的插件文档，了解开发规范后评审正确性。

**我的回复**

你这个质疑是对的。我前面用 `reopen/revise 类命令` 这种说法不够严谨，容易让人误以为 Claude Code plugin 支持“命令名中间带空格”的子命令。

按 Claude Code plugin/skill 的方式，命令入口应该是：

```text
/plugin-name:skill-name
```

例如：

```text
/scc-dev-sphere:feature-design-solution
```

空格后面的内容不是命令名的一部分，而是传给该 skill 的参数。Skill 可以通过 `$ARGUMENTS` 或位置参数解析这些参数。

因此，修订阶段设计不应设计成一个“带空格的命令名”，而应设计成阶段 skill 的参数模式：

```text
/scc-dev-sphere:feature-design-solution --mode revise
```

**用户回复**

ok。

**阶段性结论**

正式修正命令设计：

- Claude Code plugin skill 命令名不使用空格子命令。
- MVP 保持多个清晰的 skill 命令入口，例如 `feature-design-solution`。
- `revise`、`rerun` 等动作通过参数表达，不新增伪子命令。
- 推荐使用 `--mode revise` 这类显式参数，避免 `/scc-dev-sphere:feature-design-solution revise` 这种容易被误解成子命令的写法。
- 已批准阶段的修改必须调用对应阶段 skill 的修订参数模式，并记录修订原因、影响范围和重新评审要求。

## Q54：已批准设计进入修订模式后是否需要保存旧版本快照？

**我的问题**

已人工批准的设计文档进入 `--mode revise` 后，是否需要保留旧版本快照？

我的倾向是需要，但不要做复杂版本系统，只保存修订前快照和一条 revision 记录，否则后面无法审计“批准过的方案到底被改了什么”。

**用户回复**

当前不需要，不希望搞得太复杂。

**阶段性结论**

MVP 不引入设计文档版本快照机制，也不新增 `revisions/` 目录。

已批准阶段产物进入修订模式时，只做轻量记录：

- 修订原因。
- 影响范围。
- 受影响阶段。
- 重新评审要求。

文档历史差异暂时依赖 Git 或外部文档管理能力，不在插件 MVP 内自建版本管理。

## Q55：高风险任务是否必须强制 `strict-human-loop`？

**我的问题**

高风险任务是否必须强制 `strict-human-loop`，还是只默认推荐 `strict-human-loop`、允许人工确认后降级？

我的判断是不要强制死，否则插件会变成流程阻塞器。

**用户回复**

ok。

**阶段性结论**

高风险任务采用 **默认推荐 strict-human-loop，但允许人工确认降级**：

- 命中高风险规则时，`feature-assess` 默认推荐 `strict-human-loop`。
- 用户可以人工确认后降级为 `collaborative-design` 或 `auto-design`。
- 降级原因、已知风险、确认人必须写入 `decisions/business-design-decisions.md` 的任务级决策区。
- 插件不得在未人工确认的情况下自动降级高风险任务。

## Q56：`advisory` 的人工确认结果应该保存在哪里？

**我的问题**

`advisory` 建议项需要人工确认，但确认结果到底放在哪里？

我建议不要散落在 review markdown 里，应该有一个轻量机器可读文件，例如 `reviews/advisory-confirmation.json`，否则 hook/workflow 很难判断“建议项是否已处理完”。

**用户回复**

ok。

**阶段性结论**

`advisory` 人工确认采用 **Markdown 明细 + JSON 确认索引**：

- Markdown 评审文件保存建议项的详细上下文。
- `reviews/advisory-confirmation.json` 保存人工确认结果。
- 允许确认结果为 `accept`、`reject`、`convert_to_blocking`。
- `feature-approve` 必须校验所有 `advisory` 都已人工确认。
- 被转换为 `blocking` 的建议项必须走阻塞项修订和原评审者复核关闭流程。

## Q57：`advisory accept` 是否等同于 `accepted_risk`？

**我的问题**

`accepted_risk` 是否要和 `advisory accept` 区分？

我的判断是必须区分。`advisory accept` 是“建议不采纳/已知但不改”；`accepted_risk` 是“明确接受风险”，必须进入决策记录和最终交付包。混在一起会让风险管理失真。

**用户回复**

ok。

**阶段性结论**

正式区分 `advisory accept` 和 `accepted_risk`：

- `advisory accept`：人工确认该建议不采纳或暂不处理，只写入 `reviews/advisory-confirmation.json`。
- `accepted_risk`：人工明确接受交付风险，必须写入 `decisions/*-decisions.md`，并进入最终交付包。
- 如果 `advisory accept` 的理由本质是接受风险，应转为 `accepted_risk`，不能用建议项确认绕过风险登记。

## Q58：`integrated-design.md` 是否必须汇总所有 `accepted_risk`？

**我的问题**

是否需要在 `integrated-design.md` 中强制汇总所有 `accepted_risk`？

我建议需要。否则最终人工批准时看不到风险总览，风险虽然写进 decision 了，但审批视图会漏掉它。

**用户回复**

ok。

**阶段性结论**

`integrated-design.md` 必须汇总所有 `accepted_risk`：

- 风险详情仍以 `decisions/*-decisions.md` 为事实来源。
- `integrated-design.md` 作为最终批准视图，必须展示风险总览。
- `feature-design` 生成或刷新集成设计时需要汇总 accepted risk。
- `feature-approve` 必须校验 `accepted_risk` 已写入决策记录，且已出现在 `integrated-design.md` 的风险汇总中。

## Q59：`feature-approve` 是批准单个阶段，还是最终设计批准？

**我的问题**

`feature-approve` 是不是只批准 `integrated-design.md`，还是也能批准单个阶段设计？

我建议区分：阶段批准由阶段状态 `human_approved` 表达，`feature-approve` 默认只做代码落地前的最终设计批准，避免一个命令承担两类批准语义。

**用户回复**

ok。

**阶段性结论**

正式区分阶段级人工确认和最终设计批准：

- 阶段级人工确认只更新对应阶段状态为 `human_approved`。
- `feature-approve` 默认只处理代码落地前的最终设计批准。
- `feature-approve` 的批准对象是 `integrated-design.md` 及其引用的阶段设计产物。
- 最终批准后任务进入 `approved_for_implementation`，这才是代码落地的依据。
- 不用 `feature-approve` 承担单个阶段批准语义。

## Q60：是否还要继续新增过程文件？

**用户问题**

当前设计的文档已经很多了，作为初版感觉设计已经比较冗余了，不要再新增文件了，每个设计阶段的所有决策记录统一放在一个文件中即可。

**我的回复**

这个约束是对的。继续加文件会把 MVP 拖成流程文档系统。正式设计应该收敛为：不新增阶段批准文件、不新增单条 ADR 文件、不新增跨阶段决策文件；每个设计阶段的决策进入对应阶段的决策文件。

**阶段性结论**

MVP 过程文件收敛规则：

- 不新增阶段 approval 文件。
- 不新增 `revisions/` 目录。
- 不新增单条 ADR 文件。
- 不新增 `cross-cutting-decisions.md`。
- 每个设计阶段的决策统一记录到对应阶段决策文件。
- 跨阶段、模式选择、风险接受等决策归并到最相关阶段；无法明确归属时，默认记录到 `business-design-decisions.md` 的任务级决策区。

## Q61：是否要把 `advisory-confirmation.json` 合并进 `review-matrix.json`？

**我的问题**

我们之前新增了 `reviews/advisory-confirmation.json`。如果继续压缩文件数，是否要把它合并进 `reviews/review-matrix.json`？

我的倾向是合并，少一个文件，而且它本来就是评审状态的一部分。

**用户回复**

不用，这个继续独立。

**阶段性结论**

`reviews/advisory-confirmation.json` 保持独立：

- `review-matrix.json` 负责评审覆盖、评审状态和阻塞项统计。
- `advisory-confirmation.json` 负责人工确认建议项的结果。
- 该文件属于少数必要的机器可读过程件，不并入 review matrix。

## Q62：MVP 是否需要保留 `task-list` 和 `task-switch` 两个独立命令？

**我的问题**

MVP 是否需要保留 `task-list` 和 `task-switch` 两个独立命令？

我的判断是不建议保留独立命令。它们不是需求开发主流程能力，只是任务导航能力；命令越多，用户和模型越容易选错入口。任务列表和任务切换能力可以由 `workflow/status` 通过参数承担。

**用户回复**

能力需要保留，同意裁剪独立命令，按照支持参数方式来实现。

**阶段性结论**

`task-list` 和 `task-switch` 能力保留，但不作为 MVP 独立命令：

- 不提供 `/scc-dev-sphere:task-list`。
- 不提供 `/scc-dev-sphere:task-switch`。
- 任务列表能力由 `/scc-dev-sphere:workflow list` 或等价参数实现。
- 任务切换能力由 `/scc-dev-sphere:workflow switch <task-id>` 或等价参数实现。
- `/scc-dev-sphere:status` 继续负责查看当前任务状态。

## Q63：是否保留前端、后端、全栈三个开发专项 Skill？

**我的问题**

是否保留 `backend-development`、`frontend-development`、`fullstack-change-planning` 三个独立 skill 目录？

我的建议是暂时保留。它们不是导航命令，而是开发阶段真正的能力模块，和“Agent 可按需加载 Skill”的核心设计一致。

**用户回复**

同意，保留。

**阶段性结论**

MVP 保留三个开发专项 Skill：

- `backend-development`
- `frontend-development`
- `fullstack-change-planning`

DEV Agent 默认仍是统一开发责任角色，不拆分为常驻前端/后端 Agent；开发专项 Skill 由 DEV 在实现计划和代码落地阶段按需加载。

## Q64：确定性脚本是否收敛成一个 `devsphere.js` 单入口？

**我的问题**

是否保留多个 `devsphere-*.js` 脚本，还是收敛成一个 `devsphere.js` 单入口？

我的建议是保留多个脚本。它们是确定性工具，不是用户入口；按职责拆开更利于测试和维护，不会增加用户认知负担。

**用户回复**

同意。

**阶段性结论**

MVP 保留多个确定性脚本：

- `devsphere-state.js`
- `devsphere-review-matrix.js`
- `devsphere-approval.js`
- `devsphere-guard.js`
- `devsphere-workspace.js`

这些脚本不直接面向用户，不属于命令入口膨胀；它们按职责拆分，服务于状态读写、评审矩阵、批准记录、Hook 守门和工作区管理。

## Q65：是否保留 `links/` 目录？

**我的问题**

是否保留 `links/` 目录，尤其是 `links/repos.json`？

我的建议是保留。任务工作区可能不在代码仓库下，repo 绑定是跨仓实现和 hook 定位的关键关系，单独文件比塞进 `state.json` 更清晰。

**用户回复**

同意。

**阶段性结论**

MVP 保留 `links/` 目录：

- `links/repos.json` 用于记录任务与一个或多个代码仓库的绑定关系。
- 任务工作区可以独立于代码仓库存在。
- repo 绑定是实现阶段、Hook 守门、代码修改范围校验的关键输入。
- 不把 repo 绑定塞进 `state.json`。

## Q66：是否保留 `conversations/` 目录？

**我的问题**

是否保留 `conversations/` 目录？

我的建议是不保留独立目录。设计协同过程里真正有价值的内容应该进入对应 `*-decisions.md`；原始聊天转储价值低、噪声大，也容易产生隐私和体积问题。

**用户回复**

同意。

**阶段性结论**

MVP 不保留 `conversations/` 目录：

- 不保存原始聊天转储。
- 人机协同中的有效决策进入对应阶段决策文件。
- 假设确认、风险接受、范围裁剪等也进入对应 `*-decisions.md`。
- 这样满足过程可追溯，同时避免把任务工作区变成聊天日志归档。

## Q67：MVP 技术方案是否列出具体 bugfix 扩展命令？

**我的问题**

是否保留 bugfix 扩展示例命令在 MVP 技术方案里？

我的建议是保留“扩展方向”，但删除具体 bugfix 命令清单。因为 MVP 不实现 bugfix，列出具体命令容易让读者误以为第一版要交付这些入口。

**用户回复**

同意。

**阶段性结论**

MVP 技术方案不列具体 bugfix 命令清单：

- 保留 task type 前缀命名原则。
- 保留 bugfix/refactor/performance 作为后续扩展方向。
- 不在 MVP 命令入口章节列 `/scc-dev-sphere:bugfix-*` 具体命令。
- 避免把非 MVP 范围误读为第一版交付入口。

## Q68：task type 工作区目录是否动态创建？

**用户问题**

这些工作区目录应该是创建任务时动态创建的吧？

**我的回复**

对，这些目录应该是创建任务时按 task type 动态创建，不应该在 `.devsphere/tasks/` 下提前铺一堆空目录。MVP 实际行为应是 `feature-init` 只创建 `.devsphere/tasks/feature/<task-id>/...`。

**用户回复**

同意。

**阶段性结论**

task type 工作区目录采用动态创建：

- MVP 只由 `feature-init` 创建 `.devsphere/tasks/feature/<task-id>/...`。
- 不预创建 `bugfix/`、`refactor/`、`performance/` 空目录。
- 后续实现对应 workflow 时，再由对应 init 命令创建对应 task type 目录。
- 技术方案保留 task type 分层原则，但目录示例只展示 MVP 实际创建内容。

## Q69：是否保留 `templates/` 下的分类模板目录？

**我的问题**

`templates/` 下是否需要保留 `approvals/verification/` 等多个模板目录？

我的建议是保留。模板目录不是运行时过程文件，也不是用户命令；它能让各阶段输出结构稳定，尤其对 Claude Code skill 很有价值。

**用户回复**

同意。

**阶段性结论**

MVP 保留 `templates/` 下的分类模板目录：

- `templates/artifacts/`
- `templates/reviews/`
- `templates/approvals/`
- `templates/verification/`

模板目录不属于任务过程文件膨胀；它们用于约束输出结构，提高 Skill 生成稳定性和 Hook 校验可预测性。

## Q70：`status` 是否需要作为独立命令保留？

**我的问题**

`status` 是否需要作为独立命令保留？

我的建议是保留。它是高频只读入口，和 `workflow` 的“推进/导航”语义不同；保留能减少误操作风险。

**用户回复**

同意。

**阶段性结论**

MVP 保留独立 `status` 命令：

- `/scc-dev-sphere:status` 是高频只读入口。
- `status` 只读取和展示当前任务状态，不推进 workflow。
- `workflow` 负责导航、下一步建议和带参数的任务列表/切换能力。
- 保留 `status` 有助于降低误操作风险。

## Q71：是否保留 `knowledge-query` 独立 Skill？

**我的问题**

是否需要保留 `knowledge-query` 独立 Skill？

我的建议是保留。它不是用户入口，而是多个 Agent/Skill 复用的查询策略能力；如果把知识查询逻辑散落到 SA/SE/MDE/TEST 各自 skill 里，后续证据格式和引用规范会很难统一。

**用户回复**

同意。

**阶段性结论**

MVP 保留 `knowledge-query` 独立 Skill：

- 它不是用户命令入口，而是内部复用能力。
- SA、SE、MDE、TEST、DEV 等 Agent 可按需调用。
- 它统一知识库查询策略、证据筛选、证据不足判断和引用格式。
- 避免每个角色 Skill 各自实现一套知识查询逻辑。

## Q72：是否保留四个阶段设计命令？

**我的问题**

`feature-design-business`、`feature-design-solution`、`feature-design-implementation`、`feature-design-test` 四个阶段命令是否都要保留？

我的建议是保留。虽然命令数量多一点，但它们是人工模式、局部重跑和修订的关键入口；如果只保留一个 `feature-design --stage xxx`，参数会变复杂，误操作风险反而更高。

**用户回复**

同意。

**阶段性结论**

MVP 保留四个阶段设计命令：

- `/scc-dev-sphere:feature-design-business`
- `/scc-dev-sphere:feature-design-solution`
- `/scc-dev-sphere:feature-design-implementation`
- `/scc-dev-sphere:feature-design-test`

这些命令用于明确处理单一设计产物，支持 strict-human-loop、局部重跑、人工指定阶段推进和 `--mode revise` 修订场景。

## Q73：`feature-review` 是否拆成多个阶段评审命令？

**我的问题**

`feature-review` 是否保留一个统一命令，还是拆成 `feature-review-business`、`feature-review-solution` 等多个命令？

我的建议是保留统一 `feature-review`，通过参数指定评审对象，例如 `/scc-dev-sphere:feature-review solution-design`。评审逻辑高度一致，拆成多个命令会增加重复。

**用户回复**

同意。

**阶段性结论**

MVP 保留统一 `feature-review` 命令：

- 不拆分 `feature-review-business`、`feature-review-solution` 等命令。
- 通过参数指定评审对象，例如 `/scc-dev-sphere:feature-review solution-design`。
- 支持阶段评审和集成评审。
- 统一命令内部根据评审对象读取 review matrix 和必要评审者规则。

## Q74：`feature-verify` 是否作为独立命令保留？

**我的问题**

`feature-verify` 是否作为 MVP 独立命令保留？

我的建议是保留。虽然验证可以被 `feature-implement` 末尾触发，但独立 `verify` 对重跑测试、转测前复核、失败后恢复很关键。

**用户回复**

同意。

**阶段性结论**

MVP 保留独立 `feature-verify` 命令：

- `/scc-dev-sphere:feature-verify` 用于实现后的验证和转测前复核。
- 支持失败后重跑验证。
- 支持在代码已修改但验证未完成时恢复流程。
- `feature-implement` 可以在末尾建议或触发验证，但不替代独立验证入口。

## Q75：`feature-plan-implementation` 是否独立于 `feature-implement`？

**我的问题**

`feature-plan-implementation` 是否需要独立命令，还是并入 `feature-implement`？

我的建议是保留独立命令。你已经明确“设计批准后不能直接编码，必须先生成开发执行计划”，所以计划和执行必须是两个入口，尤其高风险或 strict 模式下计划要人工确认。

**用户回复**

同意。

**阶段性结论**

MVP 保留独立 `feature-plan-implementation` 命令：

- 设计最终批准后不能直接进入代码修改。
- DEV 必须先生成开发执行计划。
- 高风险或 `strict-human-loop` 模式下，开发执行计划需要人工确认。
- `feature-implement` 只能在开发执行计划存在且满足确认要求后执行。

## Q76：repo 绑定应存放在 `links/repos.json` 还是 `state.json.linkedRepos`？

**我的问题**

repo 绑定到底放在 `links/repos.json`，还是 `state.json.linkedRepos`？

当前文档存在冲突：Q65 已确认保留 `links/repos.json`，不把 repo 绑定塞进 `state.json`；但技术方案的 `state.json` 示例里仍有 `linkedRepos` 字段。两套事实来源并存会导致 Hook 和 workflow 判断不一致。

**用户回复**

同意删除 `state.json` 示例里的 `linkedRepos` 字段。

**阶段性结论**

repo 绑定唯一事实来源为 `links/repos.json`：

- `state.json` 只保存流程状态，不保存 repo 绑定明细。
- `links/repos.json` 保存任务与一个或多个代码仓库的绑定关系。
- Hook、实现计划和代码修改范围校验读取 `links/repos.json`。
- 避免 `state.json.linkedRepos` 与 `links/repos.json` 形成重复状态。

## Q77：是否保留 `implementation-plan-approval.json`？

**我的问题**

`implementation-plan-approval.json` 是否真的需要？

技术方案的批准目录包含 `design-final-approval.json` 和 `implementation-plan-approval.json`。前面已确认开发执行计划独立存在，并且高风险或 `strict-human-loop` 模式下计划需要人工确认。这里的问题是，计划确认事实是否需要独立 approval 文件。

我的建议是保留 `implementation-plan-approval.json`。这不是阶段设计批准文件，而是代码执行前的计划确认闸口，和“不要新增阶段 approval 文件”不冲突。

**用户回复**

同意。

**阶段性结论**

MVP 保留 `implementation-plan-approval.json`：

- 它记录高风险或 `strict-human-loop` 模式下开发执行计划的人工确认事实。
- 它不是阶段设计 approval 文件。
- Hook 可以用它判断开发执行计划是否满足确认要求。
- 计划确认事实不混入开发执行计划正文或 `state.json`。

## Q78：`state.json` 是否同时保留 `overallStage` 和 `status`？

**我的问题**

`state.json` 里是否同时保留 `overallStage` 和 `status`？

当前示例里同时存在 `overallStage: design` 和 `status: in_progress`，但任务整体状态又包含 `design_in_progress`、`approved_for_implementation` 等状态。两个字段如果都可变，后续很容易出现互相矛盾。

我的建议是删除 `overallStage`，只保留 `status` 作为任务整体状态机字段。

**用户回复**

同意。

**阶段性结论**

`state.json` 只保留 `status` 作为任务整体状态机字段：

- 删除 `overallStage`。
- `status` 使用 `initialized`、`design_in_progress`、`approved_for_implementation` 等任务整体状态。
- 阶段细节交给 `stages.*.status`。
- Hook 同步最终批准状态时写入 `status=approved_for_implementation`。

## Q79：`approvalStatus` 和 `allowedCodeChange` 是否还需要保留？

**我的问题**

`approvalStatus` 和 `allowedCodeChange` 是否还需要保留？

当前 `state.json` 同时有 `status=approved_for_implementation`、`approvalStatus=approved`、`allowedCodeChange=true`，三个字段都在表达是否允许进入代码落地。如果三套字段并存，后续很容易出现互相矛盾的状态。

我的建议是删除 `approvalStatus` 和 `allowedCodeChange`。批准事实由 approval 文件承载，流程准入状态由 `status=approved_for_implementation` 表达。

**用户回复**

同意。

**阶段性结论**

`state.json` 删除 `approvalStatus` 和 `allowedCodeChange`：

- `status=approved_for_implementation` 是流程准入状态。
- `approvals/design-final-approval.json` 是最终设计批准事实。
- 必要时 `approvals/implementation-plan-approval.json` 是开发执行计划确认事实。
- Hook 判断是否允许代码修改时，读取 `status`、approval 文件、开发执行计划和 `links/repos.json`，不再读取 `approvalStatus` 或 `allowedCodeChange`。

## Q80：最终设计批准记录是否需要记录所有阶段设计产物？

**我的问题**

`feature-approve` 前面定义的批准对象是 `integrated-design.md` 及其引用的阶段设计产物，但技术方案示例中的 `approvedArtifacts` 只记录了 `integrated-design.md` 的 hash。

这里有一个一致性问题：如果只锁定汇总设计，不锁定业务设计、方案设计、实现设计、测试设计这些事实来源，后续阶段文档被改动时，批准记录无法发现。

我的建议是：`design-final-approval.json` 的 `approvedArtifacts` 必须同时记录所有最终批准涉及的阶段设计产物 hash。

**用户回复**

同意。

**阶段性结论**

`design-final-approval.json` 的 `approvedArtifacts` 必须记录所有最终批准涉及的设计产物 hash：

- `artifacts/business-design.md`
- `artifacts/solution-design.md`
- `artifacts/implementation-design.md`
- `artifacts/test-design.md`
- `artifacts/integrated-design.md`

阶段设计文档是事实来源，`integrated-design.md` 是最终人工批准视图。这个调整不新增文件，只提高批准记录的准确性。

## Q81：`state.json` 中是否保留 `stages.*.reviewStatus`？

**我的问题**

`state.json` 里的 `stages.*.reviewStatus` 是否还需要保留？

我的判断是应该删除。它会和两类信息重复：阶段推进状态已经有 `stages.*.status`，评审事实状态应该以 `reviews/review-matrix.json` 和具体 review 文件为准。

如果 `reviewStatus` 留在 `state.json`，后续很容易出现 `stages.solutionDesign.status=human_approved`，但 `reviewStatus=pending_human` 这种不一致。

**用户回复**

同意。

**阶段性结论**

删除 `state.json` 中的 `stages.*.reviewStatus`：

- `stages.*.status` 只表达阶段推进状态。
- 评审状态事实来源是 `reviews/review-matrix.json` 和具体 review 文件。
- `state.json` 不重复保存评审状态，避免状态漂移。

## Q82：任务整体状态是否需要正常终态？

**我的问题**

当前任务整体状态需要一个明确的正常终态，否则工作流完成后只能停在 `verification_ready` 或其他中间态，无法表达“插件流程已结束”。

我的建议是只保留一个终态：`completed`。不要增加 `archived`、`delivered`、`accepted`、`released` 这些复杂状态。

**用户回复**

同意。

**阶段性结论**

MVP 任务整体状态保留唯一正常终态 `completed`：

- `completed` 表示开发、验证和转测交付包已完成，插件工作流结束。
- 上线、发布、归档不属于 MVP 状态机。
- 不新增 `archived`、`delivered`、`accepted`、`released` 等状态。

## Q83：评审矩阵中的风险字段是否统一为 `accepted_risk`？

**我的问题**

`review-matrix.json` 示例里问题类型统计用了 `acceptedRisk`，但评审问题分类定义的是 `accepted_risk`。

我的建议是统一成 `accepted_risk`。这三个值本质上是枚举项，不是普通业务字段。枚举项在 Markdown、JSON、脚本参数里保持完全一致，后续少很多映射和解释。

**用户回复**

同意。

**阶段性结论**

统一使用 `accepted_risk`：

- `review-matrix.json` 的 `issues` 统计字段使用 `accepted_risk`。
- Markdown、JSON、脚本参数中的评审问题类型保持一致。
- 不引入 `acceptedRisk` 到机器可读结构中。

## Q84：谁可以把任务状态置为 `completed`？

**我的问题**

既然已经有 `completed`，必须明确谁有资格把任务置为 `completed`。

我的建议是：只有 `/scc-dev-sphere:feature-verify` 可以把任务状态更新为 `completed`，而且必须同时满足两个条件：

1. 本地验证完成并通过，或者验证失败项已被人工明确接受为风险。
2. 转测交付包已生成，包含验证结果、变更摘要、已接受风险、测试建议。

`feature-implement` 不能直接置为 `completed`，因为代码写完不等于可交付。

**用户回复**

同意。

**阶段性结论**

只有 `feature-verify` 可以将任务状态更新为 `completed`：

- 本地验证必须完成并通过，或失败项已被人工明确接受为风险。
- 必须生成转测交付包。
- 转测交付包包含验证结果、变更摘要、已接受风险和测试建议。
- `feature-implement` 不能直接置为 `completed`。

## Q85：MVP 是否保留“最终交付包”这个术语？

**我的问题**

文档里同时出现“最终交付包”和“转测包”。这两个词如果都保留，会让范围变模糊：到底是给 TEST 的转测材料，还是完整交付归档材料？

我的建议是 MVP 统一叫“转测包”，不要再使用“最终交付包”。`accepted_risk` 的要求改成：

- 必须进入 `decisions/*-decisions.md`
- 必须进入 `integrated-design.md` 风险汇总
- 若代码落地后仍相关，必须进入转测包

**用户回复**

同意。

**阶段性结论**

MVP 不再使用“最终交付包”作为正式术语：

- 代码落地后的交付材料统一称为“转测包”。
- `accepted_risk` 必须进入决策记录。
- `accepted_risk` 必须进入 `integrated-design.md` 风险汇总。
- 若风险在代码落地后仍相关，必须进入转测包。

## Q86：任务整体状态流转如何定义，`implementation_in_progress` 是否保留？

**我的问题**

前面提出代码修改准入时，我把 `implementation_in_progress` 处理得不够清楚。你提醒“阶段状态只记录稳定边界，不记录 `drafting`、`ai_reviewing` 这类命令执行中的瞬时状态”是对的。

这里需要区分两层状态：

- `stages.*.status`：阶段产物状态，只记录稳定边界。
- `state.status`：任务整体状态，记录任务流程所在区间。

`implementation_in_progress` 如果定义为“代码落地阶段已开始，可能包含多轮编码、修复、补测试”，它就是稳定边界，可以保留。

我的建议是保留 `implementation_in_progress`，但明确整体状态流转和代码修改准入：

```text
initialized
  -> assessed
  -> design_in_progress
  -> review_in_progress
  -> design_ready
  -> approved_for_implementation
  -> implementation_planned
  -> implementation_in_progress
  -> verification_ready
  -> completed
```

`human_input_required` 和 `blocked` 是异常/等待态，不是主线必经状态。代码修改准入状态只包括：

```text
implementation_planned
implementation_in_progress
```

`approved_for_implementation` 只表示最终设计已批准，允许生成开发执行计划；不能直接绕过开发执行计划进入代码修改。

**用户回复**

同意。

**阶段性结论**

保留 `implementation_in_progress`，但按稳定任务区间定义：

- `approved_for_implementation`：最终设计已批准，允许生成开发执行计划。
- `implementation_planned`：开发执行计划已生成，必要时已人工确认，允许代码落地。
- `implementation_in_progress`：代码落地阶段已开始，允许多轮编码、修复和补测试。
- `verification_ready`：代码落地完成，等待或正在执行验证与转测包生成。
- `completed`：验证和转测包完成。

代码修改准入状态只包括 `implementation_planned` 和 `implementation_in_progress`。

## Q87：什么时候可以进入 `implementation_planned`？

**我的问题**

`feature-plan-implementation` 现在说“高风险或 strict 模式下等待人工确认”，但状态机里 `implementation_planned` 是代码落地准入状态。

这里必须明确：什么时候能从 `approved_for_implementation` 进入 `implementation_planned`？

我的建议是：

- 普通任务：`feature-plan-implementation` 生成开发执行计划后，直接进入 `implementation_planned`
- 高风险或 `strict-human-loop`：必须生成 `implementation-plan-approval.json` 后，才能进入 `implementation_planned`
- 如果计划生成了但待人工确认，状态保持 `approved_for_implementation`，不能进入代码落地

**用户回复**

同意。

**阶段性结论**

进入 `implementation_planned` 的规则如下：

- 普通任务在开发执行计划生成后进入 `implementation_planned`。
- 高风险或 `strict-human-loop` 模式必须先生成 `implementation-plan-approval.json`。
- 计划已生成但待人工确认时，任务状态保持 `approved_for_implementation`。
- `implementation_planned` 是代码落地准入状态，不能在计划确认缺失时提前进入。

## Q88：任务整体状态是否应避免记录人工决策、评审中、验证中这类过程动作？

**我的问题**

你指出人工决策只是一个瞬时动作，设计过程中可能频繁发生。如果把它定义为任务整体状态，就要频繁切换和恢复状态，带来复杂的状态维护成本。评审、验证也是过程，有问题后回到设计或开发循环，不一定适合频繁在两个状态之间切换。

我的建议是把任务整体状态从“过程动作状态”改成“稳定阶段状态”。不要把人工决策、评审中、验证中这类过程动作放进 `state.status`。

简化后的整体状态为：

```text
initialized
assessed
designing
design_ready
approved_for_implementation
implementation_planned
implementing
verification_ready
completed
blocked
```

其中：

- `designing` 覆盖设计生成、AI 评审、人工澄清、设计修订、再评审循环。
- `implementing` 覆盖编码、验证失败后的修复、补测试、再验证前的开发调整。
- `verification_ready` 表示代码实现认为已完成，等待最终验证结果和转测包生成。
- `blocked` 只用于无法继续推进的稳定阻塞，不用于普通人工确认。
- 人工决策不进 `state.status`，只写入 `decisions/*-decisions.md` 或 approval 文件。

代码修改准入状态改为：

```text
implementation_planned
implementing
```

**用户回复**

同意。

**阶段性结论**

任务整体状态采用稳定阶段状态，不记录过程动作：

- 删除 `design_in_progress`、`review_in_progress`、`human_input_required`、`implementation_in_progress`。
- 新增/使用 `designing` 和 `implementing` 承载循环过程。
- 设计与评审循环保持在 `designing`，直到无阻塞后进入 `design_ready`。
- 开发与验证修复循环保持在 `implementing`，直到代码实现认为可验证后进入 `verification_ready`。
- 人工决策不进入 `state.status`，写入决策记录或批准记录。
- 代码修改准入状态为 `implementation_planned` 和 `implementing`。

## Q89：是否保留 `verification_ready`？

**我的问题**

按前面的简化思路，“验证中”不应该是任务状态；但 `verification_ready` 如果定义为“代码实现阶段认为已完成，准备生成最终验证结果和转测包”，它不是验证过程状态，而是实现阶段到完成阶段之间的稳定闸口。

我的建议是保留 `verification_ready`，但定义清楚：

- `implementing`：开发、修复、补测试、验证失败后的回修都在这里循环。
- `verification_ready`：实现 Agent 认为代码已经完成，进入最终验证和转测包生成闸口。
- `feature-verify` 验证通过并生成转测包后进入 `completed`。
- `feature-verify` 发现可修复问题时，状态回到 `implementing`。
- 不新增 `verifying` / `verification_failed`。

**用户回复**

同意。

**阶段性结论**

保留 `verification_ready`：

- 它是最终验证和转测包生成闸口，不是“验证中”过程状态。
- 验证通过并生成转测包后进入 `completed`。
- 验证失败但可修复时回到 `implementing`。
- 验证失败且无法继续推进时进入 `blocked`，并记录阻塞原因。
- 不新增 `verifying` 或 `verification_failed`。

## Q90：谁负责把任务推进到 `verification_ready`？

**我的问题**

`feature-verify` 现在的描述略别扭：它既把任务状态更新为 `verification_ready`，又执行验证和转测包生成。

如果 `verification_ready` 是“准备验证”的稳定闸口，更合理的是由 `feature-implement` 在认为代码落地完成时，把状态从 `implementing` 推到 `verification_ready`。`feature-verify` 只消费 `verification_ready`，验证通过后进入 `completed`，失败可修复则回到 `implementing`。

我的建议是：

- `feature-implement` 完成代码落地后，更新 `status=verification_ready`
- `feature-verify` 要求当前状态为 `verification_ready`
- `feature-verify` 成功后更新 `completed`
- `feature-verify` 失败可修复时回到 `implementing`

**用户回复**

同意。

**阶段性结论**

`verification_ready` 由 `feature-implement` 推进：

- `feature-implement` 启动代码落地时进入 `implementing`。
- `feature-implement` 认为代码落地完成、可进入最终验证时，进入 `verification_ready`。
- `feature-verify` 只消费 `verification_ready`，不负责把实现阶段推进到验证闸口。
- `feature-verify` 验证通过并生成转测包后进入 `completed`。
- `feature-verify` 失败可修复时回到 `implementing`。

## Q91：什么时候从 `designing` 进入 `design_ready`？

**我的问题**

状态机简化后，`feature-review` 产出 `blocking=0` 后“同步阶段状态为 `ai_review_passed`”这句话只覆盖了阶段状态，但没有说明任务整体什么时候从 `designing` 进入 `design_ready`。

我的建议是：

- 单个阶段评审通过：只更新对应 `stages.*.status=ai_review_passed` 或 `human_approved`
- 所有阶段达到当前 workflow mode 要求，且 `integrated-design` 完成一致性评审无阻塞后，任务整体进入 `design_ready`
- `design_ready` 不表示人工最终批准，只表示设计材料已准备好进入 `feature-approve`

**用户回复**

同意。

**阶段性结论**

`design_ready` 的进入条件如下：

- 所有阶段达到当前 workflow mode 要求。
- `integrated-design` 已生成或刷新。
- 集成一致性评审无阻塞。
- 阶段评审只更新阶段状态，不直接更新任务整体为 `design_ready`。
- `design_ready` 不是人工最终批准，只是进入 `feature-approve` 的前置状态。

## Q92：`feature-approve` 是否必须要求任务处于 `design_ready`？

**我的问题**

`feature-approve` 是否应该要求当前任务状态必须是 `design_ready`？

我的建议是必须要求。否则理论上只要 blocking 归零、advisory 处理完，就可能在阶段尚未完整、集成设计未准备好的情况下生成最终批准记录。

规则可以简单定义为：

- `feature-approve` 只允许在 `state.status=design_ready` 时执行
- 执行成功后进入 `approved_for_implementation`
- 如果设计被修订，状态从 `design_ready` 回到 `designing`，并重新走集成评审

**用户回复**

同意。

**阶段性结论**

`feature-approve` 必须要求 `state.status=design_ready`：

- `design_ready` 是最终人工批准的前置状态。
- `feature-approve` 成功后进入 `approved_for_implementation`。
- `design_ready` 后如果发生设计修订，任务整体状态退回 `designing`。
- 设计修订后必须重新完成受影响阶段评审和集成一致性评审。

## Q93：批准机制章节是否也需要补充 `design_ready` 前置条件？

**我的问题**

技术方案第 10 节“批准机制”还有一句旧表述：

`feature-approve` 默认只处理代码落地前的最终设计批准，批准对象是 `integrated-design.md` 及其引用的阶段设计产物。

这句话没有错，但缺少刚确认的 `design_ready` 前置条件，容易和 13.6 形成轻微不一致。

我的建议是在批准机制章节也补一句：

- `feature-approve` 只能在 `state.status=design_ready` 时生成 `design-final-approval.json`

**用户回复**

同意。

**阶段性结论**

批准机制章节同步补充 `design_ready` 前置条件：

- `feature-approve` 只能在 `state.status=design_ready` 时生成 `design-final-approval.json`。
- 该规则和 13.6 `feature-approve` 命令语义保持一致。
- 阶段级人工确认仍不生成代码落地批准。

## Q94：`advisory-confirmation` 章节是否也需要补充完整批准条件？

**我的问题**

技术方案里 `advisory-confirmation.json` 一节还有一句：

`只有当所有 advisory 都在该索引中存在人工确认结果，且没有被转换后未关闭的 blocking 时，feature-approve 才能生成批准记录。`

这句话也缺少 `design_ready` 前置条件。我的建议统一改成：

- `feature-approve` 生成批准记录必须同时满足：
  - `state.status=design_ready`
  - 所有 `advisory` 已人工确认
  - 没有未关闭 `blocking`
  - `accepted_risk` 已进入决策记录和 `integrated-design`

**用户回复**

同意。

**阶段性结论**

`advisory-confirmation` 章节同步补充完整批准条件：

- `state.status=design_ready`。
- 所有 `advisory` 已人工确认。
- 没有未关闭 `blocking`。
- `accepted_risk` 已写入决策记录，并已进入 `integrated-design.md` 风险汇总。

## Q95：任务整体 `blocked` 和阶段 `blocked` 如何区分？

**我的问题**

当前保留了任务整体 `blocked`，阶段也有 `stages.*.status=blocked`。这可能重复，但我不建议删除其中任何一个，因为粒度不同。

我的建议是补一条边界规则：

- 能归属到某个阶段的问题，写 `stages.<stage>.status=blocked`
- 影响整个任务推进、或无法归属单一阶段的问题，写 `state.status=blocked`
- 普通人工澄清不使用 blocked，只记录 decision，任务仍保持 `designing` 或 `implementing`

**用户回复**

同意。

**阶段性结论**

`blocked` 按影响范围选择写入位置：

- 阶段级问题写入对应 `stages.<stage>.status=blocked`。
- 任务级问题写入 `state.status=blocked`。
- 普通人工澄清不进入 `blocked`，只写入决策记录。
- `blocked` 只表达无法继续推进的稳定阻塞。

## Q96：`stages` 是否是所有工作流的必选结构？

**我的问题**

你指出当前阶段状态给人的感觉只是对应 feature 的设计阶段。整个任务阶段状态已经定义得比较完善，后续适配其他工作流，应该优先针对任务整体状态。

我的修正建议是：不要把 `stages` 设计成插件全局固定结构，也不要过早引入所有 workflow 都必须定义 stages/statuses 的模板系统。

更克制的设计是：

- `state.status` 是主状态机，跨工作流复用。
- `stages` 是可选的 workflow-specific 细分进度，只在确实需要细粒度阶段追踪时使用。
- MVP 的 `stages.businessDesign / solutionDesign / implementationDesign / testDesign` 只服务 feature 设计阶段。
- 其他工作流初期可以不使用 `stages`，只用 `state.status` 和对应过程产物。
- 等 bugfix/refactor 真有复杂阶段追踪需求时，再为该 workflow 定义自己的 `stages`。

**用户回复**

我同意你这种设计。

**阶段性结论**

`stages` 降级为可选的 workflow-specific 扩展结构：

- `state.status` 是跨工作流复用的任务整体状态。
- `stages` 不是插件全局固定结构，也不是扩展新 workflow 的必经机制。
- MVP 只定义 feature 需求开发工作流的设计阶段 `stages`。
- 后续 workflow 默认优先复用任务整体状态。
- 只有当某个 workflow 需要阶段可视化、阶段评审或阶段批准时，才定义自己的 `stages`。

## Q97：feature 的 `stages` 是否需要包含实现阶段，以及阶段状态如何维护？

**我的问题**

你提出两个问题：当前 `stages` 仅有设计阶段，没有实现阶段，是否属于设计缺失？同时内部的 `stages` 具体要怎么维护状态？

我的判断是不算设计缺失，也不建议把实现阶段放进 feature 的 `stages`。当前 feature 的 `stages` 是为了管理多份设计产物的细粒度状态，它们都有独立产物、独立评审、独立修订闭环，所以需要 stage 状态。实现和验证已经由任务整体状态、开发执行计划、验证结果和转测包表达。

建议规则：

- 不给 feature `stages` 增加实现阶段。
- `state.status` 管任务主流程：设计、批准、计划、实现、验证、完成。
- `stages` 只管当前 workflow 中需要细粒度追踪的子产物/子阶段。
- feature MVP 的 `stages` 只覆盖设计阶段。
- 阶段状态只由对应命令或确定性 Hook/脚本更新，不由 Agent 在正文里自由声明。

阶段状态维护建议：

- `feature-design-*` 生成或更新对应设计产物后，阶段状态进入 `drafted`。
- `feature-review <stage>` 发现 `blocking` 时，阶段状态进入 `ai_rework_required`。
- `feature-review <stage>` 无 `blocking` 时，`auto-design` 和 `collaborative-design` 下阶段状态进入 `ai_review_passed`。
- `strict-human-loop` 或阶段人工确认后，阶段状态进入 `human_approved`。
- 人工要求修改已评审阶段时，阶段状态进入 `human_rework_required`。
- 无法继续推进且能归属该阶段时，阶段状态进入 `blocked`。

**用户回复**

同意。

**阶段性结论**

feature 的 `stages` 不包含实现和验证阶段：

- 实现和验证由 `state.status`、开发执行计划、验证结果和转测包表达。
- feature `stages` 只覆盖设计产物级追踪。
- 这样避免 `stages.implementation` 与 `state.status=implementing / verification_ready / completed` 形成重复状态。
- 阶段状态由命令或确定性 Hook/脚本维护，Agent 不能自由声明。

## Q98：设计阶段由谁判断完成，谁调度评审？

**我的问题**

你修正了前面的流程理解：按照之前讨论的方案，应该是 workflow 根据任务选择对应 Agent，调用相关 Skill 执行任务。以需求分析为例，workflow 调用 SA Agent，SA Agent 加载需求分析 Skill 和你协同讨论；SA Agent 判断分析是否完成并告诉主会话，主会话再判断需要进入评审，然后找 SE Agent 调用评审 Skill 进行 AI 评审。

我的修正建议是：

- workflow 负责流程编排：读取状态、选择阶段、选择 Agent/Skill、调度评审、决定进入设计/评审/返工/批准。
- Agent + Skill 负责执行专业任务，并判断自己负责的产物是否达到该 Skill 定义的完成条件。
- Agent 返回阶段产物、关键结论和 `ready_for_review` 信号。
- workflow 接收 `ready_for_review` 后，调度正式 AI 评审闭环。
- `feature-review` 可以由用户显式调用，也可以由 workflow 自动调度。
- 设计协同期间的自检不等于正式 AI 评审，不能单独触发 `ai_review_passed`。

**用户回复**

同意。

**阶段性结论**

正式职责边界如下：

- Agent/Skill 负责专业产物生成和产物完成判断。
- workflow 负责阶段推进和评审调度。
- `drafted -> ai_review_passed` 不是由用户是否手动调用 `/feature-review` 决定，而是由正式 AI 评审闭环是否完成决定。
- 正式 AI 评审闭环必须产出 review 明细并更新 `review-matrix.json`。
- 设计 Skill 内部自检只能用于改进产物，不能替代正式评审。

## Q99：feature 阶段状态是否还需要 rework / review_required / blocked？

**我的问题**

你指出 `rework_required` 这类中间状态意义不大：如果遇到设计返工，直接切回或保持 `drafted` 就可以。同时你也指出 `blocked` 场景不应该太硬，很多外部知识缺失或代码仓不可访问都可以由人补充，不应直接阻塞团队设计流程。

我的修正建议是把 feature 阶段状态收敛为 4 个稳定边界：

```text
not_started
drafted
ai_review_passed
human_approved
```

阶段状态含义：

- `not_started`：该阶段还没有设计产物。
- `drafted`：已有阶段设计产物，协同补信息、设计修订、等待人工反馈、评审返工都保持在该状态。
- `ai_review_passed`：正式 AI 评审闭环通过，且无未关闭 `blocking`。
- `human_approved`：人工确认该阶段可用。

`blocked` 不再作为 feature 阶段状态。`blocked` 只保留为任务级极窄异常兜底：当前任务无法在本插件流程内继续推进，且不能通过普通人工补充信息、人工决策或记录假设解决。

**用户回复**

同意。

**阶段性结论**

feature 阶段状态最终收敛为 4 个：

- `not_started`
- `drafted`
- `ai_review_passed`
- `human_approved`

删除阶段状态中的 `ai_rework_required`、`human_review_required`、`human_rework_required`、`blocked`。

阶段状态维护规则：

- 没有产物时是 `not_started`。
- 设计产物生成或修订后进入 `drafted`。
- 评审存在阻塞、人工反馈问题、等待补充信息或设计返工时保持或回到 `drafted`。
- 正式 AI 评审无未关闭阻塞后进入 `ai_review_passed`。
- 人工确认后进入 `human_approved`。
- `blocked` 只作为任务级兜底异常状态。

## Q100：阶段级人工 OK 如何落盘？

**我的问题**

阶段状态简化后，需要明确“人工 OK”如何落盘。

我的建议是：

- workflow / `feature-review` 在 AI 正式评审通过后暂停，提示你人工评审。
- 你回复 `OK` 后，对应阶段进入 `human_approved`。
- 你反馈问题后，对应阶段保持或回到 `drafted`，并记录问题，workflow 再调度对应设计 Agent 修订。
- 阶段级人工 OK 不生成 approval 文件。
- 阶段级人工确认事实写入对应 review 明细或 `decisions/*-decisions.md`。
- 最终代码落地批准仍只由 `feature-approve` 生成 `design-final-approval.json`。

**用户回复**

同意。

**阶段性结论**

阶段级人工确认作为 `feature-review` 流程中的交互节点处理：

- AI 正式评审通过后暂停等待人工评审。
- 用户回复 `OK` 后，阶段状态进入 `human_approved`。
- 用户反馈问题后，阶段状态保持或回到 `drafted`，workflow 调度对应设计 Agent 修订。
- 阶段级人工确认不生成 approval 文件。
- 确认事实写入 review 明细或对应 decisions 文件。
- `feature-approve` 仍是唯一生成 `design-final-approval.json` 的最终设计批准入口。

## Q101：strict-human-loop 是否引入额外阶段状态？

**我的问题**

在阶段状态已经收敛为 `not_started`、`drafted`、`ai_review_passed`、`human_approved` 后，`strict-human-loop` 的语义需要同步收敛。

我的建议是：

- `strict-human-loop` 不引入额外阶段状态。
- `strict-human-loop` 只提高阶段推进门槛，不改变状态机。
- 后续阶段启动前，前置阶段必须达到 `human_approved`。
- AI 正式评审通过后，workflow 必须暂停并提示人工评审。
- 用户回复 `OK` 后，阶段进入 `human_approved`。
- 用户反馈问题后，阶段保持或回到 `drafted`，再由 workflow 调度设计 Agent 修订。

**用户回复**

同意。

**阶段性结论**

`strict-human-loop` 是门禁策略，不是独立状态机：

- 不新增 `human_review_required`、`human_rework_required` 等中间状态。
- AI 正式评审通过只说明可以进入人工确认点。
- 人工 OK 后才进入 `human_approved`。
- 人工反馈问题后回到或保持 `drafted`。
- 状态流转仍沿用 feature 阶段的 4 个稳定边界。

## Q102：collaborative-design 的局部人工门禁如何定义？

**我的问题**

`collaborative-design` 中“复杂阶段可人工切换为要求 `human_approved`”这句话过于模糊。如果让 Agent 在执行中临时判断某阶段是否需要人工门禁，workflow 会变得不可预测，状态恢复和问题追踪也会变复杂。

我的建议是引入轻量配置 `humanGateStages`：

```json
"humanGateStages": ["businessDesign", "solutionDesign"]
```

含义：

- `collaborative-design` 默认阶段达到 `ai_review_passed` 后即可作为后续 AI 设计输入。
- 被列入 `humanGateStages` 的阶段，必须达到 `human_approved` 后才能推进依赖它的后续阶段。
- `humanGateStages` 不新增状态，不新增模式，只改变阶段推进门槛。
- Agent 不得在执行中自行改变该配置；如需调整，必须由 workflow 记录人工决策后更新。

**用户回复**

同意，新增的 `humanGateStages` 需要在 assess 阶段就让使用者指定。也同意补充边界：如果设计过程中确实发现阶段风险比 assess 时判断更高，可以人工决策后调整 `humanGateStages`，并记录到决策文件；Agent 不能自行修改。

**阶段性结论**

`collaborative-design` 使用 `humanGateStages` 做局部人工门禁：

- `feature-assess` 在用户选择 `collaborative-design` 时，必须让用户指定 `humanGateStages`，或明确确认为空。
- `humanGateStages` 写入 `state.json`。
- 未列入 `humanGateStages` 的阶段达到 `ai_review_passed` 即可推进。
- 列入 `humanGateStages` 的阶段必须达到 `human_approved` 才能推进。
- 该配置不新增阶段状态，不改变状态机。
- 设计过程中确需调整时，只能由人工决策触发，workflow 记录决策后更新配置；Agent 不得自行修改。
