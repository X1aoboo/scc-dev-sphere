---
name: feature-clarify
description: 在主会话中以歧义驱动方式动态澄清 feature 需求，持续追踪模糊点直到核心需求足以支撑后续设计。
---

# Feature Clarify — 需求澄清

围绕当前最关键的需求模糊点，动态决定分析、查询知识或询问用户，直到核心需求足以支撑后续设计。

## 阶段0：前置检查与恢复

`state.status !== 'initialized'` 时停止。启动时读取：
- `inputs/requirement.md` — 原始需求
- `evidence/evidence-registry.json` + `evidence/knowledge/EV-*.md` — 已确认证据
- `inputs/ambiguity-backlog.json` — 存在则恢复，缺失则初始化为 `{"ambiguities": []}`

## 阶段1：建立初始需求理解

分析原始需求（不写入文件），识别：明确提出了什么、Agent 的关键推断、当前缺口。此分析驱动阶段2。

需求涉及明显陌生领域时，可执行一次轻量知识查询（单一查询，不超过 2 个子问题）；已能识别核心模糊点时直接进入阶段2。

## 阶段2：生成模糊点清单

从以下方面识别模糊点，写入 `inputs/ambiguity-backlog.json`：

- 目标不明确 — 核心业务目标和成功标准是什么
- 术语存在多义 — 关键术语有无多种理解
- 用户角色和场景缺失 — 谁在什么情况下使用
- 业务流程不完整 — 主要流程的起点、终点和关键步骤
- 功能边界冲突 — 不同功能之间是否存在矛盾
- 规则和异常路径缺失 — 边界条件和失败路径
- 验收不可验证 — 如何判断需求已满足
- 外部依赖或约束未知 — 平台、系统、环境限制
- 用户前后陈述可能冲突

**`inputs/ambiguity-backlog.json` 结构：**

```json
{
  "ambiguities": [
    {
      "id": "AMB-001",
      "issue": "核心价值的清晰描述",
      "impact": "影响什么决策或设计方向",
      "status": "open",
      "resolution": null
    }
  ]
}
```

仅五个字段：`id`（`AMB-` 前缀 + 三位数字序号）、`issue`（一句话描述模糊点）、`impact`（为什么重要）、`status`（`open` | `resolved` | `deferred`）、`resolution`（status 非 open 时的最终结论）。

六维度（businessGoal / usersAndScenarios / functionalScope / nonGoalsAndBoundaries / acceptanceCriteria / constraintsAndRisks）可用于**辅助检查遗漏**，但不能直接转化成固定问题列表。

## 阶段3：动态处理模糊点

**循环执行，直到核心模糊点全部解决：**

### 3a. 选择当前最关键模糊点

从 `status: "open"` 中选择。优先：影响核心目标、产品定位和主场景 → 阻塞多个后续判断 → 错判后大范围返工。暂不处理实现细节或低影响问题。

### 3b. 判断信息获取方式

**情况一：已有信息足够形成高置信度推断**

使用确认型问题，向用户确认理解是否正确。如：

> 根据前面的信息，我理解你更关注最终稳定产出交付物，而不是展示多个 Agent 的讨论过程，这个理解是否正确？

不得未经确认将关键推断写入需求事实。

**情况二：缺少外部知识**

通过 `Agent` 工具派发一次性子 Agent，加载 `scc-dev-sphere:knowledge-query` skill 进行查询，查询聚焦当前单一模糊点。每次均为新的 `general-purpose` Task。**MUST NOT directly query the knowledge base in the main session — MUST dispatch a one-shot `knowledge-query` subagent. MUST NOT reuse agent IDs, MUST NOT use teammate. MUST wait for the structured EV/gap result.**

> 查询 Claude Code 和 Codex 是否支持运行时创建具有不同工具约束的 Agent，用于判断跨平台自定义 Agent 能力的需求边界。

等待 EV/gap 返回后决定下一步。返回 gap 时判断用户是否可提供该信息，不能只写入 gap 跳过。

**情况三：需要用户信息**

直接向用户提问，每次一个。说明为什么问。

| 模式 | 用途 | 示例 |
|------|------|------|
| 探索型 | 发现真实目标、痛点 | "目前如何完成？最耗时的步骤？" — 开放式，无预设选项 |
| 决策型 | 明确取舍 | "更关注自由讨论还是收敛结果？前者适合探索，后者适合任务交付。" — 2-3 候选项 |
| 确认型 | 确认推断 | "Skill 自进化是从成功任务中沉淀，发布前仍需人工审核，对吗？" — 有推荐时才展示 |

不再要求用户选择需求类型（functional/technical/mixed）。Agent 内部判断哪些属于需求、哪些属于技术约束、哪些应延后到设计阶段。

### 3c. 用户回答后处理

每次回答后必须：① 提取结论 ② 更新当前 ambiguity 的 status 和 resolution ③ 识别是否产生新模糊点 ④ 追加写入 `inputs/clarification-log.md`（问答、结论、来源标注）⑤ 回到 3a 重新选择。禁止直接进入预设的下一个问题。

