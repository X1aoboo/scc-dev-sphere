'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTask } = require('./helpers');
const {
  assetsPath: businessAssetsFixturePath,
  businessDraft,
  installBusinessAssets,
} = require('./fixtures/business-design');
const {
  implementationDraft,
  installImplementationAssets,
} = require('./fixtures/implementation-design');
const {
  assetsPath: solutionAssetsFixturePath,
  installSolutionAssets,
  solutionDraft,
} = require('./fixtures/solution-design');
const { validateDesignEntry } = require('../workflows/feature-workflow');
const { checkDesignReviewerStop } = require('../devsphere-guard');
const {
  DESIGN_TYPES,
  initDesign,
  inspectWorkspace,
  inspectDesign,
  lintDraft,
  reviewContext,
  recordReview,
  validateReview,
  refreshFormattingReview,
  approveCurrentDesign,
  publish,
  reopenDesign,
  designReady,
  syncDesignState,
  draftPath,
  draftAssetsPath,
  artifactPath,
  artifactAssetsPath,
  reviewSummaryPath,
  reviewReportPath,
  lintStatusPath,
  loadReviewPolicy,
  readArtifactRef,
  readDraftRef,
  sha256File,
} = require('../devsphere-design');

const VALID_DRAFT = businessDraft('FEAT-TEST-001');
const VALID_SOLUTION_DRAFT = solutionDraft();

