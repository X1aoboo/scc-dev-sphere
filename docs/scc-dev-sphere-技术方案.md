# scc-dev-sphere 技术方案

## 1. 技术目标

`scc-dev-sphere` 作为 Claude Code plugin 实现，不自建 Agent runtime。插件通过 Claude Code 原生组件组合完成需求开发工作流：

- `skills`：阶段命令和复用能力。
- `agents/custom subagents`：SA、SE、MDE、DEV、TSE、CIE 等角色上下文，按需调用。
- `hooks`：流程硬闸口。
- `scripts`：确定性状态读写、校验、矩阵更新。
- `.mcp.json`：插件根目录下的 MCP server 配置，用于私域知识库接入预留。

MVP 技术目标是让需求开发任务能够跨会话恢复、可审计推进，并在未批准前阻止代码落地。

MVP 使用 Claude Code plugin 原生 `agents/` 能力提供角色上下文，不实现复杂 subagent 并行调度或 agent-team 编排。

## 2. 插件包结构

建议插件目录：

```text
scc-dev-sphere/
  .claude-plugin/
    plugin.json
  skills/
    feature-init/
      SKILL.md
    feature-assess/
      SKILL.md
    feature-design/
      SKILL.md
    feature-design-business/
      SKILL.md
    feature-design-solution/
      SKILL.md
    feature-design-implementation/
      SKILL.md
    feature-design-test/
      SKILL.md
    feature-review/
      SKILL.md
    feature-approve/
      SKILL.md
    feature-plan-implementation/
      SKILL.md
    feature-implement/
      SKILL.md
    feature-verify/
      SKILL.md
    workflow/
      SKILL.md
    workflow-feature/
      SKILL.md
    status/
      SKILL.md
    knowledge-query/
      SKILL.md
    backend-development/
      SKILL.md
    frontend-development/
      SKILL.md
    fullstack-change-planning/
      SKILL.md
  agents/
    sa.md
    se.md
    mde.md
    dev.md
    tse.md
    cie.md
  hooks/
    hooks.json
  .mcp.json
  scripts/
    devsphere-state.js
    devsphere-review-matrix.js
    devsphere-approval.js
    devsphere-guard.js
    devsphere-workspace.js
    devsphere-workflow.js
    workflows/
      feature-workflow.js
  templates/
    artifacts/
    reviews/
    approvals/
    verification/
```

实际文件名可按 Claude Code plugin 官方格式调整，但职责边界应保持上述分层。

`agents/*.md` 必须是 Claude Code custom subagent 定义文件，包含 YAML frontmatter。`name` 使用小写短横线标识，例如 `sa`、`se`、`mde`、`dev`、`tse`、`cie`；角色缩写 SA/SE/MDE/DEV/TSE/CIE 仅作为文档展示名。插件 subagent 不依赖 `hooks`、`mcpServers`、`permissionMode` 等 frontmatter 字段。

## 3. 命令入口

Claude Code plugin skill 命令采用插件命名空间。MVP 推荐命令：

```text
/scc-dev-sphere:feature-init
/scc-dev-sphere:feature-assess
/scc-dev-sphere:feature-design
/scc-dev-sphere:feature-design-business
/scc-dev-sphere:feature-design-solution
/scc-dev-sphere:feature-design-implementation
/scc-dev-sphere:feature-design-test
/scc-dev-sphere:feature-review
/scc-dev-sphere:feature-approve
/scc-dev-sphere:feature-plan-implementation
/scc-dev-sphere:feature-implement
/scc-dev-sphere:feature-verify
```

通用命令：

```text
/scc-dev-sphere:workflow
/scc-dev-sphere:status
```

上述入口既可以由用户显式 slash 调用，也可以由 `workflow` 根据 `state.json`、`current-task.json` 和阶段状态触发。外部调用方式不构成安全边界；安全边界由 Skill 内部人工确认闸口、确定性脚本状态校验和 Hook 校验共同承担。

workflow 是主编排入口：负责读取当前任务、判断任务阶段、选择下一步动作，并选择负责 Agent；Agent 负责专业视角并加载/执行对应 Skill；Skill 负责具体工作方法、产物生成和内部闸口；脚本/Hook 负责确定性状态读写与硬校验。

workflow 采用 taskType-based adapter 机制，避免把 feature 流程写死到统一入口：

```text
/scc-dev-sphere:workflow
  -> skills/workflow/SKILL.md
  -> 读取 .devsphere/current-task.json
  -> 识别 taskType
  -> 委派给对应 workflow adapter
```

MVP 只实现 feature adapter：

- `skills/workflow/SKILL.md`：统一用户入口，负责读取 current task、识别 `taskType`、分发到对应 adapter。
- `skills/workflow-feature/SKILL.md`：feature 专属编排规则，负责解释 feature next action，并指导 workflow 调用对应 Agent/Skill 或暂停等待人工确认。
- `scripts/devsphere-workflow.js`：通用确定性工具，负责读取 current task、加载 state、校验 taskPath、调用 taskType 对应 resolver。
- `scripts/workflows/feature-workflow.js`：feature next-step resolver，根据 `state.status`、`stages`、`workflowMode`、`humanGateStages`、review matrix、approval 计算下一步动作。

adapter 脚本只输出结构化 next action 和准入条件，不生成设计正文、不调用 Agent、不修改产物、不替代 Skill 内部人工确认。`workflow` Skill 根据 next action 选择 Agent 和 Skill 执行，执行后由 Hook/scripts 做确定性校验和状态同步。

adapter 输出必须遵循最小稳定 `nextAction` schema。该 schema 是 `workflow` Skill、taskType adapter、`status` Skill 和后续 taskType adapter 的接口契约，不是执行引擎或 DSL。

最小 schema：

```json
{
  "taskType": "feature",
  "taskId": "FEAT-20260629-001",
  "adapter": "workflow-feature",
  "currentStatus": "designing",
  "currentStage": "businessDesign",
  "nextAction": {
    "kind": "run_skill",
    "skill": "feature-design-business",
    "args": {},
    "agent": "sa",
    "agentExecutions": null,
    "reason": "businessDesign is not started",
    "expectedInputs": [],
    "expectedOutputs": [
      "artifacts/business-design.md"
    ],
    "afterCompletion": [
      {
        "kind": "run_skill",
        "skill": "feature-review",
        "args": {
          "target": "business-design"
        }
      }
    ]
  },
  "requiresHumanInput": false,
  "humanPrompt": null,
  "guards": [
    "active_task_exists",
    "stage_not_human_approved"
  ],
  "stateEffects": {
    "allowed": [
      "stages.businessDesign.status -> drafted"
    ],
    "forbidden": [
      "state.status -> approved_for_implementation"
    ]
  },
  "onFailure": {
    "statePolicy": "keep_current_state",
    "recordTo": [
      "reviews/business-design/se-review.md",
      "decisions/business-design-decisions.md"
    ]
  }
}
```

MVP 支持的 `nextAction.kind`：

| kind | 含义 |
| --- | --- |
| `run_skill` | workflow 选择 Agent 并调用对应 Skill。 |
| `human_confirm` | workflow 暂停并等待人工确认。 |
| `show_status` | 只展示状态、待办或下一步建议，不推进流程。 |
| `blocked` | 展示阻塞原因和恢复建议，不自动推进。 |
| `completed` | 展示完成态，不继续推进。 |

单 Agent Skill 调用使用 `agent` 字段；多 Agent 执行同一个 Skill 时使用 `agentExecutions[]`。`agentExecutions[]` 用于表达 workflow 已经决定的 Agent 调度计划，不是 Skill 参数。

多 Agent 评审示例：

