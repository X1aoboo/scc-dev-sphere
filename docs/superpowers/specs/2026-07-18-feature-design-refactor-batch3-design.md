# Feature Design 重构 — Batch 3 实现设计 Spec

- 日期：2026-07-18
- 状态：待评审
- 范围：补齐 design change 能力（`design_change` decision type + `reopen` 命令 + 固定下游重开），并删除旧 Agent Team 运行路径（router/dispatch/review-state/teammate-conduct），更新 guard/hooks/CLAUDE.md
- 基底：
  - `docs/superpowers/specs/2026-07-18-feature-design-refactor-design.md`（总 spec，D1-D9）
  - Batch 1/2 已合入 main：`devsphere-design.js`（init-stage/mark-ready/record-gate/inspect/publish/current-stage/record-review）、四阶段 activity skill、feature-review job skill、feature-design 生命周期入口、integrated + design_ready
- 本文性质：Batch 3 的实现设计，作为 writing-plans 的输入

## 1. 决定总表

| # | 决定 | 说明 |
|---|---|---|
| B3-1 | 一个 Batch 3 计划全做 | reopen 新功能 + 旧机制清理 |
| B3-2 | version minor 递增 | `0.1.0→0.2.0→0.3.0`；同一 baseline 轮次内的 draft 修订仍走 hash 不递增 |
| B3-3 | reopen 不复制 Draft | 直接复用 `work/draft.md`，只 bump frontmatter version；hash 变→旧 Gate/Review 自动失效 |
| B3-4 | reopen 起点由主会话判断 | reopen 把目标+下游 progress.ready 重置为 false（保守默认）；主会话按变更规模用 `mark-ready` 快进 |
| B3-5 | `design_change` 新 type | 复用 `decisions/`，带 `reason`/`impact`/`resolution.chosen=apply`；用户批准后才 reopen |
| B3-6 | design-change blocking | reopen 在 matrix 写一条 blocking（`reviewerAgent='design-change'`，source 含 decisionId，绑新 draft hash）→ inspect 路由 revise |
| B3-7 | 清理：先解耦再删 | 切 feature-workflow 对 router/review-state 的依赖 → 解 review-matrix↔review-state 循环 → 再删旧脚本+测试 |
| B3-8 | 清理：teammate/guard/hooks | 删 teammate-conduct skill + check-teammate-decisions hook；改 review-writes/review-bash 提示文案；清 stage skills 否定句 |
| B3-9 | 清理：CLAUDE.md 重写 | §93-101、§140、§171 旧 Agent Team 段落重写为 lifecycle 模型 |

## 2. `design_change` decision type（B3-5）

`devsphere-decisions.js` 的 `VALID_TYPES` 加 `'design_change'`。该 type 落 `decisions/<slug>-decisions.json`：

```json
{
  "id": "BD-DEC-008",
  "type": "design_change",
  "category": "feature_scope",
  "summary": "调整查询接口为异步任务",
  "status": "decided",
  "reason": "同步请求无法满足数据规模要求",
  "impact": "solutionDesign,implementationDesign,testDesign",
  "resolution": { "chosen": "apply", "note": "...", "decidedAt": "..." }
}
```

- `reason`（必填）、`impact`（逗号分隔的阶段列表）是 design_change 专属字段；校验时该 type 必填 reason/impact。
- 不要求 options/askMode/rationale（gated 专属）。
- 主会话发现 design change 时写 `status=pending`；用户批准后 `resolve` 写 `resolution.chosen='apply'`（拒绝则不 reopen）。
- `impact` 列出受影响阶段，用于人工判断；`reopen` 的实际重开范围由**固定下游表**（§3.2）决定，`impact` 仅作一致性提示。

## 3. `reopen` 命令（B3-2/B3-3/B3-4/B3-6）

`devsphere-design.js reopen <taskPath> <stage> <decisionId>`：

