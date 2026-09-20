'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTask } = require('./helpers');
const { businessDraft, installBusinessAssets } = require('./fixtures/business-design');
const {
  initDesign,
  draftPath,
  draftAssetsPath,
  artifactPath,
  artifactAssetsPath,
  lintDraft,
  reviewContext,
  recordReview,
  recordManualReview,
  validateReview,
  approveCurrentDesign,
  publish,
  reopenDesign,
  readDraftRef,
  readArtifactRef,
  inspectDesign,
  designReady,
  syncDesignState,
} = require('../devsphere-design');
const { HELP, main } = require('../devsphere-cli');
const { validateDesignEntry } = require('../workflows/feature-workflow');

const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function capture(argv) {
  let stdout = '';
  let stderr = '';
  const exitCode = main(argv, {
    cwd: root,
    env: {},
    stdin: undefined,
    stdout: { write: value => { stdout += value; } },
    stderr: { write: value => { stderr += value; } },
  });
  return { exitCode, stdout, stderr };
}

const TASK_ID = 'FEAT-MANUAL-001';

// Mirrors the publish chain from feature-design-realistic-dry-run.test.js:
// draft -> lint pass -> AI review pass -> human approval -> published baseline.
function publishBaseline(taskPath, designType = 'businessDesign') {
  initDesign(taskPath, designType);
  fs.writeFileSync(draftPath(taskPath, designType), businessDraft(TASK_ID), 'utf8');
  installBusinessAssets(taskPath);
  assert.strictEqual(lintDraft(taskPath, designType).status, 'pass');
  const context = reviewContext(taskPath, designType);
  recordReview(taskPath, designType, {
    reviewKey: context.reviewKey,
    draftHash: context.draft.draftHash,
    policyHash: context.policyHash,
    baseReportHash: context.report.hash,
    reportAppend: '# Design Review Baseline\n',
    checklists: [...context.requiredChecklists, ...context.conditionalChecklists].map(({ checklistId }) => ({
      checklistId, result: 'pass', summary: '通过', findings: [],
    })),
    notApplicable: [],
  });
  approveCurrentDesign(taskPath, designType, { approvedBy: 'human', acceptedRisks: [] });
  publish(taskPath, designType);
}