```json
{
  "taskType": "feature",
  "taskId": "FEAT-20260629-001",
  "adapter": "workflow-feature",
  "currentStatus": "designing",
  "currentStage": "solutionDesign",
  "nextAction": {
    "kind": "run_skill",
    "skill": "feature-review",
    "args": {
      "target": "solution-design"
    },
    "agent": null,
    "agentExecutions": [
      {
        "agent": "sa",
        "args": {
          "target": "solution-design"
        },
        "expectedOutput": "reviews/solution-design/sa-review.md"
      },
      {
        "agent": "mde",
        "args": {
          "target": "solution-design"
        },
        "expectedOutput": "reviews/solution-design/mde-review.md"
      },
      {
        "agent": "tse",
        "args": {
          "target": "solution-design"
        },
        "expectedOutput": "reviews/solution-design/tse-review.md"
      }
    ],
    "reviewMatrixRef": "reviews/review-matrix.json",
    "reason": "solutionDesign is drafted and ready for formal review"
  },
  "requiresHumanInput": false,
  "humanPrompt": null,
  "guards": [
    "review_matrix_initialized",
    "target_artifact_exists"
  ],
  "stateEffects": {
    "allowed": [
      "reviews/review-matrix.json update",
      "stages.solutionDesign.status -> ai_review_passed when blocking=0"
    ],
    "forbidden": [
      "state.status -> design_ready"
    ]
  },
  "onFailure": {
    "statePolicy": "keep_current_state",
    "recordTo": [
      "reviews/solution-design/"
    ]
  }
}
```

人工确认示例：

```json
{
  "taskType": "feature",
  "taskId": "FEAT-20260629-001",
  "adapter": "workflow-feature",
  "currentStatus": "designing",
  "currentStage": "businessDesign",
  "nextAction": {
    "kind": "human_confirm",
    "reason": "businessDesign has passed AI review and requires human approval because it is listed in humanGateStages.",
    "onApprove": "mark_stage_human_approved",
    "onReject": "record_feedback_and_revise"
  },
  "requiresHumanInput": true,
  "humanPrompt": "请确认 businessDesign 是否通过阶段人工评审。",
  "guards": [
    "stage_ai_review_passed",
    "stage_in_humanGateStages"
  ],
  "stateEffects": {
    "allowed": [
      "stages.businessDesign.status -> human_approved"
    ],
    "forbidden": [
      "state.status -> approved_for_implementation"
    ]
  },
  "onFailure": {
    "statePolicy": "keep_current_state",
    "recordTo": [
      "decisions/business-design-decisions.md"
    ]
  }
}
```

schema 边界：

- `nextAction` 只描述下一步动作，不直接执行动作。
- `nextAction.skill` 只保存 Skill 名；Skill 参数必须放入 `nextAction.args`，不能拼成空格子命令或整段命令字符串。
- `feature-review` 不接收 `reviewer` 参数；评审 Agent 由 workflow / feature adapter 通过 `agent` 或 `agentExecutions[]` 调度，Agent 职责视角来自 Agent 自身定义。
- `stateEffects` 只是声明允许/禁止的状态影响，最终仍由 Skill、scripts 和 Hook 校验。
- `afterCompletion` 是建议的后续动作，不允许绕过 workflow 再次判断。
- adapter 不引入复杂 DSL、条件表达式或自建 runtime。

### Feature Next-Step Decision Table

`scripts/workflows/feature-workflow.js` 使用以下最小决策表计算 feature task 的 nextAction。该表只覆盖 MVP 主路径和必要异常，不新增状态机。

| 当前状态 / 条件 | workflow 下一步 | nextAction 形态 | 暂停点 | 关键产物 |
|---|---|---|---|---|
| 无 active task | 提示用户创建 feature task | `show_status` | 等待需求输入 | 无 |
| `initialized` | 执行需求复杂度/风险评估 | `run_skill feature-assess` | 等待用户确认 `workflowMode` / `humanGateStages` | assessment、state |
| `assessed` | 进入设计阶段，推进业务设计 | `run_skill feature-design-business`，`agent=sa` | 需求不完整时澄清 | `business-design.md` |
| `designing` + `businessDesign` 未可用 | 生成/修订业务设计；完成后 SE 正式评审 | 先 `feature-design-business agent=sa`，后 `feature-review args.target=business-design agentExecutions=[se]` | strict/humanGate 命中时人工确认 | business artifact、SE review |
| `businessDesign` 可用，`solutionDesign` 未可用 | 生成/修订方案设计；完成后 SA/MDE/TSE 正式评审 | 先 `feature-design-solution agent=se`，后 `feature-review args.target=solution-design agentExecutions=[sa,mde,tse]` | strict/humanGate 命中时人工确认 | solution artifact、reviews |
| `solutionDesign` 可用，`implementationDesign` 未可用 | 生成/修订实现设计；完成后 SE/DEV/TSE 正式评审 | 先 `feature-design-implementation agent=mde`，后 `feature-review args.target=implementation-design agentExecutions=[se,dev,tse]` | strict/humanGate 命中时人工确认 | implementation artifact、reviews |
| `solutionDesign` 可用，`testDesign` 未可用 | 生成/修订测试设计；完成后 SA/SE/MDE 正式评审 | 先 `feature-design-test agent=tse`，后 `feature-review args.target=test-design agentExecutions=[sa,se,mde]` | strict/humanGate 命中时人工确认 | test artifact、reviews |
| 四个阶段都可用，但无 `integrated-design.md` 或集成评审未通过 | 生成/刷新 integrated design；执行集成一致性评审 | `feature-design` 的 integrated 生成动作；后 `feature-review args.target=integrated-design agentExecutions=[sa,se,mde,tse]` | blocking/advisory/risk/assumption 待处理时暂停 | integrated design、integrated review |
| 所有阶段评审和集成评审通过，advisory/risk/assumption 均处理完成 | 进入 `design_ready` | `show_status` + scripts/hooks 同步 | 无 | state 更新 |
| `design_ready` | 发起最终设计批准 | `run_skill feature-approve` | 等待人工最终批准 | `design-final-approval.json` |
| `approved_for_implementation` | 生成开发执行计划 | `run_skill feature-plan-implementation agent=dev` | 高风险/strict 时等待计划批准 | implementation plan |
| `implementation_planned` | 发起代码落地 | `run_skill feature-implement agent=dev` | 首次修改代码前动作级确认 | implementation log、代码变更 |
| `implementing` | 继续实现、修复、补测试；完成后进入验证闸口 | `run_skill feature-implement agent=dev` | 范围越界时暂停并回到计划/设计 | code changes、tests |
| `verification_ready` | 执行验证并生成转测包 | `run_skill feature-verify`，默认 DEV 执行，必要时 TSE 视角补充转测建议 | 验证失败且需人工接受风险时暂停 | verification result、test handoff |
| `completed` | 展示完成状态，不推进 | `completed` | 无 | 完成摘要 |
| `blocked` | 展示阻塞原因和恢复建议，不推进 | `blocked` | 等待人工处理 | blocked reason |

阶段可用状态按既有 workflow mode 规则判断：

- `auto-design`：阶段达到 `ai_review_passed`。
- `collaborative-design`：未列入 `humanGateStages` 的阶段达到 `ai_review_passed`；列入的阶段达到 `human_approved`。
- `strict-human-loop`：阶段达到 `human_approved`。

必要异常规则：

