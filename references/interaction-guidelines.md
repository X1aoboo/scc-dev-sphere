# 人机交互规范

当需要用户从确定性选项中选择时，必须使用 **AskUserQuestion 工具**，严格遵循以下模式构造规则。
禁止使用纯文字罗列选项并要求用户打字输入。

## 通用规则

- 选项数量控制在 2-4 个（AskUserQuestion 硬限制），超过需归类或拆分为多轮
- 推荐项必须标注 **(Recommended)** 并排在首位
- `header` 字段限制 ≤12 个字符
- `multiSelect: true` 用于非互斥多选，`false` 用于单选
- AskUserQuestion 内置「Other」选项，用户可随时选择 Other 输入自定义内容
- 任何时候如果问题不需要视觉对比（非 UI mockup、非流程图），用 AskUserQuestion 而非浏览器

---

## 模式 1: `single_select` — 单选决策

**适用场景：** 从互斥选项中选择一个（工作流模式选择、批准确认等）

**构造规则：**
```
header: 简短标签（≤12字），如"工作流模式"、"代码变更"
question: 完整问句，清晰说明决策内容
options:
  - 推荐项排在首位，label 后标注 (Recommended)，description 解释含义
  - 其余选项按优先级排列
multiSelect: false
```

**示例：工作流模式选择**
```
header: "工作流模式"
question: "请选择工作流模式："
options:
  - label: "auto-design (Recommended)"
    description: "AI 自动推进设计阶段，编码前人工最终审批"
  - label: "collaborative-design"
    description: "部分阶段人工确认，其余 AI 推进"
  - label: "strict-human-loop"
    description: "每个阶段都需要人工确认"
multiSelect: false
```

---

## 模式 2: `confirm_gate` — 闸口确认

**适用场景：** 高风险操作的确认/取消（设计批准、首次代码变更）

**构造规则：**
```
header: "确认闸口"（或具体操作名如"设计批准"，≤12字）
question: 展示关键信息摘要（任务ID、产物hash、风险项数等），确认是否继续
options:
  - label: "✅ 确认继续"（替换为具体操作如"批准设计"）
    description: "继续执行当前操作"
  - label: "⏸️ 暂不继续，有顾虑需说明"
    description: "请选择 Other 输入顾虑内容"
multiSelect: false
```

**示例：设计批准确认**
```
header: "设计批准"
question: "任务 FEAT-20260707-001 的设计产物已全部通过评审。是否批准此设计进入代码实现？"
options:
  - label: "✅ 批准设计"
    description: "批准所有设计产物，进入代码实现阶段"
  - label: "⏸️ 暂不批准"
    description: "有顾虑需要说明，请选择后输入具体内容"
multiSelect: false
```

---

## 模式 3: `multi_select` — 动态多选

**适用场景：** 从非互斥选项中选择（协同设计阶段门禁、review 建议项处理）

**构造规则：**
```
header: 简短标签（≤12字），如"阶段门禁"、"建议项处理"
question: 完整问句，说明上下文和可选范围
options: 动态生成，每项一个 option 附带简短 description
  - label 为选项摘要（≤20字）
  - description 说明具体内容或影响范围
multiSelect: true
```

**示例：阶段门禁选择**
```
header: "阶段门禁"
question: "哪些设计阶段需要人工门禁确认？可多选："
options:
  - label: "业务设计"
    description: "包括业务规则、范围边界、术语和异常流程"
  - label: "方案设计"
    description: "包括架构方案、接口契约、数据流和技术选型"
  - label: "实现设计"
    description: "包括模块结构、调用链、代码模式和技术细节"
  - label: "测试设计"
    description: "包括测试策略、用例、数据、环境和回归范围"
multiSelect: true
```

**示例：review 建议项处理**
```
header: "建议项处理"
question: "以下评审建议项需要你的决策，可多选要处理的项："
options:
  - label: "补充异常流程说明"
    description: "建议在业务设计中补充超时和数据不一致的异常处理流程"
  - label: "增加接口版本号"
    description: "建议对新增 API 使用版本号前缀以支持后续兼容"
multiSelect: true
```

> **注意：** review 建议项通常需要逐项决定处理方式（apply / no_change / convert_to_blocking）。如果建议项 ≤4 个，可在第一轮多选后，对每项再发起 single_select 追问处理方式；如果 >4 个，先多选筛选出需要处理的项，再逐项或分批追问。

---

## 模式 4: `decision_loop` — 设计决策逐项问询

**适用场景：** 设计阶段决策循环中，主会话（team-lead）把 SA/SE/MDE/TSE 在 scope 阶段出土的 gated decision 逐项抛给用户确认。问题与选项由设计 agent 作者，主会话只机械转译——不做设计判断。

**数据来源：** `resolve-design-loop` 返回的 `ask_decisions` 动作里的 `decisions[]`，每项形如 `{id, summary, options, recommendation, askMode}`。

**字段映射（decision → AskUserQuestion）：**

| decision 字段 | AskUserQuestion 字段 |
|---|---|
| `summary` | `question`（可补上下文前缀，如「[业务设计] ...」） |
| `options[]` | `options[]`（`label`/`description` 直传） |
| `recommendation` | 推荐项置首，`label` 后加 `(Recommended)` |
| `askMode` | `single_select`→`multiSelect:false`；`multi_select`→`true`；`confirm_gate`→构造两选项确认式（`multiSelect:false`） |

**构造规则：**
- 每条 decision = 一次 AskUserQuestion 调用（`options` 数 2-4 已由 `devsphere-decisions.js` 强校验保证）。
- `header` ≤12 字，可用阶段名（如「业务决策」）。
- 用户回答（含 Other 自定义）写回该 decision 的 `resolution`：
  ```bash
  node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-decisions.js resolve <taskPath> <slug> <decisionId> '{"chosen":"<用户选择>","note":"<可选备注>","decidedAt":"<ISO 时间>"}'
  ```
- 全部 decision `status=decided` 后，回到 `resolve-design-loop`（得 `draft`）。

**示例：** gated decision `{id:'BD-DEC-001', summary:'博客是否需要注册登录？', options:[{label:'需要',description:'...'},{label:'不需要',description:'...'}], recommendation:'需要', askMode:'single_select'}` →
```
header: "业务决策"
question: "[业务设计] 博客是否需要注册登录？"
options:
  - label: "需要 (Recommended)"
    description: "..."
  - label: "不需要"
    description: "..."
multiSelect: false
```
用户选「需要」→ `resolve ... BD-DEC-001 '{"chosen":"需要","decidedAt":"2026-07-09T..."}'`
