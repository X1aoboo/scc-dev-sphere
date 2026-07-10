# Feature 需求澄清硬门禁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在复杂度评估前强制完成可追溯、知识库支撑且按需求类型自适应的需求澄清。

**Architecture:** 新增一个 CommonJS 的需求澄清状态/渲染模块，将确认事实保存在任务 `state.json` 的 `clarification` 字段，并确定性渲染到 `inputs/requirement.md`。workflow 仅允许 `initialized → feature-clarify → clarified → feature-assess`；`feature-clarify` 在主会话编排用户对话，每一次知识查询均派发一次性 `knowledge-query` subagent。

**Tech Stack:** Node.js CommonJS、Node 内置 `node:test`/`node:assert`（Node ≥ 18）、Markdown skill 契约、现有 Claude Code subagent 原语。

## Global Constraints

- 初始知识查询和每次再查询必须由一次性 `knowledge-query` subagent 执行；主会话不得直接调用知识库工具。
- 只有用户确认的明确结论可写为事实；候选项须标识 `knowledge`（带 EV ID）或 `inference` 来源及理由。
- 固定维度为 `businessGoal`、`usersAndScenarios`、`functionalScope`、`nonGoalsAndBoundaries`、`acceptanceCriteria`、`constraintsAndRisks`；均须完成才能放行。
- 需求类型为 `functional`、`technical`、`mixed`，且必须确认；技术型/混合型只对实际受影响的技术契约强制补齐。
- 知识不足必须登记 evidence gap 并追问用户，不得因知识库无结果阻断；用户未给出明确结论才阻断。
- `inputs/requirement.md` 保留原始需求，追加类型、结论、证据缺口和完整澄清记录。
- 测试命令统一使用 `node --test scripts/test/*.test.js`；不引入第三方依赖。

---

## File Structure

| 文件 | 责任 | 改动 |
| --- | --- | --- |
| `scripts/feature-requirement-clarification.js` | 澄清状态 schema、完成判定、再检索判定和 Markdown 渲染 | 新建 |
| `scripts/workflows/feature-workflow.js` | 顶层 `initialized`/`clarified` 路由 | 修改 |
| `scripts/test/feature-requirement-clarification.test.js` | 澄清状态和渲染的单元测试 | 新建 |
| `scripts/test/feature-workflow-clarification.test.js` | resolver 与 CLI 状态转换的测试 | 新建 |
| `scripts/test/skill-contracts.test.js` | 关键 skill 硬约束的文本契约回归测试 | 新建 |
| `skills/feature-clarify/SKILL.md` | 主会话的澄清编排和 subagent 查询协议 | 新建 |
| `skills/feature-init/SKILL.md` | 初始化澄清状态并提示新下一步 | 修改 |
| `skills/feature-assess/SKILL.md` | 仅处理 `clarified` 输入 | 修改 |
| `skills/workflow/SKILL.md` | `feature-clarify` 主会话执行和 `clarified → assessed` 状态说明 | 修改 |
| `skills/knowledge-query/SKILL.md` | 结构化返回/证据缺口对澄清 subagent 的契约 | 修改 |

## Task 1: 建立可测试的澄清状态、放行判定与需求文档渲染

**Files:**
- Create: `scripts/feature-requirement-clarification.js`
- Create: `scripts/test/feature-requirement-clarification.test.js`

**Interfaces:**
- Consumes: `state.clarification`，以及调用方收集的原始需求、用户确认结论、EV ID 和 evidence gap。
- Produces: `createClarification(originalRequirement)`, `recordConclusion(clarification, key, conclusion, sources, confirmedAt)`, `recordEvidenceGap(clarification, gap)`, `shouldRequery(feedback)`, `validateClarification(clarification)`, `renderRequirementMarkdown(clarification)`。
- State schema: `{ version: 1, originalRequirement, requirementType, typeConfirmedAt, dimensions, technicalContracts, evidenceGaps, history }`；每个 dimension 为 `{ conclusion, sources, confirmedAt }`。

- [ ] **Step 1: 写失败测试，锁定固定维度、来源和放行规则**

