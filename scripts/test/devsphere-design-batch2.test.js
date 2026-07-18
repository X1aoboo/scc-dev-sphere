'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');
const { initStage, STAGE_SLUG, stageDir, currentStage, markReady } = require('../devsphere-design');
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

// --- Task 3: inspect 的 integrated 分支 ---
const { inspect, recordGate, readDraftRef } = require('../devsphere-design');
const { initMatrix, readMatrix, writeMatrix } = require('../devsphere-review-matrix');

function writeIntegratedDraft(taskPath, id, ver, body = '# integrated') {
  const dp = path.join(taskPath, 'work', 'integrated-design', 'draft.md');
  fs.writeFileSync(dp, `---\nartifactId: "${id}"\nversion: "${ver}"\n---\n\n${body}\n`, 'utf-8');
}

test('inspect(integrated): 无 draft → run_stage/assemble', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'integratedDesign');
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'run_stage', activity: 'assemble' });
});

test('inspect(integrated): draft 存在无 gate → run_gate', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'integratedDesign');
  writeIntegratedDraft(taskPath, 'INT-1', '0.1.0');
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'run_gate' });
});

test('inspect(integrated): gate pass 无 review → run_review', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'integratedDesign');
  writeIntegratedDraft(taskPath, 'INT-1', '0.1.0');
  recordGate(taskPath, 'integratedDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'run_review' });
});

test('inspect(integrated): reviewed 无 baseline → baseline', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'integratedDesign');
  writeIntegratedDraft(taskPath, 'INT-1', '0.1.0');
  recordGate(taskPath, 'integratedDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  initMatrix(taskPath); // 含 integrated-design entry（BASE_REVIEWERS 已含）
  const draftRef = readDraftRef(taskPath, 'integratedDesign');
  const m = readMatrix(taskPath);
  m.artifacts['integrated-design'].draftRef = draftRef;
  m.artifacts['integrated-design'].status = 'reviewed';
  writeMatrix(taskPath, m);
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'baseline' });
});

test('inspect(integrated): baselined → complete', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'integratedDesign');
  writeIntegratedDraft(taskPath, 'INT-1', '0.1.0');
  recordGate(taskPath, 'integratedDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  // 模拟 publish 已写 baseline
  const state = readState(taskPath);
  state.stages.integratedDesign = state.stages.integratedDesign || {};
  state.stages.integratedDesign.baseline = { version: '0.1.0', hash: readDraftRef(taskPath, 'integratedDesign').hash, inputVersions: {}, approvedAt: 't' };
  writeState(taskPath, state);
  initMatrix(taskPath);
  const m = readMatrix(taskPath);
  m.artifacts['integrated-design'].draftRef = state.stages.integratedDesign.baseline;
  m.artifacts['integrated-design'].status = 'reviewed';
  writeMatrix(taskPath, m);
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'complete' });
});

// --- Task 4: record-review (hash-bound multi-perspective merge) ---
const { recordReview } = require('../devsphere-design');

function writeSolutionDraft(taskPath, id, ver, body = '# solution') {
  const dp = path.join(taskPath, 'work', 'solution-design', 'draft.md');
  fs.mkdirSync(path.dirname(dp), { recursive: true });
  fs.writeFileSync(dp, `---\nartifactId: "${id}"\nversion: "${ver}"\n---\n\n${body}\n`, 'utf-8');
}

test('record-review: 合并多视角 findings 并 stamp draftRef/status', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'solutionDesign');
  writeSolutionDraft(taskPath, 'SD-1', '0.1.0');
  initMatrix(taskPath);
  const draftRef = readDraftRef(taskPath, 'solutionDesign');
  const snapshots = [
    { reviewer: 'sa', artifactId: 'solution-design', artifactVersion: '0.1.0',
      issueFindings: [{ findingId: 'F1', type: 'blocking', reviewerAgent: 'sa', round: 1 }], closureDecisions: [] },
    { reviewer: 'mde', artifactId: 'solution-design', artifactVersion: '0.1.0',
      issueFindings: [{ findingId: 'F1', type: 'advisory', reviewerAgent: 'mde', round: 1 }], closureDecisions: [] },
  ];
  recordReview(taskPath, 'solutionDesign', snapshots);
  const m = readMatrix(taskPath);
  const entry = m.artifacts['solution-design'];
  assert.strictEqual(entry.status, 'reviewed');
  assert.strictEqual(entry.draftRef.hash, draftRef.hash);
  assert.strictEqual(entry.issuesList.length, 2);
});

