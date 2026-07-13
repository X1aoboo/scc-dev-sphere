'use strict';
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const { makeTask } = require('./helpers');
const { initMatrix, addIssue, setArtifactStatus } = require('../devsphere-review-matrix');
const { initDecisions, addDecision, resolveDecision } = require('../devsphere-decisions');
const {
  DESIGN_STAGE_ORDER, isHumanGated, isStageReady, stageToArtifact,
  getDesignAgent, getDesignSkill, resolveDesignAction,
} = require('../feature-design-router');

test('DESIGN_STAGE_ORDER 固定四阶段顺序', () => {
  assert.deepStrictEqual(DESIGN_STAGE_ORDER,
    ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign']);
});

test('isHumanGated 三模式', () => {
  assert.strictEqual(isHumanGated('strict-human-loop', 'businessDesign', []), true);
  assert.strictEqual(isHumanGated('collaborative-design', 'businessDesign', ['businessDesign']), true);
  assert.strictEqual(isHumanGated('collaborative-design', 'solutionDesign', ['businessDesign']), false);
  assert.strictEqual(isHumanGated('auto-design', 'businessDesign', []), false);
});

test('isStageReady 三模式', () => {
  assert.strictEqual(isStageReady('human_approved', 'businessDesign', 'strict-human-loop', []), true);
  assert.strictEqual(isStageReady('ai_review_passed', 'businessDesign', 'strict-human-loop', []), false);
  assert.strictEqual(isStageReady('ai_review_passed', 'solutionDesign', 'collaborative-design', ['businessDesign']), true);
  assert.strictEqual(isStageReady('human_approved', 'solutionDesign', 'auto-design', []), true);
});

test('stageToArtifact / getDesignAgent / getDesignSkill', () => {
  assert.strictEqual(stageToArtifact('businessDesign'), 'business-design');
  assert.strictEqual(getDesignAgent('solutionDesign'), 'se');
  assert.strictEqual(getDesignSkill('testDesign'), 'feature-design-test');
});

test('resolveDesignAction: 四阶段全完成 → design_phase_complete', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  const { readState } = require('../devsphere-state');
  const state = readState(taskPath);
  for (const stage of DESIGN_STAGE_ORDER) state.stages[stage].status = 'ai_review_passed';
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'design_phase_complete');
});

test('not_started + 无 gated → produce_draft initial', () => {
  const { taskPath } = makeTask({ workflowMode: 'strict-human-loop' });
  const { readState } = require('../devsphere-state');
  const action = resolveDesignAction(taskPath, readState(taskPath));
  assert.strictEqual(action.kind, 'produce_draft');
  assert.strictEqual(action.stage, 'businessDesign');
  assert.strictEqual(action.role, 'sa');
  assert.strictEqual(action.skill, 'feature-design-business');
  assert.strictEqual(action.name, 'sa-businessDesign');
  assert.strictEqual(action.humanGated, true);
  assert.strictEqual(action.payload.mode, 'initial');
  assert.ok(action.dispatchCmd.includes('build design sa businessDesign '), 'dispatchCmd 含 design 派发参数');
  assert.ok(action.dispatchCmd.includes('feature-design-business'), 'dispatchCmd 含 skill');
});

test('新任务默认设计修订上限为 25', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  const { readState } = require('../devsphere-state');
  assert.strictEqual(readState(taskPath).designRevisionLimit, 25);
});

test('not_started + 有 gated pending → ask_gated', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: '范围待定',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }],
    askMode: 'single_select', rationale: 'r',
  });
  const { readState } = require('../devsphere-state');
  const action = resolveDesignAction(taskPath, readState(taskPath));
  assert.strictEqual(action.kind, 'ask_gated');
  assert.strictEqual(action.stage, 'businessDesign');
  assert.strictEqual(action.name, 'sa-businessDesign');
  assert.strictEqual(action.decisions.length, 1);
  assert.strictEqual(action.decisions[0].id, 'BD-DEC-001');
});