function setRequired(taskPath, designTypes) {
  const statePath = path.join(taskPath, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.requiredDesignTypes = designTypes;
  state.status = 'designing';
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function writeDraft(taskPath, designType, content = VALID_DRAFT) {
  initDesign(taskPath, designType);
  fs.writeFileSync(draftPath(taskPath, designType), content, 'utf8');
  if (designType === 'businessDesign') installBusinessAssets(taskPath);
  if (designType === 'implementationDesign') installImplementationAssets(taskPath);
}

function passingSummary(taskPath, designType) {
  const context = reviewContext(taskPath, designType);
  return {
    reviewKey: context.reviewKey,
    draftHash: context.draft.draftHash,
    policyHash: context.policyHash,
    baseReportHash: context.report.hash,
    reportAppend: context.reviewMode === 'initial-full'
      ? `# Design Review Baseline\n\n- Design type: ${designType}\n`
      : `\n\n## Incremental Review\n\n- Design type: ${designType}\n`,
    checklists: context.requiredChecklists.map(({ checklistId }) => ({
      checklistId,
      result: 'pass',
      summary: '通过',
      findings: [],
    })),
    notApplicable: context.conditionalChecklists.map(({ checklistId }) => ({ checklistId, reason: '测试场景不适用' })),
  };
}

function passingSolutionSummary(taskPath) {
  return passingSummary(taskPath, 'solutionDesign');
}

function completeBusiness(taskPath) {
  writeDraft(taskPath, 'businessDesign');
  assert.strictEqual(lintDraft(taskPath, 'businessDesign').status, 'pass');
  assert.strictEqual(recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign')).status, 'pass');
  approveCurrentDesign(taskPath, 'businessDesign', { approvedBy: 'human', acceptedRisks: [] });
  return publish(taskPath, 'businessDesign');
}

test('workspace stores required design types but no internal design cursor', () => {
  const { taskPath } = makeTask();
  const state = JSON.parse(fs.readFileSync(path.join(taskPath, 'state.json'), 'utf8'));
  assert.deepStrictEqual(state.requiredDesignTypes, ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign']);
  assert.strictEqual(state.workflowMode, undefined);
  assert.strictEqual(state.humanGateStages, undefined);
  assert.strictEqual(state.ciCdRisk, undefined);
  assert.strictEqual(state.currentDesignType, undefined);
  assert.strictEqual(state.stages, undefined);
  assert.strictEqual(fs.existsSync(path.join(taskPath, 'quality-gates')), false);
  assert.strictEqual(fs.existsSync(path.join(taskPath, 'reviews')), false);
});

test('workspace inference can recover unfinished work without persisting a design cursor', () => {
  const { taskPath } = makeTask();
  assert.strictEqual(inspectWorkspace(taskPath).recovery, 'needs_design_selection');

  initDesign(taskPath, 'testDesign');
  const inferred = inspectWorkspace(taskPath);
  assert.strictEqual(inferred.recovery, 'design_inferred');
  assert.strictEqual(inferred.designType, 'testDesign');
});

test('formal design entry requires Requirement then upstream Design Baselines', () => {
  const { taskPath } = makeTask();
  const statePath = path.join(taskPath, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.status = 'designing';
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');

  assert.throws(() => validateDesignEntry(taskPath, 'businessDesign'), /Requirement Baseline/i);
  fs.writeFileSync(path.join(taskPath, 'inputs', 'proposal.md'), '# Proposal\n\nDetailed requirement.', 'utf8');
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement-clarification.md'), '# Clarification\n\nApproved clarification.', 'utf8');
  assert.strictEqual(validateDesignEntry(taskPath, 'businessDesign').valid, true);
  assert.throws(() => validateDesignEntry(taskPath, 'solutionDesign'), /business-design Baseline/i);

  completeBusiness(taskPath);
  assert.strictEqual(validateDesignEntry(taskPath, 'solutionDesign').valid, true);
});

test('multiple unfinished activities or conflicting persisted facts require user confirmation', () => {
  const { taskPath } = makeTask();
  initDesign(taskPath, 'solutionDesign');
  initDesign(taskPath, 'testDesign');
  assert.strictEqual(inspectWorkspace(taskPath).recovery, 'needs_user_confirmation');

  const other = makeTask().taskPath;
  writeDraft(other, 'businessDesign');
  fs.writeFileSync(artifactPath(other, 'businessDesign'), VALID_DRAFT.replace('1.0.0', '0.9.0'), 'utf8');
  assert.strictEqual(inspectDesign(other, 'businessDesign').recovery, 'needs_user_confirmation');
});

test('business lint enforces the numbered structural contract and feature-point mappings without semantic judgement', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  const pass = lintDraft(taskPath, 'businessDesign');
  assert.strictEqual(pass.status, 'pass');
  assert.strictEqual(pass.checks.filter(check => check.code.startsWith('core section:')).length, 14);
  assert.strictEqual(
    pass.checks.filter(check => check.code.startsWith('required business feature point subsection:')).length,
    28,
  );
  assert.strictEqual(pass.checks.find(check => check.code === 'business feature point mapping coverage').result, 'pass');
  assert.ok(pass.checks.every(check => check.kind !== 'semantic'));
  assert.strictEqual(fs.existsSync(path.join(taskPath, 'quality-gates')), false);

  const cases = [
    {
      content: VALID_DRAFT.replace('#### 6.2.2 当前业务设计与依据', '#### 6.2.2 现行业务'),
      code: 'business feature point subsection order:FP-BIZ-01 判定 SLA 违约资格',
    },
    {
      content: VALID_DRAFT.replace(
        '| FP-BIZ-03 确定升级责任人 | REQ-SLA-004、REQ-SLA-005、REQ-SLA-006 | 新增 | 按违约发生时的有效直属上级关系确定责任并形成通知义务；不维护组织关系或通知渠道 | 6.4 |\n',
        '',
      ),
      code: 'business feature point mapping coverage',
    },
  ];

  for (const item of cases) {
    writeDraft(taskPath, 'businessDesign', item.content);
    const fail = lintDraft(taskPath, 'businessDesign');
    assert.strictEqual(fail.status, 'fail');
    assert.strictEqual(fail.checks.find(check => check.code === item.code).result, 'fail');
  }

  const summaryOnlyTargetState = VALID_DRAFT.replace(
    /(### 6\.2 FP-BIZ-01[\s\S]*?#### 6\.2\.4 目标态业务行为\r?\n\r?\n)[\s\S]*?(?=\r?\n#### 6\.2\.5 适用规则、状态和时间语义)/,
    '$1按规则判定任务是否具备升级资格。',
  );
  writeDraft(taskPath, 'businessDesign', summaryOnlyTargetState);
  assert.strictEqual(
    lintDraft(taskPath, 'businessDesign').status,
    'pass',
    'structural lint must not claim to judge professional or semantic completeness',
  );

  const missingAsset = path.join(
    draftAssetsPath(taskPath, 'businessDesign'),
    'ucd',
    'escalation-list-business-concept.svg',
  );
  fs.unlinkSync(missingAsset);
  assert.strictEqual(
    lintDraft(taskPath, 'businessDesign').checks.find(check => check.code === 'design asset bundle').result,
    'fail',
  );

  installBusinessAssets(taskPath);
  fs.writeFileSync(path.join(draftAssetsPath(taskPath, 'businessDesign'), 'unreferenced.svg'), '<svg/>', 'utf8');
  assert.strictEqual(
    lintDraft(taskPath, 'businessDesign').checks.find(check => check.code === 'design asset bundle').result,
    'fail',
  );
});

test('business lint rejects missing, empty, placeholder, misordered, and invalid-frontmatter Drafts', () => {
  const { taskPath } = makeTask();
  const cases = [
    VALID_DRAFT.replace('## 13. 词汇表', '## 13. __TEMP__'),
    VALID_DRAFT.replace(
      /(## 13\. 词汇表\r?\n)[\s\S]*?(?=\r?\n## 14\. 参考资料)/,
      '$1',
    ),
    VALID_DRAFT.replace('REQ-SLA-BASELINE-1.0', '{{TODO}}'),
    VALID_DRAFT
      .replace('## 1. 概述', '## __TEMP__')
      .replace('## 2. 需求基线与业务设计范围', '## 1. 概述')
      .replace('## __TEMP__', '## 2. 需求基线与业务设计范围'),
    VALID_DRAFT.replace('artifactId: "BD-FEAT-TEST-001"\n', 'artifactId: "BD-FEAT-TEST-001"\nstatus: draft\n'),
  ];

  for (const content of cases) {
    writeDraft(taskPath, 'businessDesign', content);
    assert.strictEqual(lintDraft(taskPath, 'businessDesign').status, 'fail');
  }
});

test('solution lint enforces only the numbered structural contract and feature-point mappings', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'solutionDesign', VALID_SOLUTION_DRAFT);
  installSolutionAssets(taskPath);
  const pass = lintDraft(taskPath, 'solutionDesign');
  assert.strictEqual(pass.status, 'pass');
  assert.strictEqual(pass.checks.filter(check => check.code.startsWith('core section:')).length, 12);
  assert.strictEqual(pass.checks.filter(check => check.code.startsWith('required subsection:')).length, 3);
  assert.strictEqual(pass.checks.filter(check => check.code.startsWith('solution view:')).length, 5);
  assert.strictEqual(
    pass.checks.filter(check => check.code.startsWith('required feature point subsection:')).length,
    20,
  );
  assert.strictEqual(pass.checks.find(check => check.code === 'solution feature point mapping coverage').result, 'pass');

  const cases = [
    {
      content: VALID_SOLUTION_DRAFT.replace('#### 4.2.5 物理视图', '#### 4.2.5 部署观察'),
      code: 'solution view order',
    },
    {
      content: VALID_SOLUTION_DRAFT.replace('##### 当前设计', '##### 既有方案'),
      code: 'solution feature point subsection order:FP-01 识别逾期审批任务',
    },
    {
      content: VALID_SOLUTION_DRAFT.replace(
        '| FP-03 解析升级对象并请求通知 | REQ-SLA-004、REQ-SLA-005、REQ-SLA-006 | 新增 | 按违约时间解析直属上级，幂等请求通知并跟踪结果 | 4.3.3 |\n',
        '',
      ),
      code: 'solution feature point mapping coverage',
    },
  ];

  for (const item of cases) {
    writeDraft(taskPath, 'solutionDesign', item.content);
    const fail = lintDraft(taskPath, 'solutionDesign');
    assert.strictEqual(fail.status, 'fail');
    assert.strictEqual(fail.checks.find(check => check.code === item.code).result, 'fail');
  }

  const summaryOnlyTargetState = VALID_SOLUTION_DRAFT.replace(
    /(#### 4\.3\.1 FP-01[\s\S]*?##### 目标态设计\r?\n\r?\n)[\s\S]*?(?=\r?\n##### 设计影响、约束与风险)/,
    '$1采用分页和幂等机制完成候选识别。',
  );
  writeDraft(taskPath, 'solutionDesign', summaryOnlyTargetState);
  assert.strictEqual(
    lintDraft(taskPath, 'solutionDesign').status,
    'pass',
    'structural lint must not claim to judge professional or semantic completeness',
  );

  const missingAsset = path.join(
    draftAssetsPath(taskPath, 'solutionDesign'),
    'ucd',
    'escalation-list-wireframe.svg',
  );
  fs.unlinkSync(missingAsset);
  const missingAssetLint = lintDraft(taskPath, 'solutionDesign');
  assert.strictEqual(
    missingAssetLint.checks.find(check => check.code === 'design asset bundle').result,
    'fail',
  );

  installSolutionAssets(taskPath);
  fs.writeFileSync(path.join(draftAssetsPath(taskPath, 'solutionDesign'), 'unreferenced.svg'), '<svg/>', 'utf8');
  const unreferencedAssetLint = lintDraft(taskPath, 'solutionDesign');
  assert.strictEqual(
    unreferencedAssetLint.checks.find(check => check.code === 'design asset bundle').result,
    'fail',
  );
});

test('solution design assets are hash-bound to review and approval', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'solutionDesign', VALID_SOLUTION_DRAFT);
  installSolutionAssets(taskPath);
  assert.strictEqual(lintDraft(taskPath, 'solutionDesign').status, 'pass');

  const before = readDraftRef(taskPath, 'solutionDesign');
  assert.strictEqual(before.assets.length, 3);
  assert.notStrictEqual(before.hash, sha256File(draftPath(taskPath, 'solutionDesign')));
  assert.strictEqual(
    recordReview(taskPath, 'solutionDesign', passingSolutionSummary(taskPath)).status,
    'pass',
  );

  fs.appendFileSync(
    path.join(draftAssetsPath(taskPath, 'solutionDesign'), 'ucd', 'recovery-states-wireframe.svg'),
    '\n<!-- visual revision -->\n',
  );
  assert.strictEqual(inspectDesign(taskPath, 'solutionDesign').review.valid, false);
  assert.strictEqual(lintDraft(taskPath, 'solutionDesign').status, 'pass');
  assert.throws(
    () => refreshFormattingReview(taskPath, 'solutionDesign'),
    /semantic; all applicable reviews must run again/i,
  );
});

test('publish and reopen preserve the approved solution design asset bundle', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'solutionDesign', VALID_SOLUTION_DRAFT);
  installSolutionAssets(taskPath);
  assert.strictEqual(lintDraft(taskPath, 'solutionDesign').status, 'pass');
  recordReview(taskPath, 'solutionDesign', passingSolutionSummary(taskPath));
  approveCurrentDesign(taskPath, 'solutionDesign', { approvedBy: 'human', acceptedRisks: [] });

  const published = publish(taskPath, 'solutionDesign');
  const artifactRef = readArtifactRef(taskPath, 'solutionDesign');
  const publishedAsset = path.join(
    artifactAssetsPath(taskPath, 'solutionDesign'),
    'ucd',
    'escalation-detail-wireframe.svg',
  );
  assert.strictEqual(published.hash, artifactRef.hash);
  assert.strictEqual(artifactRef.assets.length, 3);
  assert.deepStrictEqual(
    fs.readFileSync(publishedAsset),
    fs.readFileSync(path.join(solutionAssetsFixturePath, 'ucd', 'escalation-detail-wireframe.svg')),
  );
  assert.strictEqual(publish(taskPath, 'solutionDesign').idempotent, true);

  const reopened = reopenDesign(taskPath, 'solutionDesign');
  assert.strictEqual(
    fs.existsSync(path.join(reopened.historyAssets, 'ucd', 'escalation-detail-wireframe.svg')),
    true,
  );
  assert.strictEqual(
    fs.existsSync(path.join(reopened.draftAssets, 'ucd', 'escalation-detail-wireframe.svg')),
    true,
  );
  assert.match(fs.readFileSync(reopened.historyFile, 'utf8'), /solution-design-assets\/ucd\/escalation-detail-wireframe\.svg/);
  assert.match(fs.readFileSync(reopened.draft, 'utf8'), /version: "2\.0\.0"/);
  assert.strictEqual(fs.existsSync(artifactPath(taskPath, 'solutionDesign')), false);
  assert.strictEqual(fs.existsSync(artifactAssetsPath(taskPath, 'solutionDesign')), false);
});

test('implementation lint accepts numbered implementation units, point mappings, and conditional unit structures', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'implementationDesign', implementationDraft('FEAT-TEST-001'));

  const pass = lintDraft(taskPath, 'implementationDesign');
  assert.strictEqual(pass.status, 'pass');
  assert.strictEqual(pass.checks.find(check => check.code === 'implementation unit count').result, 'pass');
  assert.strictEqual(
    pass.checks.filter(check => check.code.startsWith('implementation unit detail:')).length,
    4,
  );
  assert.strictEqual(pass.checks.find(check => check.code === 'implementation point mapping').result, 'pass');
  assert.strictEqual(pass.checks.find(check => check.code === 'implementation point identifiers').result, 'pass');
  assert.strictEqual(pass.checks.find(check => check.code === 'implementation mapping coverage').result, 'pass');
});

