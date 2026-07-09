# 决策输出链路修补 + Agent 文件合并 设计

- **状态:** 已通过设计评审
- **日期:** 2026-07-09
- **关联:** 主 spec `2026-07-09-design-stage-decision-loop-design.md`、Plan B spec `2026-07-09-design-loop-plan-b.md`
- **定位:** 修补 Plan A/B 落地后暴露的两个问题：(1) SA/SE/MDE/TSE teammate 在 scope 模式下输出 Markdown 而非结构化 JSON，格式守卫缺失，options 形状未校验，信息密度不足导致用户决策失准；(2) 6 个 agent 文件的「teammate 交互协议」和「人机交互规范」段大量重复，散弹式修改。

---

## 1. 问题诊断

### 1.1 SA 输出 Markdown 而非 JSON（磁盘实证）

`FEAT-20260709-002`（strict-human-loop 模式），SA 在 scope 模式写入了 8 个独立 Markdown 文件：

```
decisions/D-001-user-role-system.md
decisions/D-002-article-lifecycle.md
...
decisions/D-008-rss-and-subscription.md
```

契约期望的是 `decisions/business-design-decisions.json`，通过 `devsphere-decisions.js init` + `add` 写入。Lead 事后手动转录，且**信息丢失**：D-001 在 Markdown 中有 3 个选项，JSON 中仅剩 2 个。

**根因三层：**

| 层 | 问题 |
|---|---|
| 规范层 | SA 协议提到脚本但放在块引用页脚，无可直接复制的 bash 命令；dispatch prompt 只说了「写 decisions」未指定格式 |
| 守卫层 | PreToolUse 防御（`check-decisions-resolved`）只守卫主工件写入；SA 在 `decisions/` 下写 `.md` 文件完全无防御 |
| 校验层 | `devsphere-decisions.js addDecision` 只校验 options 数组长度 2-4，不校验元素形状 —— 规范要求 `{label, description}` 对象，但纯字符串通过校验 |

### 1.2 JSON 信息密度不足

Lead 转录的 JSON 中：
- `options` 全部是纯字符串（无 description），导致 `decision_loop` AskUserQuestion 映射时选项无解释文字
- `rationale` 退化为流水账一句话，丢失了 Markdown 中「从需求分析 → 不确定点 → 若不决策的后果」的完整语境

用户面对信息不足的选项时判断失准 —— 而信息本来就在 SA 的 context 中，只是没落到 JSON 里。

### 1.3 Agent 文件重复

6 个 agent 文件的「teammate 交互协议」「人机交互规范」段几乎一字不差重复。每次修改协议时必须同步 6 个文件（如 Plan B 的 teammate 边界重构就改了全部 6 个文件）。且 SA/SE/MDE/TSE 加载了评审回流约定（不适用其 owner 角色），CIE/DEV 加载了 scope/draft 协议（不适用其纯 reviewer 角色）。

---

## 2. Part 1: JSON 格式守卫（硬闸口）

### 2.1 `devsphere-guard.js` — `check-decisions-format`

新增确定性防御函数，PreToolUse 钩子匹配 `Write|Edit` 到 `decisions/*`：

```
checkDecisionsFormat(stdinJson) → { allow: true } | { allow: false, reason }

决策树：
1. 非 decisions/ 目录                     → allow
2. 文件名不以 .json 结尾                  → deny: decisions 目录只允许 JSON
3. JSON 文件但匹配 <slug>-decisions.json:
   a. JSON parse 失败                     → deny: invalid JSON
   b. 遍历 decisions[].options:
      - 每个 option 必须是 {label, description} 对象  → 否则 deny
   c. gated && rationale 为空             → deny
4. 全部通过                               → allow
```

仅守卫 `decisions/` 目录，不影响其他任何路径的文件写入。

### 2.2 `devsphere-decisions.js` — `addDecision` 收紧校验

gated decision 的 `options` 每个元素必须满足：

```
typeof option === 'object'
  && typeof option.label === 'string' && option.label.trim().length > 0
  && typeof option.description === 'string' && option.description.trim().length > 0
```

不满足 → `throw Error`，拒绝写入。`rationale` 增加非空校验（gated 时必填）。

### 2.3 `hooks/hooks.json` 接线

新增 PreToolUse 条目（路径过滤在脚本内部完成，与现有 `check-decisions-resolved` 同模式）：

```json
{
  "matcher": "Write|Edit",
  "hooks": [
    {
      "type": "command",
      "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-decisions-format"
    }
  ]
}
```

脚本从 stdin 获取 `file_path`，仅在路径匹配 `decisions/` 时执行格式校验，否则直接放行。条目放置在现有 `check-decisions-resolved` 条目之后，两个守卫各守一层：前者守主工件依赖，后者守 decisions 格式。

---

## 3. Part 2: JSON 信息密度提升（规范层）

### 3.1 `templates/decisions/README.md` — 字段规范扩展

