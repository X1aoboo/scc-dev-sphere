# Feature Clarify 歧义驱动优化设计

- **状态:** 已确认
- **日期:** 2026-07-14
- **范围:** `skills/feature-clarify/SKILL.md`（重写）；新增 `inputs/ambiguity-backlog.json`、`inputs/clarification-log.md`
- **关联文档:**
  - `docs/superpowers/specs/2026-07-11-feature-clarify-ambiguity-mining-design.md`（上一版歧义挖掘设计）
  - `docs/superpowers/specs/2026-07-11-knowledge-query-subagent-dispatch-design.md`

## 1. 优化目标

把当前 feature-clarify 从"按固定维度逐项提问"调整为：**围绕当前最关键的需求模糊点，动态决定继续分析、查询知识或询问用户，直到核心需求足以支撑后续设计。**

三个核心问题：
- 提问不能依赖固定问题清单
- 知识查询不能只发生在流程开始
- 澄清过程需要持续记录尚未解决的模糊点，避免遗漏和重复

不引入新的 router、复杂状态机或评分体系。

## 2. 流程模型变更

### 现有流程（6 步线性）

```
加载 → 初始知识查询(强制) → 确认需求类型 → 按六维度逐项提问(固定顺序) → 验证 → 写入
```

### 新流程（循环驱动）

```
阶段0: 前置检查与上下文恢复
  ↓
阶段1: 建立初始需求理解（分析、识别缺口，不立即提问）
  ↓
阶段2: 生成模糊点清单 → 写入 ambiguity-backlog.json
  ↓
阶段3-4 循环:
  ├─ 选择当前最关键 open 模糊点
  ├─ 判断信息获取方式 → 确认 / 动态查知识 / 问用户
  ├─ 用户回答后 → 更新结论 + 更新 backlog + 识别新模糊点 + 重新选择
  └─ 循环直到核心模糊点全部解决
  ↓
阶段5: 核心场景完整性检查（六维度只在此处用作 checklist）
  ↓
阶段6: 汇总确认 → 写入 requirement.md + 推进状态
```

核心变化：阶段 3-4 是动态循环，问题链由用户回答驱动而非预写模板。

## 3. 各阶段详情

### 阶段0：前置检查与恢复

保留现有逻辑：
- 检查 `state.json`，`status !== 'initialized'` 时拒绝
- 读取 `inputs/requirement.md`（恢复原始需求）
- 读取 `evidence/evidence-registry.json`（恢复已确认证据）
- 新增：读取 `inputs/ambiguity-backlog.json`，存在则恢复，缺失则初始化为 `{"ambiguities": []}`

### 阶段1：建立初始需求理解

Agent 分析原始需求，形成内部理解，识别：
- 用户明确提出了什么
- 用户可能真正想解决什么问题
- 当前已知的核心用户或使用场景
- 当前已知的预期结果
- 明确提出的范围和约束
- Agent 当前作出的关键推断

内容不写入独立文件，作为 Agent 的分析过程，识别出的缺口写入 backlog。

### 阶段2：生成模糊点清单

写入 `inputs/ambiguity-backlog.json`，结构：

```json
{
  "ambiguities": [
    {
      "id": "AMB-001",
      "issue": "核心价值是讨论过程还是最终交付结果",
      "impact": "影响产品定位、核心交互和协作模式",
      "status": "open",
      "resolution": null
    }
  ]
}
```

仅五个字段：`id` / `issue` / `impact` / `status`（open|resolved|deferred）/ `resolution`。

Agent 从以下方面识别模糊点：目标不明确、术语多义、角色/场景缺失、业务流程不完整、功能边界冲突、规则/异常路径缺失、验收不可验证、外部依赖/约束未知、用户前后陈述可能冲突。

六维度可用于辅助检查遗漏，但不能直接转化成固定问题列表。

### 阶段3-4：动态处理循环

**选择原则（自然语言规则，无评分公式）：**
- 优先处理影响核心目标、产品定位和主场景的问题
- 优先处理会阻塞多个后续判断的问题
- 优先处理判断错误后可能导致大范围返工的问题
- 暂不处理实现细节或低影响问题

**三种处理方式：**

| 情况 | 行为 |
|------|------|
| 已有信息足够 | 确认型问题：基于已有信息形成推断，向用户确认，不得将关键推断直接写成需求事实 |
| 缺少外部知识 | 动态派发一次性 `knowledge-query` 子 Agent，查询聚焦单一模糊点 |
| 需要用户信息 | 直接提问（探索型/决策型/确认型），一次一个问题 |

