'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { makeTask } = require('./helpers');
const { initDecisions, addDecision, resolveDecision } = require('../devsphere-decisions');
const { decideWrite } = require('../devsphere-guard');

function mainArtifactPath(taskPath, slug) {
  return path.join(taskPath, 'artifacts', `${slug}.md`);
}

test('非主产物放行', () => {
  const { taskPath } = makeTask();
  const r = decideWrite(path.join(taskPath, 'decisions', 'business-design-decisions.json'));
  assert.strictEqual(r.allow, true);
});

test('主产物但 decisions 文件不存在 → 拒绝（scoping 未完成）', () => {
  const { taskPath, taskId } = makeTask();
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /scoping/);
});

test('主产物且 gated pending>0 → 拒绝', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /1 个 gated/);
});

test('主产物且 gated pending=0 → 放行', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, true);
});

test('integrated-design.md 非设计阶段主产物 → 放行', () => {
  const { taskPath } = makeTask();
  const r = decideWrite(path.join(taskPath, 'artifacts', 'integrated-design.md'));
  assert.strictEqual(r.allow, true);
});
