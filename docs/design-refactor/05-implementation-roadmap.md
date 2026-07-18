# Feature Design 重构：最小落地路线与验收标准

## 1. 文档状态

- 设计阶段：阶段五
- 状态：已对齐
- 前置约束：[01-goals-and-scope.md](./01-goals-and-scope.md)
- 生命周期：[02-design-lifecycle.md](./02-design-lifecycle.md)
- 职责模型：[03-responsibility-model.md](./03-responsibility-model.md)
- 产物模型：[04-artifact-and-change-model.md](./04-artifact-and-change-model.md)

## 2. 实施策略

先实现一条 Business Design 垂直主线，验证以下闭环：

```text
主会话
→ Work
→ Draft
→ Gate
→ Review
→ Baseline
→ Artifact
```

业务设计跑通后再复用同一机制扩展 Solution、Implementation、Test 和 Integrated Design。正式设计不跨阶段并行。

## 3. 第一批：Business Design 垂直切片

### 3.1 Workspace 初始化

进入 Business Design 时按需初始化：

```text
work/business-design/
├── analysis.md
├── discovery.md
├── design.md
└── draft.md
```

`state.json` 增加最小设计游标和阶段 Baseline ref：

```json
{
  "designCursor": {
    "stage": "businessDesign",
    "step": "analyze"
  }
}
```

### 3.2 Work 模板

第一版只增加三份通用模板：

```text
templates/design-work/
├── analysis.md
├── discovery.md
└── design.md
```

Draft 直接按对应 Artifact 模板生成，不复制四套专业 Work 模板。专业差异由 Stage Skill 定义。

### 3.3 顶层 Skill

重写 `skills/feature-design/SKILL.md`，删除：

- Agent Teams 环境检查；
- design team bootstrap；
- stable teammate 名称；
- spawn/wake/message；
- Reviewer wait/merge；
- teammate idle 驱动规则。

目标循环：

```text
读取 Router
→ 执行返回动作
→ 检查动作完成标准
→ 重新读取 Router
```

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

`run_stage` 使用 activity 区分专业工作：

```text
analyze | discover | design | revise
```

### 3.4 Business Stage Skill

`feature-design-business` 按 activity 执行：

```text
analyze  → 更新 analysis.md
discover → 更新 discovery.md/evidence/decision
design   → 更新 design.md 并生成 draft.md
revise   → 根据 revision items 更新 design.md/draft.md
```

移除 Agent 身份、通信、Reviewer 派发、全局状态和下游状态修改职责。

### 3.5 Gate

```text
work/business-design/draft.md
→ Template Check
→ Quality Check
→ quality-gates/business-design.json
```

第一批不要求专业 Gate 全部脚本化，只增加 Draft 路径、version/hash、单文件结果和可供 Router 判断的结构。

### 3.6 Review

Business Draft 默认只执行一个综合 Review Job。Reviewer 返回 findings，主会话通过 Review Matrix 工具写入：

```text
reviews/review-matrix.json
```

第一批不创建角色快照、Reviewer Markdown 历史和多 Reviewer 并发协调。

### 3.7 Baseline

统一发布命令示例：

```text
node scripts/devsphere-design.js publish <taskPath> business-design
```

命令职责：

1. 读取 Draft version/hash。
2. 校验 Gate。
3. 校验 Review Matrix。
4. 校验所需 Approval。
5. 原样复制 Draft 到 Artifact。
6. 验证 hash 一致。
7. 更新 `state.json` Baseline ref。
8. 更新 design cursor。

发布命令不修改 Draft 内容。

## 4. 第二批：扩展四阶段和 Integrated Design

### 4.1 扩展 Work 和 Stage Skill

按进入顺序初始化 Solution、Implementation、Test Work，将同一 activity 契约应用到另外三个 Stage Skill。只替换专业步骤和完成标准，不复制生命周期控制逻辑。

### 4.2 Router 阶段表

