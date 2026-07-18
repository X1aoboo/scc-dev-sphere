# Feature Design 重构：职责模型

## 1. 文档状态

- 设计阶段：阶段三
- 状态：已对齐
- 前置约束：[01-goals-and-scope.md](./01-goals-and-scope.md)
- 生命周期：[02-design-lifecycle.md](./02-design-lifecycle.md)

## 2. 总体关系

```text
主会话
  ├── 执行 Design Lifecycle
  ├── 加载当前阶段 Skill
  ├── 与用户交互
  ├── 调用确定性脚本
  └── 按需派发一次性 Subagent
          ├── Research Job
          ├── Review Job
          └── Impact Analysis Job
```

| 组件 | 核心职责 |
|---|---|
| 主会话 | 决定现在做什么、处理用户决策、收敛设计 |
| Lifecycle Skill | 定义设计环节按什么步骤执行 |
| Stage Skill | 定义当前专业设计如何执行、什么算完成 |
| Subagent | 完成一个输入输出明确的隔离任务 |
| Script | 计算当前事实、下一动作和机器规则结果 |
| Docs/Template | 定义产物内容和专业规则 |

## 3. 主会话职责

主会话是唯一 Design Lead，但不承担 Agent Team 管理职责。

### 3.1 负责

1. 进入当前设计环节。
2. 读取 Router 返回的阶段快照和下一动作。
3. 加载当前阶段 Skill。
4. 执行 Analyze、Discover、Design、Revise。
5. 决定是否派发有界 Subagent。
6. 处理所有用户交互。
7. 将用户决定写入 decision。
8. 汇总 Gate 和 Review 产生的 revision items。
9. 修订 Work 中的 design 和 Draft。
10. 请求所需人工批准。
11. 调用脚本完成 Baseline。
12. 在设计变更时确认影响范围。

### 3.2 不负责

- 维护稳定 Agent 名称；
- bootstrap 设计团队；
- 保存 Agent ID；
- 等待或唤醒长期 teammate；
- 转发 Agent 之间的消息；
- 人工判断 version、Gate、Review 是否匹配；
- 绕过脚本直接修改流程状态；
- 在评审合并时替代 Reviewer 重做专业判断。

主会话拥有设计收敛权和交互权，但不拥有机器事实判断权。

## 4. 顶层 `feature-design` Skill

`feature-design` 从 Agent Teams 薄执行器调整为主会话设计生命周期入口。

### 4.1 应包含

1. 如何读取当前阶段快照。
2. 如何按 `nextAction` 执行当前生命周期活动。
3. 何时加载对应 Stage Skill。
4. 何时调用 Gate、Review、Baseline。
5. 何时向用户询问 decision。
6. 每个动作的可检查完成标准。
7. 当前动作完成后重新计算下一动作。

核心循环：

```text
读取阶段快照
→ 执行 nextAction
→ 产生持久化结果
→ 重新读取阶段快照
```

### 4.2 不应包含

- teammate bootstrap 命令；
- stable teammate 名称；
- Agent Teams 环境变量要求；
- Reviewer 并发协调细节；
- Agent 唤醒与恢复规则；
- 每个专业角色的完整检查清单；
- Gate Catalog 全量内容；
- artifact 模板内容；
- 具体状态判断分支。

Router 判断规则属于脚本；专业规则属于 Stage Skill 或外部参考；产物结构属于模板。

## 5. 四个 Stage Skill

继续保留：

```text
feature-design-business
feature-design-solution
feature-design-implementation
feature-design-test
```

它们是专业设计方法，不再默认绑定 SA、SE、MDE、TSE Agent。

### 5.1 负责

1. 定义本阶段 Analyze 关注点。
2. 定义本阶段需要调查的信息。
3. 定义 analysis、discovery、design 的专业完成条件。
4. 定义如何按 Artifact 模板生成完整 Draft。
5. 定义专业方法和必要图示。
6. 定义 evidence、decision、assumption 使用要求。
7. 定义正式设计完成标准。
8. 定义修订时应重新检查的内容。
9. 指向相应模板、Gate 和专业参考。

### 5.2 不负责