```text
1. 读 design_change decision（由 decisionId）；校验 type=design_change 且 status=decided 且 resolution.chosen=apply；否则抛错。
2. 固定下游重开范围（固定表）：
     businessDesign       → businessDesign, solutionDesign, implementationDesign, testDesign
     solutionDesign       → solutionDesign, implementationDesign, testDesign
     implementationDesign → implementationDesign, testDesign
     testDesign           → testDesign
   目标 <stage> 必须在范围内（否则抛错）。
3. 对目标 + 固定下游每个阶段：
   a. 读当前 work/<stage>/draft.md 的 frontmatter version，bump minor（0.1.0→0.2.0），写回 frontmatter（正文不动；hash 因 version 改变而变）。
   b. 清 state.stages[stage].baseline（删除该字段）。
   c. 重置 work/<stage>/progress.json：ready.analysis=false, ready.discovery=false, step='analyze'。
   d. integratedDesign 特殊：无 progress.json，只 bump draft version + 清 baseline。
4. 在 Review Matrix 的目标阶段 entry 写一条 design-change blocking issue：
   { type:'blocking', reviewerAgent:'design-change', status:'open',
     round:<entry 当前 max round + 1>,
     source:'<slug>@<newVersion>:design-change:<decisionId>',
     humanDecision:'pending', closureEvidence:'',
     note: decision.summary }
   并把 entry.draftRef 设为该阶段 bump 后的新 draft hash（让 inspect 看到当前 draft 有 open blocking）。
5. task status 保持 designing；不推进 design_ready。
6. 返回 { reopenedStages, newVersions: { <stage>: <newVersion> } }。
```

### 3.1 主会话 reopen 后的流程

```text
reopen <目标 stage> <decisionId>
→ 主会话按 design_change 的 reason/impact 判断变更规模，用 mark-ready 快进：
   小改（局部 draft）: mark-ready analysis && mark-ready discovery → inspect 路由 design
   中（需重查 discover）: mark-ready analysis → 从 discover 起
   大（目标范围变）: 不动 ready → 从 analyze 重来
→ inspect 看到 design-change blocking（绑当前 draft hash）→ run_stage/revise(reason: design change)
→ 主会话改 draft（基于 design_change decision）→ hash 变
→ record-gate（新 hash）→ record-review（多视角，附 closureDecisions 关闭 design-change blocking，见 §3.2）
→ inspect: blocking 已关 + Gate/Review 通过 → baseline
→ 下游阶段顺序重做（各自从保守起点 analyze 开始，主会话按需快进）
→ 四阶段 + integrated 重新 baseline → design_ready
```

### 3.2 design-change blocking 的关闭（B3-6）

design-change blocking 绑 reopen 时的新 draft hash。主会话改 draft 后 hash 又变。关闭机制：**主会话在首次 revise 后的 `record-review` 调用里，通过 `closureDecisions` 显式关闭该 blocking**——声明"design change 已在 draft 体现"。

```json
{ "issueId": "<design-change blocking 的 issueId>",
  "status": "closed",
  "closureEvidence": "design change <decisionId> 已在 draft §X 体现" }
```

- 由主会话（而非 Review Subagent）在 record-review 时附上，因为 design-change blocking 不是评审 finding，是流程性 blocking。
- 关闭后 + 新 hash 通过 Gate/Review → inspect baseline。
- 不采用"draft 改动即自动失效"，因为那样无法强制主会话确认变更已落地。

## 4. 旧机制清理计划（B3-7/B3-8/B3-9）

核心约束：**先解开耦合，再删文件**，保证删完不影响新流程。

### 4.1 解开 `feature-workflow.js` 对旧脚本的依赖

现状：`resolveDesigning`（status='designing' 分支，被 `workflow` skill 调用）`require` 了 `feature-design-router`（stageToArtifact）和 `devsphere-review-state`（readArtifactVersion/getReviewStatus）。

改动：
- 新流程下，设计阶段的一切由 `feature-design` skill 自驱（读 current-stage→inspect）。`resolveDesigning` 改为**只返回 `run_skill: feature-design`**（无 router 调用）。
- 删 `resolveDesigning` 内部对 router/review-state 的全部引用与旧分支逻辑。
- `stageToArtifact` 若别处仍用，换为 `devsphere-design.js` 的 `STAGE_SLUG`。
- 保留 `set-task-status`、`sync-stage-status` 等被 Batch 1/2 使用的命令不动。

### 4.2 解开 `review-matrix ↔ review-state` 循环依赖

现状：`devsphere-review-matrix.js` 在合并/校验路径 `require('./devsphere-review-state')` 用 `readArtifactVersion`/`getReviewStatus`（line 220-244）。

改动：
- `readArtifactVersion(taskPath, artifact)`（读 artifact frontmatter version）→ 改用 `devsphere-design.js` 的 `parseDraftFrontmatter`（读 `artifacts/<slug>.md` 的 version），或直接内联。
- `getReviewStatus`（旧角色快照状态）→ 新流程不用角色快照；确认 matrix 中调用点（line 222）能否移除。若 `setArtifactStatus` 的"所有 reviewer 完成"判定依赖它，改为基于 `entry.draftRef` + `requiredReviewers` + 已合并 snapshots 的简单判定，或由 `record-review` 的 stamp 直接决定（record-review 已 stamp status='reviewed'）。
- 解开后 review-matrix 不再 require review-state。

