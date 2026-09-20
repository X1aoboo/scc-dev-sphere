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
  approveCurrentDesign,
  publish,
  reopenDesign,
  readDraftRef,
  readArtifactRef,
  inspectDesign,
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
