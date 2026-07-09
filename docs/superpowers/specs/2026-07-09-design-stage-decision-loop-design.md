# 设计阶段「过程内人工决策循环」设计

- **状态:** 已通过设计评审，待写实现计划
- **日期:** 2026-07-09
- **作者:** brainstorming session（xiao-bo）
- **关联:** 修复 `strict-human-loop` / `collaborative-design` 模式下 SA（及 SE/MDE/TSE）在设计过程中不与用户交互、擅自从一句话需求自作主张完成整套设计的问题

---

## 1. 背景与问题

### 1.1 现象

用户选择 `strict-human-loop` 模式、仅提供一句话需求（如「创建一个博客系统」），期望 SA 持续与用户对齐具体功能点。实际结果：SA 几乎不与用户交流，自主完成整套业务设计，仅在阶段终稿后让用户确认。

### 1.2 根因

当前工作流的「人工交互」只在**阶段级闸口**被强制（`feature-workflow.js` 的 `isStageReady` + `feature-design` 子编排器的 `human_confirm`），由确定性状态机兜底。

而 SA **设计过程中**的交互（`feature-design-business` SKILL.md 步骤4「对不明确处一次只问一个问题」、步骤8「高风险 assumption 必须人工确认」）只是 **prompt 层面的软约束**，无确定性机制兜底。当 SA Agent 被 workflow 在后台派发、面对「产出 business-design.md」的强完成指令，它倾向于自己把假设填满、一口气交付。**软约束输给了完成压力。**

核心痛点：**模式语义（strict-human-loop / collaborative-design）目前只管「阶段终点确认」，没有管「设计过程中的决策点确认」。**

### 1.3 经查证确认的硬约束（Claude Code 官方机制）

经 `claude-code-guide` 查证官方文档（https://code.claude.com/docs/en/sub-agents.md 、 https://code.claude.com/docs/en/agent-teams.md ）：

| 结论 | 依据 |
|---|---|
| `AskUserQuestion` 对 subagent 不可用 | 官方文档列入「subagent 不可用工具」清单 |
| subagent 只能 run-to-completion，无 suspend/resume | 官方文档 |
| 用户交互边界永远是主会话 | 官方文档（后台 agent 的权限提示也冒回主会话） |
| SendMessage 只能异步续跑，不能同步决策循环 | 文档语义推断 |
| agent-team 存在，但用户交互仍只走 lead（=主会话） | 官方文档（实验特性，需 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`） |
| 「主会话编排 + 每步派发 run-to-completion subagent + 自己扛 AskUserQuestion」是受支持形态 | 推荐（各约束均有文档支撑） |

不可变结论：**用户交互永远在主会话；不存在「保活的 subagent 中途抛 AskUserQuestion」的原语。**

---

## 2. 目标与不变量

### 2.1 目标

让 `strict-human-loop` 和 `collaborative-design`（对门禁阶段）在设计**过程内**就强制人工交互——查知识 → 拆功能点 → 不清楚的点逐个及时澄清 → 每个待采纳的假设由用户拍板——而不只是阶段终点确认。交互节奏对标已安装的 `brainstorming` 技能。

### 2.2 不变量（设计必须保证的硬约束）

1. 用户交互**永远在主会话（=team-lead）**发生（官方机制决定，不可变）。
2. 角色专才（SA/SE/MDE/TSE）以 **agent-team teammate** 形式存在，持久上下文，但仍 run-to-completion per turn——不原地阻塞等用户。
3. **team-lead 是纯调度者 + AskUserQuestion 代理**，绝不跑设计/评审 skill；只跑编排类 skill，下达「现在是 X 阶段，用 Y skill 执行」的指令，并在 teammate 抛来决策时代问用户。
4. SA ↔ team-lead 的决策/澄清**内容**通过**工作区文件**（decisions 文件）流转，不靠瞬时消息。agent-team 消息只是信号/通知。
5. **确定性闸口兜底**：未解决的 gated 决策不允许阶段推进——不依赖 teammate 自觉。
6. 所有阶段状态/闸口信号**可从磁盘事实重建**（重启安全），无不可重建的瞬态。

---

## 3. 架构：agent-teams 拓扑与编排循环

### 3.1 拓扑（以业务设计为例）

```
主会话 = team-lead
  ├── 只跑编排类 skill（workflow / feature-design 子编排）：读 state、决定派谁、何时问用户
  ├── 绝不跑设计/评审 skill
  └── 职责：① 下达「现在是 X 阶段，用 Y skill 执行」的调度指令
            ② teammate 抛来 gated 决策时，做 AskUserQuestion 代理（只有 lead 能调）

