# scc-dev-sphere 技术方案

## 1. 技术目标

`scc-dev-sphere` 作为 Claude Code plugin 实现，不自建 Agent runtime。插件通过 Claude Code 原生组件组合完成需求开发工作流：

- `skills`：阶段命令和复用能力。
- `agents/custom subagents`：SA、SE、MDE、DEV、TEST、CIE 等角色上下文，按需调用。
- `hooks`：流程硬闸口。
- `scripts`：确定性状态读写、校验、矩阵更新。
- `mcpServers`：私域知识库接入预留。

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
    status/
      SKILL.md
    knowledge-query/
      SKILL.md
  agents/
    sa.md
    se.md
    mde.md
    dev.md
    test.md
    cie.md
  hooks/
    pre-tool-use.json
    post-tool-use.json
  scripts/
    devsphere.js
  templates/
    artifacts/
    reviews/
    approvals/
    verification/
```

实际文件名可按 Claude Code plugin 官方格式调整，但职责边界应保持上述分层。

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

`task-list`、`task-switch` 不作为 MVP 独立命令。任务列表、切换和下一步推荐统一由 `/scc-dev-sphere:workflow` 或 `/scc-dev-sphere:status` 通过参数承担。

后续扩展通过 task type 前缀新增命令，但不进入 MVP 插件包。

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
        decisions/
        evidence/
    bugfix/
    refactor/
    performance/
```

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

```json
{
  "taskId": "FEAT-20260629-001",
  "taskType": "feature",
  "workflowMode": "auto-design",
  "interactionMode": "standard",
  "overallStage": "design",
  "status": "in_progress",
  "approvalStatus": "pending",
  "allowedCodeChange": false,
  "linkedRepos": [],
  "stages": {
    "businessDesign": {
      "status": "human_approved",
      "artifact": "artifacts/business-design.md",
      "reviewStatus": "human_approved"
    },
    "solutionDesign": {
      "status": "human_review_required",
      "artifact": "artifacts/solution-design.md",
      "reviewStatus": "pending_human"
    },
    "implementationDesign": {
      "status": "not_started",
      "artifact": "artifacts/implementation-design.md",
      "reviewStatus": "not_started"
    },
    "testDesign": {
      "status": "not_started",
      "artifact": "artifacts/test-design.md",
      "reviewStatus": "not_started"
    }
  }
}
```

阶段状态枚举：

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

阶段状态只记录稳定边界，不记录 `drafting`、`ai_reviewing` 这类命令执行中的瞬时状态。`ai_review_passed` 在 `auto-design` 和 `collaborative-design` 中可以作为后续 AI 设计阶段的输入，但不能作为代码落地依据。阶段级 `human_approved` 是 `strict-human-loop` 阶段推进的硬依据；代码落地依据是最终批准后的 `approved_for_implementation`。

任务整体状态可包含：

```text
initialized
assessed
design_in_progress
review_in_progress
human_input_required
design_ready
approved_for_implementation
implementation_planned
implementation_in_progress
verification_ready
completed
blocked
```

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
    test-review.md
  implementation-design/
    se-review.md
    dev-review.md
    test-review.md
  test-design/
    sa-review.md
    se-review.md
    mde-review.md