| 字段 | 当前约束 | 新约束 |
|---|---|---|
| `summary` | 一句话 | 不变（AskUserQuestion 的 question） |
| `rationale` | 无约束，可选 | **必填**（gated 时）。内容规范：「从 knowledge-query 发现 → 不确定点 → 若不决策的后果。用户看 AskUserQuestion 时这就是决策背景；信息不足 = 用户判断失准。」 |
| `options[].label` | 未定义 | 选项简短标题（≤25 字），对应 AskUserQuestion option label |
| `options[].description` | 未定义 | **必填**。解释该选项的具体含义、取舍代价、适用场景。不是单行 —— 要足够支撑用户做出独立判断 |

### 3.2 Agent 协议嵌入可执行命令

`teammate-design-protocol.md`（见 §4）scope 模式中给出可直接复制的命令：

```bash
# 初始化 decisions 文件
node scripts/devsphere-decisions.js init <taskPath> <slug> <taskId> <stage>

# 每新增一条 gated decision
node scripts/devsphere-decisions.js add <taskPath> <slug> '{"type":"gated","category":"feature_scope","summary":"一句话","rationale":"从 knowledge-query 发现 → 不确定点 → 若不决策的后果","options":[{"label":"选项A","description":"A 的具体含义、取舍、适用场景"},{"label":"选项B","description":"B 的具体含义、取舍、适用场景"}],"recommendation":"选项A","askMode":"single_select","evidence":["EV-xxx"],"impact":"对下游阶段的影响"}'
```

agent 不需要记住 CLI 签名 —— 复制 + 填值即可。

### 3.3 `devsphere-decisions.js` 新增校验点

- `addDecision`: gated 时 `rationale.trim()` 非空
- `addDecision`: gated 时 options 元素形状校验（`{label, description}` 对象）
- `check-decisions-format`（guard 函数）: 对已落盘的 decisions JSON 做同样校验，双重保证

---

## 4. Part 3: Agent 文件合并

### 4.1 协议拆分

当前每个 agent 文件的「teammate 交互协议」「人机交互规范」段拆成三个维度：

| 维度 | 新文件 | 用途 | 引用者 |
|---|---|---|---|
| 设计循环协议 | `references/teammate-design-protocol.md` | scope/draft 模式、硬契约、decisions 脚本命令 | SA/SE/MDE/TSE |
| teammate 边界 | `references/teammate-boundary.md` | 不调 AskUserQuestion、askMode 语义、gated/blocking 回流机制 | 全部 6 个 agent |
| 评审回流约定 | `references/teammate-review-backflow.md` | 评审发现需用户决策 → blocking item → 回流 owner → 补 gated decision → ask 循环。决策创作权始终在阶段 owner | 全部 6 个 agent |

### 4.2 新建文件内容

#### `references/teammate-design-protocol.md`

```
# Teammate 设计循环协议

SA/SE/MDE/TSE 阶段 owner agent 的设计阶段 teammate 交互协议。

## scope 模式（出土决策）
- 按 design skill 做上游分析：调 knowledge-query 查受影响领域知识 → 拆功能点候选 → 识别所有不确定/待采纳假设。
- 据派发 prompt 的 humanGated 标志落 decisions/<slug>-decisions.json：
  - humanGated=true：每个需用户拍板的点写成 type=gated decision。
  - humanGated=false：写成 type=autonomous（自决，不进闸口）。
- **写完 decisions 即停当轮。绝不写主产物、绝不擅自编答案。** 发消息给 lead：「gated 决策就绪，N 项待决」。

## draft 模式（基于决议定稿）
- 读 decisions/<slug>-decisions.json 的 resolution（lead 已逐项问过用户）。
- 按 design skill 产出完整主产物，所有 gated 项必须按 resolution 落实。
- 写完主产物即停当轮。

## 硬契约
- 不确定 → gated decision，不臆测。
- scope 不碰主产物；draft 不改 decisions 的 resolution。
- 违约时 PreToolUse 守卫会拦下写入。

## decisions 脚本命令

初始化 decisions 文件：
  node scripts/devsphere-decisions.js init <taskPath> <slug> <taskId> <stage>

添加一条 gated decision：
  node scripts/devsphere-decisions.js add <taskPath> <slug> '{"type":"gated","category":"...","summary":"一句话","rationale":"完整语境...","options":[{"label":"A","description":"..."},{"label":"B","description":"..."}],"recommendation":"A","askMode":"single_select","evidence":["EV-xxx"],"impact":"..."}'

gated decision 字段规范见 templates/decisions/README.md。
```

#### `references/teammate-boundary.md`

