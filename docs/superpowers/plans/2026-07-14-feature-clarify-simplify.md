# Feature Clarify 精简 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `skills/feature-clarify/SKILL.md` 从 244 行精简至 ~180 行，删除「硬规则」独立章节，内容融入对应阶段，压缩冗余措辞。

**Architecture:** 单文件全文替换。阶段5、阶段6、文件结构模板、完成判断原则保持原样不动。

**Tech Stack:** Markdown

## Global Constraints

- 所有功能逻辑、完成条件、状态推进、文件产出与原版完全一致
- 9 条模糊点识别规则、三种提问模式表格、回答后四步处理、情况一/二引用示例全部保留
- 阶段5、阶段6、文件结构模板、完成判断原则原文不动
- skill-contracts 测试必须通过

---

### Task 1: 重写 SKILL.md（精简版）

**Files:**
- Modify: `skills/feature-clarify/SKILL.md`（全文替换）

**Interfaces:**
- Consumes: 无（单文件改动）
- Produces: 精简版 SKILL.md（~180 行）
- Verifies: `node scripts/test/skill-contracts.test.js`

- [ ] **Step 1: 用以下完整内容替换 `skills/feature-clarify/SKILL.md`**

```markdown
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

通过 `Agent` 工具派发一次性子 Agent，加载 `scc-dev-sphere:knowledge-query` skill 进行查询，查询聚焦当前单一模糊点。每次均为新的 `general-purpose` Task。

> 查询 Claude Code 和 Codex 是否支持运行时创建具有不同工具约束的 Agent，用于判断跨平台自定义 Agent 能力的需求边界。

等待 EV/gap 返回后决定下一步。返回 gap 时判断用户是否可提供该信息，不能只写入 gap 跳过。

**情况三：需要用户信息**

直接向用户提问，每次一个。说明为什么问。

| 模式 | 用途 | 示例 |
|------|------|------|
| 探索型 | 发现真实目标、痛点 | "目前如何完成？最耗时的步骤？" — 开放式，无预设选项 |
| 决策型 | 明确取舍 | "更关注自由讨论还是收敛结果？前者适合探索，后者适合任务交付。" — 2-3 候选项 |
| 确认型 | 确认推断 | "Skill 自进化是从成功任务中沉淀，发布前仍需人工审核，对吗？" — 有推荐时才展示 |

Agent 内部判断功能/技术/设计边界，不要求用户选择需求类型。

### 3c. 用户回答后处理

每次回答后必须：① 提取结论 ② 更新当前 ambiguity 的 status 和 resolution ③ 识别是否产生新模糊点 ④ 回到 3a 重新选择。禁止直接进入预设的下一个问题。

示例：用户回答"Agent 自由讨论，但协调者收敛结论" → AMB-003 resolved + 生新模糊点 AMB-006「协调者由谁指定」。

### 3d. 循环终止 → 阶段5

核心模糊点全部 resolved 且挖不出新的时退出。低影响 open 项标 `deferred`（附延后原因）带至阶段6。凡影响用户可见行为、数据一致性、安全性者不得 deferred。

每次回答后更新需求理解（原阶段4，已于循环中完成）。

## 阶段5：核心场景完整性检查

使用六维度作为结束前 checklist，逐一确认：

- **businessGoal** — 核心业务目标是否明确？
- **usersAndScenarios** — 用户和主要使用场景是否清晰？能否完整描述至少一条核心用户旅程？
- **functionalScope** — 核心功能范围和非目标是否明确？
- **nonGoalsAndBoundaries** — 明确不做什么？
- **acceptanceCriteria** — 验收条件是否可验证？
- **constraintsAndRisks** — 关键业务规则和约束是否已识别？

六维度**只用于完整性检查，不决定提问顺序**。发现遗漏时回到阶段3补充处理。

## 阶段6：汇总确认与状态推进

1. **组织需求汇总**（将写入 `inputs/requirement.md`）：
   - 原始需求（保持不动）
   - 已确认的需求结论（按需求内容自然组织，不强制按六维度列表排列）
   - 关键技术约束（Agent 内部判断的技术契约，不区分 functional/technical/mixed 标签）
   - 验收标准
   - 知识证据缺口（如有）
   - 最终确认

2. **列出 deferred 模糊点**：向用户展示所有 `deferred` 项及延后原因，请用户评审确认是否接受带入设计阶段。

3. **写入文件**：
   - 将确认后的结论写入 `inputs/requirement.md`（**追加**到原始需求下方，**永不覆盖原始需求**）
   - 将问答过程、决策转折和来源标注写入 `inputs/clarification-log.md`（独立审计 trail）
   - 确保 `ambiguity-backlog.json` 中无 `open` 项残留

4. **用户最终确认**：用 `confirm_gate` 展示汇总，请求最终确认。

5. **状态推进**：
```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js set-task-status <workspaceRoot> clarified
```

## `inputs/requirement.md` 追加结构

```text
# 原始需求
<feature-init 写入的文本，不可修改>

# 需求澄清
## 需求结论         （按需求内容自然组织，不强制六维度列表；每条带来源与确认时间）
## 技术约束         （Agent 内部判断的关键技术约束，不适用则省略）
## 验收标准         （可验证的验收条件）
## 知识证据缺口     （如有；主题、status、reliability、用户结论）
## 最终确认         （用户最终确认时间）
```

## `inputs/clarification-log.md` 结构

独立记录澄清过程，与 requirement.md 分离：

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

全部满足后才展示汇总并用 `confirm_gate` 请求最终确认：

- 核心业务目标明确
- 目标用户和主要使用场景明确
- 可完整描述至少一条核心用户旅程
- 核心功能范围和非目标基本明确
- 关键业务规则和约束已识别
- 验收条件可验证
- `ambiguity-backlog.json` 中无 `open` 状态的核心模糊点
- 用户确认需求汇总符合真实意图

低影响 `deferred` 项允许带到设计阶段，但需在阶段6向用户展示并获评审确认。任一核心条件不满足则继续澄清，不得推进状态。

确认后记录「最终确认」时间，并执行状态推进。
```

- [ ] **Step 2: 运行契约测试验证**

```bash
node scripts/test/skill-contracts.test.js
```

预期：全部通过，0 失败。

- [ ] **Step 3: 确认行数**

```bash
wc -l skills/feature-clarify/SKILL.md
```

- [ ] **Step 4: 提交**

```bash
git add skills/feature-clarify/SKILL.md
git commit -m "refactor(feature-clarify): simplify by removing redundant hard-rules section

- Delete standalone 硬规则 chapter; merge rules into relevant stages
- Merge 阶段4 into 阶段3d (one-line closure)
- Compress 阶段0, 阶段1, 阶段3a/3b/3c wording
- Preserve 阶段5, 阶段6, file templates, 完成判断原则 unchanged
- Reduce from 244 to ~180 lines"
```
