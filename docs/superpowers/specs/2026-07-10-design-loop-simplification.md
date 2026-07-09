# 设计循环简化:agent + skill + 行为准则 + 守卫 设计

- **状态:** 已通过设计评审
- **日期:** 2026-07-10
- **关联:** 原 spec `2026-07-09-design-stage-decision-loop-design.md`、Plan A-E 的历次修补
- **定位:** 剥离历次修补累积的过度设计(resolver 微观驱动 scope/ask/draft 状态机、mode 耦合、teammate-protocol skill 等),回归最简模型——agent 按岗位能力 + design skill 做分析,行为准则把"想提问"翻译成"记 decision、交 lead 代问",守卫做唯一确定性兜底。

---

## 1. 问题:过度设计的累积

### 1.1 实测现象(2026-07-10 调试)

`FEAT-20260709-001`(collaborative-design,businessDesign 门禁),一句话需求:
- `decisions/business-design-decisions.json` = `{stage, taskId, decisions: []}` —— canonical 但**空**。
- `business-design.md` = 14KB **完整设计稿**(SA 自主 draft)。
- 用户**从未被问**功能设计细节。

debug 日志(`f22340fd`)逐项核查:
- `resolve-design-loop` 调用 **0 次**;`feature-workflow.js` **0 次**;任何 `node ...js` **0 次**;`sync-stage-status` **0 次**;`devsphere-decisions.js` CLI **0 次**。

### 1.2 根因:resolver 微观驱动 + 职责错位

- **确定性 resolver 根本没跑**——lead 加载 feature-design skill 却跳过它的核心步骤(`resolve-design-loop`)。整个 scope→ask→draft 状态机空转,lead 自行其是派 SA,SA 自主 draft。
- **design skill 残留 teammate 化之前的指令**——`feature-design-business` step 4 直接写「`AskUserQuestion` 提问」,但 SA 是 teammate 不能调;SA 没有正确的"该停下来问用户"抓手。
- **SA 的业务分析能力没被方法论引导**——面对一句话需求,skill 没写死"按维度拆解→每个空白出土 decision",SA 不知该提取什么,干脆全自决/留空。
- **职责散乱**——design 方法论在 skill、交互协议在 teammate-protocol skill、角色在 agent、mode/状态在 resolver,四层耦合,lead 和 SA 都无所适从。

### 1.3 关键认知:resolver 从未保证"决策出土"

resolver 的 `ask` 仅在 `humanGated && gated pending>0` 时触发——即只有 SA **已产出** gated decision 后才管 resolve。SA 是否产出 decision,resolver 不管。所以"SA 面对 vague 需求是否拆出 decision"**从来都靠 SA 的能力**,不是靠状态机。微观状态机是不必要的复杂度。

---

## 2. 目标模型(用人做类比)

SA = 一个**不能直接找客户、只能找项目经理转达**的业务分析师:

1. 读业务输入
2. 查知识库相关内容
3. **按自身岗位能力**做分析(design skill 是方法论参考)
4. 想提问 → **行为准则"不能直接问"** → 记一条 gated decision,交 lead 代问 → 等回复 → 继续设计

**核心原则:skill 让提问、Agent 行为准则不允许时,以 Agent 为准——记 decision,让 team-lead 协助。** SA 不关心 resolver/scope/draft/外部调用流程。

---

## 3. 简化后的架构

| 角色 | 职责 | 载体 |
|---|---|---|
| **agent(SA/SE/MDE/TSE)** | 角色职能 + 岗位能力(业务分析/方案/实现/测试) + **行为准则**;加载并遵循对应 design skill 做设计 | `agents/{sa,se,mde,tse}.md` |
| **design skill** | 纯方法论(读输入→查知识→分析→建模→...);**天然写"不清楚就问"**;与 mode/resolver 解耦 | `skills/feature-design-{business,solution,implementation,test}/SKILL.md` |
| **team-lead** | 编排:派 agent 做设计;agent 报"gated decision 就绪"→ AskUserQuestion 代问 → 回写 resolution → SendMessage 唤醒 agent 继续;阶段顺序;评审循环 | `skills/workflow` + `skills/feature-design` |
| **守卫(唯一确定性兜底)** | `check-decisions-resolved`:gated 未 resolved 时不准写主产物 | `devsphere-guard.js`(已有,保留) |

