# Feature Design 重构：实现设计 Spec

- 日期：2026-07-18
- 状态：待评审
- 范围：`feature-design` 从稳定 Agent Team 编排迁移为"设计生命周期主轴 + 持久化 Work/Draft/Artifact + 按需一次性 Subagent"
- 基底：`docs/design-refactor/` 下五份子文档（01-05，均标记"已对齐"）
- 本文性质：在五份基底之上的 **delta + 精化**，记录本次 brainstorming 的决定与新增细节，作为 writing-plans 的输入

## 1. 决定总表（相对五份基底的 delta）

| # | 决定 | 取代基底中的 |
|---|---|---|
| D1 | 设计推演（Analyze/Discover/Design/Draft/Revise）全部在主会话执行；Subagent 只做 Research + Review 两类有界任务 | 03 文档"Subagent 三类（Research/Review/Impact）"→ 收为两类 |
| D2 | 阶段里程碑由主会话写入的结构化 ready 信号派生；载体 `work/<stage>/progress.json` | 02 文档 §14"由 analysis/discovery 完成条件计算"的歧义 |
| D3 | 评审按专业视角拆多套 checklist，每套一个一次性 Review Job，并行派发、脚本顺序合并进 matrix | 04 文档 §10"默认单综合 Reviewer" |
| D4 | Integrated Design 也走"跨阶段承接"维度的多视角 Review | 主文档 §12、04 文档 §14"默认不重复多角色 Review" |
| D5 | 砍掉 Impact Analysis Job | 03 文档 §9 |
| D6 | 移除 Work Iteration 概念；基线后重开直接覆盖更新 work 文件，过程留痕交给 git | 04 文档 §6 |
| D7 | assumption 复用 `decisions/` + `type=assumption`，不新增目录 | 01 文档 G4 提到但无归属的 assumption |
| D8 | Gate 结果收敛为 `pass|warn|fail`；原 `requires_human` 走 decision 机制 | 02 文档 §8 四值 |
| D9 | `designCursor.step` 允许值补 `revise` | 主文档 §10 漏列 |

基底中未列入本表的全部内容（两层工作流、生命周期七步、职责模型、Draft hash 失效、固定下游重开表、最小状态模型、迁移边界、验收场景等）**保持不变**，本 spec 不重复抄录。

## 2. 主会话上下文管理（D1 配套）

D1 把四阶段推演放回主会话，不加管理会重新栽进"上下文压缩导致幻觉"这一原始问题。机制：

```text
进入 stage N:
  主会话只加载 stage N-1 的 Artifact（已基线、内容收敛）
  + 当前 stage 的 analysis/discovery（从 work/ 读）
  不加载上游 stage 的 analysis/discovery/design 过程

stage N 内部:
  Analyze/Discover/Design/Draft/Revise 都在主会话完成
  过程实时落盘到 work/<stage>/*.md

stage N Baseline 后:
  主会话主动卸载本 stage 的 analysis/discovery/design 推演上下文
  只保留 Artifact 摘要（artifactId/version + 关键 decision id）
  再进入 stage N+1
```

要点：

- **Artifact 是阶段间唯一的上下文传递物**——同时承担"外部任务唯一可读"和"主会话上下文边界"两个角色，零新增机制。
- **Work 文件是断点续传载体**——主会话任何一步中断，恢复时从 `progress.json`（D2）+ work 文件还原，不依赖会话记忆。
- **Draft hash 失效机制**保证主会话推演产物的一致性——draft.md 改动即重新 Gate/Review，不靠会话自觉。
- v1 **不引入显式 forget / 上下文压缩指令**，靠阶段切换的自然边界 + 文件外部化。若实测某阶段推演仍超预算，退路是把该阶段 Design activity 下沉为一次性 Design Subagent，但 v1 不做。

## 3. 评审模型（D3 + D4 展开）

### 3.1 checklist 即 role profile 的唯一权威来源

