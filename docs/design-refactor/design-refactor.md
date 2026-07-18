# Feature Design 重构完整设计方案

## 1. 文档状态

- 状态：待整体评审
- 目标：指导 `feature-design` 从稳定 Agent Team 编排迁移为以设计生命周期、Work、Draft 和 Artifact 发布为核心的轻量流程
- 详细设计：
  - [目标与范围](./01-goals-and-scope.md)
  - [设计生命周期](./02-design-lifecycle.md)
  - [职责模型](./03-responsibility-model.md)
  - [产物与变更模型](./04-artifact-and-change-model.md)
  - [最小落地路线](./05-implementation-roadmap.md)

## 2. 背景与问题

最初引入 Agent 的目标是隔离长周期设计过程的上下文，避免需求分析、知识查询、方案设计、多轮评审和修订全部堆积在主会话中。

实际实现逐渐演变为稳定角色 Agent 协同系统，插件需要处理 team bootstrap、长期成员、派发、等待、唤醒、转发、Reviewer 快照和合并，导致：

1. Agent 协同占据主要开发和调试成本；
2. 需要用户交互时必须由主会话转发；
3. 插件重心从设计质量漂移到 Agent 生命周期；
4. Skill 中协同约束多于真正的专业设计方法；
5. Gate、Baseline 和设计变更等主线能力反而没有成为一等流程。

本次重构不否定上下文隔离，而是将它从“长期角色 Agent”调整为“持久化 Work + 按需 Subagent”。

## 3. 目标与非目标

### 3.1 目标

建立一条能够稳定完成以下活动的轻量设计主线：

```text
分析
→ 信息收集
→ 设计
→ Draft
→ Gate
→ Review
→ Revise
→ Baseline
→ Artifact
```

同时满足：

- 会话中断后可以恢复；
- 关键事实、取舍和设计过程可以追溯；
- Artifact 符合 Spec；
- 用户交互统一由主会话处理；
- 需求完成后可以从 Work、Evidence、Decision 和 Review 中提炼团队知识。

### 3.2 非目标

第一版不建设：

- 通用 Agent 编排平台；
- 持久化 Agent 身份和恢复协议；
- Agent 间通信协议；
- 独立 Baseline 仓库；
- 通用 Change Request 系统；
- 字段级影响分析；
- Subagent 作业队列或结果档案；
- 全自动专业 Gate；
- 旧设计任务自动迁移；
- 完整知识库归档流程。

## 4. 目标架构

```text
主会话（Design Lead）
  ├── feature-design 生命周期入口
  ├── 四个 Stage Skill
  ├── 用户决策与批准
  ├── Router / 确定性脚本
  └── 按需一次性 Subagent
        ├── Research Job
        ├── Review Job
        └── Impact Analysis Job

持久化任务空间
  ├── State       流程位置
  ├── Work        设计形成过程和待发布 Draft
  ├── Evidence    查证事实
  ├── Decisions   取舍与用户决定
  ├── Gate        当前 Draft 质量检查
  ├── Review      当前 Draft 问题
  └── Artifacts   已发布正式设计
```

核心原则：

- 主会话拥有设计收敛权和用户交互权；
- Script 拥有机器事实判断和原子写入权；
- Subagent 只完成一次性隔离任务；
- Skill 定义步骤和可检查完成标准；
- Artifact 只表示当前正式基线。

## 5. 四阶段主流程

第一版保持严格顺序：

```text
Business Design
→ Solution Design
→ Implementation Design
→ Test Design
→ Integrated Design
→ design_ready
```

上游 Artifact 未 Baseline 时，下游不生成正式 Draft。允许并行的仅是输入边界明确的信息调查，不并行正式设计。

## 6. 单阶段设计生命周期

四个阶段共享：

```text
Analyze
→ Discover
→ Design
→ Validate
→ Review
→ Revise
→ Baseline
```

### Analyze

明确阶段目标、输入、边界、未知项、调查计划和待用户确认问题，写入 `analysis.md`。

### Discover

调查知识、代码、规范和历史设计；原始事实写入 Evidence，综合结论和设计影响写入 `discovery.md`。

### Design

