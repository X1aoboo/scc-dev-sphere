'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { makeTask, writeArtifact } = require('./helpers');
const { initMatrix, readMatrix } = require('../devsphere-review-matrix');
const {
  readArtifactVersion,
  authorizeReview,
  recordReviewResult,
  getReviewStatus,
  mergeReviewResults,
  snapshotPath,
} = require('../devsphere-review-state');

test('artifactVersion 作为评审批次校验，不需要 reviewBatchId', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  initMatrix(taskPath);
  writeArtifact(taskPath, 'business-design', '0.1.0');
  assert.strictEqual(readArtifactVersion(taskPath, 'business-design'), '0.1.0');
  authorizeReview(taskPath, 'business-design', '0.1.0');
  const status = getReviewStatus(taskPath, 'business-design', '0.1.0');
  assert.strictEqual(status.requiredReviewers.join(','), 'se');
  assert.ok(snapshotPath(taskPath, 'business-design', 'se').endsWith('/reviews/business-design/se.json'));
});

test('多角色评审各写自己的快照，Lead 合并前 matrix 不变', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  initMatrix(taskPath);
  writeArtifact(taskPath, 'solution-design', '0.1.0');
  authorizeReview(taskPath, 'solution-design', '0.1.0');
  for (const reviewer of ['sa', 'mde', 'tse']) {
    recordReviewResult(taskPath, 'solution-design', reviewer, {
      artifactId: 'solution-design', artifactVersion: '0.1.0',
      issueFindings: reviewer === 'sa' ? [{ findingId: 'sa-001', type: 'blocking' }] : [],
    });
  }
  assert.strictEqual(readMatrix(taskPath).artifacts['solution-design'].issuesList.length, 0);
  assert.strictEqual(getReviewStatus(taskPath, 'solution-design', '0.1.0').allCompleted, true);
  const merged = mergeReviewResults(taskPath, 'solution-design', '0.1.0');
  assert.strictEqual(merged.status, 'pending');
  assert.strictEqual(readMatrix(taskPath).artifacts['solution-design'].issuesList.length, 1);
});

test('版本不匹配的旧评审结果不能完成当前批次', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  initMatrix(taskPath);
  writeArtifact(taskPath, 'business-design', '0.2.0');
  authorizeReview(taskPath, 'business-design', '0.2.0');
  assert.throws(() => recordReviewResult(taskPath, 'business-design', 'se', {
    artifactId: 'business-design', artifactVersion: '0.1.0', issueFindings: [],
  }), /version mismatch/i);
  assert.strictEqual(getReviewStatus(taskPath, 'business-design', '0.2.0').allCompleted, false);
});

test('新版本复评关闭原 issue，原 issue ID 保持不变且重复 merge 幂等', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  initMatrix(taskPath);
  writeArtifact(taskPath, 'business-design', '0.1.0');
  authorizeReview(taskPath, 'business-design', '0.1.0');
  recordReviewResult(taskPath, 'business-design', 'se', {
    artifactId: 'business-design', artifactVersion: '0.1.0',
    issueFindings: [{ findingId: 'se-001', type: 'blocking' }],
  });
  mergeReviewResults(taskPath, 'business-design', '0.1.0');
  const firstMatrix = readMatrix(taskPath);
  const issueId = firstMatrix.artifacts['business-design'].issuesList[0].id;
  assert.strictEqual(issueId, 'B-001');

  writeArtifact(taskPath, 'business-design', '0.2.0');
  authorizeReview(taskPath, 'business-design', '0.2.0');
  recordReviewResult(taskPath, 'business-design', 'se', {
    artifactId: 'business-design', artifactVersion: '0.2.0',
    issueFindings: [],
    closureDecisions: [{ issueId, status: 'closed', closureEvidence: '复评确认已修复' }],
  });
  const merged = mergeReviewResults(taskPath, 'business-design', '0.2.0');
  assert.strictEqual(merged.status, 'reviewed');
  assert.strictEqual(readMatrix(taskPath).artifacts['business-design'].issuesList.length, 1);
  assert.strictEqual(readMatrix(taskPath).artifacts['business-design'].issuesList[0].id, issueId);
  assert.strictEqual(readMatrix(taskPath).artifacts['business-design'].issuesList[0].status, 'closed');

  mergeReviewResults(taskPath, 'business-design', '0.2.0');
  assert.strictEqual(readMatrix(taskPath).artifacts['business-design'].issuesList.length, 1);
});