- 选择当前设计阶段；
- 修改全局 workflow 状态；
- 派发 Reviewer；
- 创建或唤醒 Agent；
- 询问用户；
- 合并 Review；
- 将自身标记为 Baseline；
- 修改下游阶段状态；
- 实现设计变更传播。

Stage Skill 发现用户决策时只创建结构化 pending decision，主会话重新路由后处理用户交互。

### 5.3 信息层级

为避免 Skill 再次膨胀，建议组织为：

```text
SKILL.md
├── 输入与输出
├── Analyze
├── Discover
├── Design
├── Produce Draft
├── Revise
├── 完成标准
└── Context pointers
      ├── 专业规则
      ├── Gate Catalog
      └── Artifact Template
```

每次执行都需要的步骤和可检查完成标准保留在 `SKILL.md`；大型检查表和专业参考放入现有 Docs，通过明确条件按需加载。

## 6. Subagent 通用约束

Subagent 是一次性隔离工作单元，不代表长期团队成员：

- 一次只接受一个 job；
- 输入由主会话一次性提供；
- 不读取或修改 workflow state；
- 不决定下一阶段；
- 不直接询问用户；
- 不派发其他 Subagent；
- 不与其他 Subagent 通信；
- 只写自己被授权的输出；
- 完成后退出；
- 输出不足时返回缺口，不自行扩大任务。

## 7. Research Job

### 7.1 适用范围

- 大范围知识库查询；
- 跨模块代码调查；
- 现有架构、接口和数据模型调查；
- 历史方案或测试资料调查。

### 7.2 输入

```text
jobId
targetStage
questions[]
allowedSources[]
```

### 7.3 输出

```text
findings
evidenceRefs
conflicts
unknowns
designImplications
```

Research Subagent 不做最终设计、不决定方案，也不修改 Work Draft 或正式 Artifact。它通过现有 Evidence 工具登记事实并向主会话返回结构化摘要，由主会话综合写入 `discovery.md`。对于主会话已有充分上下文的小调查，不强制派发 Subagent；只有调查会显著扩大主会话上下文时才隔离执行。

## 8. Review Job

Review Job 只接收已通过 Gate 的冻结 Draft。

### 8.1 输入

```text
jobId
artifactId
version
draftHash
reviewProfile
draftPath
requiredUpstreamRefs
gateWarnings
```

### 8.2 输出

```text
findings
closureDecisions
summary
```

Reviewer：

- 只评审冻结 Draft；
- 不修改 Work 或 Artifact；
- 不处理用户决策；
- 不合并共享 Review Matrix；
- 不推进 Baseline；
- 完成后退出。

不同视角通过 `reviewProfile` 表达，不需要稳定 SA、SE、MDE、TSE 会话。

## 9. Impact Analysis Job

Impact Analysis Job 只用于基线后变更或明显跨阶段影响。

### 9.1 输入

```text
changeId
changedArtifact
oldVersion
proposedChange
dependencyRefs
```

### 9.2 输出

```text
directImpacts
possibleImpacts
unaffectedAreas
evidenceRefs
unknowns
recommendedInvalidations
```

Impact Subagent 只给出影响建议。最终是否接受变更、哪些阶段需要重新打开，由主会话和确定性规则共同决定。

## 10. Subagent 最小 Job Contract

Research、Review、Impact 共用一个最小 job contract，不分别实现三套协同框架：

```json
{
  "jobId": "JOB-001",
  "kind": "research | review | impact",
  "target": "...",
  "inputs": {},
  "allowedReads": [],
  "allowedWrites": [],
  "completionCriteria": []
}
```

统一结果通过 Subagent 返回主会话；只有 Evidence 和 Review Matrix 等既有领域产物需要持久化，不为 Job 新建结果目录。返回结构为：

```json
{
  "jobId": "JOB-001",
  "status": "completed | incomplete | failed",
  "result": {},
  "unknowns": [],
  "errors": []
}
```

`jobId` 只用于对应一次请求和一次结果，不引入队列、注册表或生命周期管理。

