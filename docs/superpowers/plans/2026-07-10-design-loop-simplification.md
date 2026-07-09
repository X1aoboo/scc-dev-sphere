# 设计循环简化(agent + skill + conduct + 守卫 + 派发脚本)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the over-engineered resolver micro-state-machine and mode coupling; restore the simple model — agent follows its design skill + a conduct skill, the lead builds a deterministic dispatch prompt via script, guards backstop the machine-checkable rules.

**Architecture:** Four plans. F0 (dispatch script, TDD, ship first) — `devsphere-dispatch.js` renders a generic `teammate-dispatch.md` template into a complete dispatch prompt parameterized by kind/skill/stage/humanGated. F1 (conduct skill + agent norms) — one `devsphere-teammate-conduct` skill preloaded to all agents; agents carry role + capability + conduct. F2 (design skills decoupled + thin orchestrator) — design skills shed mode/resolver coupling; `feature-design` becomes a short imperative orchestrator calling F0. F3 (delete resolver + docs) — remove `resolve-design-loop` and its 6 actions; keep `sync-stage-status`/`set-task-status`/`set-stage-status`.

**Tech Stack:** Node.js (`node:test` + `node:assert`), no external deps. Scripts dual-use CLI + `require()`.

## Global Constraints

- Preserve agent-teams persistent teammate model; SA remains the decisions writer (lead does not transcribe).
- Dispatch skill name is an EXPLICIT param `<skill>` (full name, e.g. `scc-dev-sphere:feature-design-business`); the template uses `{{skill}}` — never construct by prefix, never store a stage→inputs map (inputs are declared by the skill itself).
- Template is generic for ALL agents: `{{#design}}`/`{{#review}}` blocks by kind; `{{#gated}}`/`{{^gated}}` by humanGated (design kind only).
- Conduct rules are mode-aware: humanGated=true → record `type=gated` + stop + lead asks; humanGated=false → record `type=autonomous`+assumption + continue (no user interrupt).
- Agents preload `devsphere-teammate-conduct` (all) + their design skill (stage owners only) via frontmatter `skills:`; skills must NOT set `disable-model-invocation: true`.
- Guards are the ONLY deterministic backstop — keep `check-decisions-resolved` (stage-aware: gated pending>0 denies main-artifact write in humanGated stages), `check-decisions-format`, `check-decisions-bash`, `check-teammate-decisions`.
- `--dangerously-skip-permissions` does not bypass hooks.
- Existing tests stay green; net test count only changes by documented additions/deletions.

---

## Plan F0: Dispatch Script (TDD, ship first)

### Task F0-1: `devsphere-dispatch.js` + template + tests

**Files:**
- Create: `scripts/devsphere-dispatch.js`
- Create: `templates/dispatch/teammate-dispatch.md`
- Test: `scripts/test/devsphere-dispatch.test.js`

**Interfaces:**
- Produces: `renderDispatch({kind, role, stage, taskPath, skill, humanGated, mode, artifactPath})` → string; CLI `build <kind> <role> <stage> <taskPath> <skill> [humanGated] [mode] [artifactPath]`; exported `renderDispatch`, `slugify`

- [ ] **Step 1: Create the template `templates/dispatch/teammate-dispatch.md`**

```
你被 team-lead 派发为 {{role}} teammate。任务路径:{{taskPath}}

【通用约束(所有 teammate 共享)】
- 遵循你已预加载的 teammate 行为准则(devsphere-teammate-conduct)。
- 你不能直接调 AskUserQuestion;需用户决策时按 conduct 翻译规则处理。
- decisions 只能用 devsphere-decisions.js CLI(init/add/resolve);禁止 Write/Edit/Bash 直接写 decisions/ 和 artifacts/(守卫拦)。
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
4. 不得替 stage owner 做决策;发现「需用户决策」的点 → 提 blocking 项回流给 stage owner(owner 在 revise 轮补成 gated decision,见 conduct 的评审回流约定)。
5. 评审完成 → 通知 lead「{{stage}} 评审完成,blocking=N」。
{{/review}}
```

- [ ] **Step 2: Write failing tests `scripts/test/devsphere-dispatch.test.js`**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { renderDispatch, slugify } = require('../devsphere-dispatch');

