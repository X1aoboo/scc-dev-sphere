'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');
const { makeTask } = require('./helpers');
const { readState, writeState } = require('../devsphere-state');
const { resolveNextAction } = require('../workflows/feature-workflow');
const { createClarification, recordConclusion } = require('../feature-requirement-clarification');

function completeClarification() {
  const clarification = createClarification('完成的需求');
  recordConclusion(clarification, 'requirementType', 'functional', [{ kind: 'user' }], '2026-07-11');
  for (const key of ['businessGoal', 'usersAndScenarios', 'functionalScope', 'nonGoalsAndBoundaries', 'acceptanceCriteria', 'constraintsAndRisks']) {
    recordConclusion(clarification, key, `${key} 已确认`, [{ kind: 'user' }], '2026-07-11');
  }
  return clarification;
}

test('initialized routes to feature-clarify before assessment', () => {
  const { taskPath } = makeTask();
  const action = resolveNextAction(taskPath, readState(taskPath));

  assert.deepStrictEqual(action.kind, 'run_skill');
  assert.deepStrictEqual(action.skill, 'feature-clarify');
  assert.deepStrictEqual(action.agents, []);
  assert.deepStrictEqual(action.expectedArtifacts, ['inputs/requirement.md']);
  assert.match(action.reason, /clarif/i);
});

test('clarified routes to feature-assess with the clarified requirement input', () => {
  const { taskPath } = makeTask();
  const state = readState(taskPath);
  state.status = 'clarified';
  state.clarification = completeClarification();

  const action = resolveNextAction(taskPath, state);

  assert.deepStrictEqual(action.kind, 'run_skill');
  assert.deepStrictEqual(action.skill, 'feature-assess');
  assert.deepStrictEqual(action.agents, []);
  assert.deepStrictEqual(action.requiredArtifacts, ['inputs/requirement.md']);
  assert.match(action.reason, /clarif/i);
});

test('manual or CLI clarified status spoof cannot bypass incomplete clarification', () => {
  const { workspaceRoot, taskPath } = makeTask();

  execFileSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'set-task-status', workspaceRoot, 'clarified',
  ], { encoding: 'utf-8' });

  const state = readState(taskPath);
  assert.strictEqual(state.status, 'clarified');
  assert.strictEqual(resolveNextAction(taskPath, state).skill, 'feature-clarify');
});

test('persisted complete clarification unlocks feature-assess after CLI status transition', () => {
  const { workspaceRoot, taskPath } = makeTask();
  const state = readState(taskPath);
  state.clarification = completeClarification();
  writeState(taskPath, state);

  execFileSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'set-task-status', workspaceRoot, 'clarified',
  ], { encoding: 'utf-8' });

  const reloaded = readState(taskPath);
  assert.strictEqual(reloaded.status, 'clarified');
  assert.strictEqual(resolveNextAction(taskPath, reloaded).skill, 'feature-assess');
});

test('set-task-status preserves the full assessed CLI form', () => {
  const { workspaceRoot, taskPath } = makeTask();

  execFileSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'set-task-status', workspaceRoot, 'assessed', 'collaborative-design', 'businessDesign,testDesign', 'true',
  ], { encoding: 'utf-8' });

  const state = readState(taskPath);
  assert.strictEqual(state.status, 'assessed');
  assert.strictEqual(state.workflowMode, 'collaborative-design');
  assert.deepStrictEqual(state.humanGateStages, ['businessDesign', 'testDesign']);
  assert.strictEqual(state.ciCdRisk, true);
});