Subagent 发现必须由用户回答的问题时，返回 `status=incomplete` 并列出 `unknowns`，随后结束。主会话将问题转为正式 decision；需要继续时创建新 job，不恢复旧 Subagent 会话。

## 11. Script 职责

脚本只处理可确定判断和原子写入，不做专业设计。

### 11.1 Router/Resolver

- 读取当前任务和四阶段事实；
- 计算当前阶段里程碑；
- 按固定优先级返回 `nextAction`；
- 返回 blocked reason 和 recovery；
- 不感知长期 Agent 是否存在。

### 11.2 Work/Artifact 工具

- 初始化阶段 Work 目录和四份固定文件；
- 检查 analysis、discovery、design、Draft 的最小结构；
- 读取 Draft version/hash；
- 在基线后变更时创建下一版本 Draft；
- 通过 Baseline 命令将 Draft 原样发布为 Artifact；
- 防止普通设计活动直接覆盖 Artifact。

### 11.3 Decision 工具

- 初始化 decision 集合；
- 写入 pending decision；
- 写回用户 resolution；
- 查询 gated pending decision。

### 11.4 Gate 工具

第一版只确定性检查：

- 必填字段；
- 当前 Draft version/hash；
- 引用存在性；
- Gate 结果结构；
- Gate 结果是否属于当前 Draft hash。

专业内容正确性仍由 Gate Skill 按规则判断并写入结果。

### 11.5 Review 工具

- 校验 Review 绑定当前 Draft hash；
- 校验 Reviewer 输出；
- 防止旧 Draft 结果合并；
- 顺序合并综合或专项 Review 到 Matrix；
- 计算 open revision items。

### 11.6 Baseline/Change 工具

- 验证 Draft 的 Gate/Review/Approval；
- 原样发布 Draft 并验证 Artifact hash；
- 在 state 中记录 version/hash 和上游输入版本；
- 在 design change 确认后按固定范围重开目标和下游阶段。

具体文件结构和失效规则在产物与变更模型中定义。

## 12. Docs、Template 与 Role Profile

专业知识不重复写入 Agent、Skill、Prompt 和 Docs。

| 内容 | 权威位置 |
|---|---|
| 生命周期步骤 | `feature-design` Skill |
| 阶段专业步骤 | 四个 Stage Skill |
| artifact 章节结构 | templates |
| Gate 条目 | governance docs |
| Reviewer 专业视角 | role profiles |
| 当前运行事实 | task files + scripts |

现有 `agents/sa.md`、`agents/se.md` 等第一版不必立即删除，可以暂时作为 role profile 来源，但默认流程不再创建对应 Agent。迁移时必须避免在 Agent、Review Skill 和 dispatch prompt 中复制同一检查项，最终由 Review Job 按 `reviewProfile` 加载单一权威规则。

## 13. 退出默认流程的复杂度

目标设计不再需要：

- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 作为设计前置条件；
- 固定 `design-sa`、`design-se` 等逻辑名称；
- design team bootstrap；
- owner Agent 的 continue/wake/revise 协议；
- Agent idle 通知驱动 Router；
- Agent 存在性恢复；
- owner 与 Reviewer 复用同一稳定 teammate；
- Reviewer 之间的事实澄清通信。

继续保留：

- artifact version；
- Reviewer 独立输出；
- 主会话调用脚本统一合并；
- stale Review 防护；
- revision items；
- Gate 和 Baseline 前置验证。

## 14. 已确认决策

1. 主会话是唯一 Design Lead，负责设计收敛、流程执行和用户交互。
2. `feature-design` 改为生命周期入口 Skill，不再是 Agent Teams 薄执行器。
3. 四个 Stage Skill 保留，但从角色 Agent 解耦，由主会话直接执行。
4. Subagent 只保留 Research、Review、Impact 三种一次性 job，不持有流程状态或等待用户。
5. 三类 Subagent 共用一个最小 job contract，不建设队列、注册表和恢复机制。
6. Router 和脚本只根据持久化事实计算动作并执行确定性写入，不承担专业设计。
7. 现有 Agent 定义第一版不急于删除，但退出默认运行路径，并逐步收敛为单一来源的 role profile。
