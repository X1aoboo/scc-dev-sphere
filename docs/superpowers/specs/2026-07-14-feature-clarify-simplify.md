# Feature Clarify 精简设计

- **状态:** 已确认
- **日期:** 2026-07-14
- **范围:** `skills/feature-clarify/SKILL.md` — 识别并删除冗余内容，压缩至 ~180 行
- **关联:** `docs/superpowers/specs/2026-07-14-feature-clarify-ambiguity-driven-optimization.md`

## 1. 目标

在不影响正确性的前提下，识别并精简 `feature-clarify/SKILL.md` 中的冗余和啰嗦内容。

## 2. 变更清单

| 区域 | 动作 |
|------|------|
| 硬规则章节 | **删除** — 状态校验+文件读取融入阶段0；子Agent派发规则融入阶段3b（明确通过 `Agent` 工具派发子 Agent，加载 `knowledge-query` skill，每次新 `general-purpose` Task）；来源标注融入阶段6 |
| 阶段0 | 重写 — 合并原硬规则中的前置检查内容，以列表形式呈现 |
| 阶段1 | 压缩 — 三行合并，保持语义不变 |
| 阶段2 | 保持 9 条识别规则 + 完整 JSON 示例 + 字段说明；仅删末尾冗余的「仅五个字段」描述（JSON 示例已自解释） |
| 阶段3 | 精简 — 3a 压缩为自然段；3b 情况一/二保留引用示例，情况三保留表格；删除原硬规则中子Agent的不复用ID/不使用teammate/禁用AskUserQuestion约束；阶段4 一句融入 3d |
| 阶段5 | **不变** |
| 阶段6 | **不变** |
| 文件结构模板 | **不变** |
| 完成判断原则 | **不变** |

## 3. 不变式

- 所有功能逻辑、完成条件、状态推进、文件产出与原版完全一致
- 子Agent派发约束「不复用ID/不使用teammate/禁用AskUserQuestion」删除（属冗余约束，skill 层面由 knowledge-query skill 自身保证）
- 9 条模糊点识别规则、三种提问模式、回答后四步处理全部保留
