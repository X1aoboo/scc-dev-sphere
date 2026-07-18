'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeTask } = require('./helpers');
const { initDecisions, addDecision, validateDecisionElement } = require('../devsphere-decisions');

test('design_change type 合法：带 reason/impact', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  const d = addDecision(taskPath, 'business-design', {
    type: 'design_change', category: 'feature_scope',
    summary: '调整查询接口为异步',
    reason: '同步无法满足数据规模',
    impact: 'solutionDesign,implementationDesign,testDesign',
  });
  assert.strictEqual(d.type, 'design_change');
  assert.strictEqual(d.status, 'pending');
  assert.strictEqual(d.impact, 'solutionDesign,implementationDesign,testDesign');
});

test('design_change 缺 reason → 抛', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(() => addDecision(taskPath, 'business-design', {
    type: 'design_change', category: 'feature_scope', summary: 'x', impact: 'solutionDesign',
  }), /reason/);
});

test('design_change 缺 impact → 抛', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(() => addDecision(taskPath, 'business-design', {
    type: 'design_change', category: 'feature_scope', summary: 'x', reason: 'r',
  }), /impact/);
});

test('validateDecisionElement: design_change 不要求 options/rationale', () => {
  assert.doesNotThrow(() => validateDecisionElement({
    id: 'BD-DEC-001', type: 'design_change', category: 'feature_scope', status: 'pending',
    summary: 'x', reason: 'r', impact: 'solutionDesign', resolution: null, evidence: [],
  }));
});