- review 有 blocking：nextAction 回到对应设计 Agent 修订。
- advisory 未确认：nextAction 变为 `human_confirm`，要求人工选择 `apply`、`no_change` 或 `convert_to_blocking`。
- risk_candidate 未处理：nextAction 变为 `human_confirm`，要求人工决定是否转 `accepted_risk` 或回到设计修订。
- assumption 未确认：nextAction 变为 `human_confirm` 或需求澄清。
- 知识查询不足但产物声明存量事实：nextAction 回到对应设计阶段补 evidence。
- 命中 CIE 风险：review matrix 追加 CIE，相关 review 的 `agentExecutions[]` 增加 `cie`。
- 代码修改范围超出批准范围：停止实现，回到设计修订或开发计划修订。

MVP 中 workflow 每次只推进一个最小 nextAction，不跨多个高风险阶段。`implementationDesign` 和 `testDesign` 虽然依赖上允许部分并行，但 MVP 按顺序推进，先 implementationDesign，再 testDesign。

默认用户交互模型采用 `workflow/status` 主入口：

- 普通用户默认通过 `/scc-dev-sphere:workflow` 推进需求开发任务，不需要手动串联各阶段 Skill。
- 普通用户通过 `/scc-dev-sphere:status` 查看当前任务、阶段状态、待确认事项、阻塞项、风险项和下一步建议。
- `feature-*` 阶段 Skill 仍然保留可显式调用能力，但定位为 workflow 内部调度入口、专家用户手动介入入口、修订/恢复/调试/单阶段重跑入口。
- 端到端使用场景应优先展示用户调用 `workflow` 和 `status`；阶段 Skill 应主要出现在插件内部响应、触发组件或高级介入说明中。

`status` MVP 不引入独立 taskType adapter。实现规则：

- `/scc-dev-sphere:status` 读取 `current-task.json` 和当前任务 `state.json`。
- `taskType=feature` 时展示 feature 状态摘要。
- 其他 taskType 暂时提示该 workflow 未在 MVP 中完整实现。
- `status` 可以只读调用 workflow resolver 计算 `nextAction`，用于展示下一步建议，但不能执行 next action。
- `status` 不修改文件、不推进状态、不写入决策或评审语义。

feature 状态摘要至少包含：

- taskId、taskType、workflowMode、status。
- `businessDesign`、`solutionDesign`、`implementationDesign`、`testDesign` 阶段状态。
- 未关闭 blocking 数量。
- 待人工确认的 advisory / risk_candidate / assumption。
- design final approval 是否存在。
- implementation plan 是否存在。
- repo 是否绑定。
- 当前 nextAction 摘要。

审批、代码落地、修订已人工批准产物、接受风险等高风险动作，无论由用户显式调用还是由 workflow 调度，都必须在对应 Skill 内部完成确认摘要展示、人工确认、确认事实落盘和状态校验后才能生效。

`task-list` 和 `task-switch` 能力保留，但不作为 MVP 独立命令暴露，由 `workflow` 或 `status` 通过参数承担，例如：

```text
/scc-dev-sphere:workflow list
/scc-dev-sphere:workflow switch <task-id>
/scc-dev-sphere:status
```

后续扩展保留 task type 前缀命名原则，例如 bugfix、refactor、performance 等流程，但不在 MVP 技术方案中列具体命令清单，避免被误读为第一版交付入口。

## 4. 任务工作区

工作区位于 Claude 工作空间级 `.devsphere`，不默认放在业务代码仓库内。

```text
.devsphere/
  current-task.json
  tasks/
    feature/
      <task-id>/
        state.json
        inputs/
        artifacts/
        reviews/
        approvals/
        implementation/
        verification/
        links/
        decisions/
        evidence/
```

task type 目录动态创建。MVP 只由 `feature-init` 创建 `.devsphere/tasks/feature/<task-id>/...`；`bugfix`、`refactor`、`performance` 等目录只有在后续实现对应 workflow 且创建对应任务时才生成。

### 4.1 current-task.json

```json
{
  "activeTaskId": "FEAT-20260629-001",
  "activeTaskType": "feature",
  "activeStage": "solution_design",
  "workspaceRoot": "/path/to/workspace",
  "taskPath": ".devsphere/tasks/feature/FEAT-20260629-001"
}
```

### 4.2 state.json

以下是 `taskType=feature` 的 MVP 状态示例。`stages` 字段在 feature MVP 中用于设计产物级追踪；其他 taskType 可以没有 `stages`。

```json
{
  "taskId": "FEAT-20260629-001",
  "taskType": "feature",
  "workflowMode": "auto-design",
  "humanGateStages": [],
  "status": "designing",
  "stages": {
    "businessDesign": {
      "status": "human_approved",
      "artifact": "artifacts/business-design.md"
    },
    "solutionDesign": {
      "status": "drafted",
      "artifact": "artifacts/solution-design.md"
    },
    "implementationDesign": {
      "status": "not_started",
      "artifact": "artifacts/implementation-design.md"
    },
    "testDesign": {
      "status": "not_started",
      "artifact": "artifacts/test-design.md"
    }
  }
}
```

`state.status` 是跨工作流复用的任务整体状态。`stages` 是可选的 workflow-specific 细分进度结构，不是所有 taskType 都必须具备的全局固定结构。MVP 中的 `stages.businessDesign / solutionDesign / implementationDesign / testDesign` 只服务 `feature` 需求开发工作流的设计阶段。

其他工作流默认优先复用任务整体状态。只有当某个 workflow 需要细分阶段可视化、阶段评审或阶段批准时，才定义自己的 `stages`。

feature 的 `stages` 不包含实现和验证阶段。实现与验证由 `state.status`、开发执行计划、验证结果和转测包表达，避免和 `implementing / verification_ready / completed` 形成重复状态。

feature 工作流阶段状态枚举：

```text
not_started
drafted
ai_review_passed
human_approved
```

阶段状态只记录稳定边界，不记录 `drafting`、`ai_reviewing` 这类命令执行中的瞬时状态。`ai_review_passed` 在 `auto-design` 和 `collaborative-design` 中可以作为后续 AI 设计阶段的输入，但不能作为代码落地依据。阶段级 `human_approved` 是 `strict-human-loop` 阶段推进的硬依据；代码落地依据是最终批准后的 `approved_for_implementation`。

feature `stages` 状态维护规则：

- `not_started`：该阶段还没有设计产物。
- `drafted`：已有阶段设计产物，协同补信息、设计修订、等待人工反馈、评审返工都保持在该状态。
- 正式 AI 评审闭环无未关闭 `blocking` 时，`auto-design` 和 `collaborative-design` 下阶段状态进入 `ai_review_passed`。
- 阶段是否需要 AI 评审通过后暂停等待人工确认，由 `workflowMode` 和 `humanGateStages` 决定：`strict-human-loop` 下必须暂停；`collaborative-design` 中仅列入 `humanGateStages` 的阶段暂停；`auto-design` 以及未列入 `humanGateStages` 的协同阶段达到 `ai_review_passed` 后可作为后续 AI 设计输入。
- 正式 AI 评审发现 `blocking`、人工反馈问题、需要补充信息或需要设计返工时，阶段状态保持或回到 `drafted`，具体问题写入 review 明细或 decisions。
- 需要阶段人工门禁时，workflow / `feature-review` 在 AI 正式评审通过后暂停并提示用户人工评审；用户回复 `OK` 后，记录确认事实并将对应阶段状态更新为 `human_approved`。
- 阶段状态只由对应命令或确定性 Hook/脚本更新，Agent 不直接在正文中自由声明状态。

任务整体状态可包含：

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

`completed` 是 MVP 的唯一正常终态，表示开发、验证和转测交付包已完成，插件工作流结束。上线、发布、归档不进入 MVP 状态机。

任务整体主线状态流转：

```text
initialized
  -> assessed
  -> designing
  -> design_ready
  -> approved_for_implementation
  -> implementation_planned
  -> implementing
  -> verification_ready
  -> completed
```

