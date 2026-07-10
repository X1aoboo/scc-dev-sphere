'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');
const { makeTask } = require('./helpers');
const { readState } = require('../devsphere-state');
const { resolveNextAction } = require('../workflows/feature-workflow');

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

  const action = resolveNextAction(taskPath, state);

  assert.deepStrictEqual(action.kind, 'run_skill');
  assert.deepStrictEqual(action.skill, 'feature-assess');
  assert.deepStrictEqual(action.agents, []);
  assert.deepStrictEqual(action.requiredArtifacts, ['inputs/requirement.md']);
  assert.match(action.reason, /clarif/i);
});

test('set-task-status clarified persists state and unlocks feature-assess', () => {
  const { workspaceRoot, taskPath } = makeTask();

  execFileSync('node', [
    path.join(__dirname, '..', 'workflows', 'feature-workflow.js'),
    'set-task-status', workspaceRoot, 'clarified',
  ], { encoding: 'utf-8' });

  const state = readState(taskPath);
  assert.strictEqual(state.status, 'clarified');
  assert.strictEqual(resolveNextAction(taskPath, state).skill, 'feature-assess');
});