现有 `agents/sa.md`、`agents/se.md`、`agents/mde.md`、`agents/tse.md` 正式收敛为各自评审 checklist 的来源文档，默认流程不再创建对应 Agent。`reviewProfile` 字段指向 checklist，而不是 agent 名。这避免了基底 03 文档 §12 指出的"同一检查项在 agent / review skill / dispatch prompt 三处复制"问题。

### 3.2 阶段级评审（复用现有评审表）

每个视角 = 一个 one-shot Review Job：

| Artifact | 评审视角 |
|---|---|
| business-design | 架构向（SE） |
| solution-design | 业务向（SA）、实现向（MDE）、测试向（TSE） |
| implementation-design | 架构向（SE）、开发向（DEV）、测试向（TSE） |
| test-design | 业务向（SA）、架构向（SE）、实现向（MDE） |

### 3.3 Integrated 评审（D4，跨阶段承接维度）

不重复阶段内专业检查，只看跨阶段承接：

| 视角 | checklist 关注 |
|---|---|
| 业务承接 | 业务要求是否全部被方案承接 |
| 实现承接 | 方案接口/数据/模块是否被实现承接 |
| 测试承接 | 关键需求/接口/风险是否被测试承接 |
| 基线一致 | 四 artifact 的 version/hash/Gate/Review/Baseline 是否自洽 |

### 3.4 执行与合并

- 主会话对当前冻结 Draft（绑定 `artifactId + version + draft hash`）**并行派发** N 个 Review Job（N = 该 artifact 的视角数）。
- 每个 Job 输入：`draftPath` + `draftHash` + `reviewProfile`（checklist）+ 允许读的 work/evidence/decisions/上游 Artifact。
- 每个 Job 返回 `{findings, closureDecisions, summary}`，**只评 Draft、不写 Work/Artifact、不直接写 matrix、不问用户**。发现需用户判断的事项返回 `status=incomplete` + `unknowns`，主会话转为 decision。
- 主会话调脚本把各 Job findings **顺序合并**进 `reviews/review-matrix.json`，绑定当前 draftHash。
- **Draft hash 变 → 全部旧 Job 结果失效 → 重新 Gate + 重新派发全部视角**。不复活旧的"稳定 Reviewer 快照 + authorize/wait"协议。

## 4. 里程碑与恢复（D2 展开）

### 4.1 progress.json 结构

```json
{
  "step": "analyze",
  "ready": {
    "analysis": false,
    "discovery": false
  }
}
```

- 主会话完成 analysis/discovery 的语义判断后，调 `mark-ready` 写入对应 `ready` 字段为 `true`。
- Router（`inspect`）把 `ready.analysis` / `ready.discovery` / draft 文件存在性 / Gate 结果 / Review 结果 / baseline ref 这些**结构化事实**作为里程碑派生依据，不要求脚本复判专业内容。
- `decision_pending`、`revision_required`、`blocked` 仍由持久化事实派生，不进 progress.json、不进 cursor。

### 4.2 恢复路径

```text
读取 designCursor + progress.json
→ 加载当前 stage work 文件
→ 读取 pending decisions、Gate、Review Matrix
→ inspect 校验事实并重新计算 nextAction
→ 继续执行
```

cursor 与文件事实冲突时，Router 采用文件事实并修正 cursor（基底 04 文档 §12 不变）。

## 5. 产物结构（04 文档 §4 + 本次 delta）

```text
<taskPath>/
├── work/
│   ├── <stage>/
│   │   ├── analysis.md
│   │   ├── discovery.md
│   │   ├── design.md
│   │   ├── draft.md
│   │   └── progress.json        ← D2 新增（唯一新增文件类型）
│   └── integrated-design/
│       └── draft.md
├── evidence/
├── decisions/                   ← D7: assumption / design_change 也落这里
├── artifacts/                   ← 仅 publish 命令可写
├── quality-gates/
├── reviews/
│   └── review-matrix.json       ← D3: 多视角 findings 合并入此
├── approvals/
└── state.json
```

无 `work/jobs/`、无 `assumptions/`、无 `baselines/`、无 iteration 目录。相对现有任务结构，只新增 `work/`（含 `progress.json`）。

## 6. 脚本落点

新增聚合脚本 `scripts/devsphere-design.js`：