示例：用户回答"Agent 自由讨论，但协调者收敛结论" → AMB-003 resolved + 生新模糊点 AMB-006「协调者由谁指定」。

### 3d. 循环终止

核心模糊点全部 resolved 且挖不出新的时退出循环，进入阶段5。低影响 open 项标 `deferred`（附延后原因）带至阶段6。凡影响用户可见行为、数据一致性、安全性者不得 deferred。

每次回答后更新需求理解。评审循环（阶段7）返回时，从此处重新进入，仅处理 fail 项关联的模糊点。

## 阶段5：核心场景完整性检查

使用六维度作为结束前 checklist，逐一确认：

- **businessGoal** — 核心业务目标是否明确？
- **usersAndScenarios** — 用户和主要使用场景是否清晰？能否完整描述至少一条核心用户旅程？
- **functionalScope** — 核心功能范围和非目标是否明确？
- **nonGoalsAndBoundaries** — 明确不做什么？
- **acceptanceCriteria** — 验收条件是否可验证？
- **constraintsAndRisks** — 关键业务规则和约束是否已识别？

六维度**只用于完整性检查，不决定提问顺序**。发现遗漏时回到阶段3补充处理。

## 阶段6：按模板写入需求文档

1. 读取 `skills/feature-clarify/requirement.md` 模板，按 11 章节结构组织需求汇总，写入 `inputs/requirement.md`（**追加**到原始需求下方，**永不覆盖原始需求**）。未明确项保留待补充标记，评审循环中逐步填充。

2. 列出所有 `deferred` 模糊点及延后原因，请用户评审确认是否接受带入设计阶段。

## 阶段7：评审循环

### 7a. 初始化评审清单

基于 `skills/feature-clarify/checklist.md` 的检查项，初始化 `reviews/clarify-checklist.json`。所有项初始 `result: "fail"`。

```json
{
  "reviewVersion": 1,
  "status": "in_progress",
  "categories": [
    {
      "id": "7.1",
      "name": "目标与用户",
      "items": [
        {"id": "7.1.1", "check": "已说明本需求要解决的核心问题", "result": "fail", "note": ""}
      ]
    }
  ]
}
```

### 7b. 派发评审子 Agent

通过 `Agent` 工具派发一次性子 Agent（`general-purpose` Task，每次新 Agent），携带以下 instruction：

> 你是一位需求评审专家。请对照评审清单，逐项检查 `inputs/requirement.md` 的需求质量。
>
> **评审规则：**
> 1. 读取 `reviews/clarify-checklist.json`，对所有 `result: "fail"` 的项进行复检（首轮全量检查）。
> 2. 逐项对照 requirement.md 内容判断：**pass** — 有明确可验证内容，注明 evidence（如 §2.1）；**fail** — 缺少或模糊，注明缺失点。
> 3. 判断依据：只依据文档实际内容；核心功能必须有行为和结果描述；验收标准必须可操作判断；不得出现「友好、快速、待定、可能」等不可验证措辞；Agent 推断未获用户确认的不得视为需求事实。
> 4. 更新 checklist JSON 后返回 `{passed, failed, summary}`。
>
> **禁止：** 修改 requirement.md、调用 AskUserQuestion、根据自身知识补充需求内容。

### 7c. 处理评审结果

轮次（reviewVersion）≤ `state.designRevisionLimit`（默认 25）：
- 全部 pass → 关闭循环，进入阶段8
- 有 fail → 回到阶段3 补充澄清（仅处理 fail 项关联模糊点）→ 更新 `inputs/requirement.md` → `reviewVersion` 递增 → 回到 7b

达到上限仍有 fail → 剩余 fail 项带至阶段8，向用户说明后由用户裁决。

## 阶段8：最终确认与状态推进

1. 展示需求汇总，用 `confirm_gate` 请求最终确认。

2. 确认后执行状态推进：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status <workspaceRoot> clarified
```

## `inputs/clarification-log.md` 结构

阶段3 每次用户回答后追加写入，与 requirement.md 分离：

```text
# 澄清记录

## [时间戳] 问题主题
- **涉及方面:** 需求领域
- **问题:** 向用户提出的问题
- **推荐与理由:** 如有推荐结论及理由
- **候选及来源:** 提供的选项及来源标注
- **用户回答:** 用户的选择或输入
- **结论:** 确认后的需求结论

## [时间戳] 下一个问题主题
...
```

## 完成判断原则

阶段7 全部 pass 且以下满足后，进入阶段8：

- 核心业务目标明确
- 目标用户和主要使用场景明确
- 可完整描述至少一条核心用户旅程
- 核心功能范围和非目标基本明确
- 关键业务规则和约束已识别
- 验收条件可验证
- `ambiguity-backlog.json` 中无 `open` 状态的核心模糊点
- `reviews/clarify-checklist.json` 全部 pass
- 用户确认需求汇总符合真实意图

低影响 `deferred` 项允许带到设计阶段。任一核心条件不满足则继续澄清。
