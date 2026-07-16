# 人机交互选项卡改造 — 设计文档

**日期:** 2026-07-07
**状态:** approved

## 1. 目标

将插件中所有 skill 的确定性选项交互从「纯文字罗列 + 等待用户打字」改为「AskUserQuestion 选项卡」。提升人机交互的易用性和一致性。

## 2. 整体架构

```
references/interaction-guidelines.md   ← 唯一定义源
         │
         ├── Agent 层引用（6 个 Agent）
         │   ├── sa.md
         │   ├── se.md
         │   ├── mde.md
         │   ├── dev.md
         │   ├── tse.md
         │   └── cie.md
         │   └── 覆盖 7 个 Agent 调用的 skill（design-business/solution/implementation/test,
         │       implement, plan-implementation, knowledge-query）
         │
         └── Skill 层直接引用（4 个独立入口 skill）
             ├── feature-assess/SKILL.md
             ├── feature-review/SKILL.md
             ├── feature-approve/SKILL.md
             └── workflow/SKILL.md
```

**核心原则：**
- `interaction-guidelines.md` 唯一定义交互模式，所有消费者引用
- Agent 层定义行为规范 → 通过 Agent 调用的 skill 自动继承
- 独立入口 skill → 直接引用同一份 guideline
- Skill 文件只描述触发交互的步骤，不描述交互的实现方式

## 3. 交互模式定义

所有交互模式定义在 `references/interaction-guidelines.md` 中。

### 3.1 `single_select` — 单选决策

适用：从互斥选项中选择一个（工作流模式选择、批准确认等）

AskUserQuestion 构造规则：
- `header`: 简短标签（≤12字），如"工作流模式"、"代码变更"
- `question`: 完整问句
- `options`: 推荐项排在首位，label 后标注 (Recommended)；其余按优先级排列
- `multiSelect`: false
- 用户可通过 Other 输入自定义内容

### 3.2 `confirm_gate` — 闸口确认

适用：高风险操作的确认/取消（设计批准、首次代码变更）

AskUserQuestion 构造规则：
- `header`: "确认闸口"
- `question`: 展示关键信息摘要（任务ID、产物hash、风险项数等），确认是否继续
- `options`:
  - 选项1: "✅ 确认继续"（或具体操作名如"批准设计"）
  - 选项2: "⏸️ 暂不继续，有顾虑需说明"（用户可选 Other 输入顾虑）
- `multiSelect`: false

### 3.3 `multi_select` — 动态多选

适用：从非互斥选项中选择（协同设计阶段门禁、review 建议项处理）

AskUserQuestion 构造规则：
- `header`: 简短标签（≤12字）
- `question`: 完整问句，说明上下文
- `options`: 动态生成，每项一个 option 附带 description
  - review 场景：每个 label 为建议摘要，description 说明影响范围
  - 阶段门禁场景：每个 label 为一个设计阶段名称
- `multiSelect`: true

### 3.4 通用规则

- 选项数量控制在 2-4 个（AskUserQuestion 硬限制），超过需归类或拆分
- 推荐项必须标注 (Recommended) 并排在首位
- 任何时候如果问题不需要视觉对比（非 UI mockup、非流程图），用 AskUserQuestion 而非浏览器
- AskUserQuestion 内置 Other 选项，用户可随时自由输入

## 4. 改动清单

### 4.1 新增文件

- `references/interaction-guidelines.md` — 三类交互模式 + AskUserQuestion 构造规则 + 通用规则

### 4.2 Agent 文件改动（6 个统一）

每个 Agent 文件（sa/se/mde/dev/tse/cie）新增「人机交互规范」章节：

```markdown
## 人机交互规范

当需要用户从确定性选项中选择时，**必须使用 AskUserQuestion 工具**，
严格遵循 `references/interaction-guidelines.md` 中的构造规则。
禁止使用纯文字罗列选项并要求用户打字输入。

- 单选决策 → 使用 single_select 模式
- 高风险闸口确认 → 使用 confirm_gate 模式
- 多选场景 → 使用 multi_select 模式
```

### 4.3 Skill 文件改动

| Skill | 改动内容 |
|-------|---------|
| **feature-assess** | 删除「不要使用 AskUserQuestion」指令；步骤4改为 AskUserQuestion（single_select）获取模式选择；步骤5如选 collaborative-design 则追问（multi_select）阶段门禁 |
| **feature-review** | 步骤5改为 AskUserQuestion（multi_select），每个建议项为一个选项 |
| **feature-approve** | 闸口改为 AskUserQuestion（confirm_gate），选项「批准设计 / 暂不批准」 |
| **workflow** | human_confirm 分支改为 AskUserQuestion（single_select 或 confirm_gate） |

### 4.4 无需改动

- **feature-design** — 纯编排入口，无直接人机交互
- **feature-verify** — 全自动执行
- **feature-init** — 收集开放式需求描述，非确定性选项
- **status** — 只读展示
- **design 阶段 skill**（business/solution/implementation/test）— 设计产物确认由 Agent 覆盖
- **feature-implement** — 首次变更闸口由 DEV Agent 覆盖
- **feature-plan-implementation** — 高风险确认由 DEV Agent 覆盖

## 5. 涉及文件总览

| 操作 | 文件 | 数量 |
|------|------|:---:|
| 新增 | `references/interaction-guidelines.md` | 1 |
| 修改 | `agents/sa.md`, `se.md`, `mde.md`, `dev.md`, `tse.md`, `cie.md` | 6 |
| 修改 | `skills/feature-assess/SKILL.md` | 1 |
| 修改 | `skills/feature-review/SKILL.md` | 1 |
| 修改 | `skills/feature-approve/SKILL.md` | 1 |
| 修改 | `skills/workflow/SKILL.md` | 1 |
| **合计** | | **11** |
