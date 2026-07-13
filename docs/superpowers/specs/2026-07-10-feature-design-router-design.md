# 设计阶段状态流转固化:feature-design-router

- 日期: 2026-07-10
- 状态: Draft(待实现)
- 范围: `skills/feature-design`、`scripts/`(新增 router)、`scripts/workflows/feature-workflow.js`

## 1. 背景与动因

当前设计阶段的编排由 `skills/feature-design/SKILL.md`(46 行薄编排器)在主会话用自然语言驱动:选阶段、算 humanGated、派 owner、代问 gated decision、派评审、人工批准、阶段流转。确定性只在兜底层(`sync-stage-status` + hooks 守卫)。

两个动因促成本设计:

- **A. 实测有执行偏差**:阶段流转、humanGated 分支、评审回流等控制逻辑靠 LLM 读 46 行自然语言执行,实际跑时会跳步/漏判/误派。
- **D. 不可测试**:自然语言承载的控制流无法构造测试;只有挪进确定性脚本才可单测。

此外发现一个真实 gap:grep 未找到任何 SKILL/脚本显式写 `assessed → designing` 过渡(`set-task-status` 只被用来写 `assessed`),即"进入设计阶段时翻 `designing`"目前活在自然语言里、无人确定地写——正是 A 类漂移的例证。

## 2. 目标与非目标

**目标**

- 把 feature-design SKILL 里自然语言承载的状态流转与动作选择,固化成确定性 router(磁盘事实 → 下一步动作)。
- router 作为纯函数可单测(D)。
- SKILL 退化为对 lead 的薄指令,不含控制流判断(A:减少漂移面)。
- 收敛 `feature-workflow.js` 中删 `resolve-design-loop` 后遗留的孤儿函数(简评第 3 点)。

**非目标**

- 不改 hooks/守卫(仍是反应式硬底线)。
- 不改 `devsphere-dispatch.js` / `devsphere-decisions.js` / review-matrix CRUD。
- 不重提 teammate vs subagent 选型(当前已围绕 teammate + conduct + idle 兜底建立,超出本次范围)。
- 不构造 agent runtime:插件组合 Claude Code 原语,不自己维护 teammate 身份/生命周期。

## 3. 架构与组件边界

引入确定性 router,把"现在该做哪个动作"从自然语言挪成纯函数。其余组件职责不变。

```
feature-design SKILL (薄循环,主会话 = team lead)
   │  事件驱动:在入口 / teammate 回报时咨询
   ├─→ node scripts/feature-design-router.js <workspaceRoot>
   │     纯函数:读 state + decisions + review-matrix + mode/gates
   │     → 输出一个 designAction JSON
   ├─→ 按 designAction 用原生 teammate 原语执行(按名字 spawn/message)
   ├─→ 需改 status 时调 feature-workflow.js 写命令
   └─→ node workflows/feature-workflow.js sync-stage-status(沿用)
```

### 职责正交

| 组件 | 职责 | 本次改动 |
|------|------|---------|
| `feature-design-router.js`(新) | 磁盘事实 → designAction,只读不写 | 新增 |
| `feature-design/SKILL.md` | lead 的薄指令(无控制流判断) | 重写 |
| `workflows/feature-workflow.js` | status 编排(读侧 `resolveNextAction` + 写侧 set-* 命令) | `resolveDesigning` 保持顶层委托 |
| `devsphere-dispatch.js` / `devsphere-decisions.js` / sync | 不变 | 无 |
| hooks 守卫 | 不变(反应式硬底线) | 无 |

**关键切分**:feature-workflow.js 管"任务在哪一级状态"(顶层 status 状态机 + 读写命令);router 管"设计阶段内部现在做哪个动作"。两者正交。后续新流程加 `<流程>-<阶段>-router.js` 同构。

### 不变量

1. router **只读不写**,纯函数,无副作用 → 可测。
2. router **只在边界被咨询**(入口、sync 之后、teammate 回报之后);等待 teammate 期间 lead 不调 router → "在飞"歧义不进入 router。
3. **磁盘是唯一 source of truth**。插件**不持 agentId/不维护 teammate 注册表**——那是 harness 的职责(team config `members`)。resume 后 router 按 disk 重算,lead 按 Claude Code 文档解法重新 spawn。
4. SKILL **不自行判断阶段流转**,一律听 router;仅保留"用原生原语执行 action"的机械职责。

## 4. router:designAction schema 与决策树

### 4.1 前置契约(钉死 gap)

