'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeTask } = require('./helpers');
const { initMatrix } = require('../devsphere-review-matrix');
const { initDecisions, addDecision } = require('../devsphere-decisions');
const {
  DESIGN_STAGE_ORDER, isHumanGated, isStageReady, stageToArtifact,
  getDesignAgent, getDesignSkill, resolveDesignAction,
} = require('../feature-design-router');

test('DESIGN_STAGE_ORDER 固定四阶段顺序', () => {
  assert.deepStrictEqual(DESIGN_STAGE_ORDER,
    ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign']);
});

test('isHumanGated 三模式', () => {
  assert.strictEqual(isHumanGated('strict-human-loop', 'businessDesign', []), true);
  assert.strictEqual(isHumanGated('collaborative-design', 'businessDesign', ['businessDesign']), true);
  assert.strictEqual(isHumanGated('collaborative-design', 'solutionDesign', ['businessDesign']), false);
  assert.strictEqual(isHumanGated('auto-design', 'businessDesign', []), false);
});

test('isStageReady 三模式', () => {
  assert.strictEqual(isStageReady('human_approved', 'businessDesign', 'strict-human-loop', []), true);
  assert.strictEqual(isStageReady('ai_review_passed', 'businessDesign', 'strict-human-loop', []), false);
  assert.strictEqual(isStageReady('ai_review_passed', 'solutionDesign', 'collaborative-design', ['businessDesign']), true);
  assert.strictEqual(isStageReady('human_approved', 'solutionDesign', 'auto-design', []), true);
});

test('stageToArtifact / getDesignAgent / getDesignSkill', () => {
  assert.strictEqual(stageToArtifact('businessDesign'), 'business-design');
  assert.strictEqual(getDesignAgent('solutionDesign'), 'se');
  assert.strictEqual(getDesignSkill('testDesign'), 'feature-design-test');
});

test('resolveDesignAction: 四阶段全完成 → design_phase_complete', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  const { readState } = require('../devsphere-state');
  const state = readState(taskPath);
  for (const stage of DESIGN_STAGE_ORDER) state.stages[stage].status = 'ai_review_passed';
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'design_phase_complete');
});

test('not_started + 无 gated → produce_draft initial', () => {
  const { taskPath } = makeTask({ workflowMode: 'strict-human-loop' });
  const { readState } = require('../devsphere-state');
  const action = resolveDesignAction(taskPath, readState(taskPath));
  assert.strictEqual(action.kind, 'produce_draft');
  assert.strictEqual(action.stage, 'businessDesign');
  assert.strictEqual(action.role, 'sa');
  assert.strictEqual(action.skill, 'feature-design-business');
  assert.strictEqual(action.name, 'sa-businessDesign');
  assert.strictEqual(action.humanGated, true);
  assert.strictEqual(action.payload.mode, 'initial');
  assert.ok(action.dispatchCmd.includes('build design sa businessDesign '), 'dispatchCmd 含 design 派发参数');
  assert.ok(action.dispatchCmd.includes('feature-design-business'), 'dispatchCmd 含 skill');
});

test('not_started + 有 gated pending → ask_gated', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: '范围待定',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }],
    askMode: 'single_select', rationale: 'r',
  });
  const { readState } = require('../devsphere-state');
  const action = resolveDesignAction(taskPath, readState(taskPath));
  assert.strictEqual(action.kind, 'ask_gated');
  assert.strictEqual(action.stage, 'businessDesign');
  assert.strictEqual(action.name, 'sa-businessDesign');
  assert.strictEqual(action.decisions.length, 1);
  assert.strictEqual(action.decisions[0].id, 'BD-DEC-001');
});
