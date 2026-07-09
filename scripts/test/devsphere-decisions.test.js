'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');
const {
  initDecisions, readDecisions, addDecision, resolveDecision,
  listGatedPending, countGatedPending, SLUG_PREFIX,
} = require('../devsphere-decisions');

test('initDecisions 创建空 decisions 文件', () => {
  const { taskPath, taskId } = makeTask();
  const data = initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.strictEqual(data.stage, 'businessDesign');
  assert.deepStrictEqual(data.decisions, []);
  assert.ok(fs.existsSync(path.join(taskPath, 'decisions', 'business-design-decisions.json')));
});

test('addDecision 为 gated 项分配 BD-DEC-001 并落盘', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  const d = addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope',
    summary: '是否需要注册登录？',
    options: [{ label: '需要', description: 'x' }, { label: '不需要', description: 'y' }],
    askMode: 'single_select', recommendation: '需要', rationale: '合理依据',
  });
  assert.strictEqual(d.id, 'BD-DEC-001');
  assert.strictEqual(d.status, 'pending');
  const persisted = readDecisions(taskPath, 'business-design');
  assert.strictEqual(persisted.decisions.length, 1);
});

test('addDecision 自增 ID 与 autonomous 类型', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', { type: 'gated', category: 'feature_scope', summary: 'a', options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select', rationale: '测试' });
  addDecision(taskPath, 'business-design', { type: 'autonomous', category: 'tradeoff', summary: 'b' });
  const persisted = readDecisions(taskPath, 'business-design');
  assert.strictEqual(persisted.decisions[0].id, 'BD-DEC-001');
  assert.strictEqual(persisted.decisions[1].id, 'BD-DEC-002');
});

test('addDecision 拒绝非法 type', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(() => addDecision(taskPath, 'business-design', { type: 'bogus', category: 'feature_scope', summary: 'x' }));
});

test('addDecision 对 gated 强校验：缺 options / 非法 askMode / 选项不足 均拒绝', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  // 缺 options
  assert.throws(() => addDecision(taskPath, 'business-design', { type: 'gated', category: 'feature_scope', summary: 'x' }));
  // 非法 askMode
  assert.throws(() => addDecision(taskPath, 'business-design', { type: 'gated', category: 'feature_scope', summary: 'x', options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'bogus' }));
  // 选项不足（仅 1 个）
  assert.throws(() => addDecision(taskPath, 'business-design', { type: 'gated', category: 'feature_scope', summary: 'x', options: [{ label: 'a', description: 'x' }], askMode: 'single_select' }));
});

test('resolveDecision 置 decided 并记 resolution', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', { type: 'gated', category: 'feature_scope', summary: 'q', options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select', rationale: '测试' });
  const r = resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: '需要', note: 'ok', decidedAt: '2026-07-09T00:00:00Z' });
  assert.strictEqual(r.status, 'decided');
  assert.strictEqual(r.resolution.chosen, '需要');
});

test('countGatedPending 只数 gated+pending', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', { type: 'gated', category: 'feature_scope', summary: 'g1', options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select', rationale: '测试' });
  addDecision(taskPath, 'business-design', { type: 'gated', category: 'assumption', summary: 'g2', options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select', rationale: '测试' });
  addDecision(taskPath, 'business-design', { type: 'autonomous', category: 'tradeoff', summary: 'a1' });
  assert.strictEqual(countGatedPending(taskPath, 'business-design'), 2);
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'x', decidedAt: 't' });
  assert.strictEqual(countGatedPending(taskPath, 'business-design'), 1);
  assert.strictEqual(listGatedPending(taskPath, 'business-design').length, 1);
});

test('SLUG_PREFIX 映射四个设计阶段', () => {
  assert.strictEqual(SLUG_PREFIX['business-design'], 'BD');
  assert.strictEqual(SLUG_PREFIX['solution-design'], 'SD');
  assert.strictEqual(SLUG_PREFIX['implementation-design'], 'ID');
  assert.strictEqual(SLUG_PREFIX['test-design'], 'TD');
});

