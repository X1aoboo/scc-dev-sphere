'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { makeTask } = require('./helpers');
const {
  initStage, markReady, inspect, recordGate, publish, recordReview,
  currentStage, draftPath, artifactPath, sha256File, STAGE_SLUG,
} = require('../devsphere-design');
const { initMatrix, readMatrix, closeIssue } = require('../devsphere-review-matrix');
const { readState } = require('../devsphere-state');

// 写一个带有效 frontmatter 的 draft.md。注意：frontmatter 里的 artifactId 只用于
// 设计文档的人类可读标识；调 applyReviewResults 时 snapshot.artifactId 必须是 SLUG
// （由 recordReview 强制 == slug），故此处 id 与 snapshot.artifactId 解耦。
function writeDraft(taskPath, stage, id, ver, body = '# draft') {
  fs.writeFileSync(
    draftPath(taskPath, stage),
    `---\nartifactId: "${id}"\nversion: "${ver}"\n---\n\n${body}\n`,
    'utf-8',
  );
}

// 干净阶段的「gate pass + 多视角 review pass → baseline」助手：
// - artifactId 用 SLUG（Fix #1：applyReviewResults 按 slug 校验 snapshot.artifactId）
// - initMatrix 仅在首次（任务级）调用；此处不重置 matrix，避免覆盖跨阶段持久化的 issues
function gatePassReviewPass(taskPath, stage, ver, perReviewer) {
  const slug = STAGE_SLUG[stage];
  recordGate(taskPath, stage, 'pass', { templateChecks: [], qualityChecks: [] });
  const snapshots = Object.entries(perReviewer).map(([reviewer, findings]) => ({
    reviewer,
    artifactId: slug,
    artifactVersion: ver,
    issueFindings: findings,
    closureDecisions: [],
  }));
  return recordReview(taskPath, stage, snapshots);
}

// 通用：四阶段（非 integrated）从 initStage 走到 publish(baseline)
function runStageToBaseline(taskPath, stage, ver, perReviewer) {
  initStage(taskPath, stage);
  markReady(taskPath, stage, 'analysis');
  markReady(taskPath, stage, 'discovery');
  writeDraft(taskPath, stage, stageId(stage), ver);
  gatePassReviewPass(taskPath, stage, ver, perReviewer);
  assert.deepStrictEqual(inspect(taskPath, stage).nextAction, { kind: 'baseline' });
  publish(taskPath, stage);
}

// frontmatter 里的人类可读 artifactId（不影响 snapshot.artifactId）
function stageId(stage) {
  return {
    businessDesign: 'BD-1',
    solutionDesign: 'SD-1',
    implementationDesign: 'ID-1',
    testDesign: 'TD-1',
    integratedDesign: 'INT-1',
  }[stage];
}