- **进入设计**:feature-design SKILL 的**固定入口行**执行 `set-task-status designing`(单条确定性命令,无分支)。→ 关闭 `assessed→designing` 无人写的 gap。
- **咨询前先 sync**:lead 每次调 router 之前先跑 `sync-stage-status`。router 永远看到已同步 status,不必处理"产物已存但 status 没升"的中间态。
- **只在边界咨询**:派发 teammate 后 lead 不调 router,等 teammate 回报(idle/消息自动送达,见 Claude Code agent-teams 文档)再调。

### 4.2 designAction schema(6 种 kind)

router 输出恰好一个 action。公共字段:`stage`、`slug`、`humanGated`、`reason`。teammate 寻址用**确定性名字** `<role>-<stage>`(如 `sa-businessDesign`),不用 agentId。

| kind | 触发条件(已 sync 后) | 关键字段 | lead 执行 |
|------|----------------------|---------|-----------|
| `produce_draft` | `status==='not_started'` 且 `gatedPending===0`;或 `drafted` 且 `blocking>0` | `role`,`skill`,`mode`,`name`,`payload.mode`:`initial`\|`continue`\|`revise`,`resolutions?`,`blockingItems?` | initial→`devsphere-dispatch.js build design` 渲染 prompt → spawn teammate(带规定名字);continue/revise→按名字 message 该 teammate(harness 判存在性,不存在则 spawn) |
| `ask_gated` | `gatedPending>0` | `name`,`decisions[]`(pending gated 全字段:id/options/askMode/recommendation/rationale) | 逐项 AskUserQuestion(interaction-guidelines 的 decision_loop)→ 每项 `devsphere-decisions.js resolve` 回写 |
| `dispatch_reviews` | `status==='drafted'` 且 matrix 无 blocking 数据(评审未跑) | `reviewers[]`(每项 `role`+`name`+渲染好的 review 派发 CLI),`artifactPath` | 并行 spawn 评审 teammates(各 background) |
| `human_approve` | `status==='ai_review_passed'` 且 `humanGated===true` | `stage` | AskUserQuestion `confirm_gate` → 批准则 `set-stage-status <stage> human_approved`;驳回则把用户反馈作为 blocking 注入 matrix → 转 revise |
| `design_phase_complete` | 4 阶段全部 `isStageReady` | — | 跑 integrated-design(既有逻辑)→ `set-task-status design_ready` |
| `design_blocked` | revise 轮数达到 `state.json.designRevisionLimit`（默认 25） | `reason` | 展示阻塞、停 |

> **revise 轮数来源**:review-matrix 的 `round` 是 **per-issue** 字段(`devsphere-review-matrix.js:122`),无 per-stage 计数器。router 用 `maxBlockingRound(matrix, slug)`(取该 artifact 的 blocking issue 中最大的 `round`)推导当前轮数。**依赖**:revise 回流时必须给新 blocking issue 打 `round = 上一轮最大 round + 1`,否则轮数恒为 1、cap 永不触发。该 round 递增逻辑属 revise 执行流程,实现计划须钉死(当前代码未实现该递增——这是既有 gap,本设计一并补上)。

> `produce_draft` 合并 initial/continue/revise 三态(靠 `payload.mode` 区分),避免多个 kind 做同一件事("派/唤醒 owner")。dispatch vs message 的选择不由 router 定——router 出 `payload.mode` + 名字,lead 用原生原语按名字处理(harness 判断 teammate 存在性)。

### 4.3 router 核心决策树(伪码,纯函数)

```js
function resolveDesignAction(taskPath, state):
  for stage in DESIGN_STAGE_ORDER:           // business/solution/implementation/test
    if isStageReady(stage.status, stage, mode, humanGates): continue
    slug    = stageToArtifact(stage)
    gated   = isHumanGated(mode, stage, humanGates)
    pending = countGatedPending(taskPath, slug)
    blocking = reviewMatrix.blocking[slug]    // undefined = 评审未跑
    round   = maxBlockingRound(matrix, slug)  // 从 issuesList 的 blocking issue 的 round 字段推导(per-issue,无 per-stage 计数器)

    if stage.status === 'not_started':
      if pending > 0: return ask_gated(stage, pendingList)
      return produce_draft(stage, payload.mode='initial')
    if stage.status === 'drafted':
      if round >= state.designRevisionLimit: return design_blocked(stage, 'revise 超上限')
      if blocking > 0:      return produce_draft(stage, payload.mode='revise', blockingItems)
      if blocking === undefined: return dispatch_reviews(stage, reviewers)
      // blocking === 0 由 sync 升 ai_review_passed,不会落到这
    if stage.status === 'ai_review_passed':
      if gated: return human_approve(stage)
      else: continue                          // 非门禁阶段视为完成,下一阶段
    // 'human_approved' → isStageReady 已 continue
  return design_phase_complete()
```