test('implementation lint rejects missing or duplicate units, broken mappings, invalid point ids, and empty units', () => {
  const { taskPath } = makeTask();
  const valid = implementationDraft('FEAT-TEST-001');
  const cases = [
    valid.replace(
      /^## 4\. 实现单元：`approval-service`[\s\S]*?(?=^## 5\. 实现单元：)/m,
      '',
    ),
    valid.replace(
      /^## 5\. 实现单元：`notification-service`/m,
      '## 5. 实现单元：`approval-service`',
    ),
    valid.replace(
      /^\| FP-04 处置工作台 \|.*approval-ops-web.*\n/m,
      '',
    ),
    valid.replace('IMP-WEB-01 查询与恢复闭环', 'WEB-01 查询与恢复闭环'),
    valid.replace(
      /^## 7\. 实现单元：`approval-ops-web`[\s\S]*?(?=^## 8\. 跨单元失败行为)/m,
      '## 7. 实现单元：`approval-ops-web`\n\n只有摘要，没有详细结构。\n\n',
    ),
    valid.replace(/^## 8\. 跨单元失败行为[\s\S]*?(?=^## 9\. 开发实施与 TDD 交接)/m, ''),
  ];

  for (const content of cases) {
    writeDraft(taskPath, 'implementationDesign', content);
    assert.strictEqual(lintDraft(taskPath, 'implementationDesign').status, 'fail');
  }
});

test('review record keeps hash-bound gate state while review.md remains opaque', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  const summary = passingSummary(taskPath, 'businessDesign');
  summary.checklists[0] = {
      checklistId: 'business-semantic-consistency',
    result: 'findings',
    summary: '一项建议',
    findings: [{
      type: 'advisory',
      location: '异常、边界与业务结果',
      issue: '拒绝提示可以更明确',
      impact: '用户可能需要再次确认结果',
      recommendation: '补充用户可见结果',
    }, {
      type: 'risk',
      location: '关键业务决策、约束与风险',
      issue: '边缘场景仍需上线观察',
      impact: '低频用户可能遇到额外重试',
      recommendation: '保留监控并记录残余风险',
    }],
  };
  let persisted = recordReview(taskPath, 'businessDesign', summary);
  assert.strictEqual(persisted.schemaVersion, 3);
  assert.strictEqual(persisted.status, 'pass');
  assert.deepStrictEqual(persisted.findingSummary, { blocking: 0, advisory: 1, risk: 1, total: 2 });
  assert.strictEqual(persisted.findings, undefined);
  assert.strictEqual(persisted.checklists[0].findings, undefined);
  assert.strictEqual(
    reviewSummaryPath(taskPath, 'businessDesign'),
    path.join(taskPath, 'work', 'business-design', 'review.json'),
  );
  assert.strictEqual(fs.existsSync(reviewSummaryPath(taskPath, 'businessDesign')), true);
  assert.strictEqual(fs.existsSync(reviewReportPath(taskPath, 'businessDesign')), true);
  assert.strictEqual(persisted.reportHash, sha256File(reviewReportPath(taskPath, 'businessDesign')));
  assert.strictEqual(fs.existsSync(path.join(taskPath, 'reviews')), false);
  const blockingSummary = passingSummary(taskPath, 'businessDesign');
  blockingSummary.checklists[0] = {
    ...summary.checklists[0],
    findings: [{ ...summary.checklists[0].findings[0], type: 'blocking' }],
  };
  persisted = recordReview(taskPath, 'businessDesign', blockingSummary);
  assert.strictEqual(persisted.status, 'blocked');
  assert.deepStrictEqual(persisted.findingSummary, { blocking: 1, advisory: 0, risk: 0, total: 1 });
  assert.strictEqual(JSON.parse(fs.readFileSync(reviewSummaryPath(taskPath, 'businessDesign'), 'utf8')).findings, undefined);
});