`designing` 覆盖设计生成、AI 评审、人工澄清、设计修订、再评审循环。`implementing` 覆盖编码、验证失败后的修复、补测试、再验证前的开发调整。`verification_ready` 表示实现 Agent 认为代码已经完成，进入最终验证和转测包生成闸口，不表示“验证中”。

人工决策不进入 `state.status`。人工决策记录到对应 `decisions/*-decisions.md` 或 approval 文件；只有无法继续推进时才进入 `blocked`。

任务级 `blocked` 粒度规则：

- 缺业务信息、缺历史设计、知识库不可访问、代码仓暂时查不到信息、Agent 判断不确定、评审有分歧、需要人工选择方案，都不进入 `blocked`。
- 这些协作问题通过继续对话、记录 decision 或记录 assumption 处理，任务保持当前稳定状态。
- 只有当前任务无法在本插件流程内继续推进，且不能通过普通人工补充信息、人工决策或记录假设解决时，才写入 `state.status=blocked`。
- 普通人工澄清不使用 `blocked`，只记录 decision，任务仍保持 `designing` 或 `implementing`。

代码修改准入状态只包括：

```text
implementation_planned
implementing
```

`approved_for_implementation` 只表示最终设计已批准，允许生成开发执行计划；不能直接绕过开发执行计划进入代码修改。

## 5. 设计产物

MVP 设计产物：

```text
artifacts/
  business-design.md
  solution-design.md
  implementation-design.md
  test-design.md
  integrated-design.md
```

`integrated-design.md` 是最终人工评审入口，不替代各阶段产物。

产物关系：

- 分阶段产物是事实来源。
- 集成方案是批准视图。
- 评审记录是质量证据。
- 决策记录是设计原因追溯。

`integrated-design.md` 必须包含 `accepted_risk` 汇总。汇总内容来自 `decisions/*-decisions.md`，用于最终人工批准时展示风险总览；风险详情仍以决策记录为事实来源。

每个关键设计产物都有自己的评审闭环：

```text
business-design.md
  -> business-design review
  -> rework loop

solution-design.md
  -> solution-design review
  -> rework loop

implementation-design.md
  -> implementation-design review
  -> rework loop

test-design.md
  -> test-design review
  -> rework loop

integrated-design.md
  -> integrated consistency review
  -> human final approval
```

## 6. 决策记录

决策记录按设计文档类型维护，避免文件数量过多。

```text
decisions/
  decision-index.json
  business-design-decisions.md
  solution-design-decisions.md
  implementation-design-decisions.md
  test-design-decisions.md
```

MVP 不新增阶段批准文件、单条 ADR 文件或跨阶段决策文件。跨阶段、模式选择、风险接受等决策归并到最相关的阶段决策文件；无法明确归属时，默认记录到 `business-design-decisions.md` 的任务级决策区。

MVP 不保存原始聊天转储，不设置独立 `conversations/` 目录。人机协同过程中形成的有效决策、假设确认、风险接受和范围裁剪，必须整理后写入对应阶段的 `*-decisions.md`。

决策记录采用语义层和账务层分离：

- Skill/Agent/Human 负责决策语义，包括背景、选项、最终选择、选择理由、风险和后续影响。
- Hook/scripts 负责决策账务，包括分配或校验 decision ID、校验决策条目格式、更新 `decision-index.json`、校验 Markdown 决策条目和索引一致性、校验状态推进前必要决策记录是否齐备。
- Hook/scripts 可以校验 `accepted_risk` 是否进入 decision 和 `integrated-design.md`，也可以校验 `assumption` 是否有关联人工确认记录。
- Hook/scripts 不得自动生成决策语义，不得自动接受 assumption，不得把 `risk_candidate` 自动转成 `accepted_risk`，不得自动决定 advisory 的人工处理结果，也不得替用户补充选择理由。

`decision-index.json` 示例：

```json
{
  "decisions": [
    {
      "id": "D-001",
      "stage": "solutionDesign",
      "file": "decisions/solution-design-decisions.md",
      "status": "accepted",
      "relatedArtifacts": ["artifacts/solution-design.md"],
      "impact": ["api-contract", "compatibility"]
    }
  ]
}
```

Markdown 决策条目格式：

```md
## D-001 接口兼容策略

- 关联产物：artifacts/solution-design.md
- 决策时间：
- 参与方：
- 背景：
- 可选方案：
- 最终选择：
- 选择理由：
- 风险：
- 后续影响：
- 状态：accepted
```

## 7. 证据过程件

`evidence/` 保存 Agent 在具体阶段实际查询并使用过的知识、规范、历史设计和代码证据。它不是预置上下文清单，而是任务执行过程中的证据快照，避免后续知识库变化导致设计依据不可追溯。

```text
evidence/
  evidence-registry.json
  knowledge/
    EV-001-approval-rules.md
    EV-002-existing-feature-design.md
  repository/
    EV-010-order-service-impact.md
    EV-011-frontend-patterns.md
```

`evidence-registry.json` 示例：

```json
{
  "evidence": [
    {
      "id": "EV-001",
      "sourceType": "knowledge-base",
      "source": "private-kb",
      "query": "审批规则 存量功能 订单",
      "retrievedBy": "SA",
      "stage": "businessDesign",
      "snapshotFile": "evidence/knowledge/EV-001-approval-rules.md",
      "usedIn": ["artifacts/business-design.md"],
      "confidence": "medium",
      "retrievedAt": "2026-06-30T10:30:00+08:00"
    }
  ]
}
```

证据保存规则：

- 只有被设计、评审、实现计划或代码落地实际使用的查询结果才进入 `evidence/`。
- 未使用的搜索结果可以留在会话中，不作为正式过程件。
- 知识库结果保存摘要、来源标识、查询条件、时间和关键命中内容。
- 代码仓证据保存影响分析、相关文件路径、关键符号、调用关系或约束摘要，不复制大段源码。
- 设计产物引用证据时使用 `EV-xxx`，而不是直接依赖聊天上下文。

设计依据处理规则：

- 存量事实、外部约束、代码现状判断必须引用 evidence ID，包括存量业务规则、存量功能行为、接口兼容性、模块边界、代码影响面、测试范围和回归风险。
- 新设计决策不需要 evidence，但必须说明理由、取舍和影响。
- 普通描述段落不强制引用 evidence，避免文档变成形式化审计报告。
- 引用格式：`依据：EV-001, EV-003`。
- 无证据但需要继续设计的前提必须标记为 `assumption`。
- 人工确认后的 `assumption` 写入对应 `decisions/*-decisions.md`，不能伪装成 evidence。

## 8. 评审模型

评审以产物为主体。

```text
reviews/
  review-matrix.json
  business-design/
    se-review.md
  solution-design/
    sa-review.md
    mde-review.md
    tse-review.md
  implementation-design/
    se-review.md
    dev-review.md
    tse-review.md
  test-design/
    sa-review.md
    se-review.md
    mde-review.md
```

### 8.1 基础评审矩阵

```text
business-design -> SE
solution-design -> SA、MDE、TSE
implementation-design -> SE、DEV、TSE
test-design -> SA、SE、MDE
```

### 8.2 风险增强

风险命中时追加评审者：

- 部署、配置、流水线、环境、发布策略：CIE。
- 安全、权限、审计：安全视角，MVP 可由 SE/TSE 兼任。
- 性能、容量、稳定性：SE/MDE 性能视角。
- 数据迁移或数据模型变更：MDE/DEV/TSE 数据影响检查。

### 8.3 review-matrix.json

