# 人机交互选项卡改造 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将插件中所有 skill 的确定性选项交互统一改为 AskUserQuestion 选项卡，提升人机交互易用性。

**Architecture:** 新增 `references/interaction-guidelines.md` 作为唯一定义源，定义三类交互模式（single_select、confirm_gate、multi_select）的 AskUserQuestion 构造规则。6 个 Agent 文件和 4 个独立入口 skill 文件引用该 guideline，各自在交互步骤中按规则动态构造 AskUserQuestion 调用。

**Tech Stack:** Markdown 文件修改，无代码依赖。

## Global Constraints

- AskUserQuestion 选项数量上限为 4 个（含自动 Other），超出需归类或拆分
- 推荐选项必须标注 (Recommended) 并排在首位
- multiSelect: true 用于多选，false 用于单选
- header 字段限制 ≤12 个字符
- 所有修改保持与现有 skill 文件的中文风格一致

---

## 文件结构

```
references/
  interaction-guidelines.md    (新增) — 三种交互模式 + AskUserQuestion 构造规则 + 通用约束

agents/
  sa.md    (修改) — 新增「人机交互规范」章节
  se.md    (修改) — 同上
  mde.md   (修改) — 同上
  dev.md   (修改) — 同上
  tse.md   (修改) — 同上
  cie.md   (修改) — 同上

skills/
  feature-assess/SKILL.md    (修改) — 步骤4/5 改用 AskUserQuestion
  feature-review/SKILL.md    (修改) — 步骤5 改用 AskUserQuestion
  feature-approve/SKILL.md   (修改) — 闸口改用 AskUserQuestion
  workflow/SKILL.md          (修改) — human_confirm 改用 AskUserQuestion
```

---

### Task 1: 创建交互规范文件 `references/interaction-guidelines.md`

**Files:**
- Create: `references/interaction-guidelines.md`

**Interfaces:**
- Produces: 三种交互模式的名称与构造规则，供后续所有 Task 引用
  - 模式名: `single_select`, `confirm_gate`, `multi_select`
  - 通用规则: 选项数量上限 4、推荐项标注 (Recommended)、header ≤12字

- [ ] **Step 1: 创建文件**

```bash
mkdir -p references
```

- [ ] **Step 2: 写入 interaction-guidelines.md**

```markdown
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
```

- [ ] **Step 3: 提交**

```bash
git add references/interaction-guidelines.md
git commit -m "docs: 新增人机交互规范，定义三种 AskUserQuestion 交互模式"
```

---

### Task 2: 修改 6 个 Agent 文件，新增交互规范章节

**Files:**
- Modify: `agents/sa.md`
- Modify: `agents/se.md`
- Modify: `agents/mde.md`
- Modify: `agents/dev.md`
- Modify: `agents/tse.md`
- Modify: `agents/cie.md`

**Interfaces:**
- Consumes: `references/interaction-guidelines.md` 中的模式名称（single_select, confirm_gate, multi_select）
- Produces: 各 Agent 获得统一的人机交互行为规范

- [ ] **Step 1: 修改 agents/sa.md**

在文件末尾（`## 产物责任` 章节之后）追加：

```markdown
## 人机交互规范

当需要用户从确定性选项中选择时，**必须使用 AskUserQuestion 工具**，严格遵循 `references/interaction-guidelines.md` 中的构造规则。禁止使用纯文字罗列选项并要求用户打字输入。

- 单选决策 → 使用 `single_select` 模式
- 高风险闸口确认 → 使用 `confirm_gate` 模式
- 多选场景 → 使用 `multi_select` 模式
```

使用 Edit 工具，`old_string` 精确匹配文件末尾内容。

- [ ] **Step 2: 修改 agents/se.md**

追加同样内容到文件末尾。

- [ ] **Step 3: 修改 agents/mde.md**

追加同样内容到文件末尾。

- [ ] **Step 4: 修改 agents/dev.md**

追加同样内容到文件末尾（`## 关键规则` 章节之后）。

- [ ] **Step 5: 修改 agents/tse.md**