test('incremental Review appends without replacing the baseline and preserves untouched findings', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  const first = passingSummary(taskPath, 'businessDesign');
  first.reportAppend = '# Design Review Baseline\n\n- [x] 原始评审项：pass\n';
  first.checklists[0] = {
    checklistId: first.checklists[0].checklistId,
    result: 'findings',
    summary: '保留一项 advisory',
    findings: [{
      type: 'advisory',
      location: '异常、边界与业务结果',
      issue: '未选择处理的提示文案问题',
      impact: '提示仍不够直接',
      recommendation: '后续优化提示文案',
    }],
  };
  recordReview(taskPath, 'businessDesign', first);
  const baseline = fs.readFileSync(reviewReportPath(taskPath, 'businessDesign'), 'utf8');

  fs.appendFileSync(draftPath(taskPath, 'businessDesign'), '\n补充另一处已确认业务语义。\n');
  lintDraft(taskPath, 'businessDesign');
  const context = reviewContext(taskPath, 'businessDesign');
  assert.strictEqual(context.reviewMode, 'incremental');
  assert.strictEqual(context.previousReview.findingSummary.advisory, 1);
  const incremental = passingSummary(taskPath, 'businessDesign');
  incremental.reportAppend = '\n## Round 2 — Incremental Review\n\n- 复评另一项，旧 advisory 保留。\n';
  incremental.checklists[0] = { ...first.checklists[0] };
  const persisted = recordReview(taskPath, 'businessDesign', incremental);
  const ledger = fs.readFileSync(reviewReportPath(taskPath, 'businessDesign'), 'utf8');
  assert.strictEqual(ledger, `${baseline}${incremental.reportAppend}`);
  assert.deepStrictEqual(persisted.findingSummary, { blocking: 0, advisory: 1, risk: 0, total: 1 });
});