SA/SE/MDE/TSE = teammate 执行者
  └── 在自己上下文里跑被指派的 skill，产出产物；遇不确定 → 土壤 gated 决策写入 decisions 文件 → 停当轮
```

### 3.2 编排循环（每个设计阶段通用）

```
1. lead 派 SA 开始该阶段，附 requirement + 上一阶段交接契约
2. SA:  ① 调 knowledge-query 查受影响领域知识 → evidence
        ② 拆功能点候选 + 土壤 gated 决策清单
        ③ 写入 decisions/<stage>-decisions（type=gated, status=pending）
        ④ 发消息给 lead：「gated 决策已就绪，共 N 项待决」→ 停当轮
3. lead: 读 decisions 文件的 gated pending 项，逐项按 askMode 调 AskUserQuestion
        → 写回 resolution → 置 status=decided
4. lead: 全部 resolved 后，发消息给 SA 带上「已 resolved」信号
5. SA:  基于已确认决议写完整 <stage>-design.md → 停当轮
6. 闸口: guard 校验 gated 全 resolved + 主产物存在 → drafted
7. 进入既有 review 循环（评审 → blocking=0 → ai_review_passed → human_approved）
```

### 3.3 关键契约

- **问题由 SA 作者，由 lead 代问。** gated 决策的 `options`/`recommendation`/`askMode` 由 SA（懂业务）写入 decisions 文件；lead 不需设计判断，机械地把每条 pending 转成 AskUserQuestion、把回答写回 `resolution`。
- **SA 硬契约（写进 agent prompt）：** 遇不确定就土壤成 gated 决策并停当轮，**绝不擅自编答案**。即便 SA 违约，§5 闸口也不放行——双保险。
- **teammate 持久上下文**：SA 在 scoping 阶段的分析记忆到定稿阶段仍在，不必重载。这是 agent-teams 相对 fresh-subagent 的核心收益。

### 3.4 通信分层

| 层 | 载体 | 性质 | 用途 |
|---|---|---|---|
| 实质层 | `decisions/<stage>-decisions` 文件 | 权威、持久、可重建 | 决策/澄清**内容**（options/resolution/rationale/evidence） |
| 信号层 | agent-team 消息 | 瞬时、best-effort | 通知/ poke（「决策就绪」「已 resolved 去定稿」） |

文件是权威中间件；消息丢失不影响 resolver 从文件状态重算。这给 experimental 的 agent-teams 上了保险，并契合插件「无状态 resolver + 持久化事实驱动」的现有哲学。

---

## 4. 状态机：不加枚举，纯持久化产物驱动

### 4.1 决策

**不新增状态枚举值。** 仍用现有 `not_started → drafted → ai_review_passed → human_approved`。决策门由**独立的持久化事实**——`decisions/<stage>-decisions` 的 gated resolved 状态——驱动，作为 resolver 派发前置条件。

### 4.2 resolver 派发表（完全由磁盘事实重建）

**关键约定：`decisions` 文件存在 = scoping 已完成。** 以文件存在性区分「未启动 scoping」与「已 scoping 但无 gated 项（全 autonomous）」，避免对已完成 scoping 的阶段重复派发。

| 持久化事实（磁盘上） | resolver 动作 |
|---|---|
| 主产物不存在 + decisions 文件**不存在** | 派 SA scoping（查知识 + 出土 gated 决策，写文件） |
| decisions 文件存在 + 含 gated pending 项 | lead 逐项 AskUserQuestion |
| decisions 文件存在 + gated pending = 0 + 主产物不存在 | 派 SA 定稿（含「scoping 无 gated 项」的退化情形） |
| 主产物存在 | → drafted（既有逻辑） |

### 4.3 重启安全性

「我在哪」完全可从三个磁盘事实重建：`state.json` 的 status + decisions 文件内容 + 主产物是否存在。无不可重建瞬态：

- 重启发生在 SA scoping 中途（decisions 文件尚未含 gated 项）→ resolver 当 not_started，重新派 SA scoping（幂等）。
- 重启发生在 pending 决策中途 → resolver 看到 pending 项，接着问。
- 重启发生在已 decided 待定稿 → resolver 派 SA 定稿。

「SA 正在干活」是 live teammate 的运行时事实（lead 持有 teammate 句柄），不写入持久化状态——resolver 本就无状态、每次从磁盘重算。

### 4.4 确定性兜底机制（harness 级强制）

§2 不变量5「未解决 gated 决策不允许推进」由 hook 在 harness 层兜底，不依赖 teammate 自觉：

**PreToolUse 守卫（必备）**：matcher `Write|Edit`，调用 `devsphere-guard.js check-decisions-resolved`。逻辑：
1. 读被写文件路径；非设计阶段主产物（business-design.md / solution-design.md / implementation-design.md / test-design.md）→ 放行（decisions 文件、evidence 等不受限）。
2. 是主产物 → 读对应阶段 decisions 文件，统计 `type=gated && status=pending`。
3. 存在 pending → **deny**，返回「先解决 N 个待决决策，再定稿」；pending=0 → 放行。

happy path 中此守卫永不触发（SA 先 scoping→决议→再定稿）；仅在 SA 违约时拦下，deny 消息回给 SA 促其先 resolve。选 PreToolUse 而非 PostToolUse，是为了在 SA 写下主产物之前就直接拒绝——harness 级强制，不靠 prompt。门控策略为 stage-aware：仅当 `isHumanGated(mode, stage, humanGateStages)` 为真时强制（strict 全阶段；collaborative 仅 humanGateStages 阶段；auto-design 与非门禁阶段一律放行）。与 resolver 的 stage-level 策略对齐，避免 collaborative 非门禁阶段的潜在死锁。

**sync-artifact 防错（必备，纵深防御）**：现有 `PostToolUse → sync-artifact` 改造为 decisions 感知——主产物被写但该阶段 gated pending > 0 时不置 `drafted`。与 PreToolUse 守卫互为双保险。注意：这是阻止一次错误的 `drafted` 迁移，**不是**把 decision 状态同步进 state.json（不违反 §4「不加枚举」）。

**SubagentStop 重算（可选增强）**：teammate 跑完一轮停当时触发 `sync-stage-status`，给 lead 一个确定性状态快照。lead 本会被 agent-team 消息唤醒并重跑 resolver，故此为稳健性加固，非必需；重启场景不依赖它。

**补充（2026-07-09）：** PreToolUse `check-decisions-format` 改为校验 incoming 写入内容（Write `tool_input.content` / Edit 重建），完整 schema 校验（`validateDecisionsFile`：拒绝无 type 的 decision、拒绝未知顶层字段）。新增 TeammateIdle 质量门 `check-teammate-decisions` 作 teammate 路径兜底。teammate 派发协议：scope 捕获 agentId → draft 经 SendMessage 恢复同一实例，详见 `docs/superpowers/specs/2026-07-09-design-loop-teammate-protocol-fix.md`。

---

## 5. 数据结构：单一 decisions 文件（双用途）

复用并改造现有的 `decisions/<stage>-decisions`（现为 `.md`，如 `business-design-decisions.md`），改造为**结构化文件**，同时承担：① 决策门输入/输出 ② 该阶段知识沉淀决策日志。不再有独立的 open-decisions 文件。

### 5.1 结构

```json
{
  "stage": "businessDesign",
  "taskId": "FEAT-...",
  "decisions": [
    {
      "id": "BD-DEC-001",
      "type": "gated | autonomous",
      "category": "feature_scope | assumption | open_question | business_rule | tradeoff",
      "summary": "博客是否需要用户注册登录？",
      "rationale": "需求未提及，影响鉴权与数据模型范围。依据 EV-002 ...",
      "options": [
        {"label": "需要注册登录 (Recommended)", "description": "..."},
        {"label": "仅作者后台需登录", "description": "..."}
      ],
      "recommendation": "需要注册登录",
      "askMode": "single_select | multi_select | confirm_gate",
      "status": "pending | decided",
      "resolution": null | {"chosen": "...", "note": "...", "decidedAt": "..."},
      "evidence": ["EV-002"],
      "impact": "影响 solutionDesign 的鉴权方案"
    }
  ]
}
```

### 5.2 双用途分工

- **闸口**：resolver/guard 只看 `type=gated && status=pending` 的项，驱动 AskUserQuestion 循环。
- **知识沉淀**：整个文件是该阶段决策日志，`summary`/`rationale`/`resolution`/`impact`/`evidence` 保留叙事与可追溯性；`type=autonomous`（SA 自决取舍、被拒方案）也记在此，不进闸口。

### 5.3 格式

机器消费文件统一用 **JSON**（与 state.json / review-matrix.json / approval 一致），叙事保留在 `rationale`/`resolution.note` 等 rich-text 字段。现有 `.md` 决策文件改造为此结构。

---

## 6. 模式差异化与失败处理

### 6.1 决策循环按模式差异化

| 模式 | 决策循环行为 |
|---|---|
| `strict-human-loop` | 全部 4 个设计阶段跑完整循环：scoping → gated 决策逐项问用户 → 定稿。每个 gated 决策必须用户 resolved |
| `collaborative-design` | 仅 `humanGateStages` 里的阶段跑循环；其余阶段按 auto-design 行为 |
| `auto-design` | 不跑决策循环。SA 把本该 gated 的决策转成 `type=autonomous`+`assumption` 标记，记进文件可追溯，直接定稿。仍查知识库、仍记录决策；最终审批闸口仍在 |

### 6.2 两类不确定，处理不同

- **常规决策**（功能点取舍、假设采纳）：受模式门禁（6.1）。
- **阻断性未知**（连功能点都列不出、完全无法推进）：**任何模式都升级**。SA 记 `category=open_question, options=[]`，lead 用 AskUserQuestion 的 Other 让用户补充需求 → SA 恢复 scoping。「一句话建博客」即由此解：SA 从领域知识 + 知识库枚举文章/评论/鉴权/分类等候选功能点，作为 gated 决策抛给用户，而非自作主张。

### 6.3 失败处理

1. **信息不足以 scoping** → open_question 升级，用户补充后幂等重跑（§4.3 保证）。
2. **知识库不可用/无证据** → 标 `assumption` 记录，不阻断（沿用现有 SA 行为）。
3. **用户跳过/延后某决策** → 可显式转成 `autonomous`+assumption（接受风险并记录），否则门禁不放行，阶段挂起。
4. **SA 违约**（编答案、未 resolve 就定稿）→ guard 拒绝 `drafted` 迁移，lead 重新派 SA。
5. **重启中途** → §4.3 覆盖。
6. **评审发现决策有问题** → 融入既有 review-matrix 循环：SE 标记 → 回流为新的 gated 决策或修订。

---

## 7. 影响面（要改/新增的文件）

### 脚本（确定性）
- `scripts/devsphere-decisions.js`（**新增**）— decisions 文件 CRUD，对齐 `devsphere-review-matrix.js` 模式。
- `scripts/devsphere-guard.js` — 新增 `check-decisions-resolved`：gated pending 存在时拒绝进 `drafted`。
- `scripts/workflows/feature-workflow.js` — resolver 新增决策循环动作（dispatch-scope / ask-decisions / dispatch-draft）+ stage 就绪前置条件。
- `scripts/devsphere-state.js` — decisions 文件读写 helper、每阶段 decisions 路径。

### Skill
- `skills/workflow/SKILL.md` — agent-teams 派发 + 决策循环动作处理（AskUserQuestion 代理）。
- `skills/feature-design/SKILL.md` — 子编排器路由进决策循环。
- `skills/feature-design-{business,solution,implementation,test}/SKILL.md` — 重写为 **scope（查知识 + 出土决策）→ draft（基于已确认决策定稿）** 两段式。
- （可选）抽 `skills/feature-design-common` 共享 scope→decide→draft 步骤，避免 4 个 skill 重复。

### Agent
- `agents/{sa,se,mde,tse}.md` — 重写「人机交互规范」段：**出土决策即停、绝不编答案**契约；如何 author gated 决策（options/recommendation/askMode）；knowledge-query 优先。

### 参考 / 模板 / Hook / 文档
- `references/interaction-guidelines.md` — 新增 `decision_loop` 模式（lead 如何机械地把 gated 项转成 AskUserQuestion）。
- `templates/decisions/` — 新结构化决策模板（替换现有决策模板）。
- `hooks/hooks.json` — 见 §4.4：① 新增 PreToolUse 守卫 `check-decisions-resolved`（必备）；② 现有 `sync-artifact` 改造为 decisions 感知（必备）；③ 可选 SubagentStop 重算。**不需要**把 decision 状态同步进 state.json 的 hook——resolver 直接读 decisions 文件（§4）。
- `CLAUDE.md` — 更新状态机、设计阶段表、workflow 路由描述。
- 插件文档化依赖 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`。

---

## 8. 待写实现计划时再定的细节（非本设计范畴）

- agent-teams teammate 的具体派发 prompt 模板。
- `decision_loop` AskUserQuestion 构造的精确字段映射。
- guard 校验失败时的具体回流路径与重试上限。