追加同样内容到文件末尾。

- [ ] **Step 6: 修改 agents/cie.md**

追加同样内容到文件末尾。

- [ ] **Step 7: 验证修改**

```bash
for f in agents/sa.md agents/se.md agents/mde.md agents/dev.md agents/tse.md agents/cie.md; do
  echo "=== $f ==="
  grep -c "人机交互规范" "$f"
done
```

预期输出：每行 `=== agents/xxx.md ===` 后跟 `1`。

- [ ] **Step 8: 提交**

```bash
git add agents/sa.md agents/se.md agents/mde.md agents/dev.md agents/tse.md agents/cie.md
git commit -m "feat: 6个Agent新增人机交互规范章节，要求使用AskUserQuestion选项卡"
```

---

### Task 3: 修改 skills/feature-assess/SKILL.md — 模式选择 + 阶段门禁

**Files:**
- Modify: `skills/feature-assess/SKILL.md:43-93`

**Interfaces:**
- Consumes: `references/interaction-guidelines.md` — single_select 模式（模式选择）、multi_select 模式（阶段门禁）
- Produces: feature-assess 的人机交互改为 AskUserQuestion 选项卡

- [ ] **Step 1: 修改步骤4**

将原文 `### 步骤4：展示评估结果并获取确认` 到 `### 步骤5：处理模式选择` 之间的内容替换为：

````markdown
### 步骤4：展示评估结果并获取模式确认

展示评估结果：

```
## 复杂度与风险评估

**需求:** {摘要}

**命中的风险触发条件:**
{逐条列出触发条件及解释}

**推荐模式:** {推荐模式}
- auto-design: AI 自动推进设计阶段，编码前人工最终审批
- collaborative-design: 部分阶段人工确认，其余 AI 推进
- strict-human-loop: 每个阶段都需要人工确认

**CI/CD 与环境风险:** {是/否 — 如是，评审阶段将触发 CIE}
```

然后使用 **AskUserQuestion 工具**（遵循 `references/interaction-guidelines.md` 中的 `single_select` 模式）获取模式选择：

- `header`: "工作流模式"
- `question`: "请选择工作流模式："
- `options`:
  - 将推荐模式排在首位，label 后标注 `(Recommended)`，description 解释该模式含义
  - 其余模式按风险等级从低到高排列
- `multiSelect`: false

用户可通过 Other 选项自行指定其他模式。

### 步骤5：处理模式选择结果

如果用户选择 `collaborative-design`，使用 **AskUserQuestion**（遵循 `multi_select` 模式）追问阶段门禁：

- `header`: "阶段门禁"
- `question`: "哪些设计阶段需要人工门禁确认？可多选："
- `options`: 四个设计阶段各为一个选项，description 说明该阶段产出内容
- `multiSelect`: true

用户可通过 Other 输入自定义阶段。
````

- [ ] **Step 2: 修改步骤5（原步骤5内容调整）**

将原文 `### 步骤5：处理模式选择` 中的后续内容（降级记录逻辑、状态更新逻辑）保留，但删除「直接在对话中以自然语言等待用户回复，**不要使用 AskUserQuestion 工具**」这段。改为：

```markdown
### 步骤6：记录决策并更新状态
```

将原步骤5中「用户可以选择确认推荐模式...」到「状态推进到 assessed」的状态更新逻辑移到新的步骤6，保持降级决策记录逻辑不变。

- [ ] **Step 3: 调整步骤编号**

原 `### 步骤6：更新状态` 和 `### 步骤7：完成` 的内容合并到新的步骤6中。

最终步骤结构：
- 步骤1-3 不变
- 步骤4：展示评估结果并获取模式确认（AskUserQuestion）
- 步骤5：处理模式选择结果（阶段门禁追问）
- 步骤6：记录决策并更新状态（含降级记录 + state.json 更新 + 完成确认）

- [ ] **Step 4: 验证**

```bash
grep -c "AskUserQuestion" skills/feature-assess/SKILL.md
grep "不要使用 AskUserQuestion" skills/feature-assess/SKILL.md || echo "PASS: 禁用指令已移除"
```

