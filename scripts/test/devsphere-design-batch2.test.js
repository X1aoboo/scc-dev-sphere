'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');
const { initStage, STAGE_SLUG, stageDir, currentStage } = require('../devsphere-design');
const { readState, writeState } = require('../devsphere-state');

function baselineStage(taskPath, stage, hash) {
  const state = readState(taskPath);
  state.stages[stage] = state.stages[stage] || {};
  state.stages[stage].baseline = { version: '0.1.0', hash: hash || 'sha256:x', inputVersions: {}, approvedAt: 't' };
  writeState(taskPath, state);
}

test('STAGE_SLUG 含 integratedDesign', () => {
  assert.strictEqual(STAGE_SLUG.integratedDesign, 'integrated-design');
});

test('initStage(integratedDesign) 只建 draft.md，无 progress.json / analysis / discovery / design', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'integratedDesign');
  const dir = stageDir(taskPath, 'integratedDesign');
  assert.ok(fs.existsSync(path.join(dir, 'draft.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'analysis.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'discovery.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'design.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'progress.json')));
});

test('current-stage: 全无 baseline → businessDesign', () => {
  const { taskPath } = makeTask();
  assert.strictEqual(currentStage(taskPath).stage, 'businessDesign');
  assert.strictEqual(currentStage(taskPath).complete, false);
});

test('current-stage: business baseline 后 → solutionDesign', () => {
  const { taskPath } = makeTask();
  baselineStage(taskPath, 'businessDesign');
  assert.strictEqual(currentStage(taskPath).stage, 'solutionDesign');
});

test('current-stage: 四阶段全 baseline → integratedDesign', () => {
  const { taskPath } = makeTask();
  for (const s of ['businessDesign','solutionDesign','implementationDesign','testDesign']) {
    baselineStage(taskPath, s);
  }
  assert.strictEqual(currentStage(taskPath).stage, 'integratedDesign');
  assert.strictEqual(currentStage(taskPath).complete, false);
});

test('current-stage: 含 integrated baseline → complete', () => {
  const { taskPath } = makeTask();
  for (const s of ['businessDesign','solutionDesign','implementationDesign','testDesign','integratedDesign']) {
    baselineStage(taskPath, s);
  }
  assert.strictEqual(currentStage(taskPath).stage, null);
  assert.strictEqual(currentStage(taskPath).complete, true);
});