```js
const test = require('node:test');
const assert = require('node:assert');
const { createClarification, recordConclusion, validateClarification } = require('../feature-requirement-clarification');

test('六项、需求类型和适用技术契约均确认后才可放行', () => {
  const c = createClarification('新增北向 API');
  c.requirementType = 'technical';
  c.typeConfirmedAt = '2026-07-11T00:00:00.000Z';
  for (const key of ['businessGoal', 'usersAndScenarios', 'functionalScope', 'nonGoalsAndBoundaries', 'acceptanceCriteria', 'constraintsAndRisks']) {
    recordConclusion(c, key, `${key} 已确认`, [{ kind: 'user' }], '2026-07-11T00:00:00.000Z');
  }
  c.technicalContracts = [{ key: 'apiUrl', label: 'URL', applicable: true, conclusion: '/v1/devices', confirmedAt: '2026-07-11T00:00:00.000Z' }];
  assert.deepStrictEqual(validateClarification(c), { complete: true, missing: [] });
});

test('含待定措辞或缺少 EV 的知识来源不能被当作明确结论', () => {
  const c = createClarification('自定义背景图片');
  assert.throws(() => recordConclusion(c, 'businessGoal', '具体效果待定', [{ kind: 'user' }], 't'), /明确/);
  assert.throws(() => recordConclusion(c, 'businessGoal', '允许上传图片', [{ kind: 'knowledge' }], 't'), /evidenceId/);
});
```

- [ ] **Step 2: 运行测试，确认实现尚不存在**

Run: `node --test scripts/test/feature-requirement-clarification.test.js`

Expected: FAIL，报错 `Cannot find module '../feature-requirement-clarification'`。

- [ ] **Step 3: 实现纯函数模块和 Markdown 渲染器**

```js
const REQUIRED_DIMENSIONS = ['businessGoal', 'usersAndScenarios', 'functionalScope', 'nonGoalsAndBoundaries', 'acceptanceCriteria', 'constraintsAndRisks'];
const AMBIGUOUS = /待定|可能|视情况/;

function shouldRequery(feedback) {
  return /(系统|模块|接口|API|协议|数据|权限|合规|性能|容量|部署|环境|业务规则)/i.test(feedback);
}

function validateClarification(c) {
  const missing = [];
  if (!c.requirementType || !c.typeConfirmedAt) missing.push('requirementType');
  for (const key of REQUIRED_DIMENSIONS) if (!c.dimensions[key]?.confirmedAt) missing.push(key);
  for (const item of c.technicalContracts.filter(x => x.applicable)) if (!item.confirmedAt) missing.push(`technical:${item.key}`);
  return { complete: missing.length === 0, missing };
}
```

实现 `recordConclusion` 时拒绝空白和 `AMBIGUOUS` 命中；校验 `knowledge` source 必有 `evidenceId`，`inference` 必有 `basis`，`user` 可无额外字段。`renderRequirementMarkdown` 必须按规格的“原始需求 / 需求澄清 / 需求类型 / 结论 / 知识证据缺口 / 澄清记录”标题输出，并保留所有 history 项。

- [ ] **Step 4: 补全功能型、技术型和证据缺口测试**

```js
function fixtureWithEvidenceGap() {
  const c = createClarification('为博客添加背景图片自定义');
  c.requirementType = 'functional';
  c.typeConfirmedAt = '2026-07-11T00:00:00.000Z';
  c.evidenceGaps.push({ id: 'GAP-001', topic: '图片尺寸规范', status: 'not_found', userConclusion: '支持 JPG 与 PNG' });
  c.history.push({ at: '2026-07-11T00:00:00.000Z', dimension: 'businessGoal', question: '目标是什么？', answer: '允许博主配置背景图片' });
  recordConclusion(c, 'businessGoal', '允许博主配置背景图片', [{ kind: 'knowledge', evidenceId: 'EV-001' }], '2026-07-11T00:00:00.000Z');
  return c;
}

test('功能型需求不创建技术契约缺口，技术型需求缺契约不能放行', () => {
  const functional = createClarification('博客背景图片自定义');
  functional.requirementType = 'functional';
  assert.deepStrictEqual(functional.technicalContracts, []);
  const technical = createClarification('新增北向 API');
  technical.requirementType = 'technical';
  technical.technicalContracts = [{ key: 'protocol', label: '协议', applicable: true, conclusion: '', confirmedAt: null }];
  assert.ok(validateClarification(technical).missing.includes('technical:protocol'));
});

test('renderRequirementMarkdown 保留原始需求、EV、缺口和问答记录', () => {
  const markdown = renderRequirementMarkdown(fixtureWithEvidenceGap());
  assert.match(markdown, /# 原始需求/);
  assert.match(markdown, /EV-001/);
  assert.match(markdown, /GAP-001/);
  assert.match(markdown, /## 澄清记录/);
});
```

