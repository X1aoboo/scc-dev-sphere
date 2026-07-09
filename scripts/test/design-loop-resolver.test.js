'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { isHumanGated, toQuestionData, DESIGN_STAGE_ORDER } = require('../workflows/feature-workflow');

test('DESIGN_STAGE_ORDER 固定四阶段顺序', () => {
  assert.deepStrictEqual(DESIGN_STAGE_ORDER, ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign']);
});

test('isHumanGated: strict 全阶段 true', () => {
  assert.strictEqual(isHumanGated('strict-human-loop', 'businessDesign', []), true);
  assert.strictEqual(isHumanGated('strict-human-loop', 'testDesign', []), true);
});

test('isHumanGated: collaborative 仅门禁阶段 true', () => {
  assert.strictEqual(isHumanGated('collaborative-design', 'businessDesign', ['businessDesign', 'testDesign']), true);
  assert.strictEqual(isHumanGated('collaborative-design', 'solutionDesign', ['businessDesign', 'testDesign']), false);
});

test('isHumanGated: auto-design 全 false', () => {
  assert.strictEqual(isHumanGated('auto-design', 'businessDesign', []), false);
});

test('toQuestionData 映射 gated decision 为问询数据', () => {
  const d = {
    id: 'BD-DEC-001', type: 'gated', category: 'feature_scope',
    summary: '注册登录？', rationale: 'x',
    options: [{ label: '要', description: 'a' }, { label: '不要', description: 'b' }],
    recommendation: '要', askMode: 'single_select', status: 'pending', resolution: null,
    evidence: [], impact: '',
  };
  const q = toQuestionData(d);
  assert.strictEqual(q.id, 'BD-DEC-001');
  assert.strictEqual(q.summary, '注册登录？');
  assert.strictEqual(q.options.length, 2);
  assert.strictEqual(q.recommendation, '要');
  assert.strictEqual(q.askMode, 'single_select');
});

test('toQuestionData 对缺失字段给默认值', () => {
  const q = toQuestionData({ id: 'X-1', summary: 's' });
  assert.deepStrictEqual(q.options, []);
  assert.strictEqual(q.recommendation, '');
  assert.strictEqual(q.askMode, 'single_select');
});