test('slugify: stage camelCase → kebab', () => {
  assert.strictEqual(slugify('businessDesign'), 'business-design');
  assert.strictEqual(slugify('implementationDesign'), 'implementation-design');
  assert.strictEqual(slugify('testDesign'), 'test-design');
});

test('design + gated 渲染:含 gated 块、不含 non-gated 块', () => {
  const out = renderDispatch({ kind: 'design', role: 'sa', stage: 'businessDesign',
    taskPath: '/t', skill: 'scc-dev-sphere:feature-design-business', humanGated: 'true', mode: 'strict-human-loop' });
  assert.match(out, /sa teammate/);
  assert.match(out, /scc-dev-sphere:feature-design-business/);
  assert.match(out, /type=gated/);
  assert.match(out, /artifacts\/business-design\.md/);
  assert.doesNotMatch(out, /type=autonomous/);
  assert.doesNotMatch(out, /\{\{stage\}\}/); // 占位符已填
});

test('design + 非 gated 渲染:含 autonomous 块、不含 gated 块', () => {
  const out = renderDispatch({ kind: 'design', role: 'mde', stage: 'implementationDesign',
    taskPath: '/t', skill: 'scc-dev-sphere:feature-design-implementation', humanGated: 'false', mode: 'auto-design' });
  assert.match(out, /type=autonomous\+assumption/);
  assert.match(out, /artifacts\/implementation-design\.md/);
  assert.doesNotMatch(out, /type=gated/);
});

test('design 默认 humanGated=false(未传)', () => {
  const out = renderDispatch({ kind: 'design', role: 'se', stage: 'solutionDesign',
    taskPath: '/t', skill: 'scc-dev-sphere:feature-design-solution', mode: 'auto-design' });
  assert.match(out, /type=autonomous/);
});

test('review 渲染:含 artifactPath、不含 design 任务体', () => {
  const out = renderDispatch({ kind: 'review', role: 'se', stage: 'businessDesign',
    taskPath: '/t', skill: 'scc-dev-sphere:feature-review', artifactPath: '/t/artifacts/business-design.md' });
  assert.match(out, /评审 businessDesign 阶段产物/);
  assert.match(out, /\/t\/artifacts\/business-design\.md/);
  assert.match(out, /scc-dev-sphere:feature-review/);
  assert.doesNotMatch(out, /type=gated|type=autonomous/); // review 无 gated 块
});

test('通用约束段所有 kind 都有', () => {
  for (const kind of ['design', 'review']) {
    const out = renderDispatch({ kind, role: 'sa', stage: 'businessDesign', taskPath: '/t',
      skill: 'x', humanGated: 'true', mode: 'm', artifactPath: '/a' });
    assert.match(out, /devsphere-teammate-conduct/);
    assert.match(out, /devsphere-decisions\.js CLI/);
  }
});