```
# Teammate 边界规范

所有 scc-dev-sphere agent（SA/SE/MDE/TSE/DEV/CIE）作为 teammate 时的通用边界。

## AskUserQuestion 不可用
你是 teammate，**不直接面对用户、不调用 AskUserQuestion**（该工具仅 team-lead / 主会话可用）。

## 需要用户决策时
- 你为 gated decision 选择 askMode，按以下语义（lead 会据此构造 AskUserQuestion）：
  - single_select：互斥单选（如功能点取舍）
  - confirm_gate：高风险闸口确认（两选项确认式）
  - multi_select：非互斥多选
- 决策回流通路：
  - 设计阶段 owner → 写 gated decision（见 teammate-design-protocol.md）
  - 评审者 → 提 blocking item 回流给阶段 owner（见 teammate-review-backflow.md）
```

#### `references/teammate-review-backflow.md`

```
# 评审回流约定

所有 scc-dev-sphere agent 在评审者角色下的交互约定。与 teammate-boundary.md 配合使用。

## blocking → revise → ask 回路
评审中发现「需用户决策」的点：
1. **提为 blocking issue**（通过 review-matrix），不自行决定。
2. **回流给阶段 owner**：owner 在 revise 轮将其补为 gated decision，进 ask 循环（lead 代问用户）。
3. **决策创作权始终在阶段 owner**：评审者提供风险评估和依据，但不替 owner 做决策。

## 评审时仍遵守 teammate 边界
评审发现不确定/需用户拍板的点 → blocking item → 回流。评审者不直接向用户提问。
```

### 4.3 Agent 文件改动

6 个 agent 文件的「teammate 交互协议」「人机交互规范」段替换为引用行：

**SA/SE/MDE/TSE（阶段 owner）：**

```markdown
## teammate 交互协议
- 设计循环：见 [references/teammate-design-protocol.md](../references/teammate-design-protocol.md)
- 边界规范：见 [references/teammate-boundary.md](../references/teammate-boundary.md)

## 评审约定
见 [references/teammate-review-backflow.md](../references/teammate-review-backflow.md)
```

**CIE/DEV（纯 reviewer）：**

```markdown
## teammate 交互协议
- 边界规范：见 [references/teammate-boundary.md](../references/teammate-boundary.md)
- 评审回流：见 [references/teammate-review-backflow.md](../references/teammate-review-backflow.md)
```

各 agent 文件保留不变内容：核心职责、知识查询指引、设计原则、产物责任。

Stale 内容直接删除（不再需要重复的 scope/draft 模式描述、askMode 语义、硬契约等 —— 全部由上述引用文件承载）。

---

## 5. 影响面汇总

| 文件 | 改动 |
|---|---|
| `scripts/devsphere-guard.js` | 新增 `checkDecisionsFormat` 函数 + CLI `check-decisions-format` |
| `scripts/devsphere-decisions.js` | `addDecision` 收紧 options 形状校验 + rationale 非空校验 |
| `scripts/test/devsphere-guard-decisions.test.js` | 新增 guard 测试（拒绝 .md、拒绝纯字符串 options、拒绝空 rationale、通过合法 JSON） |
| `scripts/test/devsphere-decisions.test.js` | 新增 options 形状 reject 测试 + rationale 空值 reject 测试 |
| `hooks/hooks.json` | 新增 PreToolUse 条目（`decisions/*` → `check-decisions-format`） |
| `templates/decisions/README.md` | 扩展 rationale / options[].description 字段规范 |
| `references/teammate-design-protocol.md` | **新建** — scope/draft 协议 + bash 命令模板 |
| `references/teammate-boundary.md` | **新建** — teammate 边界规范 |
| `references/teammate-review-backflow.md` | **新建** — 评审回流约定 |
| `agents/sa.md` | 替换协议段为引用行，删除重复内容 |
| `agents/se.md` | 同上 |
| `agents/mde.md` | 同上 |
| `agents/tse.md` | 同上 |
| `agents/cie.md` | 替换协议段为引用行（仅 boundary + backflow） |
| `agents/dev.md` | 同上 |
| `CLAUDE.md` | 更新 agent 文件引用说明 |
| `docs/superpowers/specs/2026-07-09-design-stage-decision-loop-design.md` | §4.4 补充 decisions 格式守卫说明 |

---

## 6. 不在本范围

- decisions 文件与 review-matrix 的合并（刻意保持分离，spec §10 已明确）
- SA 自动从 Markdown 转 JSON 的转换器（直接消灭 Markdown，不需要转换器）
- feature-assess 的修复（已由 commit `a4024f7` 解决，本文不涉及）

---

## 7. 计划拆分

- **Plan C1（脚本守卫，可 TDD，独立可发）**：`check-decisions-format` 守卫 + `addDecision` 校验收紧 + `hooks.json` 接线 + 测试。确定性、`node:test` 覆盖：拒绝 .md、拒绝纯字符串 options、拒绝空 rationale、通过合法 JSON。
- **Plan C2（规范+Agent 文件，场景验证）**：3 个新 reference 文件 + 6 个 agent 文件 stale 内容替换 + `templates/decisions/README.md` 扩展 + `CLAUDE.md` 更新。依赖 C1 的守卫契约。
