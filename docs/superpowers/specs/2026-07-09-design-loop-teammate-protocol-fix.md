# 设计循环 teammate 协议 + decisions schema 守卫 修补 设计

- **状态:** 已通过设计评审
- **日期:** 2026-07-09
- **关联:** Plan C spec `2026-07-09-decision-format-fix.md`；主 spec `2026-07-09-design-stage-decision-loop-design.md`；Plan B spec `2026-07-09-design-loop-plan-b.md`
- **定位:** Plan C 落地后，实跑暴露两个回归：(1) scope 模式派发产生重复 SA agent；(2) decisions 文件被 teammate 写成空文件 / 自创 schema，守卫未拦住，决策循环被静默废掉。本 spec 在**保留 agent-teams 保活模型**前提下，确定性化派发/恢复协议，并补上守卫的两个洞。

---

## 1. 问题诊断（实跑实证）

### 1.1 RC1 — 重复 SA agent

`FEAT-20260709-001`（collaborative-design，businessDesign 门禁），feature-design skill 派发 SA scope 后：
- 产生 `business-design-scope` + `business-design-scope-2` **两个** teammate 实例。
- 出现 `Error: summary is required when message is a string`。

**根因（经 claude-code-guide 查证 agent-teams 机制后定位）**：
- teammate 默认**后台异步**运行；完成时**自动向 lead 推送消息**，lead **无需轮询**。
- skill 未写死「派发后等 teammate 的完成消息」协议 → lead 临场发挥，**派了第二个 Agent("Check scope result") 去查进度** → 重复实例。
- lead 尝试 `SendMessage` 时 **`message` 为字符串但缺 `summary` 字段** → 报错。
- 正确协议本应是：scope 派发时**从 Agent 返回结果捕获 agentId** → 等 teammate 自动推送的完成消息 → draft 轮用 `SendMessage to=<agentId>` **恢复同一实例**（保活上下文），绝不重新 Agent 派发。

### 1.2 RC2 — 守卫校验错了对象

`checkDecisionsFormatFromStdin` 只读 `tool_input.file_path`，再 `fs.readFileSync(filePath)` —— **校验磁盘已存在内容，不是正在写入的内容**。
- SA 创建空文件（被中断）→ lead Write 修复 → 守卫读空文件 → `JSON.parse('')` → 「Unexpected end of JSON input」→ **拒绝修复写入**。
- 逻辑反了：守卫阻止了修复自身的写入。PreToolUse Write 钩子能拿到 `tool_input.content`，守卫该校验那个。

### 1.3 RC3 — 守卫 schema 检查全是洞

SA teammate **未用 `devsphere-decisions.js add`**，自由发挥写了自创 schema：`topic/question/context/options[{id,label,description}]/impact[]/priority/category=<自定义>`，外加顶层 `mode/createdAt/openQuestions/assumptions`。**无一个 canonical 字段**（`type/summary/rationale/askMode/recommendation/evidence`）。

守卫未拦住（实证：对该文件 `check-decisions-format` exit 0）：
- `if (d.type !== 'gated') continue;` —— **无 `type` 字段的 decision 被整个跳过**。守卫只校验 gated 子集，不校验必填字段集。`type:gated` 数量为 0 的文件 100% 通过。
- 下游 `countGatedPending` 返回 0 → resolver 跳过 `ask` → 直奔 `draft`。**整个决策循环被静默废掉。**

### 1.4 统一根因

Plan C 假设「prose 告诉 teammate 用脚本 + 守卫兜底」。但 (a) teammate 无视 prose 自创 schema；(b) 守卫两洞（校验磁盘而非写入内容；跳过无 type 的 decision）。teammate 被当成会遵守规范，但**无结构性强制**。叠加异步派发无确定性完成协议。

---

## 2. 设计约束（查证结论）

经 claude-code-guide 查证（https://code.claude.com/docs/en/agent-teams.md, hooks.md, sub-agents.md）：

