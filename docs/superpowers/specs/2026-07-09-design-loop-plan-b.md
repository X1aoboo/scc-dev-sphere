# 设计阶段决策循环 — Plan B（skill/agent 采纳层）设计

- **状态:** 已通过设计评审，待写实现计划
- **日期:** 2026-07-09
- **关联:** 主 spec `2026-07-09-design-stage-decision-loop-design.md`；建立在已落地的 Plan A（commit `1ef4750..853b605`）之上
- **定位:** Plan A 建好确定性机器骨干（decisions CRUD + PreToolUse 守卫 + resolver 动作）；Plan B 让 skill/agent 层真正用上它，把「SA 过程中持续交互」落地

---

## 1. 职责分层（核心原则）

**skill 是领域动作，不被架构裹挟；teammate 架构相关的交互策略放 agent；路由调度固化进脚本。**

| 层 | 职责 | 载体 |
|---|---|---|
| 领域动作 | 怎么做业务/方案/实现/测试设计（章节、质量门、知识查询、产物结构），phase 无关 | `feature-design-*` skill（轻改） |
| 角色 + 交互策略 | teammate 协议：scope/draft 模式、「绝不编答案」硬契约 | `agents/{sa,se,mde,tse}.md` |
| 架构（路由调度） | 调 `resolve-design-loop`、agent-teams 派发、AskUserQuestion 代理 | `workflow` + `feature-design` skill + `feature-workflow.js` |
| 交互规范 | lead 如何把 gated 决策机械转成 AskUserQuestion | `references/interaction-guidelines.md` `decision_loop` 模式 |

## 2. resolver 驱动整个设计循环（确定性）

`feature-workflow.js` 新增 `resolve-design-loop <taskPath>`，确定性返回**精确 nextAction**（复用 Plan A 的 `resolveDesignStageAction`）。和主干 workflow 同构：用户敲 `/workflow` → resolver 算出精确动作 → skill 呈现+执行 → 回 resolver 重算。无状态、可重启。

```
1. 选当前阶段：按序找第一个「主产物不存在」的阶段（business→solution→implementation→test）
2. 计算 humanGated = (mode==='strict-human-loop') || (mode==='collaborative-design' && stage∈humanGateStages)
3. 对该阶段调 resolveDesignStageAction → scope/ask/draft/ready-for-review
4. 返回精确动作：
   scope  → {kind:'dispatch_agent', mode:'scope',  agent, stage, skill, humanGated}
   ask    → {kind:'ask_decisions', stage, decisions:[...]}  # 仅当 humanGated=true 且 gated pending>0；否则视同 draft（防 agent 在 auto-design 误产 gated）
   draft  → {kind:'dispatch_agent', mode:'draft',  agent, stage, skill}
   review → {kind:'dispatch_reviewers', stage, reviewers:[...], skill:'feature-review'}  # 含 CIE（若 CI/CD 风险）
   revise → {kind:'dispatch_agent', mode:'draft', agent, stage, skill, reviewers, requiresReReview:true}
   ready-for-review → 标记阶段完成，推进下一阶段；全完成 → integrated-design（既有逻辑）
```

**`ask` 数据驱动：** resolver 直接把 decisions 文件里的 gated pending 项塞进 nextAction。主会话逐字转成 AskUserQuestion，零 AI 解读——彻底实现「问题由 SA 作者、由 lead 代问」。`ask` 只在人工模式触发（见 §4）。

## 3. Agent teammate 交互协议（sa/se/mde/tse）

每个阶段 owner agent 新增「teammate 交互协议」段，落主 spec §3.3 硬契约：

- **scope 模式**：按 skill 做上游分析（knowledge-query 查知识 → 拆功能点候选 → 识别所有不确定/待采纳假设）；据 `humanGated` 把需用户拍板的点写成 `type=gated`（含 options 2-4/recommendation/askMode/rationale/evidence/impact），自决取舍写 `type=autonomous`；**写完 decisions 即停当轮，绝不写主产物、绝不编答案**；发消息给 lead「gated 决策就绪，N 项」。
- **draft 模式**：读 decisions 的 resolution（lead 已逐项问过用户）；按 skill 产出完整主产物，所有 gated 项按 resolution 落实；写完即停。
- **硬契约**：不确定→gated decision，不臆测；scope 不碰主产物；draft 不改 resolution。违约由 Plan A 的 PreToolUse 守卫拦截。

**CIE / dev（按需评审者，非阶段 owner）：不加 scope/draft 协议。** 经 resolver 的 `review` 动作派发，走既有 review-matrix。若评审发现「需用户决策」的点，提为 **blocking 项** → 触发 `revise` → 回阶段 owner 由其补成 gated decision → 进 ask 循环。决策创作权始终在阶段 owner，CIE/dev 保持纯评审角色。

## 4. 三模式兼容（humanGated 贯穿）

