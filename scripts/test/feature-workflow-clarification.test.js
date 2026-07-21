'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');
const { makeTask } = require('./helpers');
const { readState, writeState } = require('../devsphere-state');
const { resolveNextAction } = require('../workflows/feature-workflow');

test('initialized routes to feature-clarify before design', () => {
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

test('clarified routes directly to feature-design', () => {
  const { taskPath } = makeTask();
  const state = readState(taskPath);
  state.status = 'clarified';

  const action = resolveNextAction(taskPath, state);

  assert.deepStrictEqual(action.kind, 'run_skill');
  assert.deepStrictEqual(action.skill, 'feature-design');
  assert.deepStrictEqual(action.agents, []);
  assert.deepStrictEqual(action.requiredArtifacts, ['inputs/requirement.md']);
  assert.deepStrictEqual(action.args, { designType: 'businessDesign' });
  assert.match(action.reason, /design/i);
});

test('set-task-status starts design without legacy mode fields', () => {
  const { workspaceRoot, taskPath } = makeTask();
  const initial = readState(taskPath);
  initial.status = 'clarified';
  writeState(taskPath, initial);

  const result = spawnSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'set-task-status', workspaceRoot, 'designing',
  ], { encoding: 'utf-8' });
  assert.strictEqual(result.status, 0, result.stderr);

  const state = readState(taskPath);
  assert.strictEqual(state.status, 'designing');
  assert.strictEqual(state.workflowMode, undefined);
  assert.strictEqual(state.humanGateStages, undefined);
  assert.strictEqual(state.ciCdRisk, undefined);
});

test('set-task-status rejects legacy assessment arguments', () => {
  const { workspaceRoot, taskPath } = makeTask();
  const initial = readState(taskPath);
  initial.status = 'clarified';
  writeState(taskPath, initial);

  const result = spawnSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'set-task-status', workspaceRoot, 'designing', 'auto-design',
  ], { encoding: 'utf-8' });
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /usage|arguments/i);
});