```json
{
  "artifacts": {
    "solution-design": {
      "requiredReviewers": ["SA", "MDE", "TSE"],
      "status": "in_review",
      "issues": {
        "blocking": 1,
        "advisory": 2,
        "risk_candidate": 0
      },
      "reviews": {
        "SA": {
          "status": "passed",
          "file": "reviews/solution-design/sa-review.md"
        },
        "MDE": {
          "status": "blocking",
          "file": "reviews/solution-design/mde-review.md"
        },
        "TSE": {
          "status": "passed_with_advice",
          "file": "reviews/solution-design/tse-review.md"
        }
      }
    }
  }
}
```

### 8.4 评审问题分类

MVP 只使用 3 类评审问题：

```text
blocking
advisory
risk_candidate
```

处理规则：

- `blocking`：必须由原设计 Agent 修订，并由提出问题的评审 Agent 复核关闭。
- `advisory`：AI 不强制修复，但必须由人工选择 `apply`、`no_change` 或 `convert_to_blocking`。
- `risk_candidate`：AI 识别出的风险候选，不能直接作为已接受风险。只有人工明确接受后，才能转换为 `accepted_risk`。

边界规则：

- `advisory apply`：表示人工采纳建议，必须回到对应设计产物修订。
- `advisory no_change`：表示人工确认该建议不采纳或暂不处理，只写入 `reviews/advisory-confirmation.json`。
- `accepted_risk`：表示人工明确接受一个风险，是人工确认后的结果类型，不是 AI 评审问题类型；必须写入 `decisions/*-decisions.md`，并进入 `integrated-design.md` 风险汇总；若代码落地后仍相关，必须进入转测包。
- 如果 `advisory no_change` 的原因本质上是在接受风险，应转成 `accepted_risk` 处理，不能用建议项确认绕过风险登记。

不引入 `minor/major/critical` 等严重级别。第一版只判断问题是否阻塞流程。

### 8.5 advisory-confirmation.json

`advisory` 的人工确认结果写入 `reviews/advisory-confirmation.json`。该文件是 workflow/hook 的机器可读判断依据，Markdown 评审文件仍保存详细意见。

示例：

```json
{
  "items": [
    {
      "advisoryId": "ADV-001",
      "artifact": "solution-design",
      "reviewer": "TSE",
      "sourceReview": "reviews/solution-design/tse-review.md",
      "decision": "no_change",
      "reason": "测试方案已覆盖该边界，暂不修改方案设计",
      "confirmedBy": "human",
      "confirmedAt": "2026-06-30T10:00:00+08:00"
    },
    {
      "advisoryId": "ADV-002",
      "artifact": "implementation-design",
      "reviewer": "DEV",
      "sourceReview": "reviews/implementation-design/dev-review.md",
      "decision": "convert_to_blocking",
      "reason": "该建议影响接口兼容性，必须回到实现设计修订",
      "confirmedBy": "human",
      "confirmedAt": "2026-06-30T10:10:00+08:00"
    }
  ]
}
```

允许的 `decision`：

```text
apply
no_change
convert_to_blocking
```

`feature-approve` 生成批准记录必须同时满足：

- `state.status=design_ready`。
- 所有 `advisory` 都在该索引中存在人工确认结果。
- 没有未关闭 `blocking`。
- `accepted_risk` 已写入决策记录，并已进入 `integrated-design.md` 风险汇总。

## 9. AI 评审-修订闭环

`feature-review` 执行阶段评审或集成评审。输入可以是当前阶段，也可以由 workflow 根据 `state.json` 自动选择待评审产物。

阶段评审示例：

```text
/scc-dev-sphere:feature-review --target business-design
/scc-dev-sphere:feature-review --target solution-design
/scc-dev-sphere:feature-review --target implementation-design
/scc-dev-sphere:feature-review --target test-design
```

集成评审示例：

```text
/scc-dev-sphere:feature-review --target integrated-design
```

执行循环：

```text
读取待评审产物
  -> 根据 review-matrix 调用评审 Agent
  -> 汇总 blocking/advisory/risk_candidate
  -> 将 blocking 反馈给产物负责 Agent
  -> 产物负责 Agent 修订
  -> 原评审 Agent 复核
  -> 将 advisory 整理成人工确认清单
  -> 更新 review-matrix
  -> 判断是否退出循环
```

退出条件：

- 所有 `blocking` 关闭，`advisory` 整理成人工确认清单。
- 达到最大循环轮次，默认 3。
- Agent 间出现无法自动调和冲突。
- 需要人工补充信息或决策。

任务级不可恢复阻塞示例：

```json
{
  "status": "blocked",
  "blockedReason": "task cannot continue in this plugin workflow"
}
```

非正常退出默认不写阶段 `blocked`。命令失败、缺少必要输入、需要人工补充或需要决策时，相关阶段保持或回到 `drafted`，并把问题写入 review 明细或 `decisions/*-decisions.md`。只有任务无法在本插件流程内继续推进，且不能通过普通人工补充、人工决策或记录假设解决时，才写入 `state.status=blocked`。

## 10. 批准机制

阶段级人工确认只更新对应阶段状态为 `human_approved`，不生成代码落地批准。`feature-approve` 默认只处理代码落地前的最终设计批准，批准对象是 `integrated-design.md` 及其引用的阶段设计产物。`feature-approve` 只能在 `state.status=design_ready` 时生成 `design-final-approval.json`。

批准记录目录：

```text
approvals/
  design-final-approval.json
  implementation-plan-approval.json
```

设计批准记录示例：

```json
{
  "approvalId": "APP-001",
  "type": "design-final-approval",
  "taskId": "FEAT-20260629-001",
  "approvedArtifacts": [
    {
      "file": "artifacts/business-design.md",
      "hash": "sha256:..."
    },
    {
      "file": "artifacts/solution-design.md",
      "hash": "sha256:..."
    },
    {
      "file": "artifacts/implementation-design.md",
      "hash": "sha256:..."
    },
    {
      "file": "artifacts/test-design.md",
      "hash": "sha256:..."
    },
    {
      "file": "artifacts/integrated-design.md",
      "hash": "sha256:..."
    }
  ],
  "approvedScope": ["backend/order", "frontend/order-ui"],
  "limitations": ["no database migration in MVP"],
  "approvedBy": "human",
  "approvedAt": "2026-06-29T10:30:00+08:00"
}
```

批准后 `state.json` 更新：

```json
{
  "status": "approved_for_implementation"
}
```

## 11. 代码仓库绑定

需求设计阶段可以不绑定代码仓库。进入实现阶段后绑定一个或多个 repo。

```text
links/
  repos.json
```

```json
{
  "repos": [
    {
      "repoPath": "/path/to/project-a",
      "role": "primary-implementation-repo",
      "branch": "feature/FEAT-20260629-001"
    }
  ]
}
```

repo 内可选轻量指针文件，不默认提交 Git：

```text
<repo>/.devsphere/current-task.json
```

```json
{
  "taskId": "FEAT-20260629-001",
  "taskType": "feature",
  "devsphereWorkspace": "/path/to/workspace/.devsphere"
}
```

## 12. Hook 设计

MVP 采用关键硬闸口 + 提示项人工确认。

Hook 的定位：

```text
Hook = guard + registry + consistency checker
```

Hook 只做守门、登记和一致性校验，不承载业务/设计推理。

插件 Hook 配置统一放在 `hooks/hooks.json`。阻断类规则必须绑定可阻断事件：代码修改准入使用 `PreToolUse` 或 `PermissionRequest` 检查 `Edit/Write/Bash` 等工具调用；直接 slash 调用 skill 的准入检查必须同时覆盖 `UserPromptExpansion`，因为用户直接输入 `/plugin:skill` 不一定经过匹配 `Skill` 工具的 `PreToolUse`。`PostToolUse` 只能用于登记、校验结果、提示或补救，不能作为阻断未授权工具调用的安全边界。