Router 使用一份数据表映射 stage、slug 和 Skill，禁止为四个阶段复制状态判断分支：

```javascript
{
  businessDesign: {
    slug: 'business-design',
    skill: 'feature-design-business'
  },
  solutionDesign: {
    slug: 'solution-design',
    skill: 'feature-design-solution'
  },
  implementationDesign: {
    slug: 'implementation-design',
    skill: 'feature-design-implementation'
  },
  testDesign: {
    slug: 'test-design',
    skill: 'feature-design-test'
  }
}
```

### 4.3 Integrated Design

```text
四阶段 Baseline
→ 生成 work/integrated-design/draft.md
→ Integrated Gate
→ Final Approval
→ publish
→ artifacts/integrated-design.md
→ design_ready
```

第一版不执行 Integrated 多角色 Review。

## 5. 第三批：基线后设计变更

主线稳定后再增加统一重开命令：

```text
node scripts/devsphere-design.js reopen <taskPath> <stage> <decisionId>
```

命令只负责：

1. 校验 `design_change` decision 已批准。
2. 从当前 Artifact 创建下一版本 Draft。
3. 清除目标和固定下游 Baseline ref。
4. 在 Review Matrix 写入 design change blocking。
5. 将 design cursor 指向目标阶段的 design。
6. 保持 task status 为 designing。

固定重开范围：

```text
business       → business, solution, implementation, test
solution       → solution, implementation, test
implementation → implementation, test
test           → test
```

第一版不做自动影响推断和豁免。

## 6. 脚本收敛

只新增一个聚合脚本：

```text
scripts/devsphere-design.js
```

命令控制在：

| 命令 | 作用 |
|---|---|
| `init-stage` | 初始化 Stage Work |
| `inspect` | 计算 Cursor、Draft、Gate、Review、Baseline 事实 |
| `publish` | Draft 原样发布为 Artifact |
| `reopen` | 基线后按固定范围重开 |

继续复用：

- `devsphere-decisions.js`；
- `devsphere-review-matrix.js`；
- `devsphere-approval.js`；
- Evidence 相关脚本。

`feature-design-router.js` 根据 `inspect` 结果选择动作，不重复实现文件读写。

## 7. Review 旧机制迁移

迁移顺序：

1. 新综合 Review Job 写入新的 Matrix 结构。
2. 新 Router 不再调用 review-state。
3. 新测试覆盖 Draft hash 和 Review Matrix。
4. 主线测试通过。
5. 删除旧 review-state 调用和无用测试。
6. 确认无其他消费者后再决定是否删除旧脚本文件。

不保留长期新旧双模式，只允许实现期间短暂共存。

## 8. Agent 旧机制迁移

第一版保留 `agents/sa.md` 等定义作为 Review Profile 参考，但退出默认运行路径：

- `feature-design` 不依赖 Agent Teams；
- 默认流程不创建稳定设计 Agent；
- Router 不返回 teammate 名称；
- Stage Skill 不包含 Agent 协同约束。

新流程稳定后再清理 team bootstrap、teammate conduct 旧设计规则、owner/wake dispatch 分支和 Agent Teams 环境变量要求。

## 9. Hook 和写入边界

### Work

主会话按 Stage Skill 编辑 `work/<stage>/*.md`。Research/Review Subagent 不得编辑 Draft。

### Artifact

`artifacts/*-design.md` 只允许 Baseline publish 命令写入。主会话、Stage Skill 和 Subagent 都不得直接修改。

### 关键 JSON

Decision、Evidence 和 Review Matrix 继续通过各自 CLI 写入。

## 10. 旧任务迁移边界

第一版不自动迁移正在进行中的旧设计任务：

- 新任务使用 Work/Draft 模型；
- 已完成旧任务不处理；
- 正在旧流程中的任务在升级前完成，或重新开始设计阶段；
- Router 不同时支持 Artifact-as-Draft 和 Work/Draft 两种模型；
- 不开发一次性迁移脚本，除非确认存在必须保留的活跃任务。

