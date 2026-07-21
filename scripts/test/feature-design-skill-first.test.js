'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTask } = require('./helpers');
const { businessDraft } = require('./fixtures/business-design');
const { implementationDraft } = require('./fixtures/implementation-design');
const { validateDesignEntry } = require('../workflows/feature-workflow');
const {
  DESIGN_TYPES,
  initDesign,
  inspectWorkspace,
  inspectDesign,
  lintDraft,
  recordReview,
  refreshFormattingReview,
  approveCurrentDesign,
  publish,
  reopenDesign,
  designReady,
  syncDesignState,
  draftPath,
  artifactPath,
  sha256File,
} = require('../devsphere-design');

const VALID_DRAFT = businessDraft('FEAT-TEST-001');

const VALID_SOLUTION_DRAFT = `---
artifactId: "SD-FEAT-TEST-001"
version: "1.0.0"
---

# Solution Design

## 概述
为审批任务增加 SLA 自动升级，目标读者为研发和测试人员。

## 特性需求与设计上下文
这是存量增强；新增自动升级，影响审批状态与通知，保持组织数据所有权不变，不包含组织架构维护。

## 总体方案
调度器发现逾期任务，升级服务原子创建升级事件，异步消费者完成上级解析和通知。

## 4+1 架构视图

### 场景视图
逾期任务触发一次升级；撤回和重复扫描不会形成第二次有效升级。

### 逻辑视图
审批服务拥有任务状态，组织服务拥有上下级关系，通知服务负责送达。

### 进程视图
扫描、原子建事件、异步消费和通知形成可重试链路，幂等键阻止重复升级。

### 开发视图
审批服务新增调度和升级组件，通知服务沿用现有消费入口。

### 物理视图
复用现有部署拓扑和消息设施，通过独立并发配额隔离扫描任务。

## 接口与集成设计
组织查询设置超时和有限重试，通知事件至少一次投递并以 eventId 幂等。

## 数据设计
审批服务拥有升级状态和 Outbox，审计记录只追加，组织关系不复制为权威数据。

## 可靠性、可用性与功能安全设计
依赖失败保留待处理事件并退避重试，积压和重试耗尽触发告警；不涉及功能安全。

## 安全、隐私与韧性设计
沿用审批权限边界，操作者标识最小化展示，通知消费不能绕过租户校验。

## 非功能质量属性设计
扫描批次和并发配额保护在线请求；升级延迟与积压深度可监控和验证。

## 关键技术决策、取舍与风险
选择事务 Outbox 取得可靠投递，接受通知最终一致；组织服务长时间不可用是残余风险。

## 下游设计约束与交接
审批服务细化事务和并发实现；测试覆盖重复扫描、撤回竞态和通知重放。

## 需求追溯与覆盖关系
自动升级落到调度与升级事件，可靠通知落到 Outbox，审计要求落到追加记录。

## 词汇表
升级事件：一次 SLA 违约产生的唯一业务事件。

## 参考资料
采用当前任务需求、审批状态模型和组织服务接口合同。
`;

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
}

function passingSummary(taskPath, designType) {
  return {
    draftHash: sha256File(draftPath(taskPath, designType)),
    checklists: [{ checklistId: 'business-semantic-consistency', result: 'pass', summary: '通过', findings: [] }],
    notApplicable: [],
  };
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
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# Requirement Baseline\n\nApproved requirement.', 'utf8');
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

test('business lint accepts complete new, existing, and low-impact Drafts without semantic judgement', () => {
  const { taskPath } = makeTask();
  for (const variant of ['new', 'existing', 'low-impact']) {
    writeDraft(taskPath, 'businessDesign', businessDraft('FEAT-TEST-001', variant));
    const pass = lintDraft(taskPath, 'businessDesign');
    assert.strictEqual(pass.status, 'pass', variant);
    assert.strictEqual(pass.checks.filter(check => check.code.startsWith('core section:')).length, 14);
    assert.ok(pass.checks.every(check => check.kind !== 'semantic'));
  }
});

test('business lint rejects missing, empty, placeholder, misordered, and invalid-frontmatter Drafts', () => {
  const { taskPath } = makeTask();
  const cases = [
    VALID_DRAFT.replace('## 词汇表\nSLA 截止时间：任务应完成处理的业务时刻。升级：逾期任务责任上移并形成可观察结果的业务事件。\n\n', ''),
    VALID_DRAFT.replace('## 词汇表\nSLA 截止时间：任务应完成处理的业务时刻。升级：逾期任务责任上移并形成可观察结果的业务事件。', '## 词汇表\n'),
    VALID_DRAFT.replace('当前任务 Requirement Baseline', '{{TODO}} Requirement Baseline'),
    VALID_DRAFT
      .replace('## 概述', '## __TEMP__')
      .replace('## 需求基线与业务设计范围', '## 概述')
      .replace('## __TEMP__', '## 需求基线与业务设计范围'),
    VALID_DRAFT.replace('artifactId: "BD-FEAT-TEST-001"\n', 'artifactId: "BD-FEAT-TEST-001"\nstatus: draft\n'),
  ];

  for (const content of cases) {
    writeDraft(taskPath, 'businessDesign', content);
    assert.strictEqual(lintDraft(taskPath, 'businessDesign').status, 'fail');
  }
});

test('solution lint enforces the fourteen chapters and all 4+1 views', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'solutionDesign', VALID_SOLUTION_DRAFT);
  const pass = lintDraft(taskPath, 'solutionDesign');
  assert.strictEqual(pass.status, 'pass');
  assert.strictEqual(pass.checks.filter(check => check.code.startsWith('core section:')).length, 14);
  assert.strictEqual(pass.checks.filter(check => check.code.startsWith('required subsection:')).length, 5);

  fs.writeFileSync(
    draftPath(taskPath, 'solutionDesign'),
    VALID_SOLUTION_DRAFT.replace('### 物理视图', '### 部署观察'),
    'utf8',
  );
  const fail = lintDraft(taskPath, 'solutionDesign');
  assert.strictEqual(fail.status, 'fail');
  assert.strictEqual(
    fail.checks.find(check => check.code === 'required subsection:4+1 架构视图/物理视图').result,
    'fail',
  );
});

