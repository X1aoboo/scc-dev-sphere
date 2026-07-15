'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const readSkill = name => fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');

test('feature-clarify independently requires one-shot subagents, waiting, and a direct-query ban', () => {
  const skill = readSkill('feature-clarify');

  assert.match(skill, /MUST dispatch a one-shot `knowledge-query` subagent/i);
  assert.match(skill, /MUST NOT directly query the knowledge base in the main session/i);
  assert.match(skill, /MUST wait for the structured EV\/gap result/i);

});

test('feature-clarify writes conclusions into requirement.md and self-judges completeness', () => {
  const skill = readSkill('feature-clarify');

  // Conclusions live in requirement.md; the skill carries a written completion principle.
  assert.match(skill, /inputs\/requirement\.md/i);
  assert.match(skill, /完成判断原则/);
  assert.match(skill, /set-task-status <workspaceRoot> clarified/i);
});

test('feature-clarify recovers from requirement.md and the evidence registry', () => {
  const skill = readSkill('feature-clarify');

  assert.match(skill, /evidence\/evidence-registry\.json/i);
  assert.match(skill, /EV-\*\.md/i);
  assert.match(skill, /inputs\/requirement\.md/i);
});

test('feature-clarify internally judges requirement type without asking user', () => {
  const skill = readSkill('feature-clarify');

  // Agent internally judges functional/technical/mixed; user is not asked to choose
  assert.match(skill, /不再要求用户选择需求类型/);
  // Functional requirements should not be dragged into unrelated technical details
  assert.match(skill, /Agent.*内部判断.*哪些属于需求.*哪些属于技术约束.*哪些应延后到设计阶段/is);
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

test('workflow binds feature-clarify itself to main-session execution and its query subagents', () => {
  const skill = readSkill('workflow');
  const clarifySection = skill.match(/特别地，如果 `nextAction\.skill === 'feature-clarify'`([\s\S]*?)(?=\n#### )/);

  assert.ok(clarifySection, 'feature-clarify dispatch section');
  assert.match(clarifySection[0], /main session/i);
  assert.match(clarifySection[0], /knowledge-query.*subagents/is);
  assert.match(clarifySection[0], /must not.*background teammate/i);
});

test('workflow binds feature-assess itself to main-session execution', () => {
  const skill = readSkill('workflow');
  const assessSection = skill.match(/特别地，如果 `nextAction\.skill === 'feature-assess'`([\s\S]*?)(?=\n特别地，如果|\n#### )/);

  assert.ok(assessSection, 'feature-assess dispatch section');
  assert.match(assessSection[0], /main session/i);
});

test('knowledge-query uses multi-source config and 4-step query flow', () => {
  const skill = readSkill('knowledge-query');

  assert.match(skill, /knowledge-sources\.json/i);
  assert.match(skill, /subagent-prompt\.md/i);
  assert.match(skill, /evidence-registry\.json/i);
  assert.match(skill, /EV-xxx-\*\.md/i);
  assert.match(skill, /步骤1/i);
  assert.match(skill, /步骤2/i);
  assert.match(skill, /步骤3/i);
  assert.match(skill, /步骤4/i);
});

test('knowledge-query dispatches subagent, may ask user, and returns markdown format', () => {
  const skill = readSkill('knowledge-query');

  assert.match(skill, /Agent.*派发/i);
  assert.match(skill, /general-purpose/i);
  assert.match(skill, /AskUserQuestion/i);
  assert.match(skill, /EV-ID/i);
  assert.match(skill, /查询结果/i);
  assert.match(skill, /已有证据/i);
  assert.match(skill, /本次发现/i);
  assert.match(skill, /未找到/i);
});

test('feature-design uses one unified reviewItems revise contract', () => {
  const skill = readSkill('feature-design');

  assert.match(skill, /payload\.reviewItems/);
  assert.match(skill, /blocking\/advisory\/risk_candidate/);
  assert.match(skill, /requiresReReview/);
  assert.match(skill, /ask_review/);
  assert.doesNotMatch(skill, /payload\.blockingItems/);
});

test('feature-review delegates human decisions and closes only after re-review', () => {
  const skill = readSkill('feature-review');
  const conduct = readSkill('devsphere-teammate-conduct');

  assert.match(skill, /Reviewer 不调用 `AskUserQuestion`/);
  assert.match(skill, /closureDecisions/);
  assert.match(skill, /review-state\.js complete/);
  assert.match(skill, /review-matrix/);
  assert.match(skill, /Lead.*ask_review/);
  assert.match(conduct, /保持 advisory\/risk pending/);
  assert.match(conduct, /review-state\.js/);
});