### 4.3 删除旧脚本 + skill + 测试

- `scripts/feature-design-router.js` + `scripts/test/feature-design-router.test.js`
- `scripts/devsphere-dispatch.js` + `scripts/test/devsphere-dispatch.test.js`
- `scripts/devsphere-review-state.js` + `scripts/test/devsphere-review-state.test.js`
- `skills/devsphere-teammate-conduct/`（整个目录）
- `scripts/test/feature-workflow-decisions.test.js`、`scripts/test/devsphere-guard-decisions.test.js`：reconcile 或删其中绑定旧机制的断言（按实际内容定；不削弱对 decisions schema 的契约校验测试）。

### 4.4 guard + hooks 清理（B3-8）

- `hooks/hooks.json`：删 `check-teammate-decisions`（TeammateIdle hook）整条。
- `scripts/devsphere-guard.js`：删 `check-teammate-decisions` case；`check-review-writes`/`check-review-bash` 的提示文案把 "devsphere-review-state.js complete" 改为 "record-review CLI"（新流程评审写入入口）；其余 guard（decisions-resolved/format/bash、evidence-writes/bash、clarify-checklist）保留。

### 4.5 stage skills + agents + CLAUDE.md（B3-9）

- 四个 stage skills：删 teammate-conduct 否定句（旧机制已删，否定句无意义）。
- `agents/*.md`：清"你是…Agent"身份、`skills:` frontmatter 里的 `devsphere-teammate-conduct`、设计所有权段（"你拥有 artifacts/..."）；保留"设计评审"段（review profile 来源）。`feature-design-solution` 等 skill 引用若残留，确认是否仍需。
- `CLAUDE.md`：
  - §93-101（设计阶段决策循环）重写为 lifecycle 模型：feature-design 读 current-stage→inspect→按 nextAction 执行；主会话推演；无 Agent Team、无 teammate、无 router。
  - §140（feature-design sub-orchestrator）改为"生命周期入口"。
  - §171（agents 定义）改为"agents/*.md 为 review checklist 来源，默认流程不创建 Agent"。
  - `### Agent invocation` 段同步更新。

## 5. 实现顺序（任务序）

1. `design_change` type（VALID_TYPES + 校验 reason/impact）+ 单元测试。
2. `reopen` 命令（bump version、清 baseline、重置 ready、写 design-change blocking）+ 单元测试。
3. reopen E2E（基线→design_change→批准→reopen→主会话快进→revise 关闭 blocking→重 Gate/Review→重 baseline→下游重做→design_ready）。
4. 解开 feature-workflow.resolveDesigning + review-matrix 循环依赖。
5. 删 router/dispatch/review-state/teammate-conduct + 旧测试 + guard/hooks 清理。
6. 清 stage skills 否定句 + agents/*.md + CLAUDE.md 重写。
7. 全套回归 + grep 验证清理干净。

## 6. 验收

### 6.1 design_change + reopen

- 基线后写 design_change decision（pending）→ 用户批准（resolve apply）→ reopen：
  - 目标 + 固定下游的 draft version bump（minor）、baseline 清除、progress.ready 重置、matrix 写 design-change blocking。
- 主会话判断起点 mark-ready 快进 → revise（关 design-change blocking）→ Gate → Review → 重新 baseline。
- 下游阶段顺序重做 → integrated → design_ready。
- version 递增正确（0.1.0→0.2.0）；旧 Gate/Review 因 hash 变自动失效。

### 6.2 清理

- 删完后全套测试绿。
- `grep -rln "feature-design-router\|devsphere-dispatch\|devsphere-review-state\|devsphere-teammate-conduct"` 在 `skills/`/`scripts/`/`hooks/`/`agents/`/`CLAUDE.md` 无命中（git 历史除外）。
- feature-workflow designing 分支仍能返回 run_skill: feature-design（workflow skill 正常进入设计阶段）。
- guard/hooks 正常工作（decisions/evidence/clarify 守卫不变；teammate 守卫已删）。

### 6.3 整体

- 不启用 Agent Teams；插件验证通过。
- 新任务从 init 走到 design_ready 全程不依赖旧机制。

## 7. 非目标

- 不做字段级影响分析、stale 状态、失效豁免、自动影响推断（固定下游表足够）。
- 不重构 feature-init/clarify/assess/implement/verify。
- 不引入 Work Iteration 概念（基线后重开直接覆盖 work）。
- 不清理历史 git 记录中的旧机制引用。
