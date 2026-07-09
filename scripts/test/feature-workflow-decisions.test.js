'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');
const { initDecisions, addDecision, resolveDecision } = require('../devsphere-decisions');
const { isHumanGated, DESIGN_STAGE_ORDER } = require('../feature-design-router');

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
    rationale: 'test rationale',
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
    rationale: 'test rationale',
  });
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });
  fs.writeFileSync(path.join(taskPath, 'artifacts', 'business-design.md'), 'x');
  runSync(workspaceRoot);
  const { readState } = require('../devsphere-state');
  const state = readState(taskPath);
  assert.strictEqual(state.stages.businessDesign.status, 'drafted');
});

test('set-task-status 写入 ciCdRisk=true', () => {
  const { workspaceRoot, taskPath } = makeTask();
  execFileSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'set-task-status', workspaceRoot, 'assessed', 'strict-human-loop', '', 'true',
  ], { encoding: 'utf-8' });
  const { readState } = require('../devsphere-state');
  const st = readState(taskPath);
  assert.strictEqual(st.status, 'assessed');
  assert.strictEqual(st.workflowMode, 'strict-human-loop');
  assert.strictEqual(st.ciCdRisk, true);
});

test('set-task-status 不传 ciCdRisk 时不改该字段', () => {
  const { workspaceRoot, taskPath } = makeTask();
  execFileSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'set-task-status', workspaceRoot, 'assessed', 'auto-design',
  ], { encoding: 'utf-8' });
  const { readState } = require('../devsphere-state');
  const st = readState(taskPath);
  assert.strictEqual(st.ciCdRisk, undefined);
});

test('set-stage-status 写入阶段状态', () => {
  const { taskPath } = makeTask();
  execFileSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'set-stage-status', taskPath, 'businessDesign', 'human_approved',
  ], { encoding: 'utf-8' });
  const { readState } = require('../devsphere-state');
  const st = readState(taskPath);
  assert.strictEqual(st.stages.businessDesign.status, 'human_approved');
});

test('set-stage-status 拒绝非法 status', () => {
  const { taskPath } = makeTask();
  let threw = false;
  try {
    execFileSync('node', [
      path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
      'set-stage-status', taskPath, 'businessDesign', 'human_apporved',
    ], { encoding: 'utf-8', stdio: ['ignore', 'ignore', 'ignore'] });
  } catch (e) { threw = true; }
  assert.strictEqual(threw, true, 'invalid status must cause non-zero exit');
  const { readState } = require('../devsphere-state');
  const st = readState(taskPath);
  assert.strictEqual(st.stages.businessDesign.status, 'not_started', 'invalid status must not be written');
});
