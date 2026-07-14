# Feature Clarify 评审循环设计

- **状态:** 已确认
- **日期:** 2026-07-14
- **范围:** `skills/feature-clarify/SKILL.md`、`skills/feature-clarify/checklist.md`、`skills/feature-clarify/requirement.md`
- **关联:** `docs/superpowers/specs/2026-07-14-feature-clarify-ambiguity-driven-optimization.md`、`docs/superpowers/specs/2026-07-14-feature-clarify-simplify.md`

## 1. 目标

1. 引入 `requirement.md` spec 模板，阶段6 初次写入后评审循环中持续更新
2. 新增评审循环：subagent 对照 checklist 检查 → 不通过则回阶段3 补充澄清 → 再评
3. 持续写入机制：`clarification-log.md`（阶段3每次回答后）、`requirement.md`（阶段6起持续）、`ambiguity-backlog.json`（阶段2/3c）

## 2. 流程模型调整

```
阶段0-5: 不变
  ↓
阶段6: 按 spec 模板写入 requirement.md + 展示 deferred 项
  ↓
阶段7(新): 评审循环
  ├─ 初始化 reviews/clarify-checklist.json
  ├─ 派发 review subagent，对照 checklist 逐项检查
  ├─ 全部 pass → 退出
  ├─ 有 fail → 回阶段3 补充澄清 → 更新 requirement.md → 再评
  └─ 轮次达 designRevisionLimit 上限 → 剩余 fail 带至阶段8
  ↓
阶段8: 最终确认 + 状态推进
```

## 3. 各阶段变更详情

### 阶段3（修改）

每次用户回答后追加写入 `inputs/clarification-log.md`（原为阶段6集中写入）。

### 阶段6（修改）

1. 读取 `skills/feature-clarify/requirement.md` 模板，按 11 章节组织需求，写入 `inputs/requirement.md`。未明确项保留待补充。
2. 列出 deferred 模糊点，请用户评审确认。

### 阶段7（新增）

1. 初始化 `reviews/clarify-checklist.json`（基于 checklist.md 8 类检查项 + 出口判定规则，所有项初始 `result: "fail"`）。
2. 派发一次性 review subagent（`general-purpose` Task，每次新 Agent），加载 review instruction prompt。
3. 轮次 ≤ `designRevisionLimit`：
   - 全部 pass → 退出循环，进阶段8
   - 有 fail → 回阶段3 补充澄清（仅处理 fail 项关联模糊点）→ 更新 requirement.md → 重新派发 subagent（读上次 checklist JSON，只复检 fail 项）
4. 达到上限 → 剩余 fail 带至阶段8，用户裁决。

### 阶段8（修改）

1. 展示汇总，`confirm_gate` 最终确认。
2. 确认后状态推进：`feature-workflow.js set-task-status clarified`。

### 持续写入

| 文件 | 写入时机 |
|------|----------|
| `clarification-log.md` | 阶段3 每次回答后追加 |
| `ambiguity-backlog.json` | 阶段2 初始化 + 阶段3c 每次回答后更新 |
| `requirement.md` | 阶段6 初写 + 评审循环中更新 |
| `reviews/clarify-checklist.json` | 阶段7 初始化 + review subagent 更新 |

## 4. 新增产物

### `reviews/clarify-checklist.json`

```json
{
  "reviewVersion": 1,
  "status": "in_progress",
  "categories": [
    {
      "id": "7.1",
      "name": "目标与用户",
      "items": [
        {"id": "7.1.1", "check": "已说明本需求要解决的核心问题", "result": "pass", "evidence": "§2.1"},
        {"id": "7.1.2", "check": "已说明需求完成后希望产生的业务结果", "result": "fail", "note": "未说明预期业务结果"}
      ]
    }
  ]
}
```

所有项初始 `result: "fail"`。review subagent 更新 result/evidence/note。每轮递增 reviewVersion。

## 5. Review Subagent Instruction

```markdown
你是一位需求评审专家。请对照评审清单，逐项检查 `inputs/requirement.md` 的需求质量。

## 评审规则

1. 读取 `reviews/clarify-checklist.json`，对所有 `result: "fail"` 的项进行复检（首轮评审则全量检查）。
2. 逐项对照 `inputs/requirement.md` 内容判断：
   - **pass** — 文档中有明确、可验证的内容满足该项要求，在 `evidence` 中注明具体章节位置（如 §2.1）
   - **fail** — 文档中缺少对应内容或表述模糊不可验证，在 `note` 中简要说明缺失点
3. 判断依据：
   - 只依据 requirement.md 的实际内容，不根据推断或假设补充
   - 核心功能必须有明确行为和结果描述，不能只有功能名称
   - 验收标准必须可以通过操作和观察判断通过或失败
   - 不得出现"友好、灵活、快速、完善、待定、可能、视情况"等不可验证措辞
   - Agent 推断未获用户确认的不得视为正式需求事实
4. 更新 checklist JSON 后返回 `{passed, failed, summary}`。

## 禁止

- 不得修改 `inputs/requirement.md`
- 不得调用 AskUserQuestion
- 不得根据自身知识补充需求内容
```

## 6. 不变式

- 状态推进唯一入口不变
- knowledge-query 子 Agent 派发规则不变
- 六维度完成判断原则保留，阶段8继续使用
- `designRevisionLimit` 复用现有机制，默认 25
- checklist.md 和 requirement.md 为 skill 目录内的静态模板文件，不被运行时修改