| 事实 | 来源 |
|---|---|
| teammate 默认后台异步；完成时**自动向 lead 推送消息**，无需轮询 | agent-teams Architecture |
| teammate 完成一轮**不销毁**，`SendMessage to=<agentId>` **自动后台恢复，保留全部上下文** | sub-agents Resume |
| custom agent（sa.md 等）返回 agentId → **可恢复**（保活） | sub-agents Resume |
| `SendMessage` 当 `message` 为字符串时**必须带 `summary`** | 实跑报错 + sub-agents |
| **PreToolUse 在 teammate 自身会话触发**（teammate 加载同一 hooks.json），按 `file_path` 过滤 | hooks Common input fields |
| `TeammateIdle` 触发，提供 `teammate_name`；**exit 2 → teammate 继续工作，stderr 回喂** | hooks TeammateIdle |
| 无 matcher 级 agent 作用域；脚本按 stdin 字段过滤 | hooks Matcher patterns |

**保留 agent-teams 保活模型**（用户硬约束：设计 agent 须跨用户交互间隙保活，subagent 每次 fresh 无法满足）。

---

## 3. Part D1：teammate 派发/恢复协议确定性化（skill 内容层）

### 3.1 feature-design SKILL 循环协议

在 `skills/feature-design/SKILL.md` 步骤2 的派发表中，重写 `dispatch_agent` 行为，写死确定性协议：

**scope 模式（轮1，出土决策）：**
1. 用 Agent tool 派发 `action.agent`（teammate，后台）。
2. **从 Agent 返回结果捕获 `agentId`**，按 stage 存入主会话上下文（如 `agentId[businessDesign] = <id>`）。
3. **等待 teammate 自动推送的完成消息**（「gated 决策就绪，N 项待决」）。**禁止轮询、禁止派第二个 Agent 去查、禁止派"check"agent。**
4. 收到完成消息后 → 步骤3（sync-stage-status）→ 回步骤1。

**draft 模式（轮2，基于决议定稿）：**
1. **检查主会话是否持有该 stage 的 `agentId`**。
2. **持有** → `SendMessage`：`to=<agentId>`、`message`=决议内容+draft 指令、`summary`=<短摘要>（必填）→ **恢复同一 teammate 实例**（保活上下文）。**绝不重新 Agent 派发。**
3. **未持有**（如 `/resume` 后 in-process teammate 未恢复，见 agent-teams Limitations）→ **降级**：重新 Agent 派发 draft（丢失保活上下文，但可恢复流程），并在输出中提示「teammate 未保活，draft 以 fresh 上下文重跑」。
4. 等 teammate 完成消息 → 步骤3 → 回步骤1。

**硬规则（写入 skill 约束段）：**
- 主会话**不直接写设计产物**（既有约束，保留）。
- **revise（requiresReReview）后必须先 re-review**（既有，保留）。
- **【新增】同一 stage 的 draft 必须用 scope 轮捕获的 agentId 经 SendMessage 恢复，不得重新 Agent 派发**（保活 + 防重复实例）。
- **【新增】派发后只等 teammate 自动推送的完成消息，不得派任何"检查/查询"agent**。

### 3.2 teammate 完成消息协议

`references/teammate-design-protocol.md` scope 模式末尾强化：写完 decisions 后**必须发一条明确完成消息给 lead**，格式：「✅ <stage> scope 完成：N 项 gated 决策已写入 `<slug>-decisions.json`，待 lead 代问」。draft 模式同理：「✅ <stage> draft 完成：主产物 `<slug>.md` 已写入」。

明确完成消息是 lead 推进的**唯一触发**——无此消息 lead 不推进。

### 3.3 workflow SKILL 协调

`skills/workflow/SKILL.md` 的「无 Agent 场景」feature-design 段补一句：feature-design 内部自驱设计循环，**agentId 在其自身上下文内跨 resolver 迭代持有**，workflow 不介入 teammate 生命周期管理。

---

## 4. Part D2：守卫校验写入内容（RC2）

### 4.1 `checkDecisionsFormatFromStdin` 改为校验 incoming content

`scripts/devsphere-guard.js`：

