# Feature Design 重构：产物、基线与设计变更模型

## 1. 文档状态

- 设计阶段：阶段四
- 状态：已对齐
- 前置约束：[01-goals-and-scope.md](./01-goals-and-scope.md)
- 生命周期：[02-design-lifecycle.md](./02-design-lifecycle.md)
- 职责模型：[03-responsibility-model.md](./03-responsibility-model.md)

## 2. 设计目标

产物模型只服务两个目标：

1. 持久化当前流程位置和必要检查结果，使设计中断后可以恢复；
2. 保存形成设计过程中有价值的分析、发现和取舍，需求完成后可提炼到团队私域知识库。

第一版不建设独立 Baseline 仓库、通用 Change Request 系统、Subagent 作业档案或完整设计版本管理系统。

## 3. 核心边界

```text
State
→ 记录设计进行到哪里

Work
→ 记录设计如何形成，以及待发布设计是什么

Artifact
→ 保存已经批准并发布的正式设计
```

`work/` 是当前任务内部工作区，`artifacts/` 是对外发布区。外部任务和下游流程只能消费 `artifacts/`，不得把 `work/` 作为正式设计输入。

## 4. 精简目录结构

```text
<taskPath>/
├── inputs/
│   └── requirement.md
├── work/
│   ├── business-design/
│   │   ├── analysis.md
│   │   ├── discovery.md
│   │   ├── design.md
│   │   └── draft.md
│   ├── solution-design/
│   │   ├── analysis.md
│   │   ├── discovery.md
│   │   ├── design.md
│   │   └── draft.md
│   ├── implementation-design/
│   │   ├── analysis.md
│   │   ├── discovery.md
│   │   ├── design.md
│   │   └── draft.md
│   ├── test-design/
│   │   ├── analysis.md
│   │   ├── discovery.md
│   │   ├── design.md
│   │   └── draft.md
│   └── integrated-design/
│       └── draft.md
├── evidence/
├── decisions/
├── artifacts/
│   ├── business-design.md
│   ├── solution-design.md
│   ├── implementation-design.md
│   ├── test-design.md
│   └── integrated-design.md
├── quality-gates/
├── reviews/
│   └── review-matrix.json
├── approvals/
└── state.json
```

相对现有结构只新增 `work/`。不新增 `baselines/`、`changes/`、`work/jobs/`、单独 assumption/revision 目录或 Agent 状态目录。

## 5. Work 文件职责

每个设计环节固定四份 Work 文件，不继续按角色、评审轮次或 Subagent 拆分。

### 5.1 `analysis.md`

回答“当前阶段要解决什么问题，以及接下来需要调查什么”。

包含：

- 阶段目标；
- 上游输入摘要；
- 初步理解；
- 范围和边界；
- 关键问题和未知项；
- 调查计划；
- 待用户确认事项。

不包含大段查询结果和正式设计文档内容。

### 5.2 `discovery.md`

回答“查到了什么，这些信息对设计意味着什么”。

包含：

- 调查项和查询范围；
- 关键发现；
- evidence 引用；
- 现状约束；
- 冲突信息和未知项；
- 对设计的影响。

原始事实保存在 `evidence/`，本文件只保存综合结论和引用，不复制大段知识或源码。

### 5.3 `design.md`

回答“为什么形成当前方案”。

包含：

- 候选方案和比较；
- 关键取舍；
- 设计推演；
- 被拒绝方案；
- 约束如何影响设计；
- 评审问题引发的设计调整；
- 与 decision/evidence 的关联；
- 对 Draft 各部分的设计输入。

它不要求严格符合最终 Artifact 模板，也不对外提供。

### 5.4 `draft.md`

回答“如果现在批准，正式发布的设计文档是什么”。

Draft 必须：

- 完整符合对应 Artifact 模板；
- 不包含内部讨论过程；
- 不包含未收敛的候选方案；
- 不包含占位符或写作提示；
- 引用关键 evidence 和 decision；
- 可原样复制为正式 Artifact；
- 作为 Gate、Review 和 Approval 的唯一正式检查对象。

## 6. Work Iteration

Work 保存整个设计任务必要的过程信息。首次设计和有实质影响的设计变更使用 iteration 区分。

需要新 iteration 的情况：

- 用户目标或范围变化；
- 新 evidence 推翻原判断；
- 关键方案取舍变化；
- 已 Baseline 设计重新打开；
- 上游重新 Baseline 导致下游返工。