### 12.0 Hook Event Matrix

| Hook 事件/职责 | 用途 | 是否可作为阻断边界 | 禁止事项 |
| --- | --- | --- | --- |
| `UserPromptExpansion` | 直接 slash 调用高风险 Skill 的准入检查，例如 approve、implement、revise 已批准产物 | 是 | 不生成设计内容，不替代 Skill 内部人工确认 |
| `PreToolUse` / `PermissionRequest` | 代码修改、文件写入、危险命令执行前校验 active task、repo 绑定、任务状态、批准记录、开发计划和修改范围 | 是 | 不根据模型判断临时放行，不绕过状态文件和批准记录 |
| `PostToolUse` | artifact/review/approval/evidence/decision 生成后的登记、索引、状态同步、提示和一致性复核 | 否 | 不作为阻断安全边界，不补救已经发生的未授权写入 |
| 状态同步 | 根据确定性事实同步状态，例如 artifact 存在 -> `drafted`，review matrix blocking=0 -> `ai_review_passed` | 仅在绑定可阻断事件时可阻断非法推进 | 不判断设计质量，不关闭 blocking，不接受 advisory/risk |
| 过程件登记 | 更新 artifact/review/evidence/decision/approval 索引，校验 ID 唯一性和引用完整性 | 否，除非被状态推进前置校验调用 | 不生成过程件语义内容 |
| 一致性检查 | 校验 `accepted_risk` 是否进入 decision 和 `integrated-design.md`、advisory 是否人工确认、`design_ready` 前阶段评审矩阵和 integrated review 是否齐备 | 作为状态推进前置校验时可以阻断 | 不替代评审 Agent 或人工判断 |

### 12.1 硬闸口

应阻断：

- 未绑定 active task 时执行需求落地相关代码修改。
- 任务未进入 `implementation_planned` 或 `implementing` 时修改代码文件。
- 设计评审存在未关闭阻塞项时生成实现批准。
- 开发执行计划缺失时进入代码落地。
- 代码修改范围超出批准范围。

### 12.2 提示项

不直接阻断具体产出，但必须有人确认后才能放行：

- 缺少测试建议。
- CIE 风险未评估。
- 知识引用不足。
- `advisory` 未完成人工确认。
- 低风险但存在不确定性的实现建议。

### 12.3 允许的状态同步

Hook 可以执行确定性状态同步，但不能做业务状态决策。

允许：

- 命令成功生成阶段 artifact 后，同步阶段状态为 `drafted`。
- `feature-review` 产出合法评审结果且 `blocking=0` 后，同步阶段状态为 `ai_review_passed`。
- 所有阶段达到当前 workflow mode 要求，且 `integrated-design` 完成一致性评审无阻塞后，同步 `status=design_ready`。
- `feature-approve` 写入合法批准记录后，同步 `status=approved_for_implementation`。
- `feature-plan-implementation` 满足计划准入条件后，同步 `status=implementation_planned`。
- `feature-implement` 首次启动代码修改并完成人工确认后，同步 `status=implementing`；代码落地完成后，同步 `status=verification_ready`。
- `feature-verify` 完成验证和转测交付包后，同步 `status=completed`。
- 命令失败、缺少必要输入、需要人工补充或需要决策时，阶段状态保持或回到 `drafted`，并记录问题；只有任务无法通过普通人工补充、人工决策或记录假设继续推进时，才同步任务级 `state.status=blocked`。

禁止：

- 自行判断设计是否合理。
- 自行判断 `blocking` 是否真的关闭。
- 自行接受或拒绝 `advisory`。
- 自行接受 `assumption` 或 `accepted_risk`。
- 自行决定是否跳过阶段、生成集成设计或进入代码实现。

### 12.4 过程件登记

Hook 可以负责过程件的账务工作：

- 校验 decision 条目格式。
- 分配或校验 decision ID 唯一性。
- 更新 `decision-index.json`。
- 校验设计文档中的 `assumption` 是否有关联 decision。
- 校验 `accepted_risk` 是否进入 decision。
- 校验 Markdown 决策条目和 `decision-index.json` 是否一致。
- 在状态推进前检查必要决策记录是否齐备。
- 登记 artifact、review、approval、evidence 的索引关系。

Hook 不能生成 decision 语义内容，不能自动把 AI 建议写成 accepted decision，不能自动接受 assumption，不能把 `risk_candidate` 自动转成 `accepted_risk`，不能自动决定 advisory 的人工处理结果，也不能替用户补充选择理由。Command/Skill 生成过程件内容，人工或负责 Agent 确认语义，Hook 负责登记、索引和一致性校验。

## 13. Skill 职责

Skill 是具体工作能力单元，默认由 workflow 根据持久化状态选择负责 Agent 后加载并执行；也可以由专家用户通过插件命名空间显式调用，用于修订、恢复、调试或单阶段介入。Skill 不应该自行决定跨阶段推进；跨阶段推进由 workflow 根据 `state.json`、评审矩阵、批准记录和 Hook 校验结果判断。

高风险 Skill 必须内置人工确认闸口。该闸口与调用方式无关：

- 用户显式调用时，Skill 仍必须校验状态并要求人工确认。
- workflow 选择负责 Agent 执行该 Skill 时，Skill 也必须在生效前展示确认摘要并等待人工确认。
- 缺少确认记录时，Skill 不得写入批准文件、推进状态或执行代码修改。
- scripts/hooks 负责对状态变更、批准记录和代码修改准入做确定性复核。

### 13.1 feature-init

- 创建 `.devsphere/tasks/feature/<task-id>`。
- 写入输入材料。
- 初始化 `state.json`。
- 设置 `current-task.json`。
- 不区分新需求和变更需求分支；存量功能调整也作为普通 feature task 处理。

### 13.2 feature-assess

- 分析需求复杂度和风险。
- 推荐 workflow mode。
- 当用户选择 `collaborative-design` 时，要求用户指定 `humanGateStages`，或明确确认为空。
- 输出风险命中规则。
- 等待用户确认模式。
- 不预加载完整知识上下文。
- 不生成固定的上下文来源清单。
- 只识别后续可能需要重点查证的方向，例如历史业务规则、存量设计、代码影响面、测试回归风险。

命中高风险规则时，`feature-assess` 默认推荐 `strict-human-loop`。如果用户选择降级为 `collaborative-design` 或 `auto-design`，必须在 `decisions/business-design-decisions.md` 的任务级决策区记录：

- 降级后的工作流模式。
- 降级原因。
- 已知风险。
- 风险接受人或确认人。

`feature-assess` 不得自动降级高风险任务。

`humanGateStages` 是 `collaborative-design` 的局部人工门禁配置，只能包含 feature 设计阶段名：

```text
businessDesign
solutionDesign
implementationDesign
testDesign
```

被列入 `humanGateStages` 的阶段，必须达到 `human_approved` 后才能推进依赖它的后续阶段。未列入的阶段达到 `ai_review_passed` 即可作为后续 AI 设计输入。该配置在 `feature-assess` 阶段由用户指定或确认为空，并写入 `state.json`；后续 Agent 不得在执行中自行改变门禁规则。若确需调整，必须由 workflow 记录人工决策后更新配置。

### 13.3 feature-design

设计编排入口。根据 `state.json` 和 `workflowMode` 只推进当前任务中下一个允许推进的设计阶段：

