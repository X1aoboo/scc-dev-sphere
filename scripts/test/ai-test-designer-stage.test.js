'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  projectConfigPath,
  readEffectiveTestDesignConfig,
} = require('../devsphere-test-design-config');
const { createFeatureTask } = require('../devsphere-workspace');
const { readState, writeState } = require('../devsphere-state');
const {
  DESIGN_TYPES,
  artifactPath,
  approvalPath,
  sha256File,
  syncDesignState,
} = require('../devsphere-design');
const {
  completeExternalTestDesign,
  resolveNextAction,
} = require('../workflows/feature-workflow');
const { approveDesign, validateDesignReady } = require('../devsphere-approval');
const { TRANSITIONS, checkApproveEntry } = require('../devsphere-guard');

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ds-test-design-'));
}

function writeProjectConfig(workspaceRoot, config) {
  const file = projectConfigPath(workspaceRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof config === 'string' ? config : JSON.stringify(config), 'utf8');
  return file;
}

function createTask(workspaceRoot, taskId = 'FEAT-EXT-001') {
  const taskPath = createFeatureTask(workspaceRoot, taskId);
  return { taskPath, state: readState(taskPath) };
}

function baseline(taskPath, designType) {
  const state = readState(taskPath);
  const definition = DESIGN_TYPES[designType];
  const file = artifactPath(taskPath, designType);
  fs.writeFileSync(
    file,
    `---\nartifactId: ${definition.artifactPrefix}-${state.taskId}\nversion: "1.0.0"\n---\n\n# ${definition.slug}\n`,
    'utf8',
  );
  fs.writeFileSync(approvalPath(taskPath, designType), JSON.stringify({
    designType,
    draftHash: sha256File(file),
    approvedBy: 'human',
    acceptedRisks: [],
  }), 'utf8');
}

function completeExternalInputs(taskPath) {
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# Requirement\n', 'utf8');
  for (const designType of ['businessDesign', 'solutionDesign', 'implementationDesign']) {
    baseline(taskPath, designType);
  }
}

test('plugin default is external and project config is a complete override', () => {
  const defaultWorkspace = workspace();
  assert.deepStrictEqual(readEffectiveTestDesignConfig(defaultWorkspace), {
    mode: 'external',
    externalSkillId: 'ai-test-designer',
  });

  const builtinWorkspace = workspace();
  writeProjectConfig(builtinWorkspace, { mode: 'builtin' });
  assert.deepStrictEqual(readEffectiveTestDesignConfig(builtinWorkspace), { mode: 'builtin' });

  const externalWorkspace = workspace();
  writeProjectConfig(externalWorkspace, { mode: 'external', externalSkillId: 'team-test-designer' });
  assert.deepStrictEqual(readEffectiveTestDesignConfig(externalWorkspace), {
    mode: 'external',
    externalSkillId: 'team-test-designer',
  });
});

test('invalid project config fails instead of falling back to builtin', () => {
  const cases = [
    ['invalid JSON', '{'],
    ['invalid mode', { mode: 'team', externalSkillId: 'ai-test-designer' }],
    ['missing external skill', { mode: 'external' }],
    ['builtin with external skill', { mode: 'builtin', externalSkillId: 'ai-test-designer' }],
    ['unknown field', { mode: 'builtin', extra: true }],
  ];
  for (const [name, config] of cases) {
    const workspaceRoot = workspace();
    writeProjectConfig(workspaceRoot, config);
    assert.throws(() => readEffectiveTestDesignConfig(workspaceRoot), undefined, name);
    assert.throws(() => createFeatureTask(workspaceRoot, `FEAT-${name.replace(/\s/g, '-')}`), undefined, name);
  }
});

test('new tasks freeze mutually exclusive external or builtin test design facts', () => {
  const externalWorkspace = workspace();
  const external = createTask(externalWorkspace);
  assert.deepStrictEqual(external.state.requiredDesignTypes, [
    'businessDesign',
    'solutionDesign',
    'implementationDesign',
  ]);
  assert.deepStrictEqual(external.state.externalTestDesign, { skillId: 'ai-test-designer' });
  assert.strictEqual(fs.statSync(path.join(external.taskPath, 'artifacts', 'test-design')).isDirectory(), true);

  writeProjectConfig(externalWorkspace, { mode: 'builtin' });
  assert.deepStrictEqual(readState(external.taskPath).externalTestDesign, { skillId: 'ai-test-designer' });
  const laterBuiltin = createTask(externalWorkspace, 'FEAT-BUILTIN-LATER');
  assert.strictEqual(laterBuiltin.state.externalTestDesign, undefined);
  assert.ok(laterBuiltin.state.requiredDesignTypes.includes('testDesign'));

  const builtinWorkspace = workspace();
  writeProjectConfig(builtinWorkspace, { mode: 'builtin' });
  const builtin = createTask(builtinWorkspace, 'FEAT-BUILTIN-001');
  assert.deepStrictEqual(builtin.state.requiredDesignTypes, [
    'businessDesign',
    'solutionDesign',
    'implementationDesign',
    'testDesign',
  ]);
  assert.strictEqual(builtin.state.externalTestDesign, undefined);
  assert.strictEqual(fs.existsSync(path.join(builtin.taskPath, 'artifacts', 'test-design')), false);
});