test('record-review rejects a stale baseReportHash without changing review.md', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  fs.appendFileSync(draftPath(taskPath, 'businessDesign'), '\n局部语义修订。\n');
  lintDraft(taskPath, 'businessDesign');
  const stale = passingSummary(taskPath, 'businessDesign');
  const current = passingSummary(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', current);
  const before = fs.readFileSync(reviewReportPath(taskPath, 'businessDesign'), 'utf8');
  assert.throws(() => recordReview(taskPath, 'businessDesign', stale), /baseReportHash is stale/);
  assert.strictEqual(fs.readFileSync(reviewReportPath(taskPath, 'businessDesign'), 'utf8'), before);
});

test('a JSON write failure after report append leaves a detectable fail-closed partial Review', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  fs.appendFileSync(draftPath(taskPath, 'businessDesign'), '\n局部语义修订。\n');
  lintDraft(taskPath, 'businessDesign');

  const summaryPath = reviewSummaryPath(taskPath, 'businessDesign');
  const reportPath = reviewReportPath(taskPath, 'businessDesign');
  const oldSummaryRaw = fs.readFileSync(summaryPath, 'utf8');
  const oldSummary = JSON.parse(oldSummaryRaw);
  const partial = passingSummary(taskPath, 'businessDesign');
  partial.reportAppend = '\n## Partial Round\n\n- This fragment is appended exactly once.\n';

  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = function injectedWriteFailure(filePath, ...args) {
    if (path.resolve(filePath) === path.resolve(summaryPath)) {
      const error = new Error('injected review.json write failure');
      error.code = 'EIO';
      throw error;
    }
    return originalWriteFileSync.call(this, filePath, ...args);
  };
  try {
    assert.throws(
      () => recordReview(taskPath, 'businessDesign', partial),
      /injected review\.json write failure/,
    );
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }

  assert.strictEqual(fs.readFileSync(summaryPath, 'utf8'), oldSummaryRaw);
  const report = fs.readFileSync(reportPath, 'utf8');
  assert.strictEqual((report.match(/## Partial Round/g) || []).length, 1);
  assert.notStrictEqual(sha256File(reportPath), oldSummary.reportHash);
  const validation = validateReview(taskPath, 'businessDesign');
  assert.strictEqual(validation.valid, false);
  assert.match(validation.issues[0], /Review report hash mismatch/);
  const context = reviewContext(taskPath, 'businessDesign');
  assert.strictEqual(context.reviewMode, 'rebuild-full-required');
  assert.match(context.historyIssue, /Review report hash mismatch/);
});

test('missing or tampered review.md fails closed until an explicitly flagged baseline rebuild', () => {
  for (const damage of ['missing', 'tampered']) {
    const { taskPath } = makeTask();
    writeDraft(taskPath, 'businessDesign');
    lintDraft(taskPath, 'businessDesign');
    recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
    const reportPath = reviewReportPath(taskPath, 'businessDesign');
    if (damage === 'missing') fs.unlinkSync(reportPath);
    else fs.appendFileSync(reportPath, '\nuntrusted change\n');

    const context = reviewContext(taskPath, 'businessDesign');
    assert.strictEqual(context.reviewMode, 'rebuild-full-required');
    assert.match(context.historyIssue, damage === 'missing' ? /missing/ : /hash mismatch/);
    assert.strictEqual(validateReview(taskPath, 'businessDesign').valid, false);

    const rebuild = passingSummary(taskPath, 'businessDesign');
    rebuild.rebuildBaseline = true;
    rebuild.baseReportHash = null;
    rebuild.reportAppend = '# Rebuilt Design Review Baseline\n\n- Full review authorized by user.\n';
    assert.throws(
      () => recordReview(taskPath, 'businessDesign', { ...rebuild, rebuildBaseline: false }),
      damage === 'missing' ? /report is missing/ : /hash mismatch/,
    );
    const persisted = recordReview(taskPath, 'businessDesign', rebuild);
    assert.strictEqual(persisted.schemaVersion, 3);
    assert.strictEqual(fs.readFileSync(reportPath, 'utf8'), rebuild.reportAppend);
    assert.strictEqual(validateReview(taskPath, 'businessDesign').valid, true);
  }
});

test('approval and publish reject a Review ledger whose hash has drifted', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  approveCurrentDesign(taskPath, 'businessDesign', { approvedBy: 'human', acceptedRisks: [] });
  fs.appendFileSync(reviewReportPath(taskPath, 'businessDesign'), '\nuntrusted change\n');
  assert.throws(
    () => approveCurrentDesign(taskPath, 'businessDesign', { approvedBy: 'human', acceptedRisks: [] }),
    /passing lint and review/,
  );
  assert.throws(() => publish(taskPath, 'businessDesign'), /Review report hash mismatch/);
});

test('lint persists only current hash-bound status and review context requires it', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  assert.throws(() => reviewContext(taskPath, 'businessDesign'), /matching passing lint state/);
  const lint = lintDraft(taskPath, 'businessDesign');
  const persisted = JSON.parse(fs.readFileSync(lintStatusPath(taskPath, 'businessDesign'), 'utf8'));
  assert.strictEqual(persisted.status, 'pass');
  assert.strictEqual(persisted.draftHash, lint.draftHash);
  assert.strictEqual(persisted.checks, undefined);
  fs.appendFileSync(draftPath(taskPath, 'businessDesign'), '\n格式变化。\n');
  assert.throws(() => reviewContext(taskPath, 'businessDesign'), /matching passing lint state/);
});