预期：AskUserQuestion 出现 ≥2 次，禁用指令已移除。

- [ ] **Step 5: 提交**

```bash
git add skills/feature-assess/SKILL.md
git commit -m "feat: feature-assess 改为 AskUserQuestion 选项卡交互"
```

---

### Task 4: 修改 skills/feature-review/SKILL.md — 建议项确认

**Files:**
- Modify: `skills/feature-review/SKILL.md:50-53`

**Interfaces:**
- Consumes: `references/interaction-guidelines.md` — multi_select 模式
- Produces: feature-review 的建议项确认改为 AskUserQuestion 选项卡

- [ ] **Step 1: 修改步骤5（建议项汇总）**

将原文 `### 步骤5：建议项汇总` 中的：

```
1. 将所有建议项整理为确认清单。
2. 写入 `reviews/advisory-confirmation.json`（含待确认建议项）。
3. 向用户展示建议项清单，等待人工选择 `apply` / `no_change` / `convert_to_blocking`。
```

替换为：

```
1. 将所有建议项整理为确认清单。
2. 写入 `reviews/advisory-confirmation.json`（含待确认建议项）。

3. 使用 **AskUserQuestion 工具**向用户展示建议项并获取决策。

   **第一轮 — 筛选需处理的项（multi_select 模式）：**
   - `header`: "建议项处理"
   - `question`: "以下评审建议项需要你的决策。请勾选你想处理的项："
   - `options`: 每条建议项为一个选项，label 为建议摘要（≤20字），description 说明影响范围
   - `multiSelect`: true
   - 若建议项 >4 个，按影响范围归类后分批提问

   **第二轮 — 逐项决定处理方式（single_select 模式）：**
   对用户选中的每一项，追问：
   - `header`: "建议项决策"
   - `question`: "针对「{建议摘要}」，如何处理？"
   - `options`:
     - `label: "✅ apply"` `description: "采纳此建议，反馈给设计 Agent 修订"`
     - `label: "↩️ no_change"` `description: "不修改，接受当前状态"`
     - `label: "🚫 convert_to_blocking"` `description: "升级为阻塞项，必须修复"`
   - `multiSelect`: false
   - 用户也可通过 Other 输入自定义处理意见

4. 将用户决策结果更新到 `reviews/advisory-confirmation.json`。
```

- [ ] **Step 2: 验证**

```bash
grep -c "AskUserQuestion" skills/feature-review/SKILL.md
```

预期：≥1。

- [ ] **Step 3: 提交**

```bash
git add skills/feature-review/SKILL.md
git commit -m "feat: feature-review 建议项确认改为 AskUserQuestion 选项卡交互"
```

---

### Task 5: 修改 skills/feature-approve/SKILL.md — 批准闸口

**Files:**
- Modify: `skills/feature-approve/SKILL.md:28-52`

**Interfaces:**
- Consumes: `references/interaction-guidelines.md` — confirm_gate 模式
- Produces: feature-approve 的批准确认改为 AskUserQuestion 选项卡

- [ ] **Step 1: 修改「人工确认闸口」章节**

将原文 `## 人工确认闸口（强制）` 中的展示模板和「等待用户明确输入"YES"」逻辑替换为：

```markdown
## 人工确认闸口（强制）

展示批准摘要：

```
⚠️ **最终设计批准**

**任务:** {taskId}
**待批准产物:**
  - business-design.md (hash: {hash})
  - solution-design.md (hash: {hash})
  - implementation-design.md (hash: {hash})
  - test-design.md (hash: {hash})
  - integrated-design.md (hash: {hash})

**批准范围:** {approvedScope}

**已接受风险:** {count} 项
{列出每项风险及简要说明}