test('record-review: 同 snapshot 重复合并不翻倍（幂等 source）', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'solutionDesign');
  writeSolutionDraft(taskPath, 'SD-1', '0.1.0');
  initMatrix(taskPath);
  const snapshots = [{ reviewer: 'sa', artifactId: 'solution-design', artifactVersion: '0.1.0',
    issueFindings: [{ findingId: 'F1', type: 'blocking', reviewerAgent: 'sa', round: 1 }], closureDecisions: [] }];
  recordReview(taskPath, 'solutionDesign', snapshots);
  recordReview(taskPath, 'solutionDesign', snapshots); // 重复合并
  const m = readMatrix(taskPath);
  assert.strictEqual(m.artifacts['solution-design'].issuesList.length, 1);
});

test('record-review: 无 draft → 抛错', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'solutionDesign');
  initMatrix(taskPath);
  assert.throws(() => recordReview(taskPath, 'solutionDesign', []), /draft/);
});

// --- Task 5: ask_review gate — pending advisory/risk blocks baseline ---

function writeBusinessDraft(taskPath, id, ver, body = '# business') {
  const dp = path.join(taskPath, 'work', 'business-design', 'draft.md');
  fs.mkdirSync(path.dirname(dp), { recursive: true });
  fs.writeFileSync(dp, `---\nartifactId: "${id}"\nversion: "${ver}"\n---\n\n${body}\n`, 'utf-8');
}

test('ask_review gate: pending advisory → inspect 返回 ask_review (非 baseline)', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  writeBusinessDraft(taskPath, 'BD-1', '0.1.0');
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  initMatrix(taskPath);
  recordReview(taskPath, 'businessDesign', [
    { reviewer: 'se', artifactId: 'business-design', artifactVersion: '0.1.0',
      issueFindings: [{ findingId: 'F1', type: 'advisory', reviewerAgent: 'se', round: 1 }], closureDecisions: [] },
  ]);
  const result = inspect(taskPath, 'businessDesign');
  assert.strictEqual(result.nextAction.kind, 'ask_review');
  assert.strictEqual(result.nextAction.slug, 'business-design');
  assert.strictEqual(result.nextAction.stage, 'businessDesign');
  assert.ok(Array.isArray(result.nextAction.issues) && result.nextAction.issues.length === 1);
});

test('ask_review gate: 关闭 pending advisory (no_change) 后 → inspect 返回 baseline', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  writeBusinessDraft(taskPath, 'BD-1', '0.1.0');
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  initMatrix(taskPath);
  const result = recordReview(taskPath, 'businessDesign', [
    { reviewer: 'se', artifactId: 'business-design', artifactVersion: '0.1.0',
      issueFindings: [{ findingId: 'F1', type: 'advisory', reviewerAgent: 'se', round: 1 }], closureDecisions: [] },
  ]);
  const advId = result.assignedIssueIds[0].issueId;
  const { closeIssue } = require('../devsphere-review-matrix');
  closeIssue(taskPath, advId, { humanDecision: 'no_change', closureEvidence: 'accepted as-is' });
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'baseline' });
});

test('ask_review gate: pending risk_candidate → ask_review (非 baseline)', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  writeBusinessDraft(taskPath, 'BD-1', '0.1.0');
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  initMatrix(taskPath);
  recordReview(taskPath, 'businessDesign', [
    { reviewer: 'se', artifactId: 'business-design', artifactVersion: '0.1.0',
      issueFindings: [{ findingId: 'F1', type: 'risk_candidate', reviewerAgent: 'se', round: 1 }], closureDecisions: [] },
  ]);
  assert.strictEqual(inspect(taskPath, 'businessDesign').nextAction.kind, 'ask_review');
});

test('ask_review gate (integrated): pending advisory → ask_review (非 baseline)', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'integratedDesign');
  writeIntegratedDraft(taskPath, 'INT-1', '0.1.0');
  recordGate(taskPath, 'integratedDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  initMatrix(taskPath);
  recordReview(taskPath, 'integratedDesign', [
    { reviewer: 'baseline-consistency', artifactId: 'integrated-design', artifactVersion: '0.1.0',
      issueFindings: [{ findingId: 'F1', type: 'advisory', reviewerAgent: 'baseline-consistency', round: 1 }], closureDecisions: [] },
  ]);
  assert.strictEqual(inspect(taskPath, 'integratedDesign').nextAction.kind, 'ask_review');
  assert.strictEqual(inspect(taskPath, 'integratedDesign').nextAction.slug, 'integrated-design');
});