test('Review Policy is complete, path-safe, and record-review enforces every disposition', () => {
  const loaded = loadReviewPolicy('businessDesign');
  assert.strictEqual(loaded.policy.schemaVersion, 1);
  assert.strictEqual(loaded.policy.designTypes.businessDesign.required.length, 3);
  assert.strictEqual(loaded.policy.designTypes.businessDesign.conditional.length, 1);
  assert.strictEqual(JSON.stringify(loaded.policy).includes('privacy-review'), false);
  assert.notStrictEqual(loaded.hash, loaded.legacyHash);
  assert.strictEqual(loadReviewPolicy('businessDesign').hash, loaded.hash);

  const changedChecklist = spawnSync(process.execPath, ['-e', `
    const fs = require('node:fs');
    const original = fs.readFileSync;
    fs.readFileSync = function (filePath, ...args) {
      const value = original.call(this, filePath, ...args);
      if (!String(filePath).endsWith('business-semantic-consistency.md')) return value;
      return Buffer.isBuffer(value)
        ? Buffer.concat([value, Buffer.from('\\nraw checklist change')])
        : value + '\\nraw checklist change';
    };
    process.stdout.write(require('./scripts/devsphere-design').loadReviewPolicy('businessDesign').hash);
  `], { cwd: path.resolve(__dirname, '..', '..'), encoding: 'utf8' });
  assert.strictEqual(changedChecklist.status, 0, changedChecklist.stderr);
  assert.notStrictEqual(changedChecklist.stdout, loaded.hash);

  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  const summary = passingSummary(taskPath, 'businessDesign');
  summary.checklists.pop();
  assert.throws(() => recordReview(taskPath, 'businessDesign', summary), /Required review checklist was not executed/);

  const missingDisposition = passingSummary(taskPath, 'businessDesign');
  missingDisposition.notApplicable = [];
  assert.throws(() => recordReview(taskPath, 'businessDesign', missingDisposition), /no disposition/);
});