- [ ] **Step 5: 运行模块测试**

Run: `node --test scripts/test/feature-requirement-clarification.test.js`

Expected: PASS，所有 schema、放行、再检索和渲染用例通过。

- [ ] **Step 6: 提交 Task 1**

```bash
git add scripts/feature-requirement-clarification.js scripts/test/feature-requirement-clarification.test.js
git commit -m "feat(clarify): add requirement clarification state helpers"
```

## Task 2: 将澄清设为 workflow 的确定性硬门禁

**Files:**
- Modify: `scripts/workflows/feature-workflow.js:18-31, 146-177`
- Create: `scripts/test/feature-workflow-clarification.test.js`

**Interfaces:**
- Consumes: `state.status` 为 `initialized`、`clarified` 或 `assessed`。
- Produces: `resolveNextAction(taskPath, state)` 在 `initialized` 返回 `{ kind: 'run_skill', skill: 'feature-clarify', agents: [] }`，在 `clarified` 返回 `{ kind: 'run_skill', skill: 'feature-assess', agents: [] }`。
- CLI: `set-task-status <workspaceRoot> clarified` 可持久化状态；后续 `set-task-status ... assessed <workflowMode> <humanGateStages> <ciCdRisk>` 保持兼容。

- [ ] **Step 1: 写失败的 resolver 和 CLI 测试**

```js
const { resolveNextAction } = require('../workflows/feature-workflow');

test('initialized 必须路由到 feature-clarify，而不是 feature-assess', () => {
  const { taskPath } = makeTask();
  const action = resolveNextAction(taskPath, readState(taskPath));
  assert.strictEqual(action.skill, 'feature-clarify');
  assert.match(action.reason, /clarif/i);
});

test('clarified 才路由到 feature-assess', () => {
  const { taskPath } = makeTask();
  const state = readState(taskPath);
  state.status = 'clarified';
  const action = resolveNextAction(taskPath, state);
  assert.strictEqual(action.skill, 'feature-assess');
});
```

- [ ] **Step 2: 运行测试，确认当前 initialized 行为失败**

Run: `node --test scripts/test/feature-workflow-clarification.test.js`

Expected: FAIL，第一个断言显示当前 skill 为 `feature-assess`。

- [ ] **Step 3: 以最小改动更新 resolver**

```js
if (status === 'initialized') {
  return makeAction('run_skill', state, null, null,
    'feature-clarify', {}, [],
    'Task initialized. Clarify the requirement before complexity and risk assessment.',
    ['inputs/requirement.md'], ['inputs/requirement.md']);
}

if (status === 'clarified') {
  return makeAction('run_skill', state, null, null,
    'feature-assess', {}, [],
    'Requirement clarification complete. Proceed with complexity and risk assessment.',
    ['inputs/requirement.md'], []);
}
```

保留既有 `set-task-status` 的通用写入能力，不把 `clarified` 的业务判定放进 CLI；放行判定由 Task 1 模块和 `feature-clarify` 调用共同负责。

- [ ] **Step 4: 增加状态转换回归用例并运行**

```js
test('set-task-status 写入 clarified 后 resolver 仅允许评估', () => {
  const { workspaceRoot, taskPath } = makeTask();
  execFileSync('node', [workflowScript, 'set-task-status', workspaceRoot, 'clarified']);
  const action = resolveNextAction(taskPath, readState(taskPath));
  assert.strictEqual(action.skill, 'feature-assess');
});
```

Run: `node --test scripts/test/feature-workflow-clarification.test.js scripts/test/feature-workflow-decisions.test.js`

Expected: PASS。

- [ ] **Step 5: 提交 Task 2**