### 4.4 阶段流转:读侧 emergent,无 advance 动作

router 是无状态纯函数,每次从磁盘重算"第一个未完成阶段"。阶段完成状态由 feature-workflow.js 写命令写入(门禁阶段 `set-stage-status human_approved`;非门禁阶段 `sync-stage-status` 升 `ai_review_passed`)。router 下次循环用 `isStageReady` 跳过已完成项、落到下一个未完成项。**没有显式 `advance_stage` action**——不需要。

唯一显式终态是 `design_phase_complete`(4 阶段全 ready 后循环跌出),因它要触发 integrated-design + `set-task-status design_ready`,是不同于"进下一阶段"的动作。

阶段边界副作用(decisions 文件初始化)挂在 `produce_draft{initial}` 执行里(`devsphere-decisions.js init`),不单设动作。

### 4.5 复活死代码

`isStageReady / isHumanGated / stageToArtifact / getDesignAgent / getDesignSkill / getDesignReviewers / DESIGN_STAGE_ORDER` 从 `feature-workflow.js` 搬进 router(或被 router require),从无调用点变为被 router 调用 + 被 router 测试覆盖。

## 5. SKILL:薄指令契约(不造 runtime)

SKILL 从 46 行控制逻辑压缩成事件驱动的薄指令。**关键:插件不持 agentId、不维护 teammate 注册表、不造控制流状态机**——这些是 harness 职责(Claude Code agent-teams 文档:teammate 按名字寻址,team config 管 `members`,消息自动送达,idle 自动通知,lead 无需轮询)。

### 循环骨架

```
入口(固定行): set-task-status designing

ON 入口 / ON teammate 回报(idle / 消息: draft 成 / N 项 gated / 评审完成 / blocking=N):
  sync-stage-status
  action = feature-design-router <workspaceRoot>
  EXEC(action)

EXEC(action) 按 kind:
  produce_draft:
    if payload.mode == 'initial':
        devsphere-decisions.js init <slug>
        prompt = devsphere-dispatch.js build design <role> <stage> <taskPath> <skill> <humanGated> <mode>
        spawn teammate(名字=action.name, prompt)
    else (continue | revise):
        message teammate(名字=action.name, 内容=按 payload 组装 resolutions/blockingItems, summary 必填)
    [harness 自动送达;lead 等 teammate 回报,不重咨询 router]

  ask_gated:
    for d in action.decisions:
        choice = AskUserQuestion(d)                 # interaction-guidelines decision_loop
        devsphere-decisions.js resolve <slug> <id> <resolution>
    [立即重咨询:pending 清零 → router 返回 produce_draft{continue}]

  dispatch_reviews:
    for r in action.reviewners:                     # 并行
        spawn teammate(名字=r.name, prompt=review 派发 CLI 的 stdout)
    [评审 one-shot,不持 agentId;等回报]

  human_approve:
    if AskUserQuestion(confirm_gate) == 批准:
        set-stage-status <stage> human_approved
        [重咨询:router 跳到下一阶段]
    else: 把用户反馈作为 blocking 注入 matrix → 触发 produce_draft{revise}
        [重咨询]

  design_phase_complete:
    跑 integrated-design(既有逻辑)
    set-task-status design_ready
    [EXIT]

  design_blocked:
    展示 reason,停
```

### 与原生原语的边界

- **不持 agentId**:router 输出确定性名字 `<role>-<stage>`;spawn/message 用名字;存在性/wake 由 harness 判定。
- **不造轮询状态机**:依赖 agent-teams 文档的"消息自动送达 + idle 自动通知";teammate 回报自然触发 lead 重咨询 router。
- **resume 不写专门处理**:disk 在,router 重算;in-process teammate 不跨 `/resume`(文档已知限制),lead 按文档解法重新 spawn。正确性由磁盘保证。
- **TeammatIdle hook 的 `check-teammate-decisions` 兜底保留**:hook 层职责,不是 SKILL 状态机。

## 6. 数据流 + 与 hooks/guard 的关系

### 读写权责