test('Policy drift requires explicit full baseline rebuild instead of automatic fallback', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  const summaryPath = reviewSummaryPath(taskPath, 'businessDesign');
  const drifted = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  drifted.policyHash = 'sha256:outdated-policy-and-checklists';
  fs.writeFileSync(summaryPath, JSON.stringify(drifted, null, 2), 'utf8');

  const context = reviewContext(taskPath, 'businessDesign');
  assert.strictEqual(context.policyChanged, true);
  assert.strictEqual(context.reviewMode, 'rebuild-full-required');
  assert.match(validateReview(taskPath, 'businessDesign').issues[0], /current Review Policy/);
  const rebuild = passingSummary(taskPath, 'businessDesign');
  assert.throws(() => recordReview(taskPath, 'businessDesign', rebuild), /Policy or Checklist content changed/);
  rebuild.rebuildBaseline = true;
  rebuild.baseReportHash = null;
  rebuild.reportAppend = '# Authorized Rebuilt Baseline\n';
  assert.strictEqual(recordReview(taskPath, 'businessDesign', rebuild).status, 'pass');
});

test('legacy schema 2 keeps Draft compatibility without claiming Checklist Markdown binding', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  const summaryPath = reviewSummaryPath(taskPath, 'businessDesign');
  const legacy = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  legacy.schemaVersion = 2;
  legacy.policyHash = loadReviewPolicy('businessDesign').legacyHash;
  delete legacy.reportHash;
  fs.writeFileSync(summaryPath, JSON.stringify(legacy, null, 2), 'utf8');
  fs.unlinkSync(reviewReportPath(taskPath, 'businessDesign'));
  assert.strictEqual(validateReview(taskPath, 'businessDesign').valid, true);

  fs.appendFileSync(draftPath(taskPath, 'businessDesign'), '\n经确认的局部语义变化。\n');
  lintDraft(taskPath, 'businessDesign');
  const context = reviewContext(taskPath, 'businessDesign');
  assert.strictEqual(context.reviewMode, 'rebuild-full-required');
  assert.strictEqual(context.historyIssue, null);
  const rebuild = passingSummary(taskPath, 'businessDesign');
  assert.throws(() => recordReview(taskPath, 'businessDesign', rebuild), /Legacy Review has no review.md/);
  rebuild.rebuildBaseline = true;
  rebuild.baseReportHash = null;
  rebuild.reportAppend = '# Authorized Legacy Migration Baseline\n';
  assert.strictEqual(recordReview(taskPath, 'businessDesign', rebuild).schemaVersion, 3);
});

test('legacy schema 2 can publish an unchanged Draft bound to the legacy Policy JSON hash', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  const summaryPath = reviewSummaryPath(taskPath, 'businessDesign');
  const legacy = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  legacy.schemaVersion = 2;
  legacy.policyHash = loadReviewPolicy('businessDesign').legacyHash;
  delete legacy.reportHash;
  fs.writeFileSync(summaryPath, JSON.stringify(legacy, null, 2), 'utf8');
  fs.unlinkSync(reviewReportPath(taskPath, 'businessDesign'));

  approveCurrentDesign(taskPath, 'businessDesign', { approvedBy: 'human', acceptedRisks: [] });
  assert.strictEqual(publish(taskPath, 'businessDesign').designType, 'businessDesign');
});