**用户回答后四步处理（硬规则）：**
1. 提取用户明确确认的需求结论
2. 更新当前 ambiguity 的 status 和 resolution
3. 判断回答是否产生新模糊点（有则追加到 backlog）
4. 重新选择下一个最关键问题

明确禁止：用户回答后直接进入预设的下一个问题。

### 阶段5：核心场景完整性检查

六维度（businessGoal / usersAndScenarios / functionalScope / nonGoalsAndBoundaries / acceptanceCriteria / constraintsAndRisks）作为结束前 checklist 使用，不决定提问顺序。

### 阶段6：汇总确认与状态推进

- 展示完整需求汇总（从 requirement.md 组织）
- 列出低影响 `deferred` 项，请用户评审确认
- 用户确认后，写入 `inputs/clarification-log.md`（独立审计 trail）
- 执行状态推进：`feature-workflow.js set-task-status clarified`

## 4. 知识查询机制调整

1. **初始查询从强制改为可选** — 仅在陌生领域或平台约束时执行轻量查询；需求已能识别核心模糊点时直接进入澄清
2. **循环内支持多次动态查询** — 处理模糊点发现知识不足时，随时派发新的 `knowledge-query`，查询聚焦单一模糊点
3. **查询不到时主动追问用户** — 判断用户是否掌握该信息、是否可转为需求约束延后解决，不能只是写入 gap 表格

保留不变式：每次新 Agent、不复用 ID、不使用 teammate、子 Agent 禁用 AskUserQuestion、子 Agent 不直接修改需求文件。

## 5. 提问方式

### 删除
- 强制每题提供推荐答案
- 强制用户选择需求类型（functional/technical/mixed 改为 Agent 内部判断）

### 三种提问模式

| 模式 | 用途 | 预设选项 |
|------|------|----------|
| 探索型 | 发现真实目标、当前痛点 | 开放式，无预设 |
| 决策型 | 明确取舍、范围界定 | 2-3 候选项 + 影响说明 |
| 确认型 | 确认 Agent 高置信度推断 | 是/否，有推荐时可展示 |

每条问题必须说明为什么问，让用户理解决策影响。

## 6. 完成条件

替换"六维度全部有内容且无待定词"：

- 核心业务目标明确
- 目标用户和主要使用场景明确
- 可完整描述至少一条核心用户旅程
- 核心功能范围和非目标基本明确
- 关键业务规则和约束已识别
- 验收条件可验证
- 无 `open` 状态的核心模糊点
- 用户确认需求汇总符合真实意图

低影响 `deferred` 项允许带到设计阶段，但需在最终汇总时向用户展示并获评审确认。

## 7. 产物调整

| 文件 | 变更 |
|------|------|
| `inputs/requirement.md` | 保留原始需求 + 结论 + 约束 + 验收标准 + 最终确认；弱化固定维度表格，按需求内容自然组织 |
| `inputs/clarification-log.md` | **新增** — 独立记录澄清问答、决策转折、来源标注，requirement.md 只保留最终事实 |
| `inputs/ambiguity-backlog.json` | **新增** — 模糊点追踪，含 deferred 项的评审意见 |
| `evidence/evidence-registry.json` | 不变（MVP 不增加 ambiguity ID 关联） |

## 8. 实施范围

| 做 | 不做 |
|----|------|
| 新增 `ambiguity-backlog.json` | 模糊点评分算法 |
| 新增 `clarification-log.md` | backlog 专用脚本 |
| 重写 `SKILL.md` 提问选择逻辑 | 独立 router |
| 知识查询改为可选+动态多次 | 复杂状态枚举 |
| 删除强制确认需求类型 | 多 Agent 并发处理 |
| 增加回答后重新分析规则 | 依赖图自动生成 |
| 修改完成条件 | 新协调协议 |
| 保留现有状态推进和证据记录 | — |

## 9. 不变式

- 主会话不得直接调用知识库工具；knowledge-query 子 Agent 每次均为新的一次性 `general-purpose` Task
- 每个采用事实必须有 EV 快照和 registry 条目；证据不足不阻塞
- 所有结论必须带来源标注；候选推断只保留在澄清记录，不得伪装为最终事实
- 状态推进唯一入口：`feature-workflow.js set-task-status clarified`
- `inputs/requirement.md` 永不覆盖原始需求