| 组件 | 读 | 写 |
|------|----|----|
| feature-design-router.js | state.json、decisions/*.json、review-matrix.json | 只读不写 |
| feature-workflow.js(写命令) | — | state.json(set-task-status / set-stage-status / sync-stage-status) |
| devsphere-decisions.js | decisions/*.json | decisions/*.json(init/add/resolve) |
| devsphere-dispatch.js | dispatch 模板 | stdout(派发词) |
| feature-design SKILL(lead) | router 输出 | 调 CLI;spawn/message teammate(原生) |

### router 与 hooks 正交,不互相替代

- **router = 主动"下一步该干嘛"**(lead 咨询驱动流程)。
- **hooks = 反应式硬闸门**(拦非法写)。router 不管写,hooks 一行不改、照常兜底:
  - `check-decisions-resolved`(Write|Edit):teammate 在 gated 未 resolve 时写主产物 → 拦。router 也会先算出 ask_gated,hook 是最后确定性兜底,防 lead 漏看 router。
  - `check-decisions-format` / `check-decisions-bash`:decisions 写入 schema、禁 Bash 直写。
  - `TeammateIdle → check-teammate-decisions`:teammate idle 时磁盘兜底(尤其重要——SKILL 不再造控制流,idle→lead 重咨询 链若断,hook 仍是兜底)。
  - `PostToolUse Write|Edit → sync-artifact`:产物落盘自动同步。

**不变量保留**:router 是软建议(lead 可能不遵循),hooks 是硬底线。重叠处 router 提示在前、hook 兜底在后。本次不改 hooks。

## 7. 测试策略

router 是纯函数 → 可单测。SKILL 是给 LLM 的指令、不可单测,但其决策逻辑全在 router——router 测住 = 流转逻辑测住。

### router 单元测试(`scripts/test/feature-design-router.test.js`,沿用现有 node 测试模式)

构造 state + decisions + matrix fixture,断言 `resolveDesignAction` 返回的 kind + 关键字段,覆盖决策树每个格子:

| 构造条件 | 期望 action |
|---------|------------|
| not_started, gatedPending=0 | `produce_draft{mode:initial}` |
| not_started, gatedPending=2 | `ask_gated` + decisions 字段完整 |
| drafted, blocking>0 | `produce_draft{mode:revise, blockingItems}` |
| drafted, matrix 无 blocking | `dispatch_reviews` + reviewers 完整 |
| ai_review_passed, humanGated=true | `human_approve` |
| ai_review_passed, humanGated=false | skip → 下一阶段 |
| 4 阶段全 isStageReady | `design_phase_complete` |
| revise 轮数达到 `state.json.designRevisionLimit` | `design_blocked` |

### 专项断言

- **三模式 × 门禁组合**:`isStageReady` / `isHumanGated` 在 strict / collaborative(门禁/非门禁)/ auto-design 下的完成判定。
- **阶段推进序列**:喂递进 state,断言 router 按 business→solution→implementation→test→complete 顺序产出。
- **派发词锁定**:`produce_draft` / `dispatch_reviews` 输出的 CLI 命令串做字符串相等断言,锁死"派发词由 dispatch 脚本生成"不变量。
- **确定性名字**:断言 teammate 名字符合 `<role>-<stage>` 规约。

### 刻意不测(划清边界)

- teammate 实际 spawn/message/wake(harness 行为,集成层)。
- AskUserQuestion 交互(主会话能力)。
- hooks 兜底(已有/独立,本次不改)。

## 8. 实现切面(实现计划阶段细化)

预期改动文件:

- 新增 `scripts/feature-design-router.js`(router + 搬入的辅助函数 + CLI 入口)。
- 新增 `scripts/test/feature-design-router.test.js`。
- 重写 `skills/feature-design/SKILL.md`(46 行控制逻辑 → 薄指令 + action→执行映射)。
- 小改 `scripts/workflows/feature-workflow.js`:把被 router 接管的辅助函数移走/改为 export 给 router require;`resolveDesigning` 保持顶层委托。
- 不改:hooks、devsphere-dispatch.js、devsphere-decisions.js、devsphere-review-matrix.js、devsphere-state.js、templates。

## 9. 风险与取舍

- **token 成本**:`produce_draft{continue/revise}` 走原生 message 唤醒(harness 保活 teammate),复用上下文,成本可控;resume 极端情况下重 spawn 会重做功,但磁盘(decisions + artifact)是 checkpoint,丢的只是 agent 私有草稿推理,不影响产物质量。
- **SKILL 仍是 LLM 指令**:router 固化了"下一步该干嘛",但"执行 action 时具体怎么 message teammate"仍是 LLM 行为;hooks 是硬底线兜住致命违规(如 gated 未 resolve 写主产物)。这与动因 A 对齐:把可漂移的控制流挪进 router,把不可漂移的留在 hooks。
- **teammate vs subagent 选型未重提**:文档指出 agent team 不适合顺序任务,设计阶段主体顺序。本次不重提(超出范围);若后续要优化,router 的 action 抽象不阻碍切到 subagent 派发。
