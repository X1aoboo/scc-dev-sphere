'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { makeTask } = require('./helpers');
const { initDecisions, addDecision, resolveDecision, readDecisions } = require('../devsphere-decisions');
const { decideWrite, checkDecisionsResolvedFromStdin, slugToStage } = require('../devsphere-guard');
const { readState, writeState } = require('../devsphere-state');

function mainArtifactPath(taskPath, slug) {
  return path.join(taskPath, 'artifacts', `${slug}.md`);
}

test('非主产物放行', () => {
  const { taskPath } = makeTask();
  const r = decideWrite(path.join(taskPath, 'decisions', 'business-design-decisions.json'));
  assert.strictEqual(r.allow, true);
});

test('主产物但 decisions 文件不存在 → 拒绝（scoping 未完成）', () => {
  const { taskPath, taskId } = makeTask();
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /scoping/);
});

test('主产物且 gated pending>0 → 拒绝', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /1 个 gated/);
});

test('主产物且 gated pending=0 → 放行', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, true);
});

test('integrated-design.md 非设计阶段主产物 → 放行', () => {
  const { taskPath } = makeTask();
  const r = decideWrite(path.join(taskPath, 'artifacts', 'integrated-design.md'));
  assert.strictEqual(r.allow, true);
});

// === Fix 3: C1/I1/I5 行为测试 ===

test('C1: auto-design 模式即使有 gated pending 也放行（mode-gate 豁免）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'auto-design' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, true);
});

test('I1: 非 devsphere 路径（无 state.json）→ 放行', () => {
  // 不创建任何任务工作区；直接构造一个看起来像主产物的路径
  const fakePath = path.join('/tmp', 'ds-xyz-not-exist', 'artifacts', 'business-design.md');
  const r = decideWrite(fakePath);
  assert.strictEqual(r.allow, true);
});

test('I5: strict 模式 decisions 文件损坏 → fail-closed（拒绝）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  // 覆盖为损坏 JSON
  const decisionsFile = path.join(taskPath, 'decisions', 'business-design-decisions.json');
  fs.writeFileSync(decisionsFile, '{ not json');
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /损坏/);
});

// === Fix 2: checkDecisionsResolvedFromStdin (I4 stdin) 测试 ===

test('stdin: strict 任务主产物有 gated pending → deny 对象', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  const stdin = { tool_input: { file_path: mainArtifactPath(taskPath, 'business-design') } };
  const result = checkDecisionsResolvedFromStdin(stdin);
  assert.ok(result, '应返回非 null deny 对象');
  assert.strictEqual(result.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.strictEqual(result.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(result.hookSpecificOutput.permissionDecisionReason.length > 0);
});

test('stdin: null → null（放行）', () => {
  assert.strictEqual(checkDecisionsResolvedFromStdin(null), null);
});

test('stdin: 缺 tool_input → null', () => {
  assert.strictEqual(checkDecisionsResolvedFromStdin({}), null);
});

test('stdin: tool_input 无 file_path → null', () => {
  assert.strictEqual(checkDecisionsResolvedFromStdin({ tool_input: {} }), null);
});

test('stdin: strict 任务主产物 gated pending=0（已 resolved）→ null（放行）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });
  const stdin = { tool_input: { file_path: mainArtifactPath(taskPath, 'business-design') } };
  assert.strictEqual(checkDecisionsResolvedFromStdin(stdin), null);
});

test('stdin: auto-design 任务即使 gated pending → null（mode-gate 豁免）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'auto-design' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  const stdin = { tool_input: { file_path: mainArtifactPath(taskPath, 'business-design') } };
  assert.strictEqual(checkDecisionsResolvedFromStdin(stdin), null);
});

// === Fix 2: collaborative stage-aware guard ===

test('slugToStage: business-design → businessDesign', () => {
  assert.strictEqual(slugToStage('business-design'), 'businessDesign');
  assert.strictEqual(slugToStage('implementation-design'), 'implementationDesign');
  assert.strictEqual(slugToStage('test-design'), 'testDesign');
});

test('collaborative: businessDesign 在 humanGateStages 中 + gated pending → 拒绝（门禁阶段强制）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'collaborative-design' });
  const st = readState(taskPath);
  st.humanGateStages = ['businessDesign'];
  writeState(taskPath, st);
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /1 个 gated/);
});

test('collaborative: businessDesign 不在 humanGateStages（仅 testDesign 门禁）+ gated pending → 放行（非门禁阶段豁免）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'collaborative-design' });
  const st = readState(taskPath);
  st.humanGateStages = ['testDesign'];
  writeState(taskPath, st);
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, true);
});

test('auto-design + gated pending → 放行（stage-aware：humanGated=false）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'auto-design' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, true);
});
