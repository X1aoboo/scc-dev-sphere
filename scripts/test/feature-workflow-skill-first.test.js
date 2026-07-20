'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTask } = require('./helpers');
const { resolveNextAction } = require('../workflows/feature-workflow');
const {
  DESIGN_TYPES,
  artifactPath,
  approvalPath,
  sha256File,
  designReady,
  syncDesignState,
} = require('../devsphere-design');
const { approveDesign, validateDesignReady } = require('../devsphere-approval');

const workflowScript = path.join(__dirname, '..', 'workflows', 'feature-workflow.js');

function configure(taskPath, requiredDesignTypes, status = 'designing') {
  const statePath = path.join(taskPath, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.requiredDesignTypes = requiredDesignTypes;
  state.status = status;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function baseline(taskPath, designType) {
  const state = JSON.parse(fs.readFileSync(path.join(taskPath, 'state.json'), 'utf8'));
  const definition = DESIGN_TYPES[designType];
  fs.writeFileSync(
    artifactPath(taskPath, designType),
    `---\nartifactId: ${definition.artifactPrefix}-${state.taskId}\nversion: "1.0.0"\n---\n\n# ${definition.slug}\n`,
    'utf8',
  );
  fs.writeFileSync(approvalPath(taskPath, designType), JSON.stringify({
    designType,
    draftHash: sha256File(artifactPath(taskPath, designType)),
    approvedBy: 'human',
    acceptedRisks: [],
  }), 'utf8');
}

test('top-level workflow routes to the generic feature-design skill without a design cursor', () => {
  const { taskPath } = makeTask();
  const state = { taskId: 'X', taskType: 'feature', status: 'designing', requiredDesignTypes: ['testDesign'] };
  const action = resolveNextAction(taskPath, state);
  assert.strictEqual(action.skill, 'feature-design');
  assert.strictEqual(action.stage, 'design');
  assert.strictEqual(action.args.designType, undefined);
  assert.ok(!JSON.stringify(action).includes('businessDesign'));
});

test('required design types are an unordered outer policy set', () => {
  const { taskPath } = makeTask();
  configure(taskPath, ['testDesign', 'businessDesign']);
  baseline(taskPath, 'testDesign');
  assert.strictEqual(designReady(taskPath).valid, false);
  assert.strictEqual(syncDesignState(taskPath).status, 'designing');

  baseline(taskPath, 'businessDesign');
  assert.strictEqual(designReady(taskPath).valid, true);
  assert.strictEqual(syncDesignState(taskPath).status, 'design_ready');
});

test('generic design_ready transition uses the persisted required design set', () => {
  const { workspaceRoot, taskPath } = makeTask();
  configure(taskPath, ['solutionDesign']);

  let result = spawnSync(process.execPath, [workflowScript, 'set-task-status', workspaceRoot, 'design_ready'], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /Baseline/i);

  baseline(taskPath, 'solutionDesign');
  result = spawnSync(process.execPath, [workflowScript, 'set-task-status', workspaceRoot, 'design_ready'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
});

test('sync-design-status is idempotent and derives status from workspace facts', () => {
  const { workspaceRoot, taskPath } = makeTask();
  configure(taskPath, ['implementationDesign'], 'assessed');
  let result = spawnSync(process.execPath, [workflowScript, 'sync-design-status', workspaceRoot], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(JSON.parse(result.stdout).status, 'designing');

  baseline(taskPath, 'implementationDesign');
  result = spawnSync(process.execPath, [workflowScript, 'sync-design-status', workspaceRoot], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(JSON.parse(result.stdout).status, 'design_ready');
});

test('generic status updates cannot bypass overall human approval', () => {
  const { workspaceRoot, taskPath } = makeTask();
  configure(taskPath, ['businessDesign'], 'design_ready');
  const result = spawnSync(
    process.execPath,
    [workflowScript, 'set-task-status', workspaceRoot, 'approved_for_implementation'],
    { encoding: 'utf8' },
  );
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /overall approval|approve-design/i);
});

test('overall readiness and approval bind only the current required baseline set', () => {
  const { taskPath } = makeTask();
  configure(taskPath, ['testDesign']);
  baseline(taskPath, 'testDesign');
  syncDesignState(taskPath);

  const ready = validateDesignReady(taskPath);
  assert.strictEqual(ready.valid, true);
  assert.deepStrictEqual(ready.requiredDesignTypes, ['testDesign']);

  const approval = approveDesign(taskPath, { approvedBy: 'human', risks: [], limitations: [] });
  assert.strictEqual(approval.artifacts.length, 1);
  assert.strictEqual(approval.artifacts[0].designType, 'testDesign');
  assert.strictEqual(approval.crossStageReviewHash, undefined);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(taskPath, 'state.json'), 'utf8')).status, 'approved_for_implementation');
});

test('feature-approve action lists the persisted required artifacts without cross-stage output', () => {
  const { taskPath } = makeTask();
  const state = {
    taskId: 'X',
    taskType: 'feature',
    status: 'design_ready',
    requiredDesignTypes: ['implementationDesign', 'businessDesign'],
  };
  const action = resolveNextAction(taskPath, state);
  assert.deepStrictEqual(action.requiredArtifacts, [
    'artifacts/implementation-design.md',
    'artifacts/business-design.md',
  ]);
  assert.ok(!JSON.stringify(action).includes('cross-stage'));
});