排版、错别字和不改变设计含义的修正不创建 iteration。

`analysis.md`、`discovery.md`、`design.md` 可以按 iteration 保留必要过程；`draft.md` 始终只保存当前待发布候选，不在同一文件中累计旧 Draft。

第一版不设计 Work 归档或自动清理机制。

## 7. Draft 与 Artifact 的发布关系

Draft 是候选发布内容，Artifact 是当前正式基线：

| 文件 | 内部工作使用 | 外部任务可读 | Gate/Review 目标 |
|---|---:|---:|---:|
| `analysis.md` | 是 | 否 | 否 |
| `discovery.md` | 是 | 否 | 否 |
| `design.md` | 是 | 否 | 仅辅助读取 |
| `draft.md` | 是 | 否 | 是 |
| `artifacts/*.md` | 否 | 是 | 否 |

Artifact 在 Baseline 前保持旧版本不变；未发布 Draft 不影响外部任务。

## 8. Draft Reference

Gate、Review 和 Approval 统一绑定 Draft：

```json
{
  "artifactId": "SD-FEAT-001",
  "version": "0.2.0",
  "hash": "sha256:..."
}
```

Draft 直接使用最终 Artifact frontmatter：

```yaml
---
artifactId: "SD-FEAT-001"
version: "0.2.0"
---
```

不在 Draft frontmatter 写入 `status: draft` 或 `externalConsumable: false`，避免 Baseline 时修改内容。候选与正式状态由路径和 `state.json` 判断。

同一 Baseline 轮次内的 Draft 修订保持目标 version 不变；内容变化通过 hash 使旧 Gate、Review 和 Approval 自动失效。只有基线后开始新一轮设计变更时才递增目标 version。

## 9. Gate 模型

每个设计目标只保留一个当前 Gate 文件，例如：

```text
quality-gates/business-design.json
quality-gates/solution-design.json
quality-gates/implementation-design.json
quality-gates/test-design.json
quality-gates/integrated-design.json
```

Template Check 和 Quality Check 仍按顺序执行，但合并写入同一结果：

```json
{
  "draftRef": {
    "artifactId": "SD-FEAT-001",
    "version": "0.2.0",
    "hash": "sha256:..."
  },
  "templateChecks": [],
  "qualityChecks": [],
  "status": "pass | warn | fail | requires_human"
}
```

第一版只保留当前 Draft 的 Gate 结果，不保留每次检查历史。Draft hash 改变后旧 Gate 自动失效。

## 10. Review 模型

每个 Draft 默认执行一个综合 Review Job。Review 可以读取 analysis、discovery、design、evidence、decisions 和上游 Artifact 作为依据，但所有 finding 必须指向 Draft，正式 blocking 只能通过修改 Draft 关闭。

Review Job 返回结构化 findings，由主会话调用脚本顺序合并到：

```text
reviews/review-matrix.json
```

第一版不再默认维护：

- 每角色 Reviewer 快照；
- Reviewer Markdown 历史；
- authorize/complete/wait/merge 协调阶段；
- 多 Reviewer 并发合并。

Review Matrix 每个目标至少保存：

```json
{
  "draftRef": {},
  "status": "pending | reviewed",
  "issues": []
}
```

命中明确专项风险时可以顺序追加专项 Review Job，并合并到同一 Matrix。不同专业视角由综合或专项 review profile 表达，不要求长期角色 Agent。

Draft hash 改变后，旧 Review 自动失效，必须重新执行 Gate 和 Review。

## 11. Baseline 是纯发布动作

Baseline 不生成、重写或总结设计，只发布已通过检查的 Draft：

```text
校验 Draft
→ 原样复制到 Artifact
→ 验证复制后的 hash
→ 更新 state baseline ref
```

具体步骤：

1. 读取 Draft 的 artifactId、version 和 hash。
2. 校验 Gate 绑定同一 Draft hash 且结果可接受。
3. 校验 Review Matrix 绑定同一 Draft hash 且问题已闭合。
4. 校验所需用户批准绑定同一 Draft hash。
5. 原样复制 Draft 到对应 Artifact。
6. 验证 Artifact hash 与 Draft hash 完全一致。
7. 更新 `state.json` 中的 Baseline 信息。
8. 推进下一设计环节。

通过条件：

```text
hash(draft.md) == hash(artifacts/<stage>-design.md)
```