test('E2E: 四阶段顺序 + 多视角 + integrated + design_ready', () => {
  const { taskPath } = makeTask();

  // 任务级 matrix 初始化一次（含全部 5 个 artifact entry）。
  // 后续阶段不再 initMatrix，以保证 solution 阶段产生的 blocking issue 能跨
  // recordReview 持久化、并被 re-review 的 closureDecisions 关闭（Fix #2）。
  initMatrix(taskPath);

  // --- business（单视角 SE，advisory） — advisory 触发 ask_review gate ---
  // 不走 runStageToBaseline：先证明 pending advisory 阻断 baseline，再 close 后 baseline。
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  writeDraft(taskPath, 'businessDesign', stageId('businessDesign'), '0.1.0');
  const businessReview = gatePassReviewPass(taskPath, 'businessDesign', '0.1.0', {
    se: [{ findingId: 'F1', type: 'advisory', reviewerAgent: 'se', round: 1 }],
  });
  // pending advisory → ask_review (非 baseline)
  const businessInspect = inspect(taskPath, 'businessDesign');
  assert.strictEqual(businessInspect.nextAction.kind, 'ask_review');
  assert.strictEqual(businessInspect.nextAction.slug, 'business-design');
  assert.ok(businessInspect.nextAction.issues.length >= 1);
  // 关闭 advisory (no_change) 模拟 Lead ask_review 用户决策
  const businessAdv = businessReview.assignedIssueIds[0].issueId;
  closeIssue(taskPath, businessAdv, { humanDecision: 'no_change', closureEvidence: 'accepted as-is' });
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'baseline' });
  publish(taskPath, 'businessDesign');
  assert.strictEqual(currentStage(taskPath).stage, 'solutionDesign');

  // --- solution（3 视角 SA+MDE+TSE），先 blocking → revise → hash 失效 → 重 gate + 重 review ---
  initStage(taskPath, 'solutionDesign');
  markReady(taskPath, 'solutionDesign', 'analysis');
  markReady(taskPath, 'solutionDesign', 'discovery');
  writeDraft(taskPath, 'solutionDesign', 'SD-1', '0.1.0');
  recordGate(taskPath, 'solutionDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  // run_review checkpoint: gate pass 后、recordReview 前 → run_review
  assert.deepStrictEqual(inspect(taskPath, 'solutionDesign').nextAction, { kind: 'run_review' });

  // 首轮 review：SA 提 blocking，其余 2 视角无 finding。
  // 注意：Fix #1 — artifactId 必须是 slug 'solution-design'，而非 frontmatter id 'SD-1'。
  const firstReview = recordReview(taskPath, 'solutionDesign', [
    {
      reviewer: 'sa',
      artifactId: 'solution-design',
      artifactVersion: '0.1.0',
      issueFindings: [{ findingId: 'F1', type: 'blocking', reviewerAgent: 'sa', round: 1 }],
      closureDecisions: [],
    },
    { reviewer: 'mde', artifactId: 'solution-design', artifactVersion: '0.1.0', issueFindings: [], closureDecisions: [] },
    { reviewer: 'tse', artifactId: 'solution-design', artifactVersion: '0.1.0', issueFindings: [], closureDecisions: [] },
  ]);

  // blocking → run_stage/revise（hasOpenRevision）
  assert.strictEqual(inspect(taskPath, 'solutionDesign').nextAction.kind, 'run_stage');
  assert.strictEqual(inspect(taskPath, 'solutionDesign').nextAction.activity, 'revise');

  // 取得 SA blocking finding 对应的 matrix issueId，供 re-review 的 closureDecisions 引用。
  const saBlocking = firstReview.assignedIssueIds.find(
    (a) => a.reviewer === 'sa' && a.findingId === 'F1',
  );
  assert.ok(saBlocking && saBlocking.issueId, 'expected assigned SA blocking issue id');

  // revise draft（hash 变）→ 旧 gate/review 因 hash 失效：inspect 回到 run_gate。
  writeDraft(taskPath, 'solutionDesign', 'SD-1', '0.1.0', '# solution revised');
  assert.deepStrictEqual(inspect(taskPath, 'solutionDesign').nextAction, { kind: 'run_gate' });

  // Fix #2 — 重 gate + 重派 3 视角（无新 finding），但必须关闭旧 blocking issue，
  // 否则 matrix 中 open blocking 仍计入 getRevisionItems → inspect 返回 revise 而非 baseline。
  // 注意：此处不再调 initMatrix，否则会清空 issuesList（且会让 closureDecisions 找不到 issue 抛错）。
  recordGate(taskPath, 'solutionDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  recordReview(taskPath, 'solutionDesign', [
    {
      reviewer: 'sa',
      artifactId: 'solution-design',
      artifactVersion: '0.1.0',
      issueFindings: [],
      closureDecisions: [
        { issueId: saBlocking.issueId, status: 'closed', closureEvidence: 'fixed in revised draft' },
      ],
    },
    { reviewer: 'mde', artifactId: 'solution-design', artifactVersion: '0.1.0', issueFindings: [], closureDecisions: [] },
    { reviewer: 'tse', artifactId: 'solution-design', artifactVersion: '0.1.0', issueFindings: [], closureDecisions: [] },
  ]);
  assert.deepStrictEqual(inspect(taskPath, 'solutionDesign').nextAction, { kind: 'baseline' });
  publish(taskPath, 'solutionDesign');
  assert.strictEqual(currentStage(taskPath).stage, 'implementationDesign');

  // --- implementation（SE+DEV+TSE，无 finding） ---
  runStageToBaseline(taskPath, 'implementationDesign', '0.1.0', {
    se: [], dev: [], tse: [],
  });
  assert.strictEqual(currentStage(taskPath).stage, 'testDesign');

  // --- test（SA+SE+MDE，无 finding） ---
  runStageToBaseline(taskPath, 'testDesign', '0.1.0', {
    sa: [], se: [], mde: [],
  });
  assert.strictEqual(currentStage(taskPath).stage, 'integratedDesign');

  // --- integrated: assemble → gate → 4 维度 review → baseline → complete ---
  initStage(taskPath, 'integratedDesign');
  assert.deepStrictEqual(
    inspect(taskPath, 'integratedDesign').nextAction,
    { kind: 'run_stage', activity: 'assemble' },
  );
  writeDraft(taskPath, 'integratedDesign', 'INT-1', '0.1.0', '# integrated draft');
  gatePassReviewPass(taskPath, 'integratedDesign', '0.1.0', {
    'business-traceability': [],
    'implementation-traceability': [],
    'test-traceability': [],
    'baseline-consistency': [],
  });
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'baseline' });
  publish(taskPath, 'integratedDesign');
  assert.deepStrictEqual(inspect(taskPath, 'integratedDesign').nextAction, { kind: 'complete' });
  assert.strictEqual(currentStage(taskPath).complete, true);

  // artifact hash == state.baseline.hash（publish 复制 draft → artifact，hash 必须一致）
  for (const stage of ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign', 'integratedDesign']) {
    assert.strictEqual(
      sha256File(artifactPath(taskPath, stage)),
      readState(taskPath).stages[stage].baseline.hash,
    );
  }
});