```
checkDecisionsFormatFromStdin(stdinJson):
  ti = stdinJson.tool_input; 若无 → null（放行）
  filePath = ti.file_path; 若非 decisions/ 路径 → null（放行）
  若文件名不以 .json 结尾 → deny("decisions 目录只允许 JSON 文件")

  # 取「将要写入的内容」，而非磁盘内容
  if typeof ti.content === 'string':      # Write
      content = ti.content
  elif typeof ti.new_string === 'string': # Edit
      disk = safeRead(filePath)           # 读磁盘原文
      if disk == null: return null        # 无法重建，放行（Edit 本身会失败）
      content = disk.split(ti.old_string).join(ti.new_string)
  else:
      return null                          # 无内容可校验

  try data = JSON.parse(content)
  catch e: return deny("decisions JSON 解析失败: " + e.message)

  try validateDecisionsFile(data)          # 见 D3
  catch e: return deny(e.message)

  return null  # 放行
```

**关键改变**：校验 `tool_input.content`（Write）/ 重建后内容（Edit），不再 `readFileSync` 磁盘。消除「守卫阻止修复写入」的反逻辑。空内容 Write → `JSON.parse('')` 失败 → deny（正确：强制写合法内容）。

---

## 5. Part D3：完整 schema 校验（RC3）

### 5.1 新增共享校验函数（`scripts/devsphere-decisions.js`）

```
VALID_DECISION_STATUS = ['pending', 'decided']
ALLOWED_TOPLEVEL = ['stage', 'taskId', 'decisions']

validateDecisionElement(d):
  if !d 或 typeof d !== 'object': throw "decision 必须为对象"
  if typeof d.id !== 'string' || !d.id: throw "id 必填"
  if !VALID_TYPES.includes(d.type): throw "type 非法: " + d.type   # ← 关键：无 type 直接拒
  if !d.category || !VALID_CATEGORIES.includes(d.category): throw "category 非法"
  if typeof d.summary !== 'string' || !d.summary.trim(): throw "summary 必填"
  if !VALID_DECISION_STATUS.includes(d.status): throw "status 非法"
  if d.type === 'gated':
      if !Array.isArray(d.options) || len<2 || len>4: throw "gated 需 2-4 options"
      for opt in d.options:
          if typeof opt !== 'object' || !opt
             || typeof opt.label !== 'string' || !opt.label.trim()
             || typeof opt.description !== 'string' || !opt.description.trim():
              throw "options 元素必须是 {label, description} 非空对象"
      if !VALID_ASK_MODES.includes(d.askMode): throw "askMode 非法"
      if typeof d.rationale !== 'string' || !d.rationale.trim(): throw "rationale 必填"

validateDecisionsFile(data):
  if !data 或 typeof data !== 'object': throw "decisions 文件须为对象"
  for k in Object.keys(data):
      if !ALLOWED_TOPLEVEL.includes(k): throw "未知顶层字段: " + k   # ← 拒绝 mode/createdAt/openQuestions/assumptions
  if typeof data.stage !== 'string' || !data.stage: throw "stage 必填"
  if typeof data.taskId !== 'string' || !data.taskId: throw "taskId 必填"
  if !Array.isArray(data.decisions): throw "decisions 须为数组"
  for d in data.decisions: validateDecisionElement(d)
```

### 5.2 addDecision 复用校验（DRY）

`addDecision` 构造完 persisted decision 对象后，调 `validateDecisionElement(decision)` 再校验一次（双保险：input 校验 + persisted 校验）。

### 5.3 守卫调用 `validateDecisionsFile`

见 §4.1，guard 用 `validateDecisionsFile` 校验 incoming content。

**效果**：SA 自创 schema 文件现在被拒 —— 顶层 `mode/openQuestions/assumptions` → 未知字段拒；decision 无 `type` → type 非法拒。SA 收到 deny 原因，必须改用 canonical schema（最好直接用 `devsphere-decisions.js add`）。

---

## 6. Part D4：TeammateIdle 质量门（teammate 路径兜底）

### 6.1 动机

PreToolUse 在 teammate 会话触发（高置信），是主防线。但「PreToolUse-for-teammates 的 `agent_type` 字段未文档化」（guide 标注）。为防御该不确定性 + 防御「SA 报告完成但文件非法/缺失」，加 TeammateIdle 兜底：**teammate 报告完成（idle）前，其 decisions 文件必须 schema 合法，否则 exit 2 强制继续。**

### 6.2 实现

`scripts/devsphere-guard.js` 新增 CLI `check-teammate-decisions`：