```

### 8.1 基础评审矩阵

```text
business-design -> SE
solution-design -> SA、MDE、TEST
implementation-design -> SE、DEV、TEST
test-design -> SA、SE、MDE
```

### 8.2 风险增强

风险命中时追加评审者：

- 部署、配置、流水线、环境、发布策略：CIE。
- 安全、权限、审计：安全视角，MVP 可由 SE/TEST 兼任。
- 性能、容量、稳定性：SE/MDE 性能视角。
- 数据迁移或数据模型变更：MDE/DEV/TEST 数据影响检查。

### 8.3 review-matrix.json

```json
{
  "artifacts": {
    "solution-design": {
      "requiredReviewers": ["SA", "MDE", "TEST"],
      "status": "in_review",
      "issues": {
        "blocking": 1,
        "advisory": 2,
        "acceptedRisk": 0
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
        "TEST": {
          "status": "passed_with_advice",
          "file": "reviews/solution-design/test-review.md"
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
accepted_risk
```

处理规则：

- `blocking`：必须由原设计 Agent 修订，并由提出问题的评审 Agent 复核关闭。
- `advisory`：AI 不强制修复，但必须由人工选择 `accept`、`reject` 或 `convert_to_blocking`。
- `accepted_risk`：人工明确接受的风险，必须写入 `decisions/*-decisions.md`，并进入最终交付包。

边界规则：

- `advisory accept`：表示人工确认该建议不采纳或暂不处理，只写入 `reviews/advisory-confirmation.json`。
- `accepted_risk`：表示人工明确接受一个交付风险，必须写入 `decisions/*-decisions.md`，并进入最终交付包。
- 如果 `advisory accept` 的原因本质上是在接受风险，应转成 `accepted_risk` 处理，不能用建议项确认绕过风险登记。

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
      "reviewer": "TEST",
      "sourceReview": "reviews/solution-design/test-review.md",
      "decision": "accept",
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
accept
reject
convert_to_blocking
```

只有当所有 `advisory` 都在该索引中存在人工确认结果，且没有被转换后未关闭的 `blocking` 时，`feature-approve` 才能生成批准记录。

## 9. AI 评审-修订闭环

`feature-review` 执行阶段评审或集成评审。输入可以是当前阶段，也可以由 workflow 根据 `state.json` 自动选择待评审产物。

阶段评审示例：

```text
/scc-dev-sphere:feature-review business-design
/scc-dev-sphere:feature-review solution-design
/scc-dev-sphere:feature-review implementation-design
/scc-dev-sphere:feature-review test-design
```

集成评审示例：

```text
/scc-dev-sphere:feature-review integrated-design
```

执行循环：

```text
读取待评审产物
  -> 根据 review-matrix 调用评审 Agent
  -> 汇总 blocking/advisory/accepted_risk
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

非正常退出时更新：

```json
{
  "status": "human_input_required",
  "blockedReason": "solution conflict requires human decision"
}
```

## 10. 批准机制

阶段级人工确认只更新对应阶段状态为 `human_approved`，不生成代码落地批准。`feature-approve` 默认只处理代码落地前的最终设计批准，批准对象是 `integrated-design.md` 及其引用的阶段设计产物。

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
  "overallStage": "approved_for_implementation",
  "approvalStatus": "approved",
  "allowedCodeChange": true
}
```

## 11. 代码仓库绑定

需求设计阶段可以不绑定代码仓库。进入实现阶段后绑定一个或多个 repo。

repo 绑定写入 `state.json.linkedRepos`，不新增独立 `links/` 目录。

```json
[
  {
    "repoPath": "/path/to/project-a",
    "role": "primary-implementation-repo",
    "branch": "feature/FEAT-20260629-001"
  }
]
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

### 12.1 硬闸口

应阻断：

- 未绑定 active task 时执行需求落地相关代码修改。
- 任务未进入 `approved_for_implementation` 时修改代码文件。
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
- `feature-approve` 写入合法批准记录后，同步 `overallStage=approved_for_implementation` 和 `allowedCodeChange=true`。
- 命令失败或缺少必要输入时，同步阶段状态为 `blocked`。

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
- 登记 artifact、review、approval、evidence 的索引关系。

Hook 不能生成 decision 语义内容，不能自动把 AI 建议写成 accepted decision。Command/Skill 生成过程件内容，人工或负责 Agent 确认语义，Hook 负责登记、索引和一致性校验。

## 13. Skill 职责

### 13.1 feature-init

- 创建 `.devsphere/tasks/feature/<task-id>`。
- 写入输入材料。
- 初始化 `state.json`。
- 设置 `current-task.json`。
- 不区分新需求和变更需求分支；存量功能调整也作为普通 feature task 处理。

### 13.2 feature-assess

- 分析需求复杂度和风险。
- 推荐 workflow mode。
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
  -> 生成或刷新 integrated-design，并提示进入最终批准
```

当前模式要求的可用状态：

- `auto-design`：阶段产物达到 `ai_review_passed` 即可作为后续 AI 设计输入。
- `collaborative-design`：阶段产物达到 `ai_review_passed` 即可作为后续 AI 设计输入；复杂阶段可人工切换为要求 `human_approved`。
- `strict-human-loop`：阶段产物必须达到 `human_approved` 才能推进后续阶段。

`feature-design` 不能自动覆盖已 `human_approved` 的阶段产物。修改已批准产物必须调用对应阶段 skill 的显式修订参数模式，并记录原因、影响范围和重新评审要求。

生成或刷新 `integrated-design.md` 时，必须汇总所有已记录的 `accepted_risk`。如果存在 `accepted_risk` 但集成设计未展示，不能进入最终批准。

各设计 Agent 在自己的阶段按需查询知识库或代码仓。查询结果一旦被设计采纳，必须写入 `evidence/` 并在设计产物中引用证据编号。

### 13.4 feature-design-*

分别处理单个设计阶段，支持 strict 模式、重跑和局部修订。阶段命令只允许读写对应阶段产物，不能顺带重写其他阶段产物。

Claude Code plugin skill 命令名不使用空格子命令。修订、重跑等动作通过 skill 参数表达，由 `SKILL.md` 使用 `$ARGUMENTS` 或位置参数解析。推荐约定：

```text
/scc-dev-sphere:feature-design-business --mode revise
/scc-dev-sphere:feature-design-solution --mode revise
/scc-dev-sphere:feature-design-implementation --mode revise
/scc-dev-sphere:feature-design-test --mode revise
```

参数语义：

- `--mode normal`：默认设计推进，只能创建或更新未人工批准的阶段产物。
- `--mode revise`：显式修订已人工批准或已进入下游使用的阶段产物，必须记录修订原因、影响范围、受影响阶段和重新评审要求。
- `--mode rerun`：重跑未人工批准阶段，适用于 AI 生成失败、上下文补充后的重新生成。

`revise` 不是新的 Claude Code 命令，也不是命令名中的空格子命令；它只是阶段 skill 的显式参数模式。

### 13.5 feature-review

执行 AI 交叉评审-修订闭环，更新 `review-matrix.json` 和评审明细。

支持两类评审：

- 阶段评审：针对 `business-design`、`solution-design`、`implementation-design`、`test-design`。
- 集成评审：针对 `integrated-design`，检查业务、方案、实现、测试之间的一致性。

### 13.6 feature-approve

默认执行代码落地前的最终设计批准，不承担单个阶段设计批准语义。

- 校验 `blocking` 归零。
- 校验 `advisory` 已由人工确认处理。
- 校验 `accepted_risk` 已写入决策记录。
- 校验 `integrated-design.md` 已汇总 `accepted_risk`。
- 生成批准记录。
- 更新 `state.json`。

### 13.7 feature-plan-implementation

生成开发执行计划。高风险或 strict 模式下等待人工确认。

如果开发执行计划依赖代码仓现状、模块约束或存量实现模式，DEV 必须查询代码仓并保存 repository evidence。

### 13.8 feature-implement

在 Hook 允许后执行代码落地。

### 13.9 feature-verify

运行本地验证并生成转测包。

## 14. Agent 职责

Agent 与 Skill 的边界规则：

```text
Agent 决定职责视角，Skill 决定执行方法。
```

同一个 Skill 可以被不同 Agent 加载，但产出必须体现 Agent 的职责视角。MVP 不设计 Skill 权限矩阵。

### SA

- 需求业务设计。
- 按需查询业务流程、业务规则、历史需求并保存 knowledge evidence。
- 使用评审 Skill 时，从业务规则、业务流程和需求边界视角输出。
- 评审方案设计中的业务一致性。
- 评审测试设计中的业务覆盖。

### SE

- 系统/方案设计。
- 按需查询存量功能设计、架构规范、接口规范并保存 knowledge evidence。
- 使用评审 Skill 时，从架构一致性、接口契约和跨系统影响视角输出。
- 评审业务设计。
- 评审实现设计和测试设计。
- 对跨模块一致性负责。

### MDE

- 模块实现设计。
- 按需查询模块历史实现方案、代码结构、技术规范并保存 knowledge/repository evidence。
- 使用评审 Skill 时，从模块边界、实现拆解和技术一致性视角输出。
- 评审方案设计实现可行性。
- 评审测试设计的模块覆盖。

### DEV

- 评审实现设计的可编码性。
- 生成开发执行计划。
- 执行代码落地和本地验证。
- 按需查询代码仓、开发规范、已有实现模式并保存 repository evidence。
- 使用评审 Skill 时，从可编码性、代码影响和开发风险视角输出。
- 默认作为统一开发责任角色，不固定拆分为前端/后端常驻 Agent。
- 根据实现计划影响面，按需启用前端、后端或全栈专项上下文。

DEV 专项上下文不作为 MVP 独立 skill 目录，而由 `feature-plan-implementation` 和 `feature-implement` 在执行时按需加载：

- 后端：接口、服务逻辑、数据访问、任务、配置等变更。
- 前端：页面、组件、交互、状态管理、接口适配等变更。
- 全栈联动：接口契约、联调顺序和回归路径。

### TEST

- 测试设计。
- 按需查询历史缺陷、测试规范、验收规则并保存 knowledge evidence。
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