test('implementation lint accepts feature context, repeated complete service units, and applicability coverage', () => {
  const { taskPath } = makeTask();
  writeDraft(
    taskPath,
    'implementationDesign',
    implementationDraft('FEAT-TEST-001', ['approval-service', 'notification-service']),
  );

  const pass = lintDraft(taskPath, 'implementationDesign');
  assert.strictEqual(pass.status, 'pass');
  assert.strictEqual(pass.checks.find(check => check.code === 'implementation unit count').result, 'pass');
  assert.strictEqual(
    pass.checks.filter(check => check.code.startsWith('required unit subsection:')).length,
    24,
  );
  assert.strictEqual(pass.checks.find(check => check.code === 'implementation mapping coverage').result, 'pass');
  assert.strictEqual(pass.checks.find(check => check.code === 'implementation applicability coverage').result, 'pass');

  for (const handling of ['沿用既有设计', '无新增影响']) {
    writeDraft(
      taskPath,
      'implementationDesign',
      implementationDraft('FEAT-TEST-001').replace('| 完整设计 |', `| ${handling} |`),
    );
    assert.strictEqual(lintDraft(taskPath, 'implementationDesign').status, 'pass', handling);
  }
});

test('implementation lint rejects missing or duplicate units, missing mapping, incomplete units, and the legacy applicability list', () => {
  const { taskPath } = makeTask();
  const valid = implementationDraft('FEAT-TEST-001');
  const cases = [
    implementationDraft('FEAT-TEST-001', []),
    implementationDraft('FEAT-TEST-001', ['approval-service', 'approval-service']),
    valid.replace(/^\| approval-service \| 存量 \|.*\n/m, ''),
    valid.replace(/^### 面向 TDD 的单元行为设计[\s\S]*?(?=^### 开发实现计划交接)/m, ''),
    valid.replace('| 完整设计 |', '| 部分设计 |'),
    valid.replace(
      /^## 适用性与裁剪说明[\s\S]*?(?=^## 实现级开放事项与升级项)/m,
      '## 适用性与裁剪说明\n- 并发：生成：覆盖撤回和升级竞态。\n\n',
    ),
  ];

  for (const content of cases) {
    writeDraft(taskPath, 'implementationDesign', content);
    assert.strictEqual(lintDraft(taskPath, 'implementationDesign').status, 'fail');
  }
});

test('review summary is hash-bound, minimal, and blocks only blocking findings', () => {
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
    }],
  };
  assert.strictEqual(recordReview(taskPath, 'businessDesign', summary).status, 'pass');
  summary.checklists[0].findings[0].type = 'blocking';
  assert.strictEqual(recordReview(taskPath, 'businessDesign', summary).status, 'blocked');
});

test('semantic revision invalidates review while formatting-only change can refresh it', () => {
  const { taskPath } = makeTask();
  writeDraft(taskPath, 'businessDesign');
  lintDraft(taskPath, 'businessDesign');
  recordReview(taskPath, 'businessDesign', passingSummary(taskPath, 'businessDesign'));

  fs.appendFileSync(draftPath(taskPath, 'businessDesign'), '\n业务语义改变。\n');
  assert.strictEqual(inspectDesign(taskPath, 'businessDesign').review.valid, false);

  fs.writeFileSync(draftPath(taskPath, 'businessDesign'), `${VALID_DRAFT}\n\n`, 'utf8');
  lintDraft(taskPath, 'businessDesign');
  const refreshed = refreshFormattingReview(taskPath, 'businessDesign');
  assert.strictEqual(refreshed.draftHash, sha256File(draftPath(taskPath, 'businessDesign')));
});

test('publish copies the approved Draft byte-for-byte without changing top-level state', () => {
  const { taskPath } = makeTask();
  setRequired(taskPath, ['businessDesign']);
  const result = completeBusiness(taskPath);
  assert.strictEqual(fs.readFileSync(result.artifactPath, 'utf8'), VALID_DRAFT);
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