Baseline 阶段如果还需要修改文档，必须返回 Revise，不能在发布过程中修改。

## 12. 最小状态持久化

`state.json` 保存任务级状态、当前设计游标和各阶段 Baseline ref：

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

`designCursor.step` 只允许：

```text
analyze | discover | design | validate | review | baseline
```

`decision_pending`、`revision_required`、`blocked` 仍由持久化事实派生，不进入游标。

恢复流程：

```text
读取 designCursor
→ 加载当前 stage 对应 Work
→ 读取 pending decisions、Gate 和 Review Matrix
→ Router 校验并重新计算 nextAction
→ 继续执行
```

Cursor 是恢复提示而不是唯一事实来源。Cursor 与文件事实冲突时，由 Router 采用文件事实并修正 Cursor。

## 13. 基线后设计变更

第一版不建立独立 Change Record，复用 stage decision：

```json
{
  "id": "SD-DEC-008",
  "type": "design_change",
  "status": "decided",
  "summary": "调整查询接口为异步任务",
  "reason": "同步请求无法满足数据规模要求",
  "impact": "implementationDesign,testDesign",
  "resolution": {
    "chosen": "apply"
  }
}
```

### 13.1 基线前变化

基线前变化是普通 Revise：修改 Draft，Draft hash 改变，重新 Gate 和 Review。除非涉及关键取舍，否则不新增 design change decision。

### 13.2 基线后变化

```text
创建 design_change decision
→ 分析影响
→ 用户确认
```

拒绝时不修改 Artifact。

批准后：

1. 从当前 Artifact 创建下一版本 Draft。
2. 在 analysis/discovery/design 中增加必要 iteration。
3. 按固定影响范围重开目标和下游阶段。
4. 在 Review Matrix 中写入来源为 design change 的 blocking revision item。
5. 依次完成 Revise、Gate、Review、Baseline。

固定重开范围：

| 变化阶段 | 重开阶段 |
|---|---|
| business | business、solution、implementation、test |
| solution | solution、implementation、test |
| implementation | implementation、test |
| test | test |

第一版不引入 `stale` 状态、递归依赖算法、字段级影响分析、失效豁免或独立 Change 状态机。

## 14. Integrated Design

Integrated Design 不引入新设计事实，第一版只保留：

```text
work/integrated-design/draft.md
```

流程：

```text
四阶段 Baseline
→ 生成 Integrated Draft
→ Integrated Gate
→ 必要时定向专项 Review
→ Final Approval
→ 原样复制到 artifacts/integrated-design.md
→ design_ready
```

默认不重复完整多角色评审。Integrated Gate 发现跨阶段 blocking 时返回对应阶段修订；只有无法判断的具体专业冲突才按需派发专项 Review Job。

## 15. 知识提炼输入

需求设计开发完成后，从现有产物提炼知识候选：

```text
analysis.md
+ discovery.md
+ design.md
+ evidence
+ decisions
+ final artifacts
+ 已关闭 review issues
        ↓
知识候选提炼
        ↓
人工确认
        ↓
团队私域知识库
```

适合提炼的内容包括：

- 被验证的存量系统事实；
- 可复用业务规则；
- 架构约束和代码模式；
- 候选方案及取舍理由；
- 被拒绝方案及不适用条件；
- 评审中反复出现的问题；
- 已接受风险及适用边界。

本次重构只提供可靠输入，不新增另一套知识库或知识归档工作流。

## 16. 已确认决策

1. 每个设计环节固定保存 `analysis.md`、`discovery.md`、`design.md`、`draft.md`。
2. Draft 完整符合最终 Artifact 模板。
3. 所有 Gate、Review 和 Approval 都绑定 Draft 的 version 和 hash。
4. Baseline 只负责将 Draft 原样复制到 Artifact，并验证 hash 一致。
5. Artifact 永远只表示当前正式基线，外部任务不得读取 Work。
6. 同一 Baseline 轮次内 Draft 修订不递增 version，只通过 hash 使旧 Gate/Review 失效。
7. 基线后变更从当前 Artifact 创建下一版本 Draft，批准前不影响当前 Artifact。
8. Integrated Design 第一版只保留 `work/integrated-design/draft.md`，批准后发布到 Artifact。
9. 不新增 Baseline、Change、Job 历史目录；状态、知识输入和检查结果复用现有文件体系。
