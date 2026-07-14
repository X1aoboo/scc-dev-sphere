# Feature Clarify 歧义驱动优化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 feature-clarify SKILL.md 从固定六维度逐项提问改为歧义驱动的动态循环，新增 ambiguity-backlog.json 和 clarification-log.md 两个运行时产物。

**Architecture:** 单文件改动（`skills/feature-clarify/SKILL.md`），无新脚本、无新 router、无新状态机。两个新 JSON/MD 文件由 skill 运行时按需创建，不需要模板文件。保留现有状态推进（`feature-workflow.js set-task-status clarified`）、证据记录（`evidence-registry.json`）和 knowledge-query 子 Agent 的不变式。

**Tech Stack:** Markdown（SKILL.md），JSON（ambiguity-backlog.json），无代码依赖。

## Global Constraints

- 不引入新脚本、新 router、新状态机、新评分体系
- knowledge-query 子 Agent 不变式保留：每次新 Agent、不复用 ID、不使用 teammate、禁用 AskUserQuestion
- 状态推进唯一入口：`feature-workflow.js set-task-status clarified`
- `inputs/requirement.md` 永不覆盖原始需求
- 所有结论必须带来源标注，候选推断不伪装为最终事实

---

### Task 1: 重写 feature-clarify/SKILL.md

**Files:**
- Modify: `skills/feature-clarify/SKILL.md`（全文替换）

**Interfaces:**
- Consumes: `state.json`（status 校验）、`inputs/requirement.md`（原始需求）、`evidence/evidence-registry.json`（证据恢复）
- Produces: `inputs/requirement.md`（追加澄清结论）、`inputs/ambiguity-backlog.json`（模糊点追踪）、`inputs/clarification-log.md`（澄清审计 trail）
- Invokes: `feature-workflow.js set-task-status clarified`（状态推进）、`knowledge-query` subagent（动态查询）

- [ ] **Step 1: 确认当前 SKILL.md 内容已加载，直接替换为以下新内容**