```
check-teammate-decisions(workspaceRoot):
  taskPath = get-task-path(workspaceRoot)
  if !taskPath: exit 0                      # 无活跃任务，放行
  decisionsDir = taskPath/decisions
  if !exists(decisionsDir): exit 0          # 无 decisions 目录，放行
  for each *.json in decisionsDir:
      try data = JSON.parse(read(file))
      catch e: exit 2 + stderr("<file> 解析失败: " + e.message)
      try validateDecisionsFile(data)
      catch e: exit 2 + stderr("<file>: " + e.message)
  exit 0                                    # 全部合法，允许 idle
```

**作用域**：不依赖 `teammate_name`→stage 映射（未文档化），改为校验活跃任务下**所有已存在的** decisions JSON。只有文件非法时才 exit 2；文件不存在/目录不存在 → 放行（不强制存在，只强制合法）。spurious-block 风险低：PreToolUse 已拦非法写入，reviewer idle 时所有 decisions 文件本就合法。

### 6.3 hooks.json 接线

新增 TeammateIdle 条目：

```json
"TeammateIdle": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-teammate-decisions \"${CLAUDE_PLUGIN_ROOT}/..\""
      }
    ]
  }
]
```

TeammateIdle 无 matcher（文档：silently ignored），始终触发，脚本内部按任务路径过滤。

---

## 7. 影响面汇总

| 文件 | 改动 | 类别 |
|---|---|---|
| `scripts/devsphere-decisions.js` | 新增 `validateDecisionElement`、`validateDecisionsFile`；`addDecision` 复用校验；导出 | D3，可 TDD |
| `scripts/devsphere-guard.js` | `checkDecisionsFormatFromStdin` 改校验 incoming content（D2）；新增 CLI `check-teammate-decisions`（D4） | D2/D4，可 TDD |
| `scripts/test/devsphere-guard-decisions.test.js` | D2 测试（Write content 校验、Edit 重建校验、空 content 拒绝）；D3 测试（无 type 拒、未知顶层拒、自创 schema 拒、canonical 通过） | 测试 |
| `scripts/test/devsphere-decisions.test.js` | D3 validateDecisionElement / validateDecisionsFile 测试 | 测试 |
| `hooks/hooks.json` | 新增 TeammateIdle 条目（D4） | D4 |
| `skills/feature-design/SKILL.md` | D1：dispatch_agent scope/draft 协议重写（捕获 agentId、SendMessage 恢复、禁重复派发/禁轮询、降级回退）；约束段加硬规则 | D1，内容 |
| `skills/workflow/SKILL.md` | D1：feature-design 段补 agentId 持有说明 | D1，内容 |
| `references/teammate-design-protocol.md` | D1：scope/draft 完成消息格式强化 | D1，内容 |
| `docs/superpowers/specs/2026-07-09-design-stage-decision-loop-design.md` | §4.4 补 teammate 协议 + TeammateIdle 说明 | 文档 |
| `CLAUDE.md` | 设计循环段补 TeammateIdle 质量门 + agentId 恢复协议 | 文档 |

---

## 8. 验证项（实施时实证）

guide 标注的未文档化点，实施时需实证：
1. PreToolUse 在 teammate 会话触发时 `agent_type` 是否存在（本设计 guard 不依赖 agent_type，按 file_path 过滤，故不阻塞）。
2. `teammate_name` 是否等于 agent frontmatter name（本设计 TeammateIdle 不依赖该映射，按任务路径过滤，故不阻塞）。
3. agent-team teammate 是否加载 agent frontmatter hooks（本设计未用 frontmatter hooks，用全局 hooks.json，故不阻塞）。

三项均不阻塞本设计（设计已规避依赖）。

---

## 9. 计划拆分

- **Plan D1（skill/agent 内容层，场景验证）**：feature-design SKILL 协议重写 + workflow SKILL + teammate-design-protocol 完成消息。无脚本，靠实跑场景验证。
- **Plan D2（脚本守卫，可 TDD，独立可发）**：`validateDecisionElement`/`validateDecisionsFile` + addDecision 复用 + guard 改 incoming content + `check-teammate-decisions` CLI + hooks.json TeammateIdle + 测试。确定性、`node:test` 覆盖。

D2 可先发（确定性、可测）；D1 依赖 D2 的守卫契约（SA 写非法 schema 会被拦，协议才有意义）。