```text
businessDesign 未达到当前模式要求的可用状态
  -> 推进 businessDesign

businessDesign 已可用，solutionDesign 未达到当前模式要求的可用状态
  -> 推进 solutionDesign

solutionDesign 已可用，implementationDesign/testDesign 未达到当前模式要求的可用状态
  -> 推进 implementationDesign 或 testDesign

全部阶段已达到当前模式要求的可用状态
  -> 生成或刷新 integrated-design，并等待集成一致性评审
```

这里的“全部阶段已达到当前模式要求的可用状态”包含阶段正式评审要求：`business-design`、`solution-design`、`implementation-design`、`test-design` 都必须完成各自必要评审、关闭 blocking，并按 `workflowMode` / `humanGateStages` 达到 `ai_review_passed` 或 `human_approved` 后，才能生成或刷新 `integrated-design.md`。`integrated-design` 的一致性评审不能替代 `implementation-design review` 或 `test-design review`。

职责边界：

- workflow 根据任务状态选择阶段、Agent 和 Skill。
- Agent 加载对应 Skill 执行专业任务，并判断自己负责的产物是否达到该 Skill 定义的完成条件。
- Agent 返回阶段产物、关键结论和 `ready_for_review` 信号。
- workflow 接收 `ready_for_review` 后，调度正式 AI 评审闭环。
- 设计协同期间的自检可以帮助 Agent 修正明显问题，但不等同于正式 AI 评审，也不能直接把阶段状态推进到 `ai_review_passed`。

正式 AI 评审闭环可以由用户显式调用 `/scc-dev-sphere:feature-review`，也可以由 `feature-design` / `feature-design-*` 在阶段产物完成后按 workflow mode 自动调度。无论入口是什么，都必须产出 review 明细并更新 `review-matrix.json`。

当前模式要求的可用状态：

- `auto-design`：阶段产物达到 `ai_review_passed` 即可作为后续 AI 设计输入。
- `collaborative-design`：未列入 `humanGateStages` 的阶段达到 `ai_review_passed` 即可作为后续 AI 设计输入；列入 `humanGateStages` 的阶段必须达到 `human_approved`。
- `strict-human-loop`：阶段产物必须达到 `human_approved` 才能推进后续阶段。

`strict-human-loop` 不改变状态机，也不新增 `human_review_required` 之类的中间状态。它只改变推进门槛：AI 正式评审通过后，workflow 暂停并提示人工评审；用户回复 `OK` 后进入 `human_approved`，用户反馈问题后回到或保持 `drafted`。

`humanGateStages` 不改变阶段状态机，也不新增模式。它只是 `collaborative-design` 的阶段推进门槛配置。

`feature-design` 不能自动覆盖已 `human_approved` 的阶段产物。修改已批准产物必须调用对应阶段 skill 的显式修订参数模式，并记录原因、影响范围和重新评审要求。

生成或刷新 `integrated-design.md` 时，必须汇总所有已记录的 `accepted_risk`。如果存在 `accepted_risk` 但集成设计未展示，不能进入最终批准。

`design_ready` 的进入条件：所有阶段达到当前 workflow mode 要求，且 `integrated-design` 完成一致性评审无阻塞。`design_ready` 不表示人工最终批准，只表示设计材料已准备好进入 `feature-approve`。

各设计 Agent 在自己的阶段按需查询知识库或代码仓。查询结果一旦被设计采纳，必须写入 `evidence/` 并在设计产物中引用证据编号。

### 13.4 feature-design-*

分别处理单个设计阶段，支持 strict 模式和局部修订。阶段命令只允许读写对应阶段产物，不能顺带重写其他阶段产物。

Claude Code plugin skill 命令名不使用空格子命令。修订动作通过 skill 参数表达，由 `SKILL.md` 使用 `$ARGUMENTS` 或位置参数解析。推荐约定：

```text
/scc-dev-sphere:feature-design-business --mode revise
/scc-dev-sphere:feature-design-solution --mode revise
/scc-dev-sphere:feature-design-implementation --mode revise
/scc-dev-sphere:feature-design-test --mode revise
```

参数语义：

- `--mode normal`：默认设计推进，只能创建或更新未人工批准的阶段产物。AI 生成失败、上下文补充后的再次生成，都归入 `normal`。
- `--mode revise`：显式修订已人工批准或已进入下游使用的阶段产物，必须记录修订原因、影响范围、受影响阶段和重新评审要求。

`revise` 不是新的 Claude Code 命令，也不是命令名中的空格子命令；它只是阶段 skill 的显式参数模式。

MVP 不提供独立 `--mode rerun`。如果后续需要引入 `rerun`，必须先定义历史产物保留、review/evidence/decision 处理和阶段状态重置规则，避免形成隐式覆盖行为。

### 13.5 feature-review

执行 AI 交叉评审-修订闭环，更新 `review-matrix.json` 和评审明细。

`feature-review` 是评审方法 Skill，不负责选择评审 Agent。workflow / feature adapter 根据基础评审矩阵和风险增强规则决定调度哪些 Agent；被调度的 Agent 加载 `feature-review` 并以自身职责视角评审目标产物。`feature-review` 只接收 `--target <artifact>` 参数，不接收 `--reviewer` 参数。

支持两类评审：

- 阶段评审：针对 `business-design`、`solution-design`、`implementation-design`、`test-design`。
- 集成评审：针对 `integrated-design`，检查业务、方案、实现、测试之间的一致性。

阶段评审和集成评审职责不同：

- `implementation-design review` 必须由 SE、DEV、TSE 基于实现设计产物进行评审；blocking 由 MDE 修订，并由提出问题的评审 Agent 复核关闭。
- `test-design review` 必须由 SA、SE、MDE 基于测试设计产物进行评审；blocking 由 TSE 修订，并由提出问题的评审 Agent 复核关闭。
- `integrated-design` 集成评审只检查阶段产物之间的一致性，不替代任何阶段产物的正式评审。
- workflow / scripts 在同步 `design_ready` 前，必须同时校验各阶段 review matrix 和 integrated review 结果。

单个阶段 AI 评审通过时，只更新对应 `stages.*.status=ai_review_passed`。随后是否暂停并提示用户人工评审，由 `workflowMode` 和 `humanGateStages` 决定：

- `strict-human-loop`：必须暂停等待人工确认；用户回复 `OK` 后阶段状态进入 `human_approved`。
- `collaborative-design`：仅当该阶段列入 `humanGateStages` 时暂停等待人工确认；用户回复 `OK` 后阶段状态进入 `human_approved`。
- `auto-design` 以及未列入 `humanGateStages` 的协同阶段：达到 `ai_review_passed` 后可继续作为后续 AI 设计输入。
- 用户反馈问题：记录问题，阶段状态保持或回到 `drafted`，workflow 选择对应设计 Agent 修订。

阶段级人工确认不生成 approval 文件。确认人、确认时间和确认意见写入对应 review 明细或 `decisions/*-decisions.md`。最终代码落地批准仍只由 `feature-approve` 生成 `design-final-approval.json`。

只有集成一致性评审无阻塞后，任务整体状态才可以进入 `design_ready`。

### 13.6 feature-approve

默认执行代码落地前的最终设计批准，不承担单个阶段设计批准语义。

- 要求当前任务状态为 `design_ready`。
- 校验 `blocking` 归零。
- 校验 `advisory` 已由人工确认处理。
- 校验 `accepted_risk` 已写入决策记录。
- 校验 `integrated-design.md` 已汇总 `accepted_risk`。
- 生成批准记录。
- 更新 `state.json`。

如果 `design_ready` 后发生设计修订，任务整体状态必须回到 `designing`，并重新完成受影响阶段评审和集成一致性评审。

### 13.7 feature-plan-implementation

生成开发执行计划。高风险或 strict 模式下等待人工确认。