```markdown
---
name: feature-clarify
description: 在主会话中以歧义驱动方式动态澄清 feature 需求，持续追踪模糊点直到核心需求足以支撑后续设计。用于需求澄清、歧义挖掘、知识查询、证据缺口记录；知识查询只由一次性子 Agent 执行。
---

# Feature Clarify — 需求澄清

在主会话完成澄清，围绕当前最关键的需求模糊点动态决定分析、查询知识或询问用户；核心需求足以支撑后续设计时完成。

## 硬规则

- `state.status !== 'initialized'` 时停止并提示从 workflow 获取下一动作。
- 启动时读取 `inputs/requirement.md`、`evidence/evidence-registry.json` 和 `inputs/ambiguity-backlog.json`（缺失则初始化为 `{"ambiguities": []}`），恢复已确认事实、EV、gap 和模糊点状态，仅处理未完成项。
- **MUST NOT directly query the knowledge base in the main session**。需要知识时 **MUST dispatch a one-shot `knowledge-query` subagent**，**MUST NOT reuse agent IDs**、**MUST NOT use teammate**、不跨轮恢复；每次均为新的 `general-purpose` Task，**MUST wait for the structured EV/gap result**。
- 子 Agent prompt 必须说明查询意图（围绕当前单一模糊点）、要求加载并遵循 `scc-dev-sphere:knowledge-query`、返回 `{facts, gaps}`（fact 含 `evidenceId`、`reliability`），且不得使用 AskUserQuestion；无法确认即报告 gap。不得将 skill 名作为 agent type。
- 每个采用事实必须有 EV 快照和 registry 条目；证据不足不阻塞，记录「知识证据缺口」（主题、status、reliability、用户结论）。EV、推断和 gap 只作候选，**Only persist user-confirmed conclusions**。
- 所有结论必须带来源标注（`[user: …]` / `[knowledge: EV-xxx]` / `[inference: …]`）；候选推断只保留在 `inputs/clarification-log.md`，不得伪装为最终事实。

## 澄清流程

### 阶段0：前置检查与上下文恢复

1. 校验 `state.status === 'initialized'`，否则停止并提示从 workflow 获取下一动作。
2. 读取 `inputs/requirement.md` 恢复原始需求。
3. 读取 `evidence/evidence-registry.json` 恢复已确认证据。
4. 读取 `inputs/ambiguity-backlog.json`：
   - 存在 → 恢复 open/resolved/deferred 模糊点
   - 缺失 → 初始化为 `{"ambiguities": []}` 并写入

### 阶段1：建立初始需求理解

分析原始需求，形成内部理解（不写入文件），至少识别：
- **明确需求** — 用户明确提出了什么
- **当前推断** — Agent 基于上下文作出的关键推断
- **当前缺口** — 不清楚、有歧义或缺失的信息

此分析用于驱动阶段2的模糊点识别。

原始需求涉及明显陌生领域或平台约束时，可执行一次**轻量**初始知识查询辅助理解；需求已能识别核心模糊点时，直接进入阶段2，不消耗 token 做大而全的领域调研。

### 阶段2：生成模糊点清单

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

### 阶段3：动态处理模糊点

**循环执行，直到核心模糊点全部解决：**

#### 3a. 选择当前最关键模糊点

从所有 `status: "open"` 的模糊点中选择一个。选择原则（自然语言判断，无评分公式）：

- 优先处理影响核心目标、产品定位和主场景的问题
- 优先处理会阻塞多个后续判断的问题
- 优先处理判断错误后可能导致大范围返工的问题
- 暂不处理实现细节或低影响问题

#### 3b. 判断信息获取方式

**情况一：已有信息足够形成高置信度推断**

使用**确认型问题**，向用户确认你的理解是否正确。如：

> 根据前面的信息，我理解你更关注最终稳定产出交付物，而不是展示多个 Agent 的讨论过程，这个理解是否正确？

**不得将关键推断在未经用户确认时写入需求事实。**

**情况二：缺少外部知识或领域事实**

动态派发一次性 `knowledge-query` 子 Agent，查询**必须聚焦当前单一模糊点**。示例：

> 查询 Claude Code 和 Codex 是否支持运行时创建具有不同工具约束的 Agent，用于判断跨平台自定义 Agent 能力的需求边界。

等待结构化 EV/gap 结果返回后，再决定是形成确认型问题还是转为直接提问。

知识 Agent 返回 gap 后，判断：
- 该信息是否只能由用户提供
- 用户是否可能掌握内部资料
- 是否可以转换成需求约束而不必现在解决
- 是否影响当前澄清完成

不能只是把 gap 写入表格后跳过。

**情况三：需要用户意图或内部信息**

直接向用户提问，每次一个问题。根据问题性质选择提问方式：

| 模式 | 用途 | 示例 |
|------|------|------|
| 探索型 | 发现真实目标、当前痛点 | "目前是如何完成这项工作的？最耗时的步骤是什么？" — 开放式，无预设选项 |
| 决策型 | 明确取舍、范围界定 | "你更关注 Agent 自由讨论还是最终收敛结果？前者适合探索，后者适合任务交付。" — 可提供 2-3 候选项并说明影响 |
| 确认型 | 确认 Agent 的高置信度推断 | "我理解 Skill 自进化是从成功任务中沉淀新 Skill，但发布前仍需人工审核，对吗？" — 有合理推荐时才展示推荐结论 |

**每条问题必须说明为什么要问**，让用户理解决策影响。避免干巴巴的"是否需要 X？"，改为说明该决策会影响什么。

**不再要求用户选择需求类型**（functional/technical/mixed）。Agent 内部判断哪些属于需求、哪些属于技术约束、哪些应延后到设计阶段。只有分类会直接改变交付范围时才向用户说明。

#### 3c. 用户回答后处理（硬规则，必须全部执行）

**MUST NOT** 用户回答后直接进入预设的下一个问题。每次回答后必须：

1. **提取结论** — 将用户明确确认的需求结论记录下来
2. **更新 backlog** — 更新当前 ambiguity 的 `status` 和 `resolution`，写入 `ambiguity-backlog.json`
3. **识别新模糊点** — 判断用户回答是否引入新的模糊点，有则追加到 backlog（新 `AMB-xxx`，status: `open`）
4. **重新选择** — 回到 3a，重新选择当前最关键的下一个问题

**示例：**

用户回答："我希望 Agent 自由讨论，但最后必须由协调者生成统一结论。"

处理：
- 更新 AMB-003：`status: "resolved"`, `resolution: "Agent 可自由讨论，但最终由协调者收敛统一结论"`
- 识别新模糊点 AMB-006：`issue: "协调者由用户指定、系统预置还是动态选择"`, `impact: "影响 Agent 配置方式和任务启动流程"`, `status: "open"`

#### 3d. 循环终止条件

当满足以下条件时，退出循环进入阶段5：
- 所有影响核心目标、产品定位和主场景的模糊点已 resolved
- 再分析也挖不出新的核心模糊点

剩余的低影响 open 项标记为 `deferred`（附简短说明为何延后），带到阶段6由用户评审。

### 阶段4：更新需求理解

每次用户回答或知识查询返回后，更新对需求的理解。此阶段与阶段3紧密交织——用户回答 → 更新理解 → 更新 backlog → 识别新模糊点 → 重新选择，不独立成单独步骤。

### 阶段5：核心场景完整性检查

使用六维度作为结束前 checklist，逐一确认：

- **businessGoal** — 核心业务目标是否明确？
- **usersAndScenarios** — 用户和主要使用场景是否清晰？能否完整描述至少一条核心用户旅程？
- **functionalScope** — 核心功能范围和非目标是否明确？
- **nonGoalsAndBoundaries** — 明确不做什么？
- **acceptanceCriteria** — 验收条件是否可验证？
- **constraintsAndRisks** — 关键业务规则和约束是否已识别？

六维度**只用于完整性检查，不决定提问顺序**。发现遗漏时回到阶段3补充处理。

### 阶段6：汇总确认与状态推进

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
- **维度:** 涉及的需求方面
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

- [ ] **Step 2: 验证 SKILL.md frontmatter 格式正确**

```bash
head -6 skills/feature-clarify/SKILL.md
```

确认 YAML frontmatter 包含 `name` 和 `description`，格式有效（`---` 包裹，无语法错误）。

- [ ] **Step 3: 验证旧版中引用的外部依赖未被破坏**

```bash
grep -n "feature-workflow.js\|knowledge-query\|evidence-registry\|state.json\|requirement.md" skills/feature-clarify/SKILL.md
```

确认所有外部依赖引用路径正确：
- `feature-workflow.js set-task-status clarified` 路径
- `knowledge-query` skill 名称
- `evidence/evidence-registry.json` 路径
- `state.json` 校验逻辑
- `inputs/requirement.md` 读写逻辑

- [ ] **Step 4: 提交**

```bash
git add skills/feature-clarify/SKILL.md
git commit -m "refactor(feature-clarify): switch from fixed-dimension traversal to ambiguity-driven loop