**砍掉/简化:**
- `resolve-design-loop` 的 scope/ask/draft 微观状态机 → **删除**。stage 内的 pause/resume 由 agent 行为准则 + 守卫保证,不由 resolver 指挥。
- design skill 的 "scope 模式/draft 模式/resolver 派发" 耦合 → **解耦**,回归纯方法论。
- `skills/devsphere-teammate-{design-protocol,boundary,review-backflow}` → **合并进 agent 文件的行为准则段**(单一职责,不再三个 skill 拆散)。
- resolver(若保留)只做**阶段顺序**(business→solution→implementation→test→integrated)+ 主产物存在性,甚至可由 workflow prose 表达。

---

## 4. Part F1:agent 行为准则(核心)

每个 stage owner agent(`sa/se/mde/tse.md`)在角色 + 能力之后,写一段明确的**行为准则**(替代当前散落的 teammate-protocol skill 引用):

```
## 行为准则（teammate）

你是 teammate,在 team-lead(主会话)编排下做设计。

### 做设计
- 加载并遵循你的 design skill(feature-design-<stage>)的方法论:读 inputs/requirement.md →
  knowledge-query 查相关知识 → 按你的岗位能力做分析。
- design skill 里写"不清楚就问/向用户确认"时,以本准则为准——你不能直接问用户。

### 需要用户决策时(翻译规则,按 humanGated 分支)
你想提问 / 需澄清 / 有待采纳假设时,**不要直接 AskUserQuestion**(你调不了)。按派发 prompt 的
`humanGated` 标志分支:

- **humanGated=true**(strict 全阶段 / collaborative 门禁阶段):**不要自决**。用 `devsphere-decisions.js add`
  记 `type=gated` decision(含 options/recommendation/askMode/rationale/evidence)→ 通知 lead
  「<stage> 有 N 项 gated decision 待代问」→ **停当轮,等 lead**。lead 代问后回写 resolution 并唤醒你;
  你按 resolution 继续。
- **humanGated=false**(auto-design / collaborative 非门禁阶段):**AI 自决,不打扰用户**。用
  `devsphere-decisions.js add` 记 `type=autonomous` + assumption 标记(记清取舍理由与被拒方案,可追溯)
  → **不停、不等** → 直接续稿。最终审批闸口仍在(用户在阶段终点审批)。

`humanGated` 由 lead 从 `state.json` 的 `workflowMode` + `humanGateStages` + 当前 stage 算出,写入派发 prompt。

### 面对一句话/vague 需求(分析框架)
不要自己把假设填满。按维度拆解,每个需求未提及的维度出土一条 gated decision:
- 用户角色与权限 / 核心实体与生命周期 / 功能范围(In/Out Scope) / 关键业务规则 /
  非功能需求(性能/安全/兼容) / 与下游阶段的交接边界
vague 需求 = 大量空白维度 = 必须问用户,不得自主定稿。

### 续稿
- humanGated=true:所有 gated decision resolved 后,按 design skill 产出完整主产物(artifacts/<slug>.md,用 Write 工具)。守卫会拦"gated 未 resolved 就写主产物"的违约。
- humanGated=false:记完 autonomous decision 后直接产出主产物;无 waiting 环节。

### 硬约束
- decisions 只能用 `devsphere-decisions.js` CLI 增删改(init/add/resolve);禁止 Write/Edit/Bash
  直接写 decisions/ 和 artifacts/(守卫拦)。
- 不臆测、不擅自编答案;不确定 → gated decision。
- 记完 decision 即停,等 lead;不原地阻塞、不自行 draft 未 resolved 的产物。
```

**关键**:"提问"的翻译下沉到 agent 行为准则——design skill 照样自然地写"不清楚就问",agent 准则统一翻译成"记 decision、交 lead"。这正是用户原则"以 Agent 为准"。

cie/dev(纯评审者)的行为准则段:做评审 → 发现需用户决策的点 → 提 blocking item 回流给 stage owner(不直接问、不替 owner 决策)。

