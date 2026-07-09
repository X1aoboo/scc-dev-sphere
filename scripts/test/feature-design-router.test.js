'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeTask } = require('./helpers');
const { initMatrix } = require('../devsphere-review-matrix');
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
