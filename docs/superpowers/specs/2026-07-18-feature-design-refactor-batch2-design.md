# Feature Design 重构 — Batch 2 实现设计 Spec

- 日期：2026-07-18
- 状态：待评审
- 范围：在 Batch 1（business 垂直切片）之上，扩展到 Solution/Implementation/Test + Integrated Design，落地多视角并行评审（D3）与跨阶段承接评审（D4），推进 task 到 `design_ready`
- 基底：
  - `docs/superpowers/specs/2026-07-18-feature-design-refactor-design.md`（总 spec，D1-D9）
  - Batch 1 已合入 main：`scripts/devsphere-design.js`（init-stage/mark-ready/record-gate/inspect/publish）、work 目录、progress.json 里程碑、单视角评审、`feature-design/SKILL.md` 生命周期入口
- 本文性质：Batch 2 的实现设计，作为 writing-plans 的输入

## 1. 决定总表

| # | 决定 | 说明 |
|---|---|---|
| B2-1 | 一个 Batch 2 计划全做 | 阶段扩展 + 多视角评审 + Integrated + design_ready |
| B2-2 | agents/*.md 直接作 review profile 来源 | Review Job 读对应 agent 文件的"设计评审"段；不改 agent 文件（清理留 Batch 3） |
| B2-3 | 多视角评审 = 并行派发 N 个 Review Subagent | 主会话对冻结 Draft 并行派 N 个 Subagent，各返 findings，`record-review` CLI 合并 |
| B2-4 | Integrated 走精简生命周期 | 新 activity `assemble`；里程碑 `not_started→drafted→validated→reviewed→baselined`，无 analyze/discover |
| B2-5 | 四个阶段 skill 全部重构为 activity 模型 | business/solution/implementation/test 改成 analyze/discover/design/revise → `work/<stage>/`，删 Agent/teammate 身份与直接写 artifact |
| B2-6 | Router 加当前阶段解析器 | 顺序 business→solution→implementation→test→integrated，首个未 baseline 的即当前阶段 |
| B2-7 | `record-review` CLI 包装 `applyReviewResults` + 绑 draft hash | 合并 N 个 Review Job 结果并 stamp `entry.draftRef` + `status=reviewed` |
| B2-8 | Integrated baseline 后推进 task → `design_ready` | 复用 `workflows/feature-workflow.js set-task-status <root> design_ready` |
| B2-9 | 旧 `feature-design-router.js` 暂留 | 死代码但测试仍绿，Batch 3 统一清理（与 Batch 1 一致） |

## 2. 阶段 skill 重构模型

### 2.1 统一 activity 契约

四个阶段 skill 共享同一套 activity 骨架（专业内容不同）：

```text
feature-design-<stage>  （主会话按 inspect 返回的 run_stage.activity 调用）

analyze   → 读写 work/<stage>/analysis.md
            读上游 Artifact + requirement + 模板
            产出阶段目标 / 未知项 / 调查计划 / 待确认 decision
            完成后主会话调: node devsphere-design.js mark-ready <taskPath> <stage> analysis

discover  → 读写 work/<stage>/discovery.md + evidence/ + decisions/
            按调查计划查知识/代码/规范；原始事实入 evidence，综合结论入 discovery
            未证前提记 type=assumption；取舍记 decision
            完成后主会话调: node devsphere-design.js mark-ready <taskPath> <stage> discovery

design    → 读写 work/<stage>/design.md + draft.md
            候选方案/取舍/推演入 design.md
            按 Artifact 模板生成完整 draft.md（带 frontmatter: artifactId + version）
            draft = 当前候选，引用 evidence/decision

revise    → 读 revision items，更新 design.md/draft.md
            不跳 Gate；改完 draft hash 变，旧 Gate/Review 自动失效
```

### 2.2 每个 skill 的结构

```text
SKILL.md
├── 集成契约（入口、activity 入参、禁止写入 state/artifact/review/下游）
├── Analyze（本阶段关注点 + analysis 完成条件）
├── Discover（本阶段调查项 + discovery 完成条件）
├── Design（本阶段专业方法 + draft 完成条件）
├── Revise（本阶段修订时应重查的内容）
└── Context pointers（artifact 模板、gate catalog、上游 artifact）
```

大型检查表/专业参考保持外置，skill 只留每次执行必需的步骤 + 可检查完成标准。

### 2.3 四个 skill 都删

- "SA/SE/MDE/TSE Agent" 自我身份、"你是…Agent"
- `devsphere-teammate-conduct` 引用、team-lead 派发语义
- scope/draft/revise **模式**（改为由 inspect 的 `run_stage.activity` 驱动，不再有 `--mode`）
- 直接写 `artifacts/*.md`（改为写 `work/<stage>/draft.md`，由 publish 发布）
- 评审派发 / 全局状态 / 下游状态修改

### 2.4 各阶段专业差异（保留方法论，只换载体）

| Stage | 上游输入 | 产出 artifact |
|---|---|---|
| business | requirement | business-design（REQ/BR/状态/规则/验收） |
| solution | business-design | solution-design（C4/4+1/接口/数据/NFR） |
| implementation | solution-design | implementation-design（模块/文件/调用链/回滚） |
| test | business+solution+implementation | test-design（策略/场景/数据/准入） |

### 2.5 写入契约

- 阶段 skill 只写：自己的 `work/<stage>/*.md` + `evidence/` + `decisions/<slug>-decisions.json`
- 不写：`artifacts/`（只 publish 能写）、`state.json`、`reviews/`、下游阶段 work
- 发现需用户决策 → 写 pending decision，不自行 AskUserQuestion（由主会话在 `ask_decision` 动作里问）

## 3. 多视角并行评审

### 3.1 评审视角表（固定，每个 artifact）

| Artifact | 视角（各一个 Review Subagent） | profile 来源 |
|---|---|---|
| business-design | SE | agents/se.md |
| solution-design | SA、MDE、TSE | agents/sa.md、agents/mde.md、agents/tse.md |
| implementation-design | SE、DEV、TSE | agents/se.md、agents/dev.md、agents/tse.md |
| test-design | SA、SE、MDE | agents/sa.md、agents/se.md、agents/mde.md |

### 3.2 执行流程（inspect 返回 run_review 时，主会话执行）

```text
1. 读取当前冻结 Draft 的 draftRef（artifactId + version + hash）
2. 查视角表得该 artifact 的 N 个视角
3. 并行派发 N 个 Review Subagent，每个输入：
   - draftPath、draftHash、version
   - reviewProfile = 对应 agents/<role>.md（Subagent 只作用其"设计评审"段）
   - allowedReads: work/<stage>/{analysis,discovery,design}、evidence/、decisions/、上游 artifacts/
   - 完成标准：findings 指向 Draft；不写 Work/Artifact；不问用户
4. 收齐 N 份 {findings, closureDecisions, summary}
5. 主会话调 record-review CLI 合并（§3.3）
6. 重读 inspect：open blocking/apply → revise；通过 → baseline
```

Draft hash 变 → 全部旧 findings 失效 → 重新 Gate + 重新派发全部 N 个视角。

### 3.3 `record-review` CLI（B2-7）

`devsphere-design.js record-review <taskPath> <stage> <snapshotsJson>`：

```text
1. 读当前 draftRef（artifactId + version + hash）
2. 调既有 applyReviewResults(taskPath, slug, version, snapshots)
   （幂等 source 合并 + closureDecisions 校验 + recomputeCounts）
3. 合并后 stamp：entry.draftRef = 当前 draftRef；entry.status = 'reviewed'
4. writeMatrix
```

`inspect`/`publish` 的 `reviewAcceptable`（Batch 1 已实现：检查 `entry.draftRef.hash === 当前 hash` && `status==='reviewed'` && 无 open revision）据此正确判定。取代 Batch 1 E2E 里手动 writeMatrix 的步骤。

**snapshot shape**（对齐 `applyReviewResults` 契约）：

```json
{
  "reviewer": "se",
  "artifactId": "SD-FEAT-001",
  "artifactVersion": "0.2.0",
  "issueFindings": [
    { "findingId": "F1", "type": "blocking", "reviewerAgent": "se", "round": 1 }
  ],
  "closureDecisions": [
    { "issueId": "SD-B-001", "status": "closed", "closureEvidence": "..." }
  ]
}
```

## 4. Integrated Design

### 4.1 目录与生命周期

目录：`work/integrated-design/draft.md`（只此一份，无 analysis/discovery/design，无 progress.json）。

精简生命周期（新 activity `assemble`）：

```text
四阶段 baseline 完成
→ current-stage 解析为 integrated
→ inspect 返回 run_stage/assemble
→ 主会话组装 integrated draft（汇总四 artifact + 跨阶段追溯 + 关键 decision + 风险 + readiness，不引入新设计事实）
→ inspect: drafted → run_gate（integrated gate）
→ inspect: validated → run_review（4 个跨阶段承接视角，并行 Subagent）
→ inspect: reviewed → baseline
→ publish(integrated) → 复制到 artifacts/integrated-design.md + state baseline
→ 推进 task → design_ready
```

### 4.2 Integrated 评审的 4 个维度（D4）

| 维度 | 关注 |
|---|---|
| 业务承接 | 业务要求是否全部被方案承接 |
| 实现承接 | 方案接口/数据/模块是否被实现承接 |
| 测试承接 | 关键需求/接口/风险是否被测试承接 |
| 基线一致 | 四 artifact 的 version/hash/Gate/Review/Baseline 是否自洽 |

这 4 个维度**不**走 agents/*.md（它们是跨阶段承接视角，无现成 agent profile）。Review Subagent 的 prompt 由主会话按维度现场组装，checklist 写进 `feature-design/SKILL.md`（或 integrated context pointer）。这是唯一不走 agent profile 的评审。

### 4.3 design_ready 推进

integrated publish 成功后，主会话调：

```bash
node scripts/workflows/feature-workflow.js set-task-status <workspaceRoot> design_ready
```

`inspect` 对 integrated baseline 后返回 `complete`（区别于四阶段的 `stage_complete`），主会话据此刻推进状态。

## 5. 实现范围

### 5.1 脚本：`scripts/devsphere-design.js`（扩展）

| 改动 | 作用 |
|---|---|
| `record-review <taskPath> <stage> <snapshotsJson>` | 包装 `applyReviewResults` + stamp `entry.draftRef`/`status=reviewed`（B2-7） |
| `current-stage <taskPath>` | 解析器：顺序 [business,solution,implementation,test,integrated]，首个未 baseline 的；全 baseline → `complete` |
| `inspect` 增加 integrated 分支 | 无 draft → `run_stage/assemble`；跳过 analyze/discover 的 progress 检查 |
| `inspect` activity 集合扩 `assemble` | `run_stage.activity ∈ analyze|discover|design|revise|assemble` |
| `init-stage` 对 integratedDesign 走精简分支 | 只建 `draft.md`，不建 analysis/discovery/design，不建 progress.json |
| `publish` 对 integrated 返回 `complete` 信号 | 主会话据此刻推进 design_ready |

`publish`/`mark-ready`/`record-gate` 对四个设计阶段不变。`mark-ready` 对 integrated 不调用。

### 5.2 复用不动

- `devsphere-review-matrix.applyReviewResults`
- `devsphere-decisions`（含 Batch 1 的 assumption type）
- `devsphere-approval`
- `workflows/feature-workflow.js`

### 5.3 Skill 改动

| Skill | 改动 |
|---|---|
| `feature-design/SKILL.md` | 扩展：①读 `current-stage` 解析当前阶段再 inspect；②`run_review` 按视角表并行派 N 个 Review Subagent + 调 `record-review`；③integrated 的 `run_stage/assemble` 组装逻辑；④integrated baseline 后推进 `design_ready`；⑤ integrated 4 维度 checklist（现场组装） |
| `feature-design-business` | 重构为 activity 模型（§2） |
| `feature-design-solution` | 同上 |
| `feature-design-implementation` | 同上 |
| `feature-design-test` | 同上 |
| `feature-review` | 重新定位为 Review Subagent 的 job skill：接收 draftRef + profile + allowedReads，产出 `{findings, closureDecisions, summary}`（shape 对齐 `applyReviewResults`），不写 Work/Artifact/matrix、不问用户 |

agents/*.md 不改（B2-2）。

### 5.4 产物结构增量

```text
work/
├── business-design/        (Batch 1 已有)
├── solution-design/        ← init-stage 建
├── implementation-design/  ← init-stage 建
├── test-design/            ← init-stage 建
└── integrated-design/
    └── draft.md            ← 只 draft，无 progress.json
```

### 5.5 实现顺序（计划内任务序）

1. `current-stage` 解析器 + `inspect` integrated 分支 + `init-stage` 精简分支 + activity 扩 `assemble`。
2. `record-review` CLI（draft-hash 绑定合并）+ 单元测试。
3. 重构 4 个阶段 skill 为 activity 模型（4 个任务，每 skill 一个）。
4. 重写 `feature-review` 为 Review Subagent job skill。
5. 扩展 `feature-design/SKILL.md`：阶段推进 + 多视角并行派发 + integrated 组装 + design_ready。
6. 验收：多阶段 + 多视角 + integrated 端到端测试。

## 6. 验收

### 6.1 单元

- `current-stage` 各分支（首个未 baseline、全 baseline→complete）。
- `record-review` 合并 + hash 绑定 + 幂等（同 snapshot 重复合并不翻倍）。
- `inspect` integrated 分支（无 draft→assemble、drafted→run_gate、reviewed→baseline、baselined→complete）。

### 6.2 端到端（扩展 Batch 1 E2E 到全流程）

```text
business baseline（Batch 1 已通）
→ solution: analyze/discover/design/draft → gate → 多视角(SA+MDE+TSE) review
→ blocking → revise → hash 失效 → 重 gate + 重派 3 视角 → baseline
→ implementation / test 同理顺序 baseline
→ 四阶段完成 → current-stage 解析为 integrated
→ assemble integrated draft → integrated gate → 4 维度 review → baseline
→ publish(integrated) → task = design_ready
```

### 6.3 完成条件

- 四阶段顺序 baseline，每阶段按视角表收 N 个视角 findings。
- Draft 改后 N 个视角全失效重派。
- integrated 4 维度评审跑通，baseline 后 task 推进 `design_ready`。
- 不启用 Agent Teams。
- 新增 + 现有非设计回归全绿；旧 `feature-design-router.test.js` 仍绿（router 未动）。

## 7. 非目标（不变 + 本批明确）

- 不做 design_change / reopen（Batch 3）。
- 不删 `feature-design-router.js` 及其测试（Batch 3）。
- 不清理 agents/*.md 的 Agent 残留措辞（Batch 3）。
- 不重构 feature-init/clarify/assess/implement/verify。
- 知识提炼仍只保证输入完整。