test('drafted + 评审未跑(pending) → dispatch_reviews', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  initMatrix(taskPath);
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'drafted';
  writeState(taskPath, state);
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'dispatch_reviews');
  assert.strictEqual(action.stage, 'businessDesign');
  assert.ok(action.artifactPath.endsWith('artifacts/business-design.md'));
  assert.strictEqual(action.reviewers.length, 1); // business-design 基础评审者只有 se
  assert.strictEqual(action.reviewers[0].role, 'se');
  assert.strictEqual(action.reviewers[0].name, 'se-review-businessDesign');
  assert.ok(action.reviewers[0].dispatchCmd.includes('build review se businessDesign '));
});

test('drafted + ciCdRisk=true → 评审者含 cie', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  initMatrix(taskPath);
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'drafted';
  state.ciCdRisk = true;
  writeState(taskPath, state);
  const action = resolveDesignAction(taskPath, state);
  assert.ok(action.reviewers.some(r => r.role === 'cie'));
});

test('drafted + blocking>0 → produce_draft revise', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  initMatrix(taskPath);
  addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'se', round: 1 });
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'drafted';
  writeState(taskPath, state);
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'produce_draft');
  assert.strictEqual(action.payload.mode, 'revise');
  assert.strictEqual(action.payload.reviewItems.length, 1);
  assert.strictEqual(action.payload.reviewItems[0].type, 'blocking');
  assert.strictEqual(action.payload.requiresReReview, true);
  assert.ok(Array.isArray(action.payload.reviewers));
});

test('drafted + blocking 与 pending advisory/risk → ask_review 优先', () => {
  const { taskPath } = makeTask({ workflowMode: 'strict-human-loop' });
  initMatrix(taskPath);
  addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'se', round: 1 });
  addIssue(taskPath, 'business-design', { type: 'advisory', reviewerAgent: 'se', round: 1 });
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'drafted';
  writeState(taskPath, state);

  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'ask_review');
  assert.strictEqual(action.issues.length, 1);
  assert.strictEqual(action.issues[0].type, 'advisory');
});

test('drafted + blocking/apply advisory/apply risk → unified reviseItems', () => {
  const { taskPath } = makeTask({ workflowMode: 'strict-human-loop' });
  initMatrix(taskPath);
  addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'se', round: 1 });
  addIssue(taskPath, 'business-design', {
    type: 'advisory', reviewerAgent: 'se', round: 1, humanDecision: 'apply',
  });
  addIssue(taskPath, 'business-design', {
    type: 'risk_candidate', reviewerAgent: 'se', round: 1, humanDecision: 'apply',
  });
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'drafted';
  writeState(taskPath, state);

  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'produce_draft');
  assert.strictEqual(action.payload.mode, 'revise');
  assert.deepStrictEqual(action.payload.reviewItems.map(i => i.type), [
    'blocking', 'advisory', 'risk_candidate',
  ]);
  assert.ok(action.payload.reviewItems.every(i => i.status === 'open'));
  assert.strictEqual(action.payload.requiresReReview, true);
});

test('drafted + 默认 round 达 25 次上限 → design_blocked', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  initMatrix(taskPath);
  addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'se', round: 25 });
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'drafted';
  writeState(taskPath, state);
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'design_blocked');
  assert.match(action.reason, /25/);
});

test('缺少 designRevisionLimit 的旧 state 按默认 25 次执行', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  initMatrix(taskPath);
  addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'se', round: 25 });
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  delete state.designRevisionLimit;
  state.stages.businessDesign.status = 'drafted';
  writeState(taskPath, state);
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'design_blocked');
  assert.match(action.reason, /25/);
});

test('自定义 designRevisionLimit=5 生效', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design', designRevisionLimit: 5 });
  initMatrix(taskPath);
  addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'se', round: 5 });
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'drafted';
  writeState(taskPath, state);
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'design_blocked');
  assert.match(action.reason, /5/);
});

