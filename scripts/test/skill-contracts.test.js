'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const readSkill = name => fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');

test('feature-clarify routes knowledge dependencies through knowledge-query and handles EV/gap', () => {
  const skill = readSkill('feature-clarify');

  assert.match(skill, /调用 knowledge-query Skill/i);
  assert.match(skill, /纳入 EV/i);
  assert.match(skill, /gap/i);

});

test('feature-clarify writes requirement.md after completeness precheck', () => {
  const skill = readSkill('feature-clarify');

  // High-impact gaps return to clarification before requirement.md is generated.
  assert.match(skill, /inputs\/requirement\.md/i);
  assert.match(skill, /发现高影响缺口时.*返回步骤3/is);
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
  assert.match(skill, /Agent.*判断需求.*技术约束.*延后到设计阶段/is);
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
  const noAgentSection = skill.match(/#### 无 Agent 场景([\s\S]*?)(?=\n#### )/);

  assert.ok(noAgentSection, 'no-Agent dispatch section');
  assert.match(noAgentSection[0], /main 会话中直接执行 `nextAction\.skill`/i);
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

test('feature-design is a lifecycle entry with no Agent Teams dependency', () => {
  const skill = readSkill('feature-design');

  // Lifecycle entry consumes deterministic inspect/publish/init-stage/mark-ready/record-gate CLI.
  assert.match(skill, /devsphere-design\.js inspect/);
  assert.match(skill, /devsphere-design\.js publish/);
  assert.match(skill, /devsphere-design\.js init-stage/);
  assert.match(skill, /mark-ready/);
  assert.match(skill, /devsphere-design\.js record-gate/);

  // No stable teammate names, no merge_reviews router action, no router import.
  assert.doesNotMatch(skill, /design-sa|design-se|design-mde|design-tse|design-dev|design-cie/);
  assert.doesNotMatch(skill, /merge_reviews/);
  assert.doesNotMatch(skill, /feature-design-router\.js/);
});

test('feature-review is a one-shot Review Subagent job skill aligned with applyReviewResults', () => {
  const skill = readSkill('feature-review');

  // Job-skill contract: receives frozen draft + reviewProfile, outputs findings shape.
  assert.match(skill, /一次性评审 Subagent/);
  assert.match(skill, /draftPath.*draftHash.*version/);
  assert.match(skill, /reviewProfile/);
  assert.match(skill, /allowedReads/);

  // Output shape aligned with applyReviewResults (each finding: findingId/type/reviewerAgent/round).
  assert.match(skill, /issueFindings/);
  assert.match(skill, /closureDecisions/);
  assert.match(skill, /findingId.*type.*reviewerAgent.*round/s);
  assert.match(skill, /blocking \| advisory \| risk_candidate/);

  // artifactId MUST be the slug (not the frontmatter id) — applyReviewResults validates snapshot.artifactId === slug.
  assert.match(skill, /artifactSlug/);
  assert.match(skill, /不是.*Draft frontmatter/);

  // Does not write Work/Artifact/matrix; does not ask the user.
  assert.match(skill, /不修改 Draft \/ Work \/ Artifact \/ matrix/);
  assert.match(skill, /不询问用户/);
  assert.doesNotMatch(skill, /review-state\.js complete/);
  assert.doesNotMatch(skill, /devsphere-review-matrix\.js add|review-matrix\.json/);
});