test('占位符全部填充(无残留 {{ }})', () => {
  const out = renderDispatch({ kind: 'design', role: 'sa', stage: 'testDesign',
    taskPath: '/t', skill: 'sk', humanGated: 'true', mode: 'strict-human-loop' });
  assert.doesNotMatch(out, /\{\{/);
});

test('非法 kind 抛错', () => {
  assert.throws(() => renderDispatch({ kind: 'bogus', role: 'sa', stage: 'x', taskPath: '/t', skill: 's' }), /kind/);
});

test('CLI smoke: build design gated 输出 prompt', () => {
  const { execSync } = require('child_process');
  const out = execSync('node scripts/devsphere-dispatch.js build design sa businessDesign /t scc-dev-sphere:feature-design-business true strict-human-loop', { encoding: 'utf-8' });
  assert.match(out, /type=gated/);
  assert.match(out, /business-design\.md/);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node scripts/test/devsphere-dispatch.test.js`
Expected: fail (`Cannot find module '../devsphere-dispatch'`).

- [ ] **Step 4: Implement `scripts/devsphere-dispatch.js`**

```js
#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'dispatch', 'teammate-dispatch.md');
const VALID_KINDS = ['design', 'review'];

function slugify(stage) {
  return String(stage).replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
}

// 渲染 {{#block}}...{{/block}} / {{^block}}...{{/block}} 条件段。
// keep: true → 保留 # 段、删除 ^ 段;false → 删除 # 段、保留 ^ 段。
function renderConditional(tpl, name, keep) {
  const re = new RegExp(`\\{\\{#${name}\\}\\}([\\s\\S]*?)\\{\\{/${name}\\}\\}`, 'g');
  const reNot = new RegExp(`\\{\\{\\^${name}\\}\\}([\\s\\S]*?)\\{\\{/${name}\\}\\}`, 'g');
  return tpl
    .replace(re, keep ? '$1' : '')
    .replace(reNot, keep ? '' : '$1');
}

function renderDispatch(input) {
  const { kind, role, stage, taskPath, skill } = input;
  if (!VALID_KINDS.includes(kind)) throw new Error(`Invalid kind: ${kind} (expected design|review)`);
  const humanGated = input.humanGated === true || input.humanGated === 'true';
  const mode = input.mode || '';
  const artifactPath = input.artifactPath || '';
  const slug = slugify(stage);

  let tpl = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  // kind 条件
  tpl = renderConditional(tpl, 'design', kind === 'design');
  tpl = renderConditional(tpl, 'review', kind === 'review');
  // gated 条件(仅 design 段内出现;review 段无)
  tpl = renderConditional(tpl, 'gated', humanGated);

  // 占位符替换
  const vars = { role, stage, taskPath, skill, humanGated: String(humanGated), mode, artifactPath, slug };
  tpl = tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return tpl.trim() + '\n';
}

function main() {
  const [, , cmd, ...args] = process.argv;
  if (cmd !== 'build') { process.stderr.write(`Unknown command: ${cmd}\n`); process.exit(1); }
  const [kind, role, stage, taskPath, skill, humanGated, mode, artifactPath] = args;
  if (!kind || !role || !stage || !taskPath || !skill) {
    process.stderr.write('Usage: build <kind> <role> <stage> <taskPath> <skill> [humanGated] [mode] [artifactPath]\n');
    process.exit(1);
  }
  try {
    process.stdout.write(renderDispatch({ kind, role, stage, taskPath, skill, humanGated, mode, artifactPath }));
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { renderDispatch, slugify, renderConditional, VALID_KINDS };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node scripts/test/devsphere-dispatch.test.js`
Expected: 9 pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/devsphere-dispatch.js scripts/test/devsphere-dispatch.test.js templates/dispatch/teammate-dispatch.md
git commit -m "feat(dispatch): add devsphere-dispatch.js — render generic teammate-dispatch prompt (design/review/gated)"
```

---

## Plan F1: Conduct Skill + Agent Norms (content layer)

### Task F1-1: Create `devsphere-teammate-conduct` skill

**Files:**
- Create: `skills/devsphere-teammate-conduct/SKILL.md`

- [ ] **Step 1: Create the skill**

```markdown
---
name: devsphere-teammate-conduct
description: scc-dev-sphere 所有 teammate(SA/SE/MDE/TSE/DEV/CIE)的通用行为准则——做设计、需用户决策时的翻译规则、vague 需求拆解、评审回流、teammate 边界。预加载给全部 agent。
---

# Teammate 行为准则

你是 teammate,在 team-lead(主会话)编排下工作。team-lead 派发你时附带的 prompt(由脚本生成)指明本次任务;本准则是你恒定的行为规范。

## 做设计(stage owner:SA/SE/MDE/TSE)

- 加载并遵循派发 prompt 指定的 design skill 的方法论。
- 按你的**岗位能力**做分析(skill 是方法论参考,不是替代你的判断)。

## 需要用户决策时(翻译规则,按 humanGated 分支)

你想提问 / 需澄清 / 有待采纳假设时,**不要直接 AskUserQuestion**(你调不了)。按派发 prompt 的 `humanGated`:

- **humanGated=true**(strict 全阶段 / collaborative 门禁阶段):**不要自决**。用 `devsphere-decisions.js add` 记 `type=gated` decision(含 options/recommendation/askMode/rationale/evidence)→ 通知 lead「<stage> N 项待代问」→ **停当轮,等 lead**。lead 代问后回写 resolution 并唤醒你;按 resolution 继续。
- **humanGated=false**(auto-design / collaborative 非门禁):**AI 自决,不打扰用户**。用 `devsphere-decisions.js add` 记 `type=autonomous`+assumption(记清取舍与被拒方案,可追溯)→ 直接续稿。最终审批闸口仍在。

## 面对一句话/vague 需求(分析框架)

不要自己把假设填满。按维度拆解,每个需求未提及的维度出土一条 decision:
- 用户角色与权限 / 核心实体与生命周期 / 功能范围(In/Out Scope) / 关键业务规则 / 非功能需求(性能/安全/兼容) / 与下游交接边界
vague 需求 = 大量空白维度 = 必须问用户(humanGated)或显式自决记录(非 humanGated),不得静默填假设。

## 续稿

- humanGated=true:所有 gated decision resolved 后,按 design skill 产出主产物(artifacts/<slug>.md,Write 工具)。守卫拦"gated 未 resolved 就写主产物"。
- humanGated=false:记完 autonomous decision 后直接产出主产物。

## 评审(评审者角色:任意 agent + CIE)

- 加载 `feature-review` skill,从你的角色视角评审。
- 评审结论写 review-matrix:blocking / advisory / risk_candidate。
- 发现「需用户决策」的点 → **提 blocking 项回流给 stage owner**(owner 在 revise 轮补成 gated decision)。不替 owner 决策、不直接问用户。

## 边界

- teammate **不能直接调 AskUserQuestion**(仅主会话可)。
- decisions 只能用 `devsphere-decisions.js` CLI(init/add/resolve);**禁止 Write/Edit/Bash 直接写 decisions/ 和 artifacts/**(守卫拦)。
- 不臆测、不擅自编答案;不确定 → decision。
- 完成或需代问时发完成消息给 lead。
```

- [ ] **Step 2: Commit**

```bash
git add skills/devsphere-teammate-conduct/SKILL.md
git commit -m "feat(skills): add devsphere-teammate-conduct — unified teammate conduct (mode-aware + vague decomposition + review backflow)"
```

---

### Task F1-2: Agent frontmatter + delete 3 protocol skills

**Files:**
- Modify: `agents/sa.md`, `agents/se.md`, `agents/mde.md`, `agents/tse.md` (frontmatter `skills:` → conduct + design skill; remove the `## teammate 交互协议`/`## 评审约定` link sections)
- Modify: `agents/cie.md`, `agents/dev.md` (frontmatter `skills:` → conduct; remove link section)
- Delete: `skills/devsphere-teammate-design-protocol/`, `skills/devsphere-teammate-boundary/`, `skills/devsphere-teammate-review-backflow/`

- [ ] **Step 1: Update SA frontmatter + remove link section**

In `agents/sa.md`, change the frontmatter `skills:` list (currently 3 teammate-protocol skills) to:

```yaml
skills:
  - devsphere-teammate-conduct
  - feature-design-business
```

Then delete the `## teammate 交互协议` and `## 评审约定` sections (the blocks containing `references/teammate-*.md` or `devsphere-teammate-*` skill links). The conduct is now delivered via the preloaded `devsphere-teammate-conduct` skill.

- [ ] **Step 2: SE**

`agents/se.md` frontmatter `skills:`:
```yaml
skills:
  - devsphere-teammate-conduct
  - feature-design-solution
```
Remove link sections.

- [ ] **Step 3: MDE**

`agents/mde.md` frontmatter `skills:`:
```yaml
skills:
  - devsphere-teammate-conduct
  - feature-design-implementation
```
Remove link sections.

- [ ] **Step 4: TSE**

`agents/tse.md` frontmatter `skills:`:
```yaml
skills:
  - devsphere-teammate-conduct
  - feature-design-test
```
Remove link sections.

- [ ] **Step 5: CIE**

`agents/cie.md` frontmatter `skills:`:
```yaml
skills:
  - devsphere-teammate-conduct
```
Remove link section.

- [ ] **Step 6: DEV**

`agents/dev.md` frontmatter `skills:`:
```yaml
skills:
  - devsphere-teammate-conduct
```
Remove link section.

- [ ] **Step 7: Delete the 3 old protocol skills**

```bash
git rm -r skills/devsphere-teammate-design-protocol skills/devsphere-teammate-boundary skills/devsphere-teammate-review-backflow
```

- [ ] **Step 8: Verify**

```bash
grep -rn "devsphere-teammate-design-protocol\|devsphere-teammate-boundary\|devsphere-teammate-review-backflow" agents/ skills/ references/ && echo "STALE" || echo "clean"
ls skills/devsphere-teammate-design-protocol 2>/dev/null && echo "NOT DELETED" || echo "deleted ok"
for f in agents/sa.md agents/se.md agents/mde.md agents/tse.md agents/cie.md agents/dev.md; do
  node -e "const fs=require('fs');const t=fs.readFileSync('$f','utf-8');const m=t.match(/^---\n([\s\S]*?)\n---/);if(!m||!m[1].includes('devsphere-teammate-conduct')){console.log('$f MISSING CONDUCT');process.exit(1)}console.log('$f OK')"
done
```
Expected: `clean`, `deleted ok`, all 6 agents `OK`.

- [ ] **Step 9: Commit**

```bash
git add agents/sa.md agents/se.md agents/mde.md agents/tse.md agents/cie.md agents/dev.md
git commit -m "refactor(agents): preload conduct + design skill; remove protocol link sections; delete 3 protocol skills"
```

---

## Plan F2: Design Skills Decoupled + Thin Orchestrator

### Task F2-1: Decouple 4 design skills

**Files:**
- Modify: `skills/feature-design-business/SKILL.md`, `skills/feature-design-{solution,implementation,test}/SKILL.md`

For EACH of the 4 design skills:

- [ ] **Step 1 (business): decouple `feature-design-business/SKILL.md`**

Read the file. Make these edits:

(a) In the `## 集成契约` section, the `**模式:**` bullet currently says the skill is scope/draft mode driven by `resolve-design-loop`. Replace that bullet with:

```
- **模式:** 本 skill 是纯领域方法论。team-lead 派发你执行时,按 skill 全流程做设计;需用户决策时按你的 teammate 行为准则(devsphere-teammate-conduct)处理。不关心外部编排流程。
```

(b) In `## 执行步骤`, step 4 currently: `**隐性知识挖掘**：对不明确处一次只问一个问题（AskUserQuestion），Q&A 落盘为 evidence；不臆测。` Replace with:

```
4. **隐性知识挖掘**：对不明确处,按 teammate 行为准则记录 gated/autonomous decision(不直接 AskUserQuestion);humanGated 阶段交 lead 代问,resolved 后落实。不臆测。
```

(c) Add a `## vague 需求拆解框架` section before `## 专业方法与图示`:

```
## vague 需求拆解框架

面对一句话/信息不足的需求,不要自填假设。按维度逐项判断,每个需求未提及的维度出土一条 decision:
- 用户角色与权限
- 核心实体与生命周期
- 功能范围(In/Out Scope)
- 关键业务规则
- 非功能需求(性能/安全/兼容)
- 与下游(solution/test)的交接边界
vague 需求 = 大量空白维度 = 必须明确(humanGated 时问用户;非 humanGated 时显式自决并记 assumption)。
```

- [ ] **Step 2 (solution): apply the same 3 edits to `feature-design-solution/SKILL.md`**

(a) Replace the `**模式:**` bullet with the same decoupled text. (b) If any step says `AskUserQuestion` directly, replace with the conduct-reference text (read the file to find the exact step; if none says AskUserQuestion, skip this sub-step). (c) Add the same `## vague 需求拆解框架` section.

- [ ] **Step 3 (implementation): apply the same edits to `feature-design-implementation/SKILL.md`**

Same as Step 2 (decouple 模式 bullet; replace any direct AskUserQuestion; add vague framework).

- [ ] **Step 4 (test): apply the same edits to `feature-design-test/SKILL.md`**

Same as Step 2.

- [ ] **Step 5: Verify no design skill still references resolve-design-loop or direct AskUserQuestion as instruction**

```bash
grep -l "resolve-design-loop" skills/feature-design-*/SKILL.md && echo "STALE resolver ref" || echo "clean"
grep -n "AskUserQuestion" skills/feature-design-*/SKILL.md
```
Expected: `clean`; the AskUserQuestion grep should return nothing inside imperative steps (a mention in prose about the conduct translation is OK — read to confirm none instruct the agent to call it directly).

- [ ] **Step 6: Commit**

```bash
git add skills/feature-design-business/SKILL.md skills/feature-design-solution/SKILL.md skills/feature-design-implementation/SKILL.md skills/feature-design-test/SKILL.md
git commit -m "refactor(skills): decouple design skills from mode/resolver; AskUserQuestion→conduct; add vague-decomposition framework"
```

---

### Task F2-2: `feature-design` thin orchestrator + workflow SKILL update

**Files:**
- Modify: `skills/feature-design/SKILL.md` (rewrite as short imperative orchestrator)
- Modify: `skills/workflow/SKILL.md` (feature-design delegation paragraph)

- [ ] **Step 1: Rewrite `skills/feature-design/SKILL.md`**

Replace the entire body (keep the frontmatter `name`/`description`, update description to reflect thin orchestrator) with:

```markdown
---
name: feature-design
description: 设计阶段薄编排器。在主会话运行:按阶段顺序派发 owner agent(脚本生成派发 prompt)、代问 gated decision、派评审、人工批准。依赖 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1。
---

# Feature Design — 设计阶段薄编排器

你在主会话运行(agents=[])。按阶段顺序驱动设计,核心动作由确定性脚本支撑,你不自由发挥派发词。

## 阶段顺序

businessDesign → solutionDesign → implementationDesign → testDesign →(全完成)integrated-design。

## 循环(对每个未完成阶段)

1. **选阶段**:找第一个未 `human_approved` 的设计阶段 `<stage>`,记其 owner agent `<role>`(sa/se/mde/tse)、design skill `<skill>`(完整名)、slug。
2. **算 humanGated**:`humanGated = (workflowMode==='strict-human-loop') || (workflowMode==='collaborative-design' && humanGateStages.includes(<stage>))`。
3. **派发 owner**(轮1):
   ```bash
   node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-dispatch.js build design <role> <stage> <taskPath> <skill> <humanGated> <workflowMode>
   ```
   把 stdout **原样**作为 Agent tool 的 prompt 派发 `<role>` teammate(后台)。**从 Agent 返回捕获 agentId**,记 per-stage。等 agent 自动推送的完成消息。
4. **分支**:
   - humanGated=true:agent 报「N 项 gated decision 待代问」→ 读 `<taskPath>/decisions/<slug>-decisions.json` 的 gated pending → 逐项 AskUserQuestion(见 references/interaction-guidelines.md decision_loop)→ `node devsphere-decisions.js resolve <taskPath> <slug> <id> '<resolution json>'` 回写 → 全 resolved 后 `SendMessage`(to=agentId,message=决议+续稿指令,**summary** 必填)唤醒 → 等 draft 完成消息。
   - humanGated=false:agent 不停(记 autonomous 直接续稿)→ 等 draft 完成消息。
5. **sync**:`node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js sync-stage-status ${CLAUDE_PROJECT_DIR}`。
6. **评审循环**:对 `<stage>` 的评审者矩阵(+ ciCdRisk=true 含 CIE)——每人:
   ```bash
   node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-dispatch.js build review <reviewer-role> <stage> <taskPath> scc-dev-sphere:feature-review <taskPath>/artifacts/<slug>.md
   ```
   并行派发(各 background,capture agentId)。等评审完成。
   - blocking>0:把 blocking 回流 owner → 用 `build design ...` 重新派发 ownerId(revise)→ owner 对需用户决策的 blocking 补 gated decision(humanGated 时)→ 回 step4 代问 → 续稿 → 重新评审。循环至 blocking=0。
   - blocking=0:`sync-stage-status`(→ ai_review_passed)。
7. **人工批准**:humanGated 阶段 AskUserQuestion(confirm_gate)请用户批准 → `node ... feature-workflow.js set-stage-status <taskPath> <stage> human_approved`。非 humanGated 阶段跳过。
8. 回 step1(下一阶段)。

## 完成判断

全 4 阶段 human_approved → 进入 integrated-design(既有逻辑)。

## 约束

- **不自行写派发词**——一律 `devsphere-dispatch.js build` 生成。
- **不直接写设计产物**——产物由 teammate 写;你只写 resolution(代问后经 CLI)。
- **SendMessage 的 message 为字符串时必带 summary**。
- 同一 stage 续稿用 SendMessage 恢复 agentId,不重新 Agent 派发(保活)。
```

- [ ] **Step 2: Update workflow SKILL feature-design delegation**

In `skills/workflow/SKILL.md`, find the paragraph starting `特别地，如果 \`nextAction.skill === 'feature-design'\``. Replace it with:

```
特别地，如果 `nextAction.skill === 'feature-design'`：在主会话执行 `feature-design` skill，它是**薄编排器**：按阶段顺序派发 owner agent（用 `devsphere-dispatch.js build` 生成派发 prompt）、代问 gated decision、派评审、人工批准。**workflow 不直接派发设计 agent**。feature-design 内部自驱直到全阶段完成。agentId 在 feature-design 自身上下文内跨轮持有（SendMessage 恢复同一 teammate）。依赖 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`。
```

- [ ] **Step 3: Commit**

```bash
git add skills/feature-design/SKILL.md skills/workflow/SKILL.md
git commit -m "refactor(skill): feature-design thin orchestrator (script-built dispatch + review loop); workflow delegation update"
```

---

## Plan F3: Delete Resolver + Docs

### Task F3-1: Delete `resolve-design-loop` + migrate tests

**Files:**
- Modify: `scripts/workflows/feature-workflow.js` (delete resolver functions + CLI cases; keep router + sync/set CLIs)
- Delete: `scripts/test/design-loop-resolver.test.js`
- Modify: `scripts/test/feature-workflow-decisions.test.js` (migrate DESIGN_STAGE_ORDER + isHumanGated tests)

**DELETE list (resolver micro-management — verify zero remaining references via grep before removing each):**
- Functions: `resolveDesignLoop` (line ~206), `resolveDesignStage` (~222), `resolvePostArtifact` (~246), `toQuestionData` (~194), `resolveDesignStageAction` (~117), `makeHumanConfirm` (~284, if only used by resolver).
- CLI cases: `resolve-design-loop` (~364), `design-stage-action` (~344).
- `module.exports`: remove `resolveDesignLoop`, `resolveDesignStageAction`, `toQuestionData` (keep `resolveNextAction`, `isHumanGated`, `DESIGN_STAGE_ORDER` if still referenced — see below).

**KEEP** (still used by `resolveNextAction` / CLIs / orchestration):
- `resolveNextAction`, `resolveDesigning`, `isStageReady`, `stageToArtifact`, `getDesignSkill`, `getDesignAgent`, `getDesignReviewers`, `DESIGN_STAGE_ORDER`, `makeAction`, `isHumanGated`.
- CLIs: `sync-stage-status`, `set-task-status`, `set-stage-status`.

- [ ] **Step 1: Verify references of each delete-candidate**

```bash
cd /Users/xiaobo/Documents/Projects/scc-dev-sphere
for fn in resolveDesignLoop resolveDesignStage resolvePostArtifact toQuestionData resolveDesignStageAction makeHumanConfirm; do
  echo "=== $fn ===";
  grep -rn "$fn" scripts/ | grep -v "function $fn"
done
```
Confirm each appears ONLY inside other delete-candidates or its own CLI case (no reference from kept functions). If `makeHumanConfirm` is referenced by `resolveNextAction`/`makeAction`, KEEP it. Adjust the delete list accordingly.

- [ ] **Step 2: Migrate keeper tests out of design-loop-resolver.test.js**

Open `scripts/test/design-loop-resolver.test.js`. The `DESIGN_STAGE_ORDER` and `isHumanGated` test groups must survive (those functions are kept). Copy those `test(...)` blocks into `scripts/test/feature-workflow-decisions.test.js` (which already requires `feature-workflow`). Ensure the require at top of feature-workflow-decisions.test.js includes `isHumanGated, DESIGN_STAGE_ORDER`:

```js
const { /* existing... */ isHumanGated, DESIGN_STAGE_ORDER } = require('../workflows/feature-workflow');
```

Append the migrated tests (verbatim from design-loop-resolver.test.js — the `SLUG_PREFIX`/stage-order assertions and the 3-mode `isHumanGated` assertions).

- [ ] **Step 3: Delete the resolver functions + CLI cases**

In `scripts/workflows/feature-workflow.js`:
- Delete the function bodies of `resolveDesignLoop`, `resolveDesignStage`, `resolvePostArtifact`, `toQuestionData`, `resolveDesignStageAction` (and `makeHumanConfirm` only if Step 1 confirmed it's unused outside resolver).
- Delete the `case 'resolve-design-loop'` and `case 'design-stage-action'` blocks in `main()`.
- Update `module.exports` to remove deleted exports.

- [ ] **Step 4: Delete the old resolver test file**

```bash
git rm scripts/test/design-loop-resolver.test.js
```

- [ ] **Step 5: Run full test suite**

```bash
node scripts/test/devsphere-decisions.test.js && node scripts/test/devsphere-decisions-resolve.test.js && node scripts/test/devsphere-guard-decisions.test.js && node scripts/test/feature-workflow-decisions.test.js && node scripts/test/devsphere-dispatch.test.js
```
Expected: ALL pass. (design-loop-resolver.test.js gone; its keeper tests migrated; design-loop-resolver.test.js references to deleted functions removed.)

- [ ] **Step 6: Verify no stale references**

```bash
grep -rn "resolve-design-loop\|resolveDesignLoop\|design-stage-action\|resolveDesignStageAction\|toQuestionData\|resolvePostArtifact" scripts/ skills/ agents/ hooks/ && echo "STALE" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 7: Commit**

```bash
git add scripts/workflows/feature-workflow.js scripts/test/feature-workflow-decisions.test.js
git commit -m "refactor(workflow): delete resolve-design-loop micro-state-machine + helpers; migrate keeper tests"
```

---

### Task F3-2: Update CLAUDE.md + original spec annotations

**Files:**
- Modify: `CLAUDE.md` (设计阶段决策循环 section)
- Modify: `docs/superpowers/specs/2026-07-09-design-stage-decision-loop-design.md` (§3/§4)

- [ ] **Step 1: Rewrite the CLAUDE.md design-loop section**

In `CLAUDE.md`, replace the `### 设计阶段决策循环（strict-human-loop / collaborative-design 门禁阶段）` section's body (the action table + mode/guard paragraphs) with:

```
设计阶段由 `feature-design` skill（主会话薄编排器）驱动：按阶段顺序派发 owner agent（`devsphere-dispatch.js build` 生成确定性派发 prompt）、代问 gated decision、派评审、人工批准。不再有 `resolve-design-loop` 微观状态机。

teammate 行为准则（`devsphere-teammate-conduct` skill，frontmatter `skills:` 预加载给全部 agent）：需用户决策时按 humanGated 分支——true 记 `type=gated` + 停 + lead 代问；false（auto-design/非门禁）记 `type=autonomous`+assumption 自决。vague 需求按维度拆解出土 decision。

守卫（唯一确定性兜底）：`check-decisions-resolved`（humanGated 阶段 gated pending>0 拒写主产物）、`check-decisions-format`（decisions 写入内容 schema 校验）、`check-decisions-bash`（禁 Bash 写 decisions/|artifacts/，CLI 豁免）、`check-teammate-decisions`（TeammateIdle 磁盘兜底）。

决策内容持久化在 `decisions/<slug>-decisions.json`（双用途：闸口 + 知识沉淀）。
```

- [ ] **Step 2: Annotate the original spec**

In `docs/superpowers/specs/2026-07-09-design-stage-decision-loop-design.md`, at the top of §3 (架构) add:

```
> **归档说明（2026-07-10）：** 本节的 resolver 微观驱动（scope/ask/draft 状态机）已被简化废弃。现行模型见 `docs/superpowers/specs/2026-07-10-design-loop-simplification.md`——agent + design skill + conduct skill + 派发脚本 + 守卫。§3.2/§3.3/§4.2 的 resolve-design-loop 动作表不再适用。
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-07-09-design-stage-decision-loop-design.md
git commit -m "docs: simplify design-loop description (CLAUDE.md) + archive original spec resolver model"
```

---

## Execution Order

1. **F0** (dispatch script, TDD) — ship first; F2's orchestrator depends on it.
2. **F1** (conduct skill + agent frontmatter) — content; independent of F0.
3. **F2** (design skills decoupled + thin orchestrator) — depends on F0 (calls dispatch) + F1 (conduct referenced by agents).
4. **F3** (delete resolver + docs) — last; after F2 no longer references `resolve-design-loop`.

F0 and F1 are independent and can run in either order; both before F2. F3 must be last.