状态更新规则：

- 普通任务：开发执行计划生成后，进入 `implementation_planned`。
- 高风险或 `strict-human-loop`：必须生成 `implementation-plan-approval.json` 后，才能进入 `implementation_planned`。
- 如果计划已生成但仍待人工确认，状态保持 `approved_for_implementation`，不能进入代码落地。

如果开发执行计划依赖代码仓现状、模块约束或存量实现模式，DEV 必须查询代码仓并保存 repository evidence。

### 13.8 feature-implement

在 Hook 允许后执行代码落地。

`feature-implement` 首次从 `implementation_planned` 进入代码修改前，必须展示实现摘要、目标 repo、预计修改范围、验证命令和主要风险，并等待人工明确确认。确认事实写入实现日志，不新增独立 approval 文件或状态。

人工确认后，`feature-implement` 将任务状态更新为 `implementing`。该状态表示任务处于实现阶段，允许多轮编码、修复和补测试，不表示单次命令正在运行。

任务已处于 `implementing` 时，同范围内的修复、补测试和验证失败回修可以继续执行，不重复要求启动确认。若实际修改范围超出已批准设计或开发执行计划，必须停止代码修改并回到对应设计/计划环节重新确认。

`feature-implement` 认为代码落地完成、可进入最终验证时，将任务状态更新为 `verification_ready`。

### 13.9 feature-verify

运行本地验证并生成转测包。

`feature-verify` 要求当前任务状态为 `verification_ready`。它不负责把实现阶段推进到验证闸口，只消费验证闸口并输出完成或回退结果。

验证结果处理规则：

- 验证通过并生成转测包后，进入 `completed`。
- 验证失败但可修复时，回到 `implementing`。
- 验证失败且无法继续推进时，进入 `blocked`，并记录阻塞原因。
- 不新增 `verifying` 或 `verification_failed` 状态。

只有 `feature-verify` 可以将任务状态更新为 `completed`，且必须同时满足：

- 本地验证完成并通过，或验证失败项已被人工明确接受为风险。
- 转测交付包已生成，包含验证结果、变更摘要、已接受风险和测试建议。

`feature-implement` 不能直接将任务置为 `completed`。

## 14. Agent 职责

Agent 与 Skill 的边界规则：

```text
Agent 决定职责视角，Skill 决定执行方法。
```

同一个 Skill 可以被不同 Agent 加载，但产出必须体现 Agent 的职责视角。MVP 不设计 Skill 权限矩阵。

### SA

- 需求业务设计。
- 按需查询业务流程、业务规则、历史需求、存量功能行为并保存 knowledge evidence，用于支撑业务规则、范围边界、术语和异常流程。
- 使用评审 Skill 时，从业务规则、业务流程和需求边界视角输出。
- 评审方案设计中的业务一致性。
- 评审测试设计中的业务覆盖。

### SE

- 系统/方案设计。
- 按需查询历史方案、架构规范、接口规范、跨模块约束、兼容性约束并保存 knowledge evidence；必要时保存轻量 repository evidence，用于支撑系统边界、接口契约、数据影响和兼容性影响。
- 使用评审 Skill 时，从架构一致性、接口契约和跨系统影响视角输出。
- 评审业务设计。
- 评审实现设计和测试设计。
- 对跨模块一致性负责。

### MDE

- 模块实现设计。
- 按需查询模块历史实现、代码结构、关键调用链、技术规范、已有实现模式并保存 knowledge/repository evidence，用于支撑模块影响面、实现拆解、修改范围和开发风险。
- 使用评审 Skill 时，从模块边界、实现拆解和技术一致性视角输出。
- 评审方案设计实现可行性。
- 评审测试设计的模块覆盖。

### DEV

- 评审实现设计的可编码性。
- 生成开发执行计划。
- 执行代码落地和本地验证。
- 按需查询目标代码仓、开发规范、已有实现模式、测试命令并保存 repository evidence，用于支撑开发执行计划、文件范围和验证命令。
- 使用评审 Skill 时，从可编码性、代码影响和开发风险视角输出。
- 默认作为统一开发责任角色，不固定拆分为前端/后端常驻 Agent。
- 根据实现计划影响面，按需启用前端、后端或全栈专项 skill/上下文。

DEV 专项能力：

- `backend-development`：后端接口、服务逻辑、数据访问、任务、配置等变更。
- `frontend-development`：前端页面、组件、交互、状态管理、接口适配等变更。
- `fullstack-change-planning`：前后端联动、接口契约、联调顺序和回归路径。

### TSE

- 测试设计。
- 按需查询历史缺陷、测试规范、验收规则、回归范围、已有测试资产并保存 knowledge evidence；必要时保存 repository evidence，用于支撑验收点、测试策略、回归建议和风险测试。
- 使用评审 Skill 时，从可测性、验收标准和回归风险视角输出。
- 评审方案设计可测性。
- 评审实现设计的测试影响。

### CIE

默认不参与主流程。命中部署、配置、流水线、环境、发布风险时按需触发。

## 15. 知识库接入

采用 MCP 工具 + 查询 Skill：

- MCP 负责连接私域知识库并返回结构化结果。
- `knowledge-query` Skill 负责查询策略、证据筛选、引用规范和证据不足判断。
- 不创建“知识库 Agent”。

查询触发原则：

- 查询由具体 Agent 在具体阶段触发，不由 `feature-assess` 一次性预加载。
- 查询结果只有被产物采用后才保存为 `evidence/knowledge/` 快照。
- 产物引用证据编号，评审时可以追溯到查询条件和快照内容。
- 如果证据不足，Agent 应在当前阶段标记不确定性并进入人工澄清或补查，而不是编造设计依据。
- 按需查询不是机械全量检索；如果某阶段判断无需查询某类预期来源，必须在阶段产物或 `evidence-registry.json` 中记录未查询原因。
- 凡是声明存量事实、代码现状、历史约束或外部规范，必须引用 evidence ID。

知识库更新采用分层沉淀：

- task workspace 保存全量过程资产。
- 知识库只接收经过验证的稳定知识。
- AI 生成知识沉淀候选。
- 人工批准后写入知识库。

## 16. 正式文档与过程文件关系

过程文件全部保留在 task workspace 中。需要随代码评审或 PR 提交时，由 workflow 导出稳定产物：

- `integrated-design.md` 中的集成设计摘要
- 开发执行计划
- 转测包
- 关键决策摘要

MVP 不新增 `final-handoff.md`。阶段设计文档是事实来源，`integrated-design.md` 是设计批准视图，转测包是代码落地后的测试交付包。

不建议把完整 `.devsphere` 过程目录提交到业务代码仓库。

## 17. MVP 交付检查清单

- 插件 manifest 可安装。
- feature task workspace 可创建。
- `state.json` 可读写。
- `evidence-registry.json` 可生成和更新。
- Agent 查询采用后的知识/代码证据可保存为过程件。
- review matrix 可生成和更新。
- AI 评审-修订闭环可执行。
- 批准记录可生成。
- Hook 可阻止未批准代码修改。
- 开发执行计划可生成。
- 代码落地阶段能读取 repo 绑定。
- 转测包可生成。

## 18. 后续扩展

- bugfix workflow：诊断、根因、修复计划、回归验证。
- refactor workflow：重构目标、影响面、行为保持验证。
- performance workflow：基线、瓶颈、优化计划、压测验证。
- subagent 并行调度：复杂任务下并行评审、并行影响分析。
- agent-team 编排：高复杂需求下的多角色协作策略。
- CIE 深度集成：CI、部署、环境和制品管理。
- LSP 集成：增强代码影响面分析。
- Monitor 集成：监听 CI、日志和环境状态。