候选方案、取舍和推演写入 `design.md`，按最终 Artifact 模板生成完整 `draft.md`。

### Validate

依次执行 Template Check 和 Quality Check，结果绑定 Draft version/hash。

### Review

默认派发一个与设计上下文隔离的综合 Reviewer。Reviewer 可以读取 Work 和依据，但 finding 必须指向 Draft。

### Revise

统一处理 Gate fail、blocking、apply advisory/risk 和用户拒绝。修改 Draft 后 hash 变化，旧 Gate/Review 自动失效，重新进入 Validate。

### Baseline

校验 Draft、Gate、Review 和 Approval，将 Draft 原样复制到 Artifact，验证 hash 一致并更新 State。

## 7. 用户决策模型

Analyze、Discover、Validate 和 Review 中需要用户判断时，统一创建 pending decision：

```text
发现决策点
→ 写入 Decision
→ Router 返回 ask_decision
→ 主会话询问用户
→ 写回 resolution
→ Router 重新计算
```

`decision_pending`、`revision_required`、`blocked` 不是持久化阶段状态，而是 Router 根据文件事实派生的动作。

## 8. Work、Draft 与 Artifact

每个阶段固定四份 Work：

```text
work/<stage>/
├── analysis.md
├── discovery.md
├── design.md
└── draft.md
```

| 文件 | 内容 | 外部可读 | Gate/Review 对象 |
|---|---|---:|---:|
| analysis | 问题分析和调查计划 | 否 | 否 |
| discovery | 调查综合和设计影响 | 否 | 否 |
| design | 候选方案、取舍和推演 | 否 | 辅助读取 |
| draft | 完整待发布设计 | 否 | 是 |
| artifact | 已 Baseline 正式设计 | 是 | 否 |

所有外部任务只能读取 `artifacts/`。

## 9. Draft 版本规则

Gate、Review 和 Approval 统一绑定：

```text
artifactId + version + draft hash
```

同一 Baseline 轮次内 Draft 修订不递增 version，只改变 hash。旧 Gate/Review 因 hash 不匹配自动失效。

基线后重新设计时，从当前 Artifact 创建下一目标 version 的 Draft。

## 10. 最小状态模型

`state.json` 只保存任务级状态、恢复游标和阶段 Baseline ref：

```json
{
  "status": "designing",
  "designCursor": {
    "stage": "solutionDesign",
    "step": "discover"
  },
  "stages": {
    "businessDesign": {
      "artifact": "artifacts/business-design.md",
      "baseline": {
        "version": "0.1.0",
        "hash": "sha256:...",
        "inputVersions": {
          "requirement": "sha256:..."
        },
        "approvedAt": "..."
      }
    }
  }
}
```

Cursor step 只允许：

```text
analyze | discover | design | validate | review | baseline
```

恢复时先读取 Cursor，再加载当前 Stage Work、Decision、Gate 和 Review，由 Router 校验事实并计算下一动作。

## 11. Review 模型

第一版每个 Draft 默认一个综合 Review Job：

- 不创建稳定 Reviewer；
- 不创建每角色快照；
- 不保留 Reviewer Markdown 历史；
- 不执行 authorize/wait/merge 协调；
- findings 顺序合并到 `reviews/review-matrix.json`。

明确存在安全、迁移、部署或数据专项风险时，可以追加一个专项 Review Job。第一版不并行多个 Reviewer。

## 12. Integrated Design

四阶段 Baseline 后生成：

```text
work/integrated-design/draft.md
```

它只汇总四阶段 Artifact、跨阶段追溯、关键 Decision、风险和 readiness，不引入新设计事实。

流程：

```text
Integrated Draft
→ Integrated Gate
→ 必要时专项 Review
→ Final Approval
→ artifacts/integrated-design.md
→ design_ready
```

默认不重复完整多角色 Review。

## 13. 基线后设计变更

基线后变化复用 `type=design_change` 的 Decision，不建立 Change Record 目录。

```text
记录变更原因和影响
→ 用户确认
→ 从当前 Artifact 创建下一版本 Draft
→ 重开目标和固定下游
→ Revise
→ Gate
→ Review
→ Baseline
```

固定重开范围：

