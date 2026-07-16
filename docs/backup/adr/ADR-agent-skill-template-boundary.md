# ADR: Agent / Skill / Template 职责边界

## 状态

Proposed

## 背景

当前 MVP 已有 SA、SE、MDE、TSE、DEV、CIE 六类 Agent，设计 Skill 和五类设计模板。但实际验证显示：

- Agent 定义偏岗位简介，容易继续膨胀为巨型 prompt。
- Skill 偏“按模板生成文档”，具体工程动作不足。
- Template 只约束章节标题，缺少章节质量标准。
- Quality Gate 和 traceability 尚未足够约束输出质量。

需要明确边界，避免职责漂移。

## 决策

采用以下边界：

- Agent：角色定位、专业视角、质量责任、协作边界、禁止事项、人工升级条件。
- Skill：入口契约、输入输出、执行步骤、专业动作、证据/决策/假设规则、失败处理、修订模式、下游交接。
- Template：产物结构、章节目的、章节质量标准、证据要求、图示要求、常见错误、下游用途。
- Quality Gate：结构完整性、引用完整性、ID 格式、traceability、review closure、artifact version/hash 等可机器检查规则。
- Docs / Knowledge：长期事实源、规范、知识、ADR、证据和治理规则。

## 替代方案

### 方案 A：强化 Agent

把所有专业方法都写入 SA/SE/MDE/TSE/DEV/CIE。

优点：单个 Agent 文件自包含。

缺点：Agent 变长，方法难复用，角色和流程混在一起。

### 方案 B：强化 Skill，Agent 极简

Agent 只保留一句角色说明，所有动作进入 Skill。

优点：复用性强。

缺点：复杂评审缺少专业视角，Agent 差异弱化。

### 方案 C：全部靠 Template

通过模板强制输出结构。

优点：产物统一。

缺点：无法表达执行步骤、失败处理和人工确认。

## 取舍

选择五层边界模型。Agent、Skill、Template 各自保持聚焦，Quality Gate 和 scripts 承担确定性约束。

## 后果

正面：

- 避免 Agent 膨胀。
- Skill 可复用。
- Template 可被门禁检查。
- Docs 成为事实源。

负面：

- 需要维护多个文档和映射。
- 初期改造成本更高。
- 需要 doc-lint 或 gate 防止规则再次漂移。