test('resolver synchronizes completed design facts and keeps external test design separate', () => {
  const workspaceRoot = workspace();
  const { taskPath } = createTask(workspaceRoot);
  const state = readState(taskPath);
  state.status = 'designing';
  writeState(taskPath, state);
  completeExternalInputs(taskPath);

  const syncAction = resolveNextAction(taskPath, readState(taskPath));
  assert.strictEqual(syncAction.kind, 'sync_design_status');
  assert.strictEqual(syncDesignState(taskPath).status, 'design_ready');

  const externalAction = resolveNextAction(taskPath, readState(taskPath));
  assert.strictEqual(externalAction.kind, 'run_skill');
  assert.strictEqual(externalAction.stage, 'external-test-design');
  assert.strictEqual(externalAction.skill, 'ai-test-designer');
  assert.deepStrictEqual(externalAction.agents, []);
  assert.deepStrictEqual(externalAction.expectedArtifacts, []);
  assert.deepStrictEqual(externalAction.args, {
    taskPath,
    outputDir: 'artifacts/test-design/',
  });
  assert.deepStrictEqual(externalAction.requiredArtifacts, [
    'inputs/requirement.md',
    'artifacts/business-design.md',
    'artifacts/solution-design.md',
    'artifacts/implementation-design.md',
  ]);
});

test('external completion records the minimal fact and advances to approval routing', () => {
  const workspaceRoot = workspace();
  const { taskPath } = createTask(workspaceRoot);
  const state = readState(taskPath);
  state.status = 'designing';
  writeState(taskPath, state);
  completeExternalInputs(taskPath);
  syncDesignState(taskPath);

  assert.deepStrictEqual(checkApproveEntry(workspaceRoot).allowed, false);
  const result = completeExternalTestDesign(workspaceRoot);
  assert.strictEqual(result.status, 'external_test_design_ready');
  assert.strictEqual(result.externalTestDesign.skillId, 'ai-test-designer');
  assert.match(result.externalTestDesign.completedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.strictEqual(resolveNextAction(taskPath, readState(taskPath)).skill, 'feature-approve');
  assert.deepStrictEqual(checkApproveEntry(workspaceRoot), { allowed: true, reason: 'OK' });

  const approval = approveDesign(taskPath, { approvedBy: 'human', risks: [], limitations: [] });
  assert.deepStrictEqual(approval.externalTestDesign, result.externalTestDesign);
  assert.deepStrictEqual(approval.artifacts.map(item => item.designType), [
    'businessDesign',
    'solutionDesign',
    'implementationDesign',
  ]);
  assert.ok(!approval.artifacts.some(item => item.designType === 'testDesign'));
});

test('external completion rejects builtin, wrong status, invalid design facts, and missing inputs', () => {
  const builtinWorkspace = workspace();
  writeProjectConfig(builtinWorkspace, { mode: 'builtin' });
  const builtin = createTask(builtinWorkspace, 'FEAT-BUILTIN-002');
  const builtinState = readState(builtin.taskPath);
  builtinState.status = 'design_ready';
  writeState(builtin.taskPath, builtinState);
  assert.throws(() => completeExternalTestDesign(builtinWorkspace), /not enabled/i);

  const externalWorkspace = workspace();
  const { taskPath } = createTask(externalWorkspace, 'FEAT-EXT-002');
  let state = readState(taskPath);
  state.status = 'design_ready';
  writeState(taskPath, state);
  assert.throws(() => completeExternalTestDesign(externalWorkspace), /Baseline/i);

  completeExternalInputs(taskPath);
  fs.rmSync(path.join(taskPath, 'inputs', 'requirement.md'));
  assert.throws(() => completeExternalTestDesign(externalWorkspace), /Missing external test-design inputs/i);

  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# Requirement\n', 'utf8');
  state = readState(taskPath);
  state.requiredDesignTypes.push('testDesign');
  writeState(taskPath, state);
  assert.throws(() => completeExternalTestDesign(externalWorkspace), /requires exactly/i);
});

test('design invalidation clears external completion and returns to designing', () => {
  const workspaceRoot = workspace();
  const { taskPath } = createTask(workspaceRoot, 'FEAT-EXT-003');
  const state = readState(taskPath);
  state.status = 'designing';
  writeState(taskPath, state);
  completeExternalInputs(taskPath);
  syncDesignState(taskPath);
  completeExternalTestDesign(workspaceRoot);

  fs.appendFileSync(artifactPath(taskPath, 'implementationDesign'), '\nchanged\n', 'utf8');
  const synced = syncDesignState(taskPath);
  assert.strictEqual(synced.status, 'designing');
  assert.strictEqual(readState(taskPath).externalTestDesign.completedAt, undefined);
});

test('transition table exposes the external ready state without an in-progress state', () => {
  assert.ok(TRANSITIONS.design_ready.includes('external_test_design_ready'));
  assert.ok(TRANSITIONS.external_test_design_ready.includes('approved_for_implementation'));
  assert.ok(TRANSITIONS.external_test_design_ready.includes('designing'));
  assert.strictEqual(TRANSITIONS.external_test_designing, undefined);
});
