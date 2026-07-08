'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');
const { initDecisions, addDecision, resolveDecision } = require('../devsphere-decisions');
const { resolveDesignStageAction } = require('../workflows/feature-workflow');

test('主产物不存在 + 无 decisions → scope', () => {
  const { taskPath } = makeTask();
  const r = resolveDesignStageAction(taskPath, 'businessDesign');
  assert.strictEqual(r.action, 'scope');
  assert.strictEqual(r.slug, 'business-design');
});

test('decisions 存在 + gated pending>0 → ask', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  const r = resolveDesignStageAction(taskPath, 'businessDesign');
  assert.strictEqual(r.action, 'ask');
  assert.strictEqual(r.gatedPending, 1);
  assert.strictEqual(r.slug, 'business-design');
});

test('decisions 存在 + gated pending=0 → draft', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });
  const r = resolveDesignStageAction(taskPath, 'businessDesign');
  assert.strictEqual(r.action, 'draft');
  assert.strictEqual(r.gatedPending, 0);
  assert.strictEqual(r.slug, 'business-design');
});

test('主产物已存在 → ready-for-review', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  fs.writeFileSync(path.join(taskPath, 'artifacts', 'business-design.md'), 'done');
  const r = resolveDesignStageAction(taskPath, 'businessDesign');
  assert.strictEqual(r.action, 'ready-for-review');
  assert.strictEqual(r.slug, 'business-design');
});

const { execFileSync } = require('child_process');

function runSync(workspaceRoot) {
  const out = execFileSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'sync-stage-status', workspaceRoot,
  ], { encoding: 'utf-8' });
  return JSON.parse(out);
}

test('sync-stage-status 在 gated pending>0 时不置 drafted', () => {
  const { workspaceRoot, taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  // 模拟守卫被绕过：强行写主产物
  fs.writeFileSync(path.join(taskPath, 'artifacts', 'business-design.md'), 'x');
  runSync(workspaceRoot);
  const { readState } = require('../devsphere-state');
  const state = readState(taskPath);
  assert.strictEqual(state.stages.businessDesign.status, 'not_started'); // 不升 drafted
});

test('sync-stage-status 在 gated pending=0 时正常置 drafted', () => {
  const { workspaceRoot, taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });
  fs.writeFileSync(path.join(taskPath, 'artifacts', 'business-design.md'), 'x');
  runSync(workspaceRoot);
  const { readState } = require('../devsphere-state');
  const state = readState(taskPath);
  assert.strictEqual(state.stages.businessDesign.status, 'drafted');
});
