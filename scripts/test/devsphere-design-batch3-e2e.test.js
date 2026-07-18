'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { makeTask } = require('./helpers');
const {
  initStage, markReady, inspect, recordGate, publish, recordReview, reopen,
  draftPath, currentStage, STAGE_SLUG,
} = require('../devsphere-design');
const { initDecisions, addDecision, resolveDecision } = require('../devsphere-decisions');
const { initMatrix, readMatrix, writeMatrix } = require('../devsphere-review-matrix');
const { readState } = require('../devsphere-state');

function writeDraft(taskPath, stage, ver, body = '# d') {
  const slug = STAGE_SLUG[stage];
  fs.writeFileSync(draftPath(taskPath, stage),
    `---\nartifactId: "${slug.toUpperCase()}-1"\nversion: "${ver}"\n---\n\n${body}\n`, 'utf-8');
}

// 干净阶段的「init → ready → draft → gate pass → 单视角 review pass → baseline」助手。
// Fix #4：initMatrix 仅在任务起始调用一次（见 test body），不在此处重置 matrix，
// 否则 reopen 写入的 design-change blocking 会被后续阶段的 helper 调用清空。
function baselineClean(taskPath, stage, ver, reviewer, findings = []) {
  const slug = STAGE_SLUG[stage];
  initStage(taskPath, stage);
  markReady(taskPath, stage, 'analysis');
  markReady(taskPath, stage, 'discovery');
  writeDraft(taskPath, stage, ver);
  recordGate(taskPath, stage, 'pass', { templateChecks: [], qualityChecks: [] });
  recordReview(taskPath, stage,
    [{ reviewer, artifactId: slug, artifactVersion: ver, issueFindings: findings, closureDecisions: [] }]);
  assert.deepStrictEqual(inspect(taskPath, stage).nextAction, { kind: 'baseline' });
  publish(taskPath, stage);
}

test('E2E: business baseline → design_change → reopen → revise 关 blocking → 重 baseline → design_ready', () => {
  const { taskPath, taskId } = makeTask();

  // Fix #4：任务级 matrix 初始化一次（含全部 5 个 artifact entry）。
  // 后续阶段不再 initMatrix，以保证 reopen 写入的 design-change blocking 跨阶段持久化，
  // 并让 closureDecisions 能在重 baseline 流程中找到对应 issue。
  initMatrix(taskPath);

  // business 基线（单视角 SE，无 finding）
  baselineClean(taskPath, 'businessDesign', '0.1.0', 'se');
  // 其余三阶段 + integrated 基线到 design_ready（简化：每阶段单视角无 finding）
  baselineClean(taskPath, 'solutionDesign', '0.1.0', 'sa');
  baselineClean(taskPath, 'implementationDesign', '0.1.0', 'se');
  baselineClean(taskPath, 'testDesign', '0.1.0', 'sa');
  // integrated（无 progress.json，无 markReady；双视角 review）
  initStage(taskPath, 'integratedDesign');
  writeDraft(taskPath, 'integratedDesign', '0.1.0');
  recordGate(taskPath, 'integratedDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  recordReview(taskPath, 'integratedDesign', [{
    reviewer: 'business-traceability', artifactId: 'integrated-design', artifactVersion: '0.1.0',
    issueFindings: [], closureDecisions: [],
  }, {
    reviewer: 'baseline-consistency', artifactId: 'integrated-design', artifactVersion: '0.1.0',
    issueFindings: [], closureDecisions: [],
  }]);
  publish(taskPath, 'integratedDesign');
  assert.strictEqual(currentStage(taskPath).complete, true);

  // 触发 design_change（business 范围）
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  const d = addDecision(taskPath, 'business-design', {
    type: 'design_change', category: 'feature_scope', summary: '改业务规则',
    reason: '用户反馈', impact: 'businessDesign,solutionDesign,implementationDesign,testDesign',
  });
  resolveDecision(taskPath, 'business-design', d.id, { chosen: 'apply', decidedAt: 't' });
  reopen(taskPath, 'businessDesign', d.id);

  // current-stage 回到 business（baseline 已清）
  assert.strictEqual(currentStage(taskPath).stage, 'businessDesign');

  // 真实行为：reopen 同时 reset progress(analysis=false) AND 写 design-change blocking。
  // inspect 的优先级把 progress 检查置于 review/blocking 检查之前（devsphere-design.js:225），
  // 故 reopen 后立即 inspect 返回 run_stage/analyze（要求团队带新背景重做分析/发现），
  // 而非 brief 设想的 revise。blocking 会在 review 里程碑经 readMatrix 验证（见下）。
  assert.strictEqual(inspect(taskPath, 'businessDesign').nextAction.kind, 'run_stage');
  assert.strictEqual(inspect(taskPath, 'businessDesign').nextAction.activity, 'analyze');

  // 直接验证 reopen 写入了 design-change blocking（open，绑定 bumped 0.2.0 hash）。
  const matrixAfterReopen = readMatrix(taskPath);
  const dcBlocking = matrixAfterReopen.artifacts['business-design'].issuesList.find(
    i => i.reviewerAgent === 'design-change' && i.status === 'open',
  );
  assert.ok(dcBlocking, 'expected design-change blocking issue after reopen');
  assert.strictEqual(dcBlocking.type, 'blocking');

  // 主会话判断"小改"→ 快进到 design + 改 draft（hash 变）
  markReady(taskPath, 'businessDesign', 'analysis');
  markReady(taskPath, 'businessDesign', 'discovery');
  // Fix #1：reopen 已 bump 到 0.2.0；rewrite 必须使用 0.2.0 以匹配 bumped frontmatter。
  writeDraft(taskPath, 'businessDesign', '0.2.0', '# business revised for design change');
  // record-gate（新 hash）
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  // Fix #2 + #3：record-review snapshot artifactId 必须是 slug；closureDecisions 引用的
  // issueId 从 matrix 实时读取（design-change blocking 由 reopen 写入，不硬编码）。
  const m = readMatrix(taskPath);
  const dcId = m.artifacts['business-design'].issuesList.find(i => i.reviewerAgent === 'design-change').id;
  recordReview(taskPath, 'businessDesign', [{
    reviewer: 'se', artifactId: 'business-design', artifactVersion: '0.2.0',
    issueFindings: [],
    closureDecisions: [{ issueId: dcId, status: 'closed', closureEvidence: 'design change 已在 draft 体现' }],
  }]);
  // blocking 关闭 + 新 hash 通过 → baseline
  assert.deepStrictEqual(inspect(taskPath, 'businessDesign').nextAction, { kind: 'baseline' });
  publish(taskPath, 'businessDesign');
  // business baseline 版本已是 0.2.0
  assert.strictEqual(readState(taskPath).stages.businessDesign.baseline.version, '0.2.0');
  // current-stage 推进到 solution（被重开）
  assert.strictEqual(currentStage(taskPath).stage, 'solutionDesign');
});
