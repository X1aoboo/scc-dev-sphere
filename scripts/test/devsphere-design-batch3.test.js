'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');
const { initDecisions, addDecision, resolveDecision, validateDecisionElement } = require('../devsphere-decisions');
const { initMatrix, readMatrix, writeMatrix } = require('../devsphere-review-matrix');
const { readState } = require('../devsphere-state');
const {
  reopen, bumpVersionMinor, initStage, markReady, inspect, recordGate,
  publish, draftPath, STAGE_SLUG, readDraftRef,
} = require('../devsphere-design');

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

function baseline(taskPath, stage) {
  initStage(taskPath, stage);
  markReady(taskPath, stage, 'analysis');
  markReady(taskPath, stage, 'discovery');
  const slug = STAGE_SLUG[stage];
  fs.writeFileSync(draftPath(taskPath, stage),
    `---\nartifactId: "${slug.toUpperCase()}-1"\nversion: "0.1.0"\n---\n\n# d\n`, 'utf-8');
  recordGate(taskPath, stage, 'pass', { templateChecks: [], qualityChecks: [] });
  initMatrix(taskPath);
  const draftRef = readDraftRef(taskPath, stage);
  const m = readMatrix(taskPath);
  m.artifacts[slug].draftRef = draftRef;
  m.artifacts[slug].status = 'reviewed';
  writeMatrix(taskPath, m);
  publish(taskPath, stage);
}

test('bumpVersionMinor: 0.1.0 → 0.2.0，写回 frontmatter', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  const dp = draftPath(taskPath, 'businessDesign');
  fs.writeFileSync(dp, '---\nartifactId: "BD-1"\nversion: "0.1.0"\n---\n\nbody\n', 'utf-8');
  const v = bumpVersionMinor(dp);
  assert.strictEqual(v, '0.2.0');
  const body = fs.readFileSync(dp, 'utf-8');
  assert.ok(body.includes('version: "0.2.0"'));
});

test('reopen: business design_change 重开四阶段 + 写 design-change blocking', () => {
  const { taskPath, taskId } = makeTask();
  baseline(taskPath, 'businessDesign');
  baseline(taskPath, 'solutionDesign');
  baseline(taskPath, 'implementationDesign');
  baseline(taskPath, 'testDesign');
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  const d = addDecision(taskPath, 'business-design', {
    type: 'design_change', category: 'feature_scope', summary: '改需求',
    reason: '规模变化', impact: 'businessDesign,solutionDesign,implementationDesign,testDesign',
  });
  resolveDecision(taskPath, 'business-design', d.id, { chosen: 'apply', decidedAt: 't' });

  const res = reopen(taskPath, 'businessDesign', d.id);
  assert.deepStrictEqual(res.reopenedStages,
    ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign']);
  assert.strictEqual(res.newVersions.businessDesign, '0.2.0');

  const state = readState(taskPath);
  assert.ok(!state.stages.businessDesign.baseline);
  const prog = JSON.parse(fs.readFileSync(
    path.join(taskPath, 'work', 'business-design', 'progress.json'), 'utf-8'));
  assert.strictEqual(prog.ready.analysis, false);
  assert.strictEqual(prog.ready.discovery, false);

  const m = readMatrix(taskPath);
  const entry = m.artifacts['business-design'];
  const dcBlocking = entry.issuesList.find(i => i.reviewerAgent === 'design-change');
  assert.ok(dcBlocking, 'design-change blocking 未写入');
  assert.strictEqual(dcBlocking.status, 'open');
  assert.ok(dcBlocking.source.includes(d.id));
});

test('reopen: 未批准的 design_change → 抛', () => {
  const { taskPath, taskId } = makeTask();
  baseline(taskPath, 'businessDesign');
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  const d = addDecision(taskPath, 'business-design', {
    type: 'design_change', category: 'feature_scope', summary: 'x', reason: 'r', impact: 'businessDesign',
  });
  assert.throws(() => reopen(taskPath, 'businessDesign', d.id), /apply|decided/i);
});