```bash
git add scripts/workflows/feature-workflow.js scripts/test/feature-workflow-clarification.test.js
git commit -m "feat(workflow): gate assessment on requirement clarification"
```

## Task 3: 编写主会话澄清 skill 与所有交互契约

**Files:**
- Create: `skills/feature-clarify/SKILL.md`
- Modify: `skills/feature-init/SKILL.md:24-58`
- Modify: `skills/feature-assess/SKILL.md:10-24`
- Modify: `skills/workflow/SKILL.md:96-145`
- Modify: `skills/knowledge-query/SKILL.md:8-36`
- Create: `scripts/test/skill-contracts.test.js`

**Interfaces:**
- Consumes: active task path, `state.clarification`, `inputs/requirement.md`, evidence registry and `knowledge-query` subagent result.
- Produces: user-confirmed clarification state, rendered `inputs/requirement.md`, and only then `set-task-status <workspaceRoot> clarified`.
- Subagent contract: every query prompt explicitly gives intent, requirement type, affected dimension/contract, minimum evidence confidence, and requests EV IDs plus evidence gaps.

- [ ] **Step 1: 写失败的 skill 文本契约测试**

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
function readSkill(name) { return fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8'); }

test('feature-clarify 强制由 subagent 执行首轮和再检索', () => {
  const text = fs.readFileSync(path.join(root, 'skills/feature-clarify/SKILL.md'), 'utf8');
  assert.match(text, /必须派发.*knowledge-query.*subagent/);
  assert.match(text, /不得在主会话直接调用知识库工具/);
  assert.match(text, /等待.*结构化结果/);
});

test('feature-assess 仅接受 clarified，workflow 说明主会话执行 clarify', () => {
  assert.match(readSkill('feature-assess'), /status=clarified/);
  assert.match(readSkill('workflow'), /nextAction\.skill === 'feature-clarify'/);
});
```

- [ ] **Step 2: 运行测试，确认 skill 尚不存在或契约缺失**

Run: `node --test scripts/test/skill-contracts.test.js`

Expected: FAIL，报出 `feature-clarify/SKILL.md` 不存在或文本匹配失败。

- [ ] **Step 3: 创建 `feature-clarify` 的完整编排指令**

在新 skill 中写入下列可执行顺序：

```text
1. 读取 state、requirement.md 和 evidence registry；若 status 不是 initialized，展示原因并停止。
2. 读取/创建 clarification 状态；首轮无查询结果时，派发一次性 knowledge-query subagent，等待其 EV/gap 结果。
3. 展示需求类型问题：推荐结论、理由、2-3 候选项和 knowledge/inference 来源；用户确认。
4. 逐项处理六项固定维度及适用技术契约；每次只问一项，候选项均标来源与理由，用户确认后调用 Task 1 模块更新并渲染 requirement.md。
5. 每次反馈后调用 shouldRequery；为 true 时先派发新的独立 subagent，等结果再问下一项。
6. 无结果时登记 gap 并向用户追问；不可用 AI 推断直接填充。
7. validateClarification 未通过时展示 missing 并继续；通过时展示全量汇总，只有用户最终确认才执行 set-task-status <workspaceRoot> clarified。
```

subagent prompt 必须包含：`你是一次性 knowledge-query subagent，不得询问用户；查询意图；当前需求类型；待支撑维度；返回 EV 编号、可采纳事实、来源可靠性、证据缺口。` 禁止用 teammate 或复用 agentId。

- [ ] **Step 4: 更新相邻 skill 的边界**

在 `feature-init` 中，写入初始需求后初始化 `state.clarification`，下一步文本改为“运行 workflow 进入需求澄清”。在 `feature-assess` 的入口增加：读取 state，若 `status !== 'clarified'` 则停止并指向 `feature-clarify`；步骤 1 读取已澄清的文档区块。更新 workflow 的无 Agent 分支：`feature-clarify` 与 `feature-assess` 都在 main 会话运行，但前者的知识查询必须按其 skill 派发 subagent。更新 `knowledge-query`：要求 subagent 回传可采纳事实、EV ID、可靠性和 `not_found` gap，且不自行向用户追问。

- [ ] **Step 5: 运行 skill 契约测试**

Run: `node --test scripts/test/skill-contracts.test.js`

Expected: PASS，所有“主会话不直接查知识库”“subagent 必须等待”“评估只消费 clarified”断言通过。

- [ ] **Step 6: 提交 Task 3**

```bash
git add skills/feature-clarify/SKILL.md skills/feature-init/SKILL.md skills/feature-assess/SKILL.md skills/workflow/SKILL.md skills/knowledge-query/SKILL.md scripts/test/skill-contracts.test.js
git commit -m "feat(clarify): add knowledge-backed clarification workflow"
```

## Task 4: 端到端回归、规格一致性检查与交付

**Files:**
- Modify: `scripts/test/feature-requirement-clarification.test.js`
- Modify: `scripts/test/feature-workflow-clarification.test.js`
- Modify: `scripts/test/skill-contracts.test.js`

**Interfaces:**
- Consumes: Tasks 1–3 的状态模块、resolver 和 skill 文本。
- Produces: 对设计规格的所有可自动验证约束的回归覆盖。

- [ ] **Step 1: 添加三类需求的端到端状态夹具测试**

```js
function confirmAllRequired(c) {
  c.typeConfirmedAt = '2026-07-11T00:00:00.000Z';
  for (const key of ['businessGoal', 'usersAndScenarios', 'functionalScope', 'nonGoalsAndBoundaries', 'acceptanceCriteria', 'constraintsAndRisks']) {
    recordConclusion(c, key, `${key} 已确认`, [{ kind: 'user' }], c.typeConfirmedAt);
  }
  return c;
}
function completedFunctionalClarification(raw) {
  const c = confirmAllRequired(createClarification(raw));
  c.requirementType = 'functional';
  return c;
}
function completedTechnicalClarificationExcept(exceptKey) {
  const c = confirmAllRequired(createClarification('新增北向 API'));
  c.requirementType = 'technical';
  c.technicalContracts = ['apiUrl', 'protocol', 'requestResponse', 'performance'].map(key => ({ key, label: key, applicable: true, conclusion: key === exceptKey ? '' : `${key} 已确认`, confirmedAt: key === exceptKey ? null : c.typeConfirmedAt }));
  return c;
}
function completedMixedClarification() {
  const c = completedTechnicalClarificationExcept('');
  c.requirementType = 'mixed';
  return c;
}

test('功能型背景图片需求在六项确认后可 clarified，且没有 API 技术契约', () => {
  const c = completedFunctionalClarification('博客系统添加背景图片自定义功能');
  assert.deepStrictEqual(validateClarification(c), { complete: true, missing: [] });
  assert.deepStrictEqual(c.technicalContracts, []);
});

test('北向 API 缺 URL、协议、参数或性能任一项均不能 clarified', () => {
  for (const key of ['apiUrl', 'protocol', 'requestResponse', 'performance']) {
    const c = completedTechnicalClarificationExcept(key);
    assert.ok(validateClarification(c).missing.includes(`technical:${key}`));
  }
});

test('混合型需求同时要求功能结论与适用技术契约', () => {
  const c = completedMixedClarification();
  assert.strictEqual(validateClarification(c).complete, true);
});
```

- [ ] **Step 2: 运行新增测试，确认边界覆盖**

Run: `node --test scripts/test/feature-requirement-clarification.test.js scripts/test/feature-workflow-clarification.test.js scripts/test/skill-contracts.test.js`

Expected: PASS，功能型不过问技术、技术型契约缺失阻断、混合型双面完成均被验证。

- [ ] **Step 3: 运行完整回归与静态检查**

Run: `node --test scripts/test/*.test.js && git diff --check`

Expected: Node 测试全绿，`git diff --check` 无输出且退出码为 0。

- [ ] **Step 4: 对照规格逐项复核并提交**

逐项核对 `docs/superpowers/specs/2026-07-11-feature-requirement-clarification-design.md` 的：独立状态、六项硬门禁、类型自适应、来源标识、evidence gap、最终确认、恢复、subagent 查询和测试九项。确认每项至少被 Task 1–3 的实现或 Task 4 的测试覆盖后执行：

```bash
git add scripts/test/feature-requirement-clarification.test.js scripts/test/feature-workflow-clarification.test.js scripts/test/skill-contracts.test.js
git commit -m "test(clarify): cover requirement clarification gate"
```