### frontmatter

agent frontmatter `skills:` 改为预加载**对应的 design skill**(方法论)+ 一个共用的「teammate 行为准则」载体(见 F2)。移除现在预加载的三个 teammate-protocol skill 引用。

---

## 5. Part F2:行为准则的承载(去散乱)

当前行为准则散在 3 个 teammate-protocol skill(design-protocol/boundary/review-backflow)。简化为**单一** skill `devsphere-teammate-conduct`,内容 = 上面 §4 的行为准则(做设计/翻译规则/分析框架/续稿/硬约束)+ 评审者回流 + boundary(不调 AskUserQuestion)。全部 agent 预加载它。

| agent | 预加载 |
|---|---|
| sa/se/mde/tse | `devsphere-teammate-conduct` + 对应 design skill(`feature-design-<stage>`) |
| cie/dev | `devsphere-teammate-conduct` |

删除原 3 个 teammate-protocol skill,合并进 `devsphere-teammate-conduct`。

---

## 5.5. Part F2.5:确定性派发 prompt(脚本 + 模板)

### 动机

派发 prompt 是 agent 收到的 task message——最前、最不可跳过的指令。与其指望 lead(LLM)每次写好派发词,不如让**脚本按编排参数生成**,保证每次一致、完整、可扩展。借鉴 openspec「脚本 + 固定 prompt 模板 → 注入确定性 instruction」模式。

### 机制

```
scripts/devsphere-dispatch.js build <kind> <role> <stage> <taskPath> <skill> [humanGated] [mode] [artifactPath]
  → 读模板 → 填占位符 + 按 kind/humanGated 渲染条件块 → stdout 输出完整派发 prompt
```

- `kind=design`:派 stage owner 做设计。参数:`role stage taskPath skill humanGated mode`。
- `kind=review`:派评审者评审 artifact。参数:`role stage taskPath skill artifactPath`(humanGated/mode 不适用)。

**`<skill>` 是完整 skill 名,由编排(feature-design)显式传入**(如 `scc-dev-sphere:feature-design-business`、`scc-dev-sphere:feature-review`)——模板不构造、不假设前缀。feature-design(lead)跑此脚本,把输出**原样**作为 Agent tool 的 prompt。**所有 agent(设计 owner + 评审者)共用此模板与编排原则。**

### 模板 `templates/dispatch/teammate-dispatch.md`(通用,带占位符 + kind/gated 条件块)

```
你被 team-lead 派发为 {{role}} teammate。任务路径:{{taskPath}}

【通用约束(所有 teammate 共享)】
- 遵循你已预加载的 teammate 行为准则(devsphere-teammate-conduct)。
- 你不能直接调 AskUserQuestion;需用户决策时按 conduct 翻译规则处理。
- decisions 只能用 devsphere-decisions.js CLI(init/add/resolve);禁止 Write/Edit/Bash
  直接写 decisions/ 和 artifacts/(守卫拦)。
- 完成或需代问时,发完成消息给 lead(格式见 conduct skill)。

{{#design}}
【任务:{{stage}} 阶段设计】
1. 加载并遵循 skill: {{skill}}(方法论——含该阶段的输入定义、方法、交接契约)。
2. 按 {{skill}} 的输入定义读取(通常含 inputs/requirement.md + 上游阶段产物的交接契约);knowledge-query 查相关知识,evidence 落盘。
3. humanGated={{humanGated}}(模式 {{mode}}):
{{#gated}}   每个不确定点 → devsphere-decisions.js add 记 type=gated → 通知 lead「{{stage}} N 项待代问」→ 停。绝不自决。
{{/gated}}
{{^gated}}   每个取舍 → devsphere-decisions.js add 记 type=autonomous+assumption → 直接续稿,不停、不问。
{{/gated}}
4. vague 需求:按维度拆解(用户角色/核心实体/生命周期/范围/非功能),每空白维度出土一条 decision。
5. 主产物 artifacts/{{slug}}.md 用 Write 工具({{#gated}}须 gated 全 resolved{{/gated}})。
{{/design}}

{{#review}}
【任务:评审 {{stage}} 阶段产物】
1. 加载并遵循 skill: {{skill}}(评审方法)。
2. 评审 artifact:{{artifactPath}}(从你的角色视角)。
3. 评审结论写入 review-matrix:blocking(必须解决)/ advisory(建议,需人工确认)/ risk_candidate(风险标记)。
4. 不得替 stage owner 做决策;发现「需用户决策」的点 → 提 blocking 项回流给 stage owner
   (owner 在 revise 轮补成 gated decision,见 conduct 的评审回流约定)。
5. 评审完成 → 通知 lead「{{stage}} 评审完成,blocking=N」。
{{/review}}
```