## 11. 测试策略

### 11.1 `devsphere-design.js`

至少覆盖：

- 初始化 Work；
- 重复初始化幂等；
- Draft 不存在时拒绝发布；
- Gate hash 不匹配时拒绝发布；
- Review hash 不匹配时拒绝发布；
- open blocking 时拒绝发布；
- 发布后 Draft/Artifact hash 一致；
- state Baseline 正确更新；
- Artifact 不能被普通流程直接覆盖；
- reopen 固定下游范围正确。

### 11.2 Router

覆盖：

```text
无 Work              → run_stage/analyze
analysis 完成         → run_stage/discover
discovery 完成        → run_stage/design
Draft 存在无 Gate     → run_gate
Gate fail             → run_stage/revise
Gate pass 无 Review   → run_review
Review blocking       → run_stage/revise
Review 通过           → baseline
Baseline 完成         → 下一阶段
四阶段完成            → integrate
Integrated 批准       → complete
```

同时覆盖 pending decision、文件损坏和 Draft hash 变化导致旧 Gate/Review 失效。

### 11.3 契约测试

- Stage Skill 只写自己的 Work；
- Stage Skill 不修改 state/Artifact/Review；
- Research Subagent 只写 Evidence；
- Reviewer 不修改 Work/Artifact；
- Baseline 是 Artifact 唯一写入入口；
- 外部阶段只能读取 Artifact。

### 11.4 回归测试

保持 init、clarify、assess、implementation plan、implement、verify、task detection 和 knowledge query 行为不变。

## 12. 主线验收场景

```text
进入 Business Analyze
→ 中断会话
→ 根据 State + Work 恢复
→ Discover 调查并保存 Evidence
→ 用户处理 pending decision
→ 生成 Design 和 Draft
→ Gate 通过
→ Review 产生 blocking
→ 修改 Draft
→ 旧 Review 因 hash 失效
→ Re-review 通过
→ Baseline 发布 Artifact
→ 完成四阶段
→ Integrated Approval
→ design_ready
```

该场景跑通后才认为重构主线成立。

## 13. 完成标准

### 13.1 功能

- 不启用 Agent Teams 也能完成设计流程；
- 四阶段均能从 Analyze 走到 Baseline；
- 会话中断后能通过 State + Work 恢复；
- 所有用户交互由主会话完成；
- Gate 和 Review 只针对 Draft；
- Baseline 发布前 Artifact 不变化；
- 发布后 Artifact 与 Draft hash 一致；
- Draft 变化后旧 Gate/Review 自动失效；
- Integrated Design 能推进 `design_ready`；
- design change 能按固定范围重开。

### 13.2 架构

- Router 不感知 Agent 是否存在；
- Stage Skill 不包含 Agent 协同约束；
- Subagent 不持有流程状态；
- Artifact 只有 Baseline publish 可以写；
- 不存在长期新旧双模式；
- State、Work、Draft、Artifact 职责不重叠。

### 13.3 质量

- 新增测试全部通过；
- 现有非设计回归测试通过；
- 插件验证通过；
- Docs、Skill、Router 和测试术语一致；
- 无遗留 Agent Teams 强制前置条件。

## 14. 已确认决策

1. 先实现 Business Design 垂直切片，验证后再扩展其他阶段。
2. 第一版只新增一个聚合脚本 `devsphere-design.js`。
3. Router 使用 `run_stage + activity`，不为 Analyze、Discover、Design、Revise 建立四套分支。
4. 默认 Review 改为单个综合 Reviewer，旧 Snapshot 机制在新流程稳定后删除。
5. Agent 定义暂时保留但退出运行路径，不在第一批做全面清理。
6. 第一版不自动迁移进行中的旧设计任务，也不长期支持双模型。
7. 以“中断恢复、用户决策、Review 修订、Draft 发布”完整场景作为主线验收标准。