- Replace 6-phase linear flow with ambiguity-driven dynamic loop
- Add ambiguity-backlog.json for tracking unresolved ambiguities
- Add clarification-log.md for independent audit trail
- Make initial knowledge query optional, support dynamic re-query
- Remove mandatory clarify-type selection (internal judgment only)
- Add post-answer re-analysis rule (update backlog, identify new ambiguities)
- Change completion criteria from 'all dimensions filled' to 'core ambiguities resolved'
- Keep existing state transitions, evidence recording, and final confirmation"
```

---

### Task 2: 干运行验证

**Files:**
- 无需修改文件，仅验证

**Interfaces:**
- Consumes: Task 1 输出的 `skills/feature-clarify/SKILL.md`
- Produces: 无

- [ ] **Step 1: 对照设计文档逐项检查**

检查新 SKILL.md 覆盖了设计文档中的所有实施点：

| 检查项 | 对应章节 |
|--------|----------|
| ✅ 删除固定六维度提问顺序 | 阶段3 — 动态选择模糊点 |
| ✅ 新增 ambiguity-backlog.json | 阶段0、阶段2 |
| ✅ 新增 clarification-log.md | 阶段6 |
| ✅ 知识查询从强制改为可选 | 阶段1 |
| ✅ 知识查询支持动态多次 | 阶段3 情况二 |
| ✅ 删除强制确认需求类型 | 阶段3 提问方式 |
| ✅ 三种提问模式（探索/决策/确认） | 阶段3 情况三 |
| ✅ 回答后四步处理规则 | 阶段3 3c |
| ✅ 新完成条件 | 完成判断原则 |
| ✅ 保留状态推进和证据记录 | 阶段6、硬规则 |

- [ ] **Step 2: 检查无遗漏的旧版引用**

```bash
# 确保没有残留的旧版概念
grep -n "六维度均有明确\|functional.*MUST NOT.*API\|六个维度全部有内容\|validateClarification\|确认需求类型.*single_select\|按固定顺序\|逐项挖掘.*映射" skills/feature-clarify/SKILL.md
```

预期：无匹配（所有旧版措辞已替换）。

- [ ] **Step 3: 检查 skill 可被正确加载**

```bash
# 确认 SKILL.md 为合法 Markdown，frontmatter 可解析
node -e "
const fs = require('fs');
const content = fs.readFileSync('skills/feature-clarify/SKILL.md', 'utf8');
const match = content.match(/^---\n([\s\S]*?)\n---/);
if (!match) { console.log('FAIL: no frontmatter'); process.exit(1); }
const fm = match[1];
if (!fm.includes('name:') || !fm.includes('description:')) {
  console.log('FAIL: missing required frontmatter fields');
  process.exit(1);
}
console.log('PASS: frontmatter valid');
"
```

预期：`PASS: frontmatter valid`

- [ ] **Step 4: 提交（如有修正）**

```bash
git add skills/feature-clarify/SKILL.md
git commit --amend --no-edit  # 如 Step 2-3 发现问题并修正
```