`{{#design}}/{{#review}}` 按 kind 二选一;`{{#gated}}/{{^gated}}` 按 humanGated 渲染(仅 design kind 内)。占位符:`role/taskPath/stage/slug/humanGated/mode/artifactPath`。

### 脚本契约

- `devsphere-dispatch.js build <kind> <role> <stage> <taskPath> <skill> [humanGated] [mode] [artifactPath]` → 读模板,填占位符,渲染条件块,stdout 输出 prompt。
- `kind ∈ {design, review}`。`<skill>` 为完整 skill 名,原样填入 `{{skill}}`(脚本不构造、不校验前缀)。`review` kind 忽略 humanGated/mode,要求 artifactPath。
- 模板路径:`${CLAUDE_PLUGIN_ROOT}/templates/dispatch/teammate-dispatch.md`。
- slug 映射(stage camelCase → kebab,仅用于 `{{slug}}` 产物文件名提示):`businessDesign→business-design` 等。**输入来源由 {{skill}} 自身声明,脚本不存 stage→inputs 映射。**
- 确定性、可 TDD:相同参数 → 相同输出。`node:test` 覆盖:design gated / design 非 gated / review 三种渲染、`{{skill}}` 原样填充、占位符填充、slug 映射、kind 校验。

### 收益

| 维度 | 效果 |
|---|---|
| 确定性 | 派发词脚本生成,lead 不参与措辞 → 每次 agent 收到的指令一致、完整 |
| 可扩展 | 后续加约束 = 模板加一行,所有派发自动带上 |
| 强约束 | task message 最不可跳过;叠加预加载 conduct + 守卫,三重 |
| 参数化 | humanGated/mode/stage 由脚本接收(feature-design 从 state.json 算) |

### 约束力栈(四层)

1. **脚本生成派发 prompt**(task message,完整/确定/可扩展)
2. **预加载 conduct skill**(始终在上下文)
3. **design skill**(派发指令要求 agent 加载)
4. **守卫**(机器可判规则硬兜底)

---

## 6. Part F3:design skill 解耦

`feature-design-{business,solution,implementation,test}/SKILL.md`:
- **移除**「集成契约」里"scope 模式只执行到.../draft 模式.../模式由编排器 resolve-design-loop 派发决定"的耦结。
- **移除** step 里直接的 `AskUserQuestion` 指令(改成「不清楚处需用户决策——见你的 teammate 行为准则:记 gated decision 交 lead 代问」)。
- 保留并**强化**方法论:对 vague 需求的维度拆解框架(与 agent 行为准则呼应)。
- skill 定位回到纯领域方法论:"怎么做业务设计",不关心 mode/resolver/外部流程。

`feature-design-business` step 4 当前:「对不明确处一次只问一个问题(`AskUserQuestion`)」→ 改为:「对不明确处,记 gated decision(见 teammate 行为准则),交 lead 代问;不臆测」。

---

## 7. Part F4:编排简化(feature-design + workflow)

### 7.1 feature-design skill 退化为薄编排器

砍掉 `resolve-design-loop` 微观驱动的步骤1-3 循环,改为:

```
feature-design(主会话执行)职责:
1. 按 stage 顺序(business→solution→implementation→test)找第一个未完成的阶段。
2. 算 humanGated = (mode==='strict-human-loop') || (mode==='collaborative-design' && stage∈humanGateStages)。
3. 对该阶段:**跑 `devsphere-dispatch.js build <role> <stage> <taskPath> <humanGated> <mode>`
   生成派发 prompt** → 用 Agent tool 派发对应 owner agent(teammate),prompt = 脚本输出(原样)。
   - 派发后从 Agent 返回捕获 agentId,记 per-stage。
   - 等 agent 的自动推送消息。
4. 分支:
   - humanGated=true:agent 报"gated decision 就绪"→ 读 decisions gated pending → 逐项
     AskUserQuestion 代问 → `devsphere-decisions.js resolve` 回写 → SendMessage 唤醒该 agentId 续稿
     → 等 draft 完成消息。
   - humanGated=false:agent 不停(记 autonomous + 直接续稿)→ 等 draft 完成消息。
5. agent draft 完成后:sync-stage-status(→ drafted)。
6. **评审循环**:派该 stage 的评审者(见评审矩阵,ciCdRisk=true 则含 CIE)——每人跑
   `devsphere-dispatch.js build review <role> <stage> <taskPath> <artifactPath>` 生成 prompt → 派发 →
   各自跑 feature-review 写 review-matrix。
   - blocking>0:把 blocking 回流给 stage owner → 跑 `build design ...`(revise 信号)派发 owner 修订;
     owner 对需用户决策的 blocking 补成 gated decision(humanGated 时)→ 回 step3 代问 → 续稿 → 重新评审。
     循环至 blocking=0。
   - blocking=0:sync-stage-status(→ ai_review_passed)。
7. humanGated 阶段:AskUserQuestion(confirm_gate)请用户批准 → set-stage-status human_approved。
   非 humanGated 阶段:跳过人工批准。
8. 进下一阶段。全阶段完成 → integrated-design(既有逻辑)。
9. 守卫兜底:humanGated 阶段 owner 未 resolve 就写主产物,check-decisions-resolved 拦下。
```

**不再有** scope/draft/ask/revise 的 resolver 动作枚举;不再调 `resolve-design-loop`。stage 内的 pause/resume 由 agent 行为准则 + 守卫保证。

### 7.2 resolver 的去留

`feature-workflow.js` 的 `resolve-design-loop` 及其 6 动作 → **删除**。保留:
- `sync-stage-status`(主产物存在 → drafted;review blocking=0 → ai_review_passed)——仍需要。
- `set-task-status` / `set-stage-status` ——仍需要。
- workflow 主干 resolver(`devsphere-workflow.js`)的 stage 顺序路由 ——仍需要(决定下一个该跑的 skill)。

即:宏观(workflow 层 stage 路由)+ 同步(sync-stage-status)保留;微观(design-loop 内 scope/ask/draft)删除。

### 7.3 workflow SKILL

更新 feature-design 委托段:feature-design 自驱 stage 顺序 + teammate 派发 + 代问;不再提 `resolve-design-loop`。保留 agentId 跨轮持有说明(SendMessage 恢复同一 teammate)。

---

## 8. Part F5:守卫(不变,确认)

- `check-decisions-resolved`(Write|Edit 主产物):gated pending>0 时 deny —— 保留,是唯一确定性兜底。
- `check-decisions-format`(Write|Edit decisions 内容校验)—— 保留。
- `check-decisions-bash`(Bash 写 decisions/|artifacts/ 拦截,CLI 豁免)—— 保留。
- `check-teammate-decisions`(TeammateIdle 磁盘兜底)—— 保留。

守卫层是这套简化模型的**确定性基石**:agent 行为准则负责"该停就停",守卫负责"违约拦不下"。两者 suffice,不需要 resolver 状态机。

---

## 9. 影响面汇总

