'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const readSkill = name => fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');

test('feature-clarify uses a dynamic requirement model and investigates queryable facts', () => {
  const skill = readSkill('feature-clarify');
  assert.match(skill, /原始问题 → 需求目标/);
  assert.match(skill, /边界 ↔ 验收/);
  assert.match(skill, /问题树/);
  assert.match(skill, /frontier/i);
  assert.match(skill, /重算整体需求理解和 frontier/i);
  assert.match(skill, /可查询事实[\s\S]*主动使用/);
  assert.match(skill, /knowledge-query/);
  assert.match(skill, /gap/i);
});

test('feature-clarify creates exactly four delivery tasks and keeps micro-actions inside them', () => {
  const skill = readSkill('feature-clarify');
  assert.match(skill, /1\. \*\*收敛并确认需求内容\*\*/);
  assert.match(skill, /2\. \*\*形成可评审的 Requirement Draft\*\*/);
  assert.match(skill, /3\. \*\*独立 Review 并修订至满足基线条件\*\*/);
  assert.match(skill, /4\. \*\*获得用户最终批准并发布 Requirement Baseline\*\*/);
  assert.match(skill, /不要为查询、提问、修订单项内容或启动 Reviewer 创建任务/);
});

test('feature-clarify keeps artifacts semantic and paths external', () => {
  const skill = readSkill('feature-clarify');
  assert.match(skill, /从外层调用上下文取得过程产物的路径、命名和生命周期/);
  assert.match(skill, /已确认内容/);
  assert.match(skill, /暂定理解/);
  assert.match(skill, /开放事项/);
  assert.match(skill, /用户授权后移事项/);
  assert.doesNotMatch(skill, /ambiguity-backlog|clarification-log|requirement-checklist|feature-clarify\.js|state\.json/);
});

test('feature-clarify enforces Draft review and verbatim user-approved baseline', () => {
  const skill = readSkill('feature-clarify');
  assert.match(skill, /requirement-baseline\.md/);
  assert.match(skill, /requirement-reviewer\.md/);
  assert.match(skill, /全新的独立 Reviewer Subagent/);
  assert.match(skill, /需求语义变化[\s\S]*重新评审完整 Draft/);
  assert.match(skill, /用户批准后，将已评审 Draft 原样发布为 Requirement Baseline/);
  assert.match(skill, /用户批准前不得进入业务设计/);
});

test('feature-clarify supports user-authorized deferral without silent assumptions', () => {
  const skill = readSkill('feature-clarify');
  assert.match(skill, /由用户明确授权/);
  assert.match(skill, /表达“想后移”只算提议/);
  assert.match(skill, /再取得知情确认/);
  assert.match(skill, /最迟决策点/);
  assert.match(skill, /不得静默假设答案/);
});

test('feature-clarify exposes bundled side effects as candidate scope expansion', () => {
  const skill = readSkill('feature-clarify');
  assert.match(skill, /“顺便”“同时”“兼容”/);
  assert.match(skill, /候选范围扩张/);
  assert.match(skill, /非自动吸收/);
});

test('feature-clarify contains only the approved skill resources', () => {
  const dir = path.join(root, 'skills', 'feature-clarify');
  const files = fs.readdirSync(dir).sort();
  const references = fs.readdirSync(path.join(dir, 'references')).sort();
  assert.deepStrictEqual(files, ['SKILL.md', 'references']);
  assert.deepStrictEqual(references, ['requirement-baseline.md', 'requirement-reviewer.md']);
  assert.strictEqual(fs.existsSync(path.join(root, 'scripts', 'feature-clarify.js')), false);
});

test('requirement reviewer reports only blocking or advisory findings without editing', () => {
  const reviewer = fs.readFileSync(path.join(root, 'skills', 'feature-clarify', 'references', 'requirement-reviewer.md'), 'utf8');
  assert.match(reviewer, /Result: pass \| issues-found/);
  assert.match(reviewer, /\[blocking\]/);
  assert.match(reviewer, /\[advisory\]/);
  assert.match(reviewer, /不要与用户交互/);
  assert.match(reviewer, /不要直接修改 Draft/);
  assert.match(reviewer, /静默加入用户未确认的需求假设/);
});

test('feature-init writes requirement.md and routes users to clarification', () => {
  const skill = readSkill('feature-init');
  assert.match(skill, /inputs\/requirement\.md/i);
  assert.match(skill, /feature-clarify/i);
});

test('feature-assess accepts only clarified tasks', () => {
  const skill = readSkill('feature-assess');
  assert.match(skill, /status !== 'clarified'/i);
  assert.match(skill, /MUST NOT assess/i);
  assert.match(skill, /feature-clarify/i);
});

test('workflow executes every no-Agent action in the main session', () => {
  const skill = readSkill('workflow');
  const section = skill.match(/#### 无 Agent 场景([\s\S]*?)(?=\n#### )/);
  assert.ok(section);
  assert.match(section[0], /main 会话中直接执行 `nextAction\.skill`/i);
});

test('workflow owns clarified state sync only after the approved baseline completion fact', () => {
  const clarify = readSkill('feature-clarify');
  const workflow = readSkill('workflow');
  assert.match(clarify, /Requirement Baseline 已经用户批准并发布/);
  assert.match(clarify, /不要自行读取或修改外层工作流状态/);
  assert.match(workflow, /仅当它明确返回“Requirement Baseline 已经用户批准并发布”时/);
  assert.match(workflow, /set-task-status \$\{CLAUDE_PROJECT_DIR\} clarified/);
  assert.match(workflow, /暂停等待用户回答、Review 或最终批准，不得更新状态/);
});