| 变化阶段 | 重开阶段 |
|---|---|
| business | business、solution、implementation、test |
| solution | solution、implementation、test |
| implementation | implementation、test |
| test | test |

第一版不引入 `stale` 状态、递归依赖算法和豁免机制。

## 14. 职责边界

### 主会话

- 执行生命周期；
- 维护 Work 和 Draft；
- 与用户交互；
- 汇总 revision items；
- 调用 Gate、Review 和 Baseline；
- 不管理长期 Agent。

### 顶层 Skill

- 读取 Router；
- 按动作执行；
- 检查完成标准；
- 不包含 teammate 生命周期和专业检查表全文。

### Stage Skill

- 定义 Analyze、Discover、Design、Draft 和 Revise 的专业步骤；
- 定义 Work 和 Draft 完成标准；
- 不修改全局 State、Artifact、Review 或下游阶段。

### Subagent

- 只执行 Research、Review、Impact 一次性 Job；
- 不询问用户；
- 不持有流程状态；
- 不派发其他 Subagent；
- 不修改 Draft 或 Artifact。

### Script

- 计算当前事实和下一动作；
- 校验 version/hash；
- 合并 Gate/Review；
- 发布 Draft；
- 按固定范围重开阶段；
- 不做专业设计。

## 15. Router 动作

动作类型收敛为：

```text
run_stage
ask_decision
run_gate
run_review
baseline
integrate
complete
blocked
```

`run_stage.activity`：

```text
analyze | discover | design | revise
```

判断优先级：

```text
事实不可解析       → blocked
存在 pending decision → ask_decision
存在 revision item → run_stage/revise
缺少当前里程碑证据 → 对应下一动作
所有阶段完成       → integrate / complete
```

## 16. 最小实现路线

### 第一批

实现 Business Design 垂直切片：Work、Draft、Gate、综合 Review、Baseline 发布。

### 第二批

复用通用机制扩展 Solution、Implementation、Test 和 Integrated Design。

### 第三批

实现 design change 和固定下游重开，随后清理旧 Review Snapshot 与 Agent Team 运行路径。

只新增一个聚合脚本：

```text
scripts/devsphere-design.js
```

命令：

```text
init-stage | inspect | publish | reopen
```

## 17. 迁移边界

- 新任务使用新模型；
- 已完成旧任务不处理；
- 正在旧设计流程中的任务在升级前完成或重新开始设计阶段；
- 不长期支持 Artifact-as-Draft 与 Work/Draft 双模型；
- Agent 定义暂时保留作为 Role Profile 参考，但退出默认运行路径。

## 18. 主线验收

必须跑通：

```text
Business Analyze
→ 会话中断
→ State + Work 恢复
→ Discover + Evidence
→ 用户 Decision
→ Design + Draft
→ Gate
→ Review Blocking
→ Revise Draft
→ 旧 Review 因 hash 失效
→ Re-review
→ Baseline 发布 Artifact
→ 四阶段完成
→ Integrated Approval
→ design_ready
```

完成条件：

- 不启用 Agent Teams 也能完成设计；
- 所有用户交互由主会话完成；
- Gate/Review 只针对 Draft；
- Baseline 前 Artifact 不变化；
- Baseline 后 Draft/Artifact hash 一致；
- 会话可以恢复；
- 设计变更可以固定范围重开；
- 新增测试、现有非设计回归和插件验证全部通过。

## 19. 知识提炼

需求设计开发完成后，从以下现有内容提炼知识候选：

```text
Analysis
+ Discovery
+ Design
+ Evidence
+ Decisions
+ Final Artifacts
+ Closed Review Issues
```

本次只保证知识输入完整、分类清晰，不扩展团队知识库的审批和发布机制。

## 20. 评审重点

请重点评审：

1. Work、Draft、Artifact 的边界是否足够清晰；
2. Draft 原样发布是否满足 Baseline 语义；
3. 单综合 Reviewer 是否满足第一版质量要求；
4. State Cursor 是否足以支持恢复；
5. 固定下游重开是否可以接受；
6. Business 垂直切片是否是合适的首个实现范围；
7. 是否存在超出原始目标的设计内容。