| 文件 | 改动 |
|---|---|
| `scripts/devsphere-dispatch.js` | **新建** — `build <role> <stage> <taskPath> <humanGated> <mode>` 读模板填占位符输出派发 prompt;可 TDD |
| `templates/dispatch/teammate-dispatch.md` | **新建** — 通用派发 prompt 模板(占位符 + design/review/gated 条件块;适用所有 agent) |
| `scripts/test/devsphere-dispatch.test.js` | **新建** — design gated / design 非 gated / review 三种渲染、`{{skill}}` 原样填充、占位符填充、slug 映射、kind 校验 |
| `agents/{sa,se,mde,tse}.md` | 加「行为准则」段(§4);frontmatter `skills:` 改为 conduct + 对应 design skill |
| `agents/{cie,dev}.md` | 行为准则段(评审回流);frontmatter `skills:` = conduct |
| `skills/devsphere-teammate-conduct/SKILL.md` | **新建**(合并原 3 个 teammate-protocol skill + 分析框架) |
| `skills/devsphere-teammate-design-protocol/-boundary/-review-backflow` | **删除**(合并进 conduct) |
| `skills/feature-design-{business,solution,implementation,test}/SKILL.md` | 解耦 mode/resolver;AskUserQuestion→记 decision;强化 vague 拆解框架 |
| `skills/feature-design/SKILL.md` | 退化为薄编排器(§7.1);删除 resolve-design-loop 循环 |
| `skills/workflow/SKILL.md` | feature-design 委托段更新(去 resolve-design-loop 提及) |
| `scripts/workflows/feature-workflow.js` | 删除 `resolve-design-loop` + 其 6 动作 + 相关 helper;保留 sync-stage-status / set-task-status / set-stage-status |
| `scripts/test/design-loop-resolver.test.js` | 删除其中测 `resolve-design-loop`/`resolveDesignStage`/`resolvePostArtifact`/`isHumanGated`/`toQuestionData` 的用例;**保留迁移**测 sync-stage-status / set-task-status / set-stage-status 的用例(这些函数保留)——迁入 `feature-workflow-decisions.test.js` 或保留为独立文件 |
| `CLAUDE.md` | 更新设计循环段:简化模型说明(去 resolver 微观、加行为准则) |
| `docs/superpowers/specs/2026-07-09-design-stage-decision-loop-design.md` | §3/§4 标注:resolver 微观驱动已废弃,见本 spec |

---

## 10. 简化收益(对照)

| 维度 | 简化前 | 简化后 |
|---|---|---|
| 设计循环驱动 | resolver 6 动作状态机(scope/ask/draft/review/revise/ready)+ lead 必须跑它 | agent 按 skill+行为准则自驱;lead 只编排 stage + 代问 |
| agent 行为契约 | 散在 3 个 teammate-protocol skill | 单一 conduct skill |
| design skill | 耦合 scope/draft mode + resolver + 直接 AskUserQuestion | 纯方法论,解耦 |
| 确定性保证 | resolver 状态机 + 守卫(双份,且 resolver 没跑) | **守卫单一兜底**(check-decisions-resolved) |
| SA 面对 vague 需求 | 无框架,自主填假设 | 维度拆解框架,强制出土 decision |

---

## 11. 验证策略

F1-F4 是内容层 + 1 处脚本删除,靠**实跑场景验证**:
- collaborative-design,businessDesign 门禁,一句话需求 → SA 应:读需求→查知识→按维度出土多条 gated decision→停;lead 代问;SA 续稿。decision 非空、用户被问、主产物 gated resolved 后才落盘。
- 守卫兜底:模拟 SA 违约(未 resolve 写主产物)→ 被 check-decisions-resolved 拦。

删除 resolve-design-loop 后,现有 design-loop-resolver 测试删除;其余脚本测试(sync-stage-status 等)保持 green。

---

## 12. 计划拆分

- **Plan F0(派发脚本,可 TDD,先发)**:`devsphere-dispatch.js` + 模板 + 测试。确定性、独立可发;是后续编排的基础。
- **Plan F1(agent + conduct skill,内容层)**:新建 conduct skill;4 agent 行为准则 + frontmatter;删 3 个 teammate-protocol skill;cie/dev 准则。场景验证主体。
- **Plan F2(design skill 解耦 + 编排简化)**:4 design skill 去 mode/AskUserQuestion、加拆解框架;feature-design 退化为薄编排器(派发改调 F0 脚本);workflow SKILL 更新。
- **Plan F3(脚本删除 + 文档)**:删 feature-workflow.js 的 resolve-design-loop + 6 动作 + helper;迁移/删 design-loop-resolver.test.js(保留 sync-stage-status 等测试);CLAUDE.md + 原 spec 标注。可 TDD 确认剩余脚本 green。
