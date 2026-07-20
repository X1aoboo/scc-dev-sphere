'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');
const { makeTask } = require('./helpers');
const { readState, writeState } = require('../devsphere-state');
const { resolveNextAction } = require('../workflows/feature-workflow');

test('initialized routes to feature-clarify before assessment', () => {
  const { taskPath } = makeTask();
  const action = resolveNextAction(taskPath, readState(taskPath));

  assert.deepStrictEqual(action.kind, 'run_skill');
  assert.deepStrictEqual(action.skill, 'feature-clarify');
  assert.deepStrictEqual(action.agents, []);
  assert.deepStrictEqual(action.requiredArtifacts, ['inputs/proposal.md']);
  assert.deepStrictEqual(action.expectedArtifacts, ['inputs/requirement.md']);
  assert.deepStrictEqual(action.args, {
    proposalPath: 'inputs/proposal.md',
    draftPath: 'work/requirement-draft.md',
    baselinePath: 'inputs/requirement.md',
  });
  assert.match(action.reason, /clarif/i);
});

test('clarified routes to feature-assess on status alone', () => {
  // Completeness is judged inside feature-clarify; routing here is status-only.
  const { taskPath } = makeTask();
  const state = readState(taskPath);
  state.status = 'clarified';

  const action = resolveNextAction(taskPath, state);

  assert.deepStrictEqual(action.kind, 'run_skill');
  assert.deepStrictEqual(action.skill, 'feature-assess');
  assert.deepStrictEqual(action.agents, []);
  assert.deepStrictEqual(action.requiredArtifacts, ['inputs/requirement.md']);
  assert.match(action.reason, /clarif/i);
});

test('set-task-status preserves the full assessed CLI form', () => {
  const { workspaceRoot, taskPath } = makeTask();
  const initial = readState(taskPath);
  initial.status = 'clarified';
  writeState(taskPath, initial);

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
