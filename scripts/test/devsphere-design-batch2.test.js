'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');
const { initStage, STAGE_SLUG, stageDir } = require('../devsphere-design');

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