// === Fix 4: I2 initDecisions 参数校验 ===

test('I2: initDecisions 缺参数 → 抛错', () => {
  const { taskPath, taskId } = makeTask();
  // 缺 taskId
  assert.throws(
    () => initDecisions(taskPath, 'business-design', undefined, 'businessDesign'),
    /initDecisions requires/
  );
  // 缺 slug
  assert.throws(
    () => initDecisions(taskPath, undefined, taskId, 'businessDesign'),
    /initDecisions requires/
  );
  // 缺 stageName
  assert.throws(
    () => initDecisions(taskPath, 'business-design', taskId, undefined),
    /initDecisions requires/
  );
  // 缺 taskPath
  assert.throws(
    () => initDecisions(undefined, 'business-design', taskId, 'businessDesign'),
    /initDecisions requires/
  );
});

// === Fix 5: I3 addDecision summary 校验 ===

test('I3: addDecision 缺 summary（undefined）→ 抛错', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(
    () => addDecision(taskPath, 'business-design', {
      type: 'autonomous', category: 'tradeoff', summary: undefined,
    }),
    /summary is required/
  );
});

test('I3: addDecision summary 为空字符串 → 抛错', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(
    () => addDecision(taskPath, 'business-design', {
      type: 'autonomous', category: 'tradeoff', summary: '',
    }),
    /summary is required/
  );
});

test('I3: addDecision summary 仅空白 → 抛错', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(
    () => addDecision(taskPath, 'business-design', {
      type: 'autonomous', category: 'tradeoff', summary: '   ',
    }),
    /summary is required/
  );
});

// === Fix: options shape + rationale validation ===

test('addDecision gated 拒绝纯字符串 options', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(
    () => addDecision(taskPath, 'business-design', {
      type: 'gated', category: 'feature_scope', summary: 'q',
      options: ['仅字符串A', '仅字符串B'], // 不是 {label, description}
      askMode: 'single_select',
    }),
    /option/
  );
});

test('addDecision gated 拒绝 option 缺 label', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(
    () => addDecision(taskPath, 'business-design', {
      type: 'gated', category: 'feature_scope', summary: 'q',
      options: [{ description: '无label的选项' }, { label: 'b', description: 'y' }],
      askMode: 'single_select',
    }),
    /option/
  );
});

test('addDecision gated 拒绝 option 缺 description', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(
    () => addDecision(taskPath, 'business-design', {
      type: 'gated', category: 'feature_scope', summary: 'q',
      options: [{ label: 'a', description: '' }, { label: 'b', description: 'y' }],
      askMode: 'single_select',
    }),
    /option/
  );
});

test('addDecision gated 拒绝空 rationale（缺失/空串/空白）', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  // 短缺
  assert.throws(
    () => addDecision(taskPath, 'business-design', {
      type: 'gated', category: 'feature_scope', summary: 'q',
      options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }],
      askMode: 'single_select',
      // rationale 缺失
    }),
    /rationale/
  );
});

test('addDecision gated 拒绝空白 rationale', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  assert.throws(
    () => addDecision(taskPath, 'business-design', {
      type: 'gated', category: 'feature_scope', summary: 'q',
      options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }],
      askMode: 'single_select',
      rationale: '',
    }),
    /rationale/
  );
});

test('addDecision autonomous 不需要 rationale（非空不校验）', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  // autonomous 类型没 rationale 应该正常
  const d = addDecision(taskPath, 'business-design', {
    type: 'autonomous', category: 'tradeoff', summary: '自决项',
  });
  assert.strictEqual(d.status, 'pending');
});

test('addDecision gated 合法选项（{label,description}对象 + rationale 存在）→ 通过', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  const d = addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: '合法gated',
    options: [{ label: '选项A', description: 'A的详细解释，足够支撑用户独立判断' }, { label: '选项B', description: 'B的详细解释' }],
    askMode: 'single_select',
    rationale: '从knowledge-query发现...不确定点...若不决策的后果',
  });
  assert.strictEqual(d.status, 'pending');
});
