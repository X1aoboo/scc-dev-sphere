'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { makeTask } = require('./helpers');
const {
  initStage, markReady, inspect, recordGate, publish,
  draftPath, artifactPath, sha256File,
} = require('../devsphere-design');
const { initDecisions, addDecision, resolveDecision } = require('../devsphere-decisions');
const { initMatrix, addIssue, closeIssue, readMatrix, writeMatrix } = require('../devsphere-review-matrix');
const { readState } = require('../devsphere-state');

function writeDraft(taskPath, stage, id, ver, body = '# draft') {
  fs.writeFileSync(draftPath(taskPath, stage),
    `---\nartifactId: "${id}"\nversion: "${ver}"\n---\n\n${body}\n`, 'utf-8');
}

test('E2E: business 垂直切片 analyze → ... → baseline，含中断恢复与 hash 失效', () => {
  const { taskPath, taskId } = makeTask();

  // 1. analyze → mark-ready analysis（模拟"中断恢复"：靠 progress.json 还原）
  initStage(taskPath, 'businessDesign');
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_stage', activity: 'analyze' });
  markReady(taskPath, 'businessDesign', 'analysis');

  // 2. discover → 记 pending gated decision → ask_decision
  markReady(taskPath, 'businessDesign', 'discovery');
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', { type: 'gated', category: 'feature_scope', summary: 'q', options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select', rationale: 'r' });
  assert.strictEqual(inspect(taskPath, 'businessDesign').nextAction.kind, 'ask_decision');
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });

  // 3. design → draft 存在 → run_gate
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0');
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_gate' });

  // 4. gate pass → run_review
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_review' });

  // 5. review 产生 blocking → revise
  initMatrix(taskPath);
  addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'se', round: 1, description: '缺验收标准' });
  const draftRef0 = require('../devsphere-design').readDraftRef(taskPath, 'businessDesign');
  let m = readMatrix(taskPath);
  m.artifacts['business-design'].draftRef = draftRef0;
  writeMatrix(taskPath, m);
  assert.strictEqual(inspect(taskPath, 'businessDesign').nextAction.kind, 'run_stage');
  assert.strictEqual(inspect(taskPath, 'businessDesign').nextAction.activity, 'revise');

  // 6. 修订 draft（hash 变）→ 关 blocking → 旧 review 因 hash 失效，需重 gate + 重 review
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0', '# draft with 验收标准');
  // hash 变后 gate 失效
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'run_gate' });
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  // 重新 review 通过（绑定新 hash）；关闭旧 blocking 以模拟 Lead 合并后矩阵状态
  closeIssue(taskPath, 'B-001', { status: 'closed', humanDecision: 'no_change', closureEvidence: 'fixed in v0.1.0 (new hash)' });
  const draftRef1 = require('../devsphere-design').readDraftRef(taskPath, 'businessDesign');
  m = readMatrix(taskPath);
  m.artifacts['business-design'].draftRef = draftRef1;
  m.artifacts['business-design'].status = 'reviewed';
  writeMatrix(taskPath, m);
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'baseline' });

  // 7. baseline → artifact hash == draft hash，state baseline 写入
  publish(taskPath, 'businessDesign');
  assert.strictEqual(sha256File(artifactPath(taskPath, 'businessDesign')), sha256File(draftPath(taskPath, 'businessDesign')));
  const state = readState(taskPath);
  assert.strictEqual(state.stages.businessDesign.baseline.hash, sha256File(draftPath(taskPath, 'businessDesign')));

  // 8. stage_complete
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'stage_complete' });
});
