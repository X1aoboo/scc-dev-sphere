---
name: design-template-check
description: 检查设计产物的模板结构与必填章节、ID 格式、Mermaid 图示、追溯矩阵、占位符残留、交接契约。只产出 quality-gates/TPL-*.json，不修改产物正文。
---

# Design Template Check — 结构与模板门禁

检查设计产物是否满足模板的**结构性要求**（章节、ID、图示、追溯、交接）。只检查结构，不判断专业内容（内容由 `design-quality-gate` 负责）。

## 集成契约

- **入口:** `/scc-dev-sphere:design-template-check --target <artifact>`
- **入参:** 目标产物、对应模板定义
- **输出:** `quality-gates/TPL-<target>.json`（status + checks[]）
- **完成标准:** TPL JSON 已写入

## 前置条件

- 目标产物文件存在。
- `--target` ∈ `business-design | solution-design | implementation-design | test-design | integrated-design`。

## 输入与写入范围

**读取：** 目标产物、`docs/design/target-design-template-model.md`、`docs/governance/artifact-registry-contract.md`。
**允许写入：** 仅 `quality-gates/TPL-<target>.json`。
**禁止写入：** 产物正文及任何其他文件。

## 执行步骤

1. 读取目标产物与对应模板的章节定义（target-design-template-model）。
2. 逐项检查：
   - **QG-TPL-001 frontmatter**：`artifactId` / `version` 存在。
   - **QG-TPL-002 章节结构**：必填章节存在且非空（按模板章节表）。
   - **Mermaid 图示**：复杂信息有图且图后有文字说明；小任务可写"不适用，理由：…"。
   - **ID 格式**：EV/DEC/ASM/RISK/REQ/BR/NFR/API/MOD/TEST/QG 编号一致。
   - **追溯矩阵**：存在且字段完整。
   - **占位符残留**：无未替换 `{{...}}`、空表格、纯注释章节。
   - **下游交接契约**：章节存在且列出下游消费字段。
3. 每条规则给出 `pass | warn | fail`，汇总整体 status。
4. 写入 `quality-gates/TPL-<target>.json`。

## 结果语义

- `pass`：结构完整。
- `warn`：次要章节简略或非关键缺失（可进入 quality-gate，但需关注）。
- `fail`：缺关键章节 / 缺 frontmatter / 只剩占位符 → 回 owner 修订。
- `requires_human`：模板本身冲突，结构无法判定。

## 失败处理

- 产物不存在 → 输出 fail + "artifact not found"。
- 模板定义缺失/冲突 → requires_human。

## 完成标准

- TPL JSON 写入，每条 check 含 `result` + `detail` + `location` + `recovery`。
- 整体 status = checks 中最严重者。

## 禁止事项

- 不修改产物正文。
- 不接受风险、不关 review issue、不推进状态。
- 不做专业内容判断（交 `design-quality-gate`）。