resolver 计算 `humanGated` 标志并传入 scope 派发 prompt；agent 据 `humanGated` 决定产出 gated 还是 autonomous。`ask` 因此自然只在人工模式触发：

| 模式 | scope 产出 | ask 触发？ |
|---|---|---|
| `strict-human-loop` | 全阶段 gated | 是，每个阶段 |
| `collaborative-design` | 仅 `humanGateStages` 阶段 gated；其余 autonomous | 仅门禁阶段 |
| `auto-design` | 全 autonomous | 否，scope→draft 直通 |

脚本路由 + Plan A 的模式门控 PreToolUse 守卫**双重保证** 3 模式兼容。resolver 对 `ask` 再加一道 `humanGated` 校验（仅 humanGated=true 且 gated pending>0 才 ask），即使 agent 在 auto-design 误产 gated 项也不会错问用户。

## 5. 评审纳入同一动作模型

resolver 动作覆盖整个阶段生命周期：`scope → ask → draft → review → (blocking?) revise → re-review → ai_review_passed → (模式门) human_approved`。`review`/`revise` 与 scope/draft 同属 `dispatch_agent`/`dispatch_reviewers` 动作模型，只是角色/skill 不同。评审复用既有 review-matrix（blocking/advisory/risk + humanDecision），**不**与 decisions 文件合并——两者是不同阶段的人工决策载体。

## 6. decision_loop 交互模式 + 字段映射

`references/interaction-guidelines.md` 新增 `decision_loop` 模式，固化主 spec §8 推迟的字段映射（resolver 的 `ask_decisions` 已携带数据，主会话机械转换）：

| decision 字段 | AskUserQuestion 字段 |
|---|---|
| `summary` | `question` |
| `options[]` | `options[]`（label/description 直传） |
| `recommendation` | 推荐项置首、label 加 `(Recommended)` |
| `askMode` | `single_select`→multiSelect:false；`multi_select`→true；`confirm_gate`→两选项确认式 |
| （回写）用户选择 | `resolution.chosen` + `decidedAt`，经 `devsphere-decisions.js resolve` 落盘 |

每条 gated pending = 一个 AskUserQuestion（选项 2-4 已由 Plan A 强校验保证）。主会话对 `ask_decisions` 的 decisions 数组逐条问、逐条 resolve；全 resolved 后回 resolver 重算得 `draft`。

## 7. skill 轻改（去架构污染）

`feature-design-{business,solution,implementation,test}/SKILL.md` 保持纯领域动作，仅：
1. 「集成契约」段加一句：本 skill 是领域参考；agent 在 scope 模式做上游分析子集、draft 模式产出完整主产物；模式由编排器派发决定（见 agent teammate 协议）。
2. 松开「一次性产出主产物」措辞，避免与 scope-then-draft 冲突。

`feature-design/SKILL.md`（子编排器）退化为薄执行器：路由全走 `resolve-design-loop`，自身不持推理逻辑（或直接并入 `workflow` skill）。

## 8. 影响面

- `scripts/workflows/feature-workflow.js` — 新增 `resolve-design-loop`（阶段选择 + 动作 + humanGated + ask_decisions 数据 + review/revise），复用 Plan A 的 `resolveDesignStageAction`。**唯一可 TDD 的脚本改动。**
- `skills/workflow/SKILL.md` — 执行 design-loop nextAction（dispatch_agent / dispatch_reviewers / ask_decisions）；agent-teams 派发；文档化依赖 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`。
- `skills/feature-design/SKILL.md` — 薄执行器化。
- `skills/feature-design-{business,solution,implementation,test}/SKILL.md` — §7 轻改。
- `agents/{sa,se,mde,tse}.md` — 加 teammate scope/draft 协议 + 硬契约。
- `agents/{cie,dev}.md` — 「人机交互规范」段补一句：评审发现需用户决策的点→blocking 项回流给阶段 owner（不加协议）。
- `references/interaction-guidelines.md` — 加 `decision_loop` 模式 + §6 字段映射。
- `CLAUDE.md` — 更新设计循环 / 模式 / 动作模型说明。

## 9. 计划拆分

- **Plan B1（脚本骨干，可 TDD，独立可发）**：`resolve-design-loop` 脚本 + `workflow`/`feature-design` skill 接线。确定性、`node:test` 覆盖：阶段选择、6 动作（scope/ask/draft/review/revise/ready-for-review）、humanGated 三模式、ask_decisions 数据组装、CIE 触发条件。
- **Plan B2（内容层，场景验证）**：4 阶段 owner agent 加 teammate 协议、cie/dev 轻改、4 design skill 轻改、interaction-guidelines 的 decision_loop、CLAUDE.md。依赖 B1 的 resolver 契约。

## 10. 不在本计划范围

- agent-teams teammate 的具体派发 prompt 模板（B2 实现时定）。
- 「scope 产 0 gated 且模式不强制→同轮直 draft」优化（先不做，多一次往返可接受）。
- decisions 文件与 review-matrix 的合并（刻意保持分离）。