function prepareDesigningTask() {
  const created = makeTask({ taskId: TASK_ID });
  const statePath = path.join(created.taskPath, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.status = 'designing';
  state.requiredDesignTypes = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  fs.writeFileSync(path.join(created.taskPath, 'inputs', 'proposal.md'), '# Proposal\n\nDetailed requirement.', 'utf8');
  fs.writeFileSync(path.join(created.taskPath, 'inputs', 'requirement-clarification.md'), '# Clarification\n\nApproved clarification.', 'utf8');
  return created;
}

test('reopen protect preserves the hand-edited draft and bumps only the version', () => {
  const { taskPath } = prepareDesigningTask();
  publishBaseline(taskPath);

  // Simulate the user hand-editing the draft after publish.
  const edited = businessDraft(TASK_ID).replace('# Business Design', '# Business Design\n\n人工修改：新增审批链路降级策略。');
  fs.writeFileSync(draftPath(taskPath, 'businessDesign'), edited, 'utf8');
  fs.writeFileSync(path.join(draftAssetsPath(taskPath, 'businessDesign'), 'ucd', 'manual-note.svg'), '<svg>edited</svg>', 'utf8');

  const result = reopenDesign(taskPath, 'businessDesign', { mode: 'protect' });
  assert.strictEqual(result.mode, 'protect');

  const draft = fs.readFileSync(draftPath(taskPath, 'businessDesign'), 'utf8');
  assert.match(draft, /人工修改：新增审批链路降级策略。/);
  assert.match(draft, /^version: "2\.0\.0"$/m);
  assert.doesNotMatch(draft, /"1\.0\.0"/);

  // Draft assets untouched by protect mode.
  assert.strictEqual(
    fs.readFileSync(path.join(draftAssetsPath(taskPath, 'businessDesign'), 'ucd', 'manual-note.svg'), 'utf8'),
    '<svg>edited</svg>',
  );

  // History snapshot holds the pre-change baseline (version 1.0.0).
  const history = fs.readFileSync(path.join(
    taskPath, 'artifacts', 'history', 'business-design', '1.0.0', 'design.md',
  ), 'utf8');
  assert.match(history, /^version: "1\.0\.0"$/m);
  assert.doesNotMatch(history, /人工修改/);

  // Baseline, approval, review, lint state are all cleared.
  assert.strictEqual(fs.existsSync(artifactPath(taskPath, 'businessDesign')), false);
  assert.strictEqual(fs.existsSync(artifactAssetsPath(taskPath, 'businessDesign')), false);
  assert.strictEqual(inspectDesign(taskPath, 'businessDesign').recovery, 'resume_from_draft');
});

test('reopen standard stays byte-identical to legacy behavior', () => {
  const { taskPath } = prepareDesigningTask();
  publishBaseline(taskPath);
  fs.writeFileSync(draftPath(taskPath, 'businessDesign'), '# user edits that must be discarded', 'utf8');
  const result = reopenDesign(taskPath, 'businessDesign');
  assert.strictEqual(result.mode, 'standard');
  const draft = fs.readFileSync(draftPath(taskPath, 'businessDesign'), 'utf8');
  assert.match(draft, /^version: "2\.0\.0"$/m);
  assert.doesNotMatch(draft, /user edits that must be discarded/);
});

test('reopen protect rejects when no draft exists', () => {
  const { taskPath } = prepareDesigningTask();
  publishBaseline(taskPath);
  fs.rmSync(draftPath(taskPath, 'businessDesign'));
  assert.throws(
    () => reopenDesign(taskPath, 'businessDesign', { mode: 'protect' }),
    /protect mode requires an existing Draft/,
  );
  assert.ok(fs.existsSync(artifactPath(taskPath, 'businessDesign')), 'baseline untouched');
});

test('reopen protect rejects when the draft version frontmatter is broken', () => {
  const { taskPath } = prepareDesigningTask();
  publishBaseline(taskPath);
  const broken = businessDraft(TASK_ID).replace(/^version: "1\.0\.0"$/m, 'version: "abc"');
  fs.writeFileSync(draftPath(taskPath, 'businessDesign'), broken, 'utf8');
  assert.throws(
    () => reopenDesign(taskPath, 'businessDesign', { mode: 'protect' }),
    /no semantic version/i,
  );
  assert.ok(fs.existsSync(artifactPath(taskPath, 'businessDesign')), 'baseline untouched');
});

test('reopen rejects invalid mode without side effects', () => {
  const { taskPath } = prepareDesigningTask();
  publishBaseline(taskPath);
  assert.throws(() => reopenDesign(taskPath, 'businessDesign', { mode: 'bogus' }), /Invalid reopen mode/);
  assert.ok(fs.existsSync(artifactPath(taskPath, 'businessDesign')));
  assert.throws(() => reopenDesign(taskPath, 'businessDesign', { mode: '../escape' }), /Invalid reopen mode/);
});

test('reopen CLI accepts --mode and rejects unknown values', () => {
  const { taskPath } = prepareDesigningTask();
  publishBaseline(taskPath);
  const out = capture([
    'design', 'reopen', '--task-path', taskPath,
    '--design-type', 'businessDesign', '--mode', 'bogus',
  ]);
  assert.strictEqual(out.exitCode, 1);
  assert.match(out.stderr, /Invalid reopen mode/);
  assert.ok(fs.existsSync(artifactPath(taskPath, 'businessDesign')));
});

// Sets up a published baseline, reopens it in protect mode, then applies the
// caller's edit. Does NOT run lint — each test decides whether lint has run,
// because recordManualReview's precondition order is draft → lint → existing
// review → reason.
function manualChangeScenario(applyEdit = () => {}) {
  const created = prepareDesigningTask();
  publishBaseline(created.taskPath);
  reopenDesign(created.taskPath, 'businessDesign', { mode: 'protect' });
  applyEdit(created.taskPath);
  return created;
}

function passLint(taskPath) {
  assert.strictEqual(lintDraft(taskPath, 'businessDesign').status, 'pass');
}

test('record-manual-review writes a review state that passes the whole existing chain', () => {
  const { taskPath } = manualChangeScenario(taskPath => {
    // Minimal inline human edit: append a plain paragraph inside the last
    // existing section (no new heading — keeps lint structure intact).
    const draft = fs.readFileSync(draftPath(taskPath, 'businessDesign'), 'utf8');
    fs.writeFileSync(draftPath(taskPath, 'businessDesign'), `${draft}\n人工补充：审批服务不可用时降级为逐级人工审批。\n`, 'utf8');
  });
  passLint(taskPath);

  const summary = recordManualReview(taskPath, 'businessDesign', { reason: '补充审批降级策略' });
  assert.strictEqual(summary.schemaVersion, 3);
  assert.strictEqual(summary.status, 'pass');
  assert.strictEqual(summary.reviewer, 'human');
  assert.strictEqual(summary.manual, true);
  assert.strictEqual(summary.reason, '补充审批降级策略');
  assert.deepStrictEqual(summary.findingSummary, { blocking: 0, advisory: 0, risk: 0, total: 0 });
  assert.ok(fs.existsSync(path.join(taskPath, 'work', 'business-design', 'review.md')));

  // Existing gates pass unchanged.
  assert.strictEqual(validateReview(taskPath, 'businessDesign').valid, true);
  approveCurrentDesign(taskPath, 'businessDesign', {
    approvedBy: 'human',
    summary: 'manual-design-change: 补充审批降级策略',
    acceptedRisks: [],
  });
  publish(taskPath, 'businessDesign');
  syncDesignState(taskPath);

  // New baseline is version 2.0.0 and approval binds it.
  const artifact = readArtifactRef(taskPath, 'businessDesign');
  assert.strictEqual(artifact.version, '2.0.0');
  assert.strictEqual(designReady(taskPath).valid, false); // other required designs still missing
  assert.strictEqual(
    designReady(taskPath).issues.some(issue => issue.includes('businessDesign')),
    false,
    'businessDesign itself must not be the failing issue',
  );

  // Downstream entry gate passes for the manually changed upstream.
  assert.strictEqual(validateDesignEntry(taskPath, 'solutionDesign').valid, true);
});

test('record-manual-review rejects missing reason with no writes', () => {
  const { taskPath } = manualChangeScenario();
  passLint(taskPath); // reason is checked after lint in the precondition order
  assert.throws(() => recordManualReview(taskPath, 'businessDesign', {}), /non-empty reason/);
  assert.throws(() => recordManualReview(taskPath, 'businessDesign', { reason: '   ' }), /non-empty reason/);
  assert.strictEqual(fs.existsSync(path.join(taskPath, 'work', 'business-design', 'review.json')), false);
  assert.strictEqual(fs.existsSync(path.join(taskPath, 'work', 'business-design', 'review.md')), false);
});

test('record-manual-review rejects when lint has not run for the current draft', () => {
  const { taskPath } = manualChangeScenario(taskPath => {
    // Edit WITHOUT running lint: no lint state binds the new draft.
    const draft = fs.readFileSync(draftPath(taskPath, 'businessDesign'), 'utf8');
    fs.writeFileSync(draftPath(taskPath, 'businessDesign'), `${draft}\n人工补充：未经 lint 的新内容。\n`, 'utf8');
  });
  assert.throws(() => recordManualReview(taskPath, 'businessDesign', { reason: 'x' }), /lint_not_ready/);
  assert.strictEqual(fs.existsSync(path.join(taskPath, 'work', 'business-design', 'review.json')), false);
});

test('record-manual-review rejects when a review state already exists', () => {
  const { taskPath } = manualChangeScenario();
  passLint(taskPath);
  recordManualReview(taskPath, 'businessDesign', { reason: 'first' });
  assert.throws(
    () => recordManualReview(taskPath, 'businessDesign', { reason: 'second' }),
    /Review state already exists; reopen the design first/,
  );
});

test('record-manual-review CLI works end to end', () => {
  const { taskPath } = manualChangeScenario();
  passLint(taskPath);
  const input = path.join(taskPath, 'manual-input.json');
  fs.writeFileSync(input, JSON.stringify({ reason: 'CLI 变更原因' }), 'utf8');
  const out = capture([
    'design', 'record-manual-review', '--task-path', taskPath,
    '--design-type', 'businessDesign', '--input-file', input,
  ]);
  assert.strictEqual(out.exitCode, 0, out.stderr);
  const summary = JSON.parse(out.stdout);
  assert.strictEqual(summary.manual, true);
  assert.strictEqual(validateReview(taskPath, 'businessDesign').valid, true);
});

test('HELP exposes record-manual-review', () => {
  assert.match(HELP, /record-manual-review/);
});