**限制条件:** {limitations}
```

然后使用 **AskUserQuestion 工具**获取批准决策（遵循 `references/interaction-guidelines.md` 中的 `confirm_gate` 模式）：

- `header`: "设计批准"
- `question`: "任务 {taskId} 的设计产物已全部通过评审。是否批准此设计进入代码实现？"
- `options`:
  - `label: "✅ 批准设计"` `description: "批准所有设计产物，进入代码实现阶段"`
  - `label: "⏸️ 暂不批准，有顾虑需说明"` `description: "请选择 Other 输入顾虑内容"`
- `multiSelect`: false

用户选择「暂不批准」后可通过 Other 直接描述顾虑，无需额外追问轮次。
```

- [ ] **Step 2: 验证**

```bash
grep -c "AskUserQuestion" skills/feature-approve/SKILL.md
grep "输入 YES" skills/feature-approve/SKILL.md || echo "PASS: 旧确认方式已移除"
```

预期：AskUserQuestion 出现 ≥1 次，旧确认方式已移除。

- [ ] **Step 3: 提交**

```bash
git add skills/feature-approve/SKILL.md
git commit -m "feat: feature-approve 批准闸口改为 AskUserQuestion 选项卡交互"
```

---

### Task 6: 修改 skills/workflow/SKILL.md — human_confirm 交互

**Files:**
- Modify: `skills/workflow/SKILL.md:123-135`

**Interfaces:**
- Consumes: `references/interaction-guidelines.md` — single_select 或 confirm_gate 模式（取决于 pause 内容）
- Produces: workflow 的 human_confirm 改为 AskUserQuestion 选项卡

- [ ] **Step 1: 修改 human_confirm 展示**

将原文中 `#### human_confirm` 的：

```
展示：
```
⏸️ **需要人工确认**

**任务:** {nextAction.taskId}
**阶段:** {nextAction.stage}
{pause.prompt if nextAction.pause}

请回复以继续。
```

等待用户回复后再继续。
```

替换为：

```
展示确认信息：

```
⏸️ **需要人工确认**

**任务:** {nextAction.taskId}
**阶段:** {nextAction.stage}
{pause.prompt if nextAction.pause}
```

使用 **AskUserQuestion 工具**获取用户决策（遵循 `references/interaction-guidelines.md`）：

- 如果 pause 内容是确认/取消类决策 → 使用 `confirm_gate` 模式
- 如果 pause 内容是多选项决策 → 使用 `single_select` 或 `multi_select` 模式
- 根据 pause.prompt 内容动态构造选项，用户也可通过 Other 自由输入

等待用户选择或输入后再继续。
```

- [ ] **Step 2: 验证**

```bash
grep -c "AskUserQuestion" skills/workflow/SKILL.md
```

预期：≥1。

- [ ] **Step 3: 提交**

```bash
git add skills/workflow/SKILL.md
git commit -m "feat: workflow human_confirm 改为 AskUserQuestion 选项卡交互"
```

---

### Task 7: 最终验证

- [ ] **Step 1: 全量检查**

```bash
# 1. 确认 interaction-guidelines.md 存在
test -f references/interaction-guidelines.md && echo "PASS: interaction-guidelines.md 存在" || echo "FAIL"

# 2. 确认所有 6 个 Agent 都包含交互规范
for f in agents/sa.md agents/se.md agents/mde.md agents/dev.md agents/tse.md agents/cie.md; do
  grep -q "人机交互规范" "$f" && echo "PASS: $f" || echo "FAIL: $f"
done

# 3. 确认 4 个 skill 都包含 AskUserQuestion
for f in skills/feature-assess/SKILL.md skills/feature-review/SKILL.md skills/feature-approve/SKILL.md skills/workflow/SKILL.md; do
  grep -q "AskUserQuestion" "$f" && echo "PASS: $f" || echo "FAIL: $f"
done

# 4. 确认旧禁用指令已全部移除
grep -r "不要使用 AskUserQuestion" skills/ agents/ && echo "FAIL: 仍有禁用指令" || echo "PASS: 禁用指令全部移除"

# 5. 列出版本差异
git diff --stat HEAD~6..HEAD
```

预期：全部 PASS。

- [ ] **Step 2: 完成**

展示最终验证摘要，确认所有 11 个文件改造完成。
