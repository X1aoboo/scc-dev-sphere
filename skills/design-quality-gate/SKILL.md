---
name: design-quality-gate
description: 执行设计产物的内容与追溯质量门禁：evidence/decision/assumption 完整性、traceability 无孤儿、NFR 可验证、图后说明。输出 quality-gates/QG-*.json，不修改正文。
---

# Design Quality Gate — 内容与追溯门禁

检查设计产物的**内容质量与可追溯性**（结构由 `design-template-check` 负责）。按 `--target` 应用对应 gate 集。

## 集成契约

- **入口:** `/scc-dev-sphere:design-quality-gate --target <artifact>`
- **入参:** 目标产物、上游产物、evidence/decision、review-matrix、gate catalog
- **输出:** `quality-gates/QG-<target>.json`
- **完成标准:** QG JSON 已写入

## 前置条件

- 目标产物存在。
- 建议 `design-template-check` 先 pass/warn（非硬性，warn 可继续）。

## 输入与写入范围

**读取：** 目标产物、上游产物、`evidence/`、`decisions/`、`reviews/review-matrix.json`、`docs/governance/design-quality-gates.md`。
**允许写入：** 仅 `quality-gates/QG-<target>.json`。
**禁止写入：** 产物正文、`state.json`、`reviews/`、`approvals/`。

## 执行步骤

1. 按 `--target` 加载 gate catalog 中该阶段的 gate 集。
2. **通用 gate（所有阶段）**：
   - `QG-EV-001`：存量事实引用 EV（无则须标 ASM）。
   - `QG-DEC-001`：关键取舍有 DEC。
   - `QG-ASM-001`：ASM 有 confidence/needsConfirmation；高风险未确认 → fail。
3. **阶段专属 gate（按 catalog 失败条件判定）**：
   - business：`QG-BD-001/004/006/008`、`QG-TR-001`
   - solution：`QG-SD-002/004`、`QG-API-001`、`QG-DATA-001`、`QG-NFR-001`、`QG-SEC-001`
   - implementation：`QG-ID-002/006/009`
   - test：`QG-TD-002/007`、`QG-TR-003`、`QG-RISK-003`

   > 仅引用 `design-quality-gates.md` §3 catalog 中已定义 fail 条件的 gate。`target-design-template-model.md` 章节表还引用了 `QG-SD-003/ID-003/DIA-001/RISK-001/002/TD-003/004` 等，但 catalog 尚未枚举——这些按章节质量标准以 warn 提示，待 catalog 补齐后升级（见 backlog 风险）。
4. 每条 gate 按 catalog 的 pass/warn/fail 条件判定。
5. 汇总 status，写入 `quality-gates/QG-<target>.json`。

## 结果语义

- `pass`：满足进入 formal review 的要求。
- `warn`：非阻塞问题（可进入 review，review 须关注）。
- `fail`：缺关键追溯/证据 → 回 owner Skill 修订。
- `requires_human`：机器无法判定（如 NFR 取舍、风险接受）→ 暂停 + AskUserQuestion。

## 失败处理

- 上游产物缺失 → 对应追溯 gate 标 fail（关键缺口）或 warn。
- evidence/decision 目录缺失 → `QG-EV-001` / `QG-DEC-001` 标 fail。
- 无法判定 → requires_human，不臆断。

## 完成标准

- QG JSON 写入，每条 gate 有 `result` + `detail` + `location` + `recovery`。
- `requires_human` 项有明确待确认问题。
- 整体 status = checks 中最严重者。

## 禁止事项

- 不修改产物正文。
- 不接受风险（`risk_candidate` 须经 `feature-review` 人工确认）。
- 不关闭 review issue。
- 不直接推进 `design_ready`。