test('validate-review is the deterministic main-session completion gate', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  let result = validateReview(taskPath, 'businessDesign');
  assert.strictEqual(result.valid, false);
  assert.deepStrictEqual(result.issues, ['Review state is missing']);

  lintDraft(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  assert.deepStrictEqual(validateReview(taskPath, 'businessDesign'), {
    valid: true,
    designType: 'businessDesign',
  });

  const blocked = passingSummary(taskPath, 'businessDesign');
  blocked.checklists[0] = {
    checklistId: blocked.checklists[0].checklistId,
    result: 'findings',
    summary: '存在阻断问题',
    findings: [{
      type: 'blocking',
      location: '业务规则',
      issue: '规则冲突',
      impact: '结果不确定',
      recommendation: '统一规则',
    }],
  };
  recordReview(taskPath, 'businessDesign', blocked);
  result = validateReview(taskPath, 'businessDesign');
  assert.strictEqual(result.valid, false);
  assert.match(result.issues[0], /status is not acceptable: blocked/);

  const reviewPath = reviewSummaryPath(taskPath, 'businessDesign');
  const tampered = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
  tampered.status = 'pass';
  fs.writeFileSync(reviewPath, JSON.stringify(tampered, null, 2), 'utf8');
  result = validateReview(taskPath, 'businessDesign');
  assert.strictEqual(result.valid, false);
  assert.match(result.issues[0], /does not match the blocking finding count/);

  tampered.status = 'blocked';
  fs.writeFileSync(reviewPath, JSON.stringify(tampered, null, 2), 'utf8');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  fs.appendFileSync(draftPath(taskPath, 'businessDesign'), '\n语义变化。\n');
  result = validateReview(taskPath, 'businessDesign');
  assert.strictEqual(result.valid, false);
  assert.match(result.issues[0], /passing lint state/);
});

test('design-reviewer SubagentStop requires a complete current persisted Review', () => {
  const { workspaceRoot, taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  const input = {
    agent_type: 'scc-dev-sphere:design-reviewer',
    cwd: workspaceRoot,
    last_assistant_message: '# Design Review\n\n- Result: pass',
  };
  assert.strictEqual(checkDesignReviewerStop(input).decision, 'block');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  assert.strictEqual(checkDesignReviewerStop(input), null);
  fs.unlinkSync(lintStatusPath(taskPath, 'businessDesign'));
  assert.match(checkDesignReviewerStop(input).reason, /passing lint state/);
});

test('semantic revision invalidates review while formatting-only change can refresh it', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));
  const reportBefore = fs.readFileSync(reviewReportPath(taskPath, 'businessDesign'), 'utf8');

  fs.appendFileSync(draftPath(taskPath, 'businessDesign'), '\n业务语义改变。\n');
  assert.strictEqual(inspectDesign(taskPath, 'businessDesign').review.valid, false);

  fs.writeFileSync(draftPath(taskPath, 'businessDesign'), `${VALID_DRAFT}\n\n`, 'utf8');
  lintDraft(taskPath, 'businessDesign');
  const refreshed = refreshFormattingReview(taskPath, 'businessDesign');
  assert.strictEqual(refreshed.draftHash, readDraftRef(taskPath, 'businessDesign').hash);
  assert.strictEqual(refreshed.reportHash, sha256File(reviewReportPath(taskPath, 'businessDesign')));
  assert.strictEqual(fs.readFileSync(reviewReportPath(taskPath, 'businessDesign'), 'utf8'), reportBefore);
});

test('publish copies the approved Draft byte-for-byte without changing top-level state', () => {
  const { taskPath } = makeTask();
  setRequired(taskPath, ['businessDesign']);
  const result = completeBusiness(taskPath);
  assert.strictEqual(fs.readFileSync(result.artifactPath, 'utf8'), VALID_DRAFT);
  assert.deepStrictEqual(
    fs.readFileSync(path.join(artifactAssetsPath(taskPath, 'businessDesign'), 'ucd', 'escalation-detail-business-concept.svg')),
    fs.readFileSync(path.join(businessAssetsFixturePath, 'ucd', 'escalation-detail-business-concept.svg')),
  );
  assert.strictEqual(fs.existsSync(reviewSummaryPath(taskPath, 'businessDesign')), false);
  assert.strictEqual(fs.existsSync(reviewReportPath(taskPath, 'businessDesign')), false);
  assert.strictEqual(publish(taskPath, 'businessDesign').idempotent, true);
  assert.strictEqual(result.state, undefined);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(taskPath, 'state.json'), 'utf8')).status, 'designing');
  assert.strictEqual(syncDesignState(taskPath).status, 'design_ready');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(taskPath, 'state.json'), 'utf8')).status, 'design_ready');
});

test('reopen operates on one independent design without changing top-level state', () => {
  const { taskPath } = makeTask();
  setRequired(taskPath, ['businessDesign']);
  completeBusiness(taskPath);
  const reopened = reopenDesign(taskPath, 'businessDesign');
  assert.ok(fs.existsSync(reopened.historyFile));
  assert.strictEqual(
    fs.existsSync(path.join(reopened.draftAssets, 'ucd', 'escalation-detail-business-concept.svg')),
    true,
  );
  assert.match(fs.readFileSync(reopened.draft, 'utf8'), /version: "2\.0\.0"/);
  assert.strictEqual(reopened.state, undefined);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(taskPath, 'state.json'), 'utf8')).status, 'designing');
  assert.strictEqual(designReady(taskPath).valid, false);
});

test('design type metadata remains free of workflow order and upstream contracts', () => {
  for (const definition of Object.values(DESIGN_TYPES)) {
    assert.strictEqual(definition.upstream, undefined);
    assert.strictEqual(definition.next, undefined);
    assert.ok(definition.slug);
  }
});
