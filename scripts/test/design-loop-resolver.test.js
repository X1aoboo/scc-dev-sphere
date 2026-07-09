'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { isHumanGated, toQuestionData, DESIGN_STAGE_ORDER, resolveDesignLoop } = require('../workflows/feature-workflow');
const { makeTask } = require('./helpers');
const { initDecisions, addDecision, resolveDecision } = require('../devsphere-decisions');
const { readState, writeState } = require('../devsphere-state');
const { initMatrix, addIssue } = require('../devsphere-review-matrix');

function writeArtifact(taskPath, slug) {
  fs.writeFileSync(path.join(taskPath, 'artifacts', `${slug}.md`), 'draft');
}
function markStage(taskPath, stage, status) {
  const st = readState(taskPath);
  st.stages[stage].status = status;
  writeState(taskPath, st);
}
function addGated(taskPath, slug) {
  addDecision(taskPath, slug, {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
}

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

test('toQuestionData(null) 返回 null', () => {
  assert.strictEqual(toQuestionData(null), null);
});

test('toQuestionData 映射 gated decision 为问询数据', () => {
  const d = {
    id: 'BD-DEC-001', type: 'gated', category: 'feature_scope',
    summary: '注册登录？', rationale: 'x',
    options: [{ label: '要', description: 'a' }, { label: '不要', description: 'b' }],
    recommendation: '要', askMode: 'single_select', status: 'pending', resolution: null,
    evidence: [], impact: '',
  };
  const q = toQuestionData(d);
  assert.strictEqual(q.id, 'BD-DEC-001');
  assert.strictEqual(q.summary, '注册登录？');
  assert.strictEqual(q.options.length, 2);
  assert.strictEqual(q.recommendation, '要');
  assert.strictEqual(q.askMode, 'single_select');
});

test('toQuestionData 对缺失字段给默认值', () => {
  const q = toQuestionData({ id: 'X-1', summary: 's' });
  assert.deepStrictEqual(q.options, []);
  assert.strictEqual(q.recommendation, '');
  assert.strictEqual(q.askMode, 'single_select');
});

test('strict 模式 + 无 decisions → scope（dispatch_agent, humanGated=true）', () => {
  const { taskPath } = makeTask({ workflowMode: 'strict-human-loop' });
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'dispatch_agent');
  assert.strictEqual(r.mode, 'scope');
  assert.strictEqual(r.stage, 'businessDesign');
  assert.strictEqual(r.agent, 'sa');
  assert.strictEqual(r.skill, 'feature-design-business');
  assert.strictEqual(r.humanGated, true);
});

test('strict 模式 + gated pending → ask_decisions 含映射数据', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addGated(taskPath, 'business-design');
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'ask_decisions');
  assert.strictEqual(r.stage, 'businessDesign');
  assert.strictEqual(r.decisions.length, 1);
  assert.strictEqual(r.decisions[0].id, 'BD-DEC-001');
  assert.strictEqual(r.decisions[0].options.length, 2);
});

test('strict 模式 + gated 全 resolved → draft', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addGated(taskPath, 'business-design');
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'dispatch_agent');
  assert.strictEqual(r.mode, 'draft');
});

test('auto-design + gated pending → draft（双重门控跳过 ask）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'auto-design' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addGated(taskPath, 'business-design');
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'dispatch_agent');
  assert.strictEqual(r.mode, 'draft');
});

test('collaborative：门禁阶段 pending → ask；非门禁阶段 pending → draft', () => {
  // 门禁阶段 businessDesign
  const t1 = makeTask({ workflowMode: 'collaborative-design' });
  const s1 = readState(t1.taskPath);
  s1.humanGateStages = ['businessDesign'];
  writeState(t1.taskPath, s1);
  initDecisions(t1.taskPath, 'business-design', t1.taskId, 'businessDesign');
  addGated(t1.taskPath, 'business-design');
  assert.strictEqual(resolveDesignLoop(t1.taskPath).kind, 'ask_decisions');

  // 非门禁阶段 solutionDesign：humanGateStages 只含 testDesign，故 business/solution 均非门禁。
  // 把 businessDesign 推到 ai_review_passed（非门禁 → 就绪），使 solutionDesign 成为当前阶段。
  const t2 = makeTask({ workflowMode: 'collaborative-design' });
  const s2 = readState(t2.taskPath);
  s2.humanGateStages = ['testDesign'];
  writeState(t2.taskPath, s2);
  markStage(t2.taskPath, 'businessDesign', 'ai_review_passed');
  initDecisions(t2.taskPath, 'solution-design', t2.taskId, 'solutionDesign');
  addGated(t2.taskPath, 'solution-design');
  const r = resolveDesignLoop(t2.taskPath);
  assert.strictEqual(r.kind, 'dispatch_agent');
  assert.strictEqual(r.mode, 'draft');
  assert.strictEqual(r.stage, 'solutionDesign');
});

test('全部阶段 ai_review_passed（auto-design）→ all_design_stages_ready', () => {
  const { taskPath } = makeTask({ workflowMode: 'auto-design' });
  for (const stg of ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign']) {
    markStage(taskPath, stg, 'ai_review_passed');
  }
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'all_design_stages_ready');
});

test('artifact 存在 + drafted + 无 blocking + 无 ciCdRisk → dispatch_reviewers（基础评审者）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  writeArtifact(taskPath, 'business-design');   // 触发 drafted 由 sync-stage-status；这里直接置 drafted
  markStage(taskPath, 'businessDesign', 'drafted');
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'dispatch_reviewers');
  assert.strictEqual(r.stage, 'businessDesign');
  assert.deepStrictEqual(r.reviewers, ['se']);   // businessDesign 评审者
  assert.strictEqual(r.skill, 'feature-review');
});

test('artifact 存在 + blocking → revise（dispatch_agent draft）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  writeArtifact(taskPath, 'business-design');
  markStage(taskPath, 'businessDesign', 'drafted');
  initMatrix(taskPath);
  addIssue(taskPath, 'business-design', { type: 'blocking', reviewerAgent: 'se' });
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'dispatch_agent');
  assert.strictEqual(r.mode, 'draft');
  assert.strictEqual(r.stage, 'businessDesign');
  assert.strictEqual(r.requiresReReview, true);
});

test('ciCdRisk=true → 评审者含 cie', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  writeArtifact(taskPath, 'business-design');
  markStage(taskPath, 'businessDesign', 'drafted');
  const st = require('../devsphere-state').readState(taskPath);
  st.ciCdRisk = true;
  writeState(taskPath, st);
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'dispatch_reviewers');
  assert.deepStrictEqual(r.reviewers, ['se', 'cie']);
});

test('ai_review_passed + strict → human_confirm', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  writeArtifact(taskPath, 'business-design');
  markStage(taskPath, 'businessDesign', 'ai_review_passed');
  const r = resolveDesignLoop(taskPath);
  assert.strictEqual(r.kind, 'human_confirm');
  assert.strictEqual(r.stage, 'businessDesign');
});

test('CLI resolve-design-loop 输出 scope 动作 JSON', () => {
  const { taskPath } = makeTask({ workflowMode: 'strict-human-loop' });
  const out = execFileSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'resolve-design-loop', taskPath,
  ], { encoding: 'utf-8' });
  const r = JSON.parse(out);
  assert.strictEqual(r.kind, 'dispatch_agent');
  assert.strictEqual(r.mode, 'scope');
  assert.strictEqual(r.stage, 'businessDesign');
});