test('非法 designRevisionLimit 返回明确配置错误', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.designRevisionLimit = 0;
  writeState(taskPath, state);
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'design_blocked');
  assert.match(action.reason, /designRevisionLimit.*positive integer/i);
});

test('三种 workflow mode 使用相同的 designRevisionLimit', () => {
  for (const workflowMode of ['auto-design', 'collaborative-design', 'strict-human-loop']) {
    const { taskPath } = makeTask({ workflowMode, designRevisionLimit: 2 });
    initMatrix(taskPath);
    addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'se', round: 2 });
    const { readState, writeState } = require('../devsphere-state');
    const state = readState(taskPath);
    state.stages.businessDesign.status = 'drafted';
    writeState(taskPath, state);
    const action = resolveDesignAction(taskPath, state);
    assert.strictEqual(action.kind, 'design_blocked', workflowMode);
    assert.match(action.reason, /2/, workflowMode);
  }
});

test('ai_review_passed + 门禁 → human_approve', () => {
  const { taskPath } = makeTask({ workflowMode: 'strict-human-loop' });
  const { readState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'ai_review_passed';
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'human_approve');
  assert.strictEqual(action.stage, 'businessDesign');
});

test('ai_review_passed + 非门禁 → skip 到下一阶段', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  const { readState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'ai_review_passed';
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'produce_draft');
  assert.strictEqual(action.stage, 'solutionDesign'); // 跳到下一未完成阶段
});

test('CLI: workspaceRoot → stdout JSON', () => {
  const { workspaceRoot } = makeTask({ workflowMode: 'strict-human-loop' });
  const out = execFileSync('node',
    [path.join(__dirname, '..', 'feature-design-router.js'), workspaceRoot],
    { encoding: 'utf-8' });
  const action = JSON.parse(out);
  assert.strictEqual(action.kind, 'produce_draft');
  assert.strictEqual(action.stage, 'businessDesign');
});

test('not_started + gated 已 resolve → produce_draft continue', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }],
    askMode: 'single_select', rationale: 'r',
  });
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });
  const { readState } = require('../devsphere-state');
  const action = resolveDesignAction(taskPath, readState(taskPath));
  assert.strictEqual(action.kind, 'produce_draft');
  assert.strictEqual(action.payload.mode, 'continue');
  assert.strictEqual(action.payload.resolutions.length, 1);
  assert.strictEqual(action.payload.resolutions[0].chosen, 'a');
});

test('ai_review_passed + blocking>0(人工驳回注入) → produce_draft revise', () => {
  const { taskPath } = makeTask({ workflowMode: 'strict-human-loop' });
  initMatrix(taskPath);
  addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'human', round: 1 });
  const { readState, writeState } = require('../devsphere-state');
  const state = readState(taskPath);
  state.stages.businessDesign.status = 'ai_review_passed';
  writeState(taskPath, state);
  const action = resolveDesignAction(taskPath, state);
  assert.strictEqual(action.kind, 'produce_draft');
  assert.strictEqual(action.payload.mode, 'revise');
  assert.strictEqual(action.payload.reviewItems.length, 1);
});

test('open apply issue blocks artifact reviewed until reviewer closes original issue', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  initMatrix(taskPath);
  const issue = addIssue(taskPath, 'business-design', {
    type: 'advisory', reviewerAgent: 'se', humanDecision: 'apply',
  });
  assert.throws(
    () => setArtifactStatus(taskPath, 'business-design', 'reviewed'),
    /apply revision issue/i,
  );
  const { closeIssue, readMatrix } = require('../devsphere-review-matrix');
  closeIssue(taskPath, issue.id, {
    status: 'closed', humanDecision: 'apply', closureEvidence: 're-review passed',
  });
  const matrix = readMatrix(taskPath);
  assert.strictEqual(matrix.artifacts['business-design'].issuesList[0].id, issue.id);
  assert.doesNotThrow(() => setArtifactStatus(taskPath, 'business-design', 'reviewed'));
});