| 命令 | 作用 |
|---|---|
| `init-stage <taskPath> <stage>` | 初始化 `work/<stage>/` 四文件 + `progress.json`（step=analyze，ready 全 false） |
| `mark-ready <taskPath> <stage> <analysis\|discovery>` | 主会话判完成后写 ready 信号（D2） |
| `inspect <taskPath> [stage]` | 计算 cursor/draft/gate/review/baseline 事实 + nextAction |
| `publish <taskPath> <stage>` | Draft 原样发布 Artifact + 校验 hash + 更新 state baseline ref |
| `reopen <taskPath> <stage> <decisionId>` | 校验 `design_change` decision + 固定下游重开 + 清 baseline ref（第三批） |

复用并改造：

- `devsphere-decisions.js`：增加 `type=assumption`、`type=design_change`（D7）。
- `devsphere-review-matrix.js`：改造合并入口，接受多 Review Job 结果顺序合并（D3）。
- `devsphere-approval.js`：复用，不改造。
- `feature-design-router.js`：改为消费 `inspect` 输出选动作，不再自读文件。

删除默认调用（迁移期允许短暂共存，迁移完成后删）：

- `devsphere-review-state.js` 的调用路径。
- `devsphere-dispatch.js` 的 design-team bootstrap 路径。

## 7. Skill 改动

- **`feature-design/SKILL.md`**：删 Agent Teams 检查 / bootstrap / stable teammate / wake / wait-merge / idle 驱动；改为"读 inspect → 按 nextAction 执行 → 检查完成标准 → 重读 inspect"循环。动作类型收敛为 `run_stage|ask_decision|run_gate|run_review|baseline|integrate|complete|blocked`，`run_stage.activity` 含 `analyze|discover|design|revise`（D9）。
- **四个 `feature-design-<stage>`**：保留，按 `analyze|discover|design|revise` 四 activity 组织；删 Agent 身份 / 通信 / 评审派发 / 下游状态修改；发现 decision 只写 pending decision，不问用户。checklist 与专业规则抽到 `agents/*.md`（D3），通过 context pointer 引用。
- **`feature-review`**：从"稳定 Reviewer 协调"改为"主会话按视角并行派发 one-shot Review Job + 脚本合并"。
- **`design-quality-gate` / `design-template-check`**：保留，Gate 结果收敛为 `pass|warn|fail`（D8）。

## 8. 三批实现顺序

1. **Business 垂直切片**：Work + progress + Draft + Gate + 单视角 Review（SE 评 business）+ Baseline。验证 D1/D2 与中断恢复。
2. **扩展 Solution/Implementation/Test**（多视角并行评审在此批验证）**+ Integrated**（跨阶段承接四视角 Review，D4）。推进到 `design_ready`。
3. **design_change + 固定下游重开**（D6：直接覆盖 work，不建 iteration）；随后删旧 review-state 调用、dispatch bootstrap、teammate-conduct 旧规则。

## 9. 验收

基底 roadmap §12-13 的主线验收场景保持不变（中断恢复 → 用户 Decision → Gate → Review blocking → Revise → hash 失效 → Re-review → Baseline → 四阶段 → Integrated Approval → design_ready）。

本次两条增量验收：

- **多视角评审**：solution-design 能并行收 SA/MDE/TSE 三视角 findings 并合并；Draft 改动后三视角结果全失效、重新派发。
- **progress.json 恢复**：analysis 写 ready 后中断会话，恢复时 Router 凭 `progress.json` + work 正确路由到 discover，不盲信 cursor。

## 10. 已确认的非目标（不变）

- 不建 Agent 编排平台 / 持久 Agent 身份 / Agent 间通信协议。
- 不重构 feature-init/clarify/assess/implement/verify。
- 不做字段级影响分析、stale 状态、失效豁免、自动影响推断（D5 已砍 Impact Job）。
- 不自动迁移进行中的旧设计任务，不长期支持 Artifact-as-Draft 与 Work/Draft 双模型。
- 不扩展知识库审批/发布机制（仅保证知识提炼输入完整）。
