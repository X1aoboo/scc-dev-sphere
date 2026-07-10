'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  createClarification,
  recordConclusion,
  recordTechnicalConclusion,
  recordTechnicalImpactDecision,
  confirmNoTechnicalImpacts,
  recordFinalConfirmation,
  recordEvidenceGap,
  persistAdoptedEvidence,
  planClarificationRecovery,
  shouldRequery,
  validateClarification,
  renderRequirementMarkdown,
  initClarification,
} = require('../feature-requirement-clarification');
const { readState, writeState } = require('../devsphere-state');
const { resolveNextAction } = require('../workflows/feature-workflow');
const { makeTask } = require('./helpers');

const DIMENSIONS = [
  'businessGoal',
  'usersAndScenarios',
  'functionalScope',
  'nonGoalsAndBoundaries',
  'acceptanceCriteria',
  'constraintsAndRisks',
];

function completeClarification(type = 'functional', originalRequirement = '为团队增加可追踪的需求澄清流程', finalConfirmed = true) {
  const clarification = createClarification(originalRequirement);
  recordConclusion(clarification, 'requirementType', type, [{ kind: 'user' }], '2026-07-11T09:00:00Z');
  for (const key of DIMENSIONS) {
    recordConclusion(clarification, key, `${key} 已确认`, [
      { kind: 'knowledge', evidenceId: `EV-${key}` },
      { kind: 'user' },
    ], '2026-07-11T09:01:00Z');
  }
  if (type !== 'functional') confirmNoTechnicalImpacts(clarification, '确认没有其他技术影响', [{ kind: 'user' }], '2026-07-11T09:02:00Z');
  if (finalConfirmed) recordFinalConfirmation(clarification, '2026-07-11T09:03:00Z');
  return clarification;
}

function addNorthboundApiContracts(clarification, confirmed = []) {
  const contract = {
    kind: 'northboundApi',
    applicable: true,
    name: '北向订单 API',
  };
  clarification.technicalContracts.push(contract);
  recordTechnicalImpactDecision(clarification, 'order-api', '订单北向 API', 'applicable', '需要同步订单配置', [{ kind: 'user' }], '2026-07-11T10:00:00Z', '北向订单 API');
  recordTechnicalConclusion(clarification, contract, null, '北向订单配置同步接口', [{ kind: 'user' }], '2026-07-11T10:00:00Z');
  for (const field of ['apiUrl', 'protocol', 'requestResponse', 'performance']) {
    if (confirmed.includes(field)) {
      recordTechnicalConclusion(clarification, contract, field, `${field} 已确认`, [{ kind: 'user' }], '2026-07-11T10:00:00Z');
    }
  }
}

function persistClarificationAndResolve(taskPath, state) {
  writeState(taskPath, state);
  const persistedState = readState(taskPath);
  const validation = validateClarification(persistedState.clarification);
  if (validation.complete) {
    persistedState.status = 'clarified';
    writeState(taskPath, persistedState);
  }
  const reloadedState = readState(taskPath);
  return { validation, reloadedState, nextAction: resolveNextAction(taskPath, reloadedState) };
}

test('createClarification 建立完整的初始状态', () => {
  const clarification = createClarification('  保留这段原始输入  ');

  assert.deepStrictEqual(clarification, {
    version: 1,
    originalRequirement: '  保留这段原始输入  ',
    requirementType: null,
    typeSources: [],
    typeConfirmedAt: null,
    typeConfirmedByUser: false,
    dimensions: {},
    technicalContracts: [],
    technicalImpacts: [],
    noTechnicalImpacts: null,
    finalConfirmedAt: null,
    adoptedEvidence: [],
    evidenceGaps: [],
    history: [],
  });
});

test('CLI init stores clarification in state and renders the existing requirement input', () => {
  const { taskPath } = makeTask();
  const originalRequirement = '允许用户用包含空格和 $ 字符的搜索词筛选订单';
  const requirementPath = path.join(taskPath, 'inputs', 'requirement.md');
  fs.writeFileSync(requirementPath, originalRequirement, 'utf8');

  execFileSync('node', [path.join(__dirname, '..', 'feature-requirement-clarification.js'), 'init', taskPath], { encoding: 'utf8' });

  assert.deepStrictEqual(readState(taskPath).clarification, createClarification(originalRequirement));
  assert.match(fs.readFileSync(requirementPath, 'utf8'), /# 原始需求/);
  assert.match(fs.readFileSync(requirementPath, 'utf8'), /包含空格和 \$ 字符/);
});

test('initClarification is idempotent and never resets recorded clarification progress', () => {
  const { taskPath } = makeTask();
  const state = readState(taskPath);
  state.clarification = completeClarification('functional', '保留已确认的需求');
  writeState(taskPath, state);

  const result = initClarification(taskPath);
  const reloaded = readState(taskPath);

  assert.deepStrictEqual(result, reloaded.clarification);
  assert.equal(reloaded.clarification.dimensions.businessGoal.conclusion, 'businessGoal 已确认');
  assert.match(fs.readFileSync(path.join(taskPath, 'inputs', 'requirement.md'), 'utf8'), /businessGoal 已确认/);
});

test('recordConclusion 持久化维度结论、来源与确认时间，并记录历史', () => {
  const clarification = createClarification('新增审批流程');
  recordConclusion(clarification, 'businessGoal', '缩短审批等待时间', [
    { kind: 'knowledge', evidenceId: 'EV-001' },
    { kind: 'user' },
  ], '2026-07-11T09:00:00Z');

  assert.deepStrictEqual(clarification.dimensions.businessGoal, {
    conclusion: '缩短审批等待时间',
    sources: [{ kind: 'knowledge', evidenceId: 'EV-001' }, { kind: 'user' }],
    confirmedAt: '2026-07-11T09:00:00Z',
  });
  assert.equal(clarification.history.length, 1);
});

test('recordConclusion 用 requirementType 确认需求类型', () => {
  const clarification = createClarification('新增 API');
  recordConclusion(clarification, 'requirementType', 'technical', [
    { kind: 'inference', basis: '涉及外部接口' },
    { kind: 'user' },
  ], '2026-07-11T09:00:00Z');

  assert.equal(clarification.requirementType, 'technical');
  assert.deepStrictEqual(clarification.typeSources, [
    { kind: 'inference', basis: '涉及外部接口' },
    { kind: 'user' },
  ]);
  assert.equal(clarification.typeConfirmedAt, '2026-07-11T09:00:00Z');
  assert.equal(clarification.typeConfirmedByUser, true);
});

test('recordConclusion 拒绝空白或含待定措辞的结论', () => {
  const clarification = createClarification('需求');
  for (const conclusion of ['', '  ', '待定', '可能支持导出', '视情况增加缓存']) {
    assert.throws(() => recordConclusion(clarification, 'businessGoal', conclusion, [{ kind: 'user' }], '2026-07-11'), /结论/);
  }
});

test('recordConclusion 校验每种来源所需的证据字段', () => {
  const clarification = createClarification('需求');
  assert.throws(() => recordConclusion(clarification, 'businessGoal', '已确认', [{ kind: 'knowledge' }], '2026-07-11'), /evidenceId/);
  assert.throws(() => recordConclusion(clarification, 'businessGoal', '已确认', [{ kind: 'inference' }], '2026-07-11'), /basis/);
  assert.doesNotThrow(() => recordConclusion(clarification, 'businessGoal', '已确认', [{ kind: 'user' }], '2026-07-11'));
});

test('recordConclusion 要求每个结论包含明确的用户确认来源', () => {
  const clarification = createClarification('需求');
  assert.throws(() => recordConclusion(clarification, 'businessGoal', '已确认', [{ kind: 'knowledge', evidenceId: 'EV-001' }], '2026-07-11'), /user/);
  assert.throws(() => recordConclusion(clarification, 'requirementType', 'technical', [{ kind: 'inference', basis: '接口调用' }], '2026-07-11'), /user/);
  assert.throws(() => recordConclusion(clarification, 'businessGoal', '已确认', [], '2026-07-11'), /user/);
});

test('recordConclusion 拒绝来源中冲突的 type 和 kind', () => {
  const clarification = createClarification('需求');
  assert.throws(() => recordConclusion(clarification, 'businessGoal', '已确认', [
    { type: 'knowledge', kind: 'user', evidenceId: 'EV-1' },
  ], '2026-07-11'), /type.*kind.*不一致/);
});

test('recordTechnicalConclusion 对适用契约及其子字段使用与维度相同的确认规则', () => {
  const clarification = createClarification('新增北向 API');
  const contract = { kind: 'northboundApi', applicable: true, name: '订单 API' };
  clarification.technicalContracts.push(contract);

  assert.throws(() => recordTechnicalConclusion(clarification, contract, 'apiUrl', '可能使用 /v1/orders', [{ kind: 'user' }], '2026-07-11'), /结论/);
  assert.throws(() => recordTechnicalConclusion(clarification, contract, 'apiUrl', '/v1/orders', [{ kind: 'knowledge', evidenceId: 'EV-1' }], '2026-07-11'), /user/);
  recordTechnicalConclusion(clarification, contract, null, '订单同步 API', [{ kind: 'user' }], '2026-07-11');
  recordTechnicalConclusion(clarification, contract, 'apiUrl', '/v1/orders', [{ kind: 'knowledge', evidenceId: 'EV-1' }, { kind: 'user' }], '2026-07-11');

  assert.deepStrictEqual(contract.apiUrl, {
    conclusion: '/v1/orders',
    sources: [{ kind: 'knowledge', evidenceId: 'EV-1' }, { kind: 'user' }],
    confirmedAt: '2026-07-11',
  });
});

test('recordEvidenceGap 记录缺口及历史', () => {
  const clarification = createClarification('需求');
  recordEvidenceGap(clarification, { id: 'GAP-001', description: '尚未提供保留期规则' });

  assert.deepStrictEqual(clarification.evidenceGaps, [{ id: 'GAP-001', description: '尚未提供保留期规则' }]);
  assert.equal(clarification.history[0].action, 'evidence_gap_recorded');
});

test('persistAdoptedEvidence writes an EV snapshot and registry entry while preserving a not_found user conclusion', () => {
  const { taskPath } = makeTask();
  const clarification = createClarification('需求');
  recordEvidenceGap(clarification, { id: 'GAP-001', description: '未找到保留期规则', status: 'not_found', userConclusion: '按 30 天保留' });

  const result = persistAdoptedEvidence(taskPath, clarification, {
    id: 'EV-001', title: '订单保留期', reliability: 'high', content: '现行规则：订单保留 30 天。', adoptedFor: 'businessGoal',
  });

  assert.ok(fs.existsSync(result.snapshotPath));
  assert.match(fs.readFileSync(result.snapshotPath, 'utf8'), /订单保留 30 天/);
  const registry = JSON.parse(fs.readFileSync(path.join(taskPath, 'evidence', 'evidence-registry.json'), 'utf8'));
  assert.deepStrictEqual(registry.evidence[0], { id: 'EV-001', title: '订单保留期', reliability: 'high', adoptedFor: 'businessGoal' });
  assert.deepStrictEqual(clarification.adoptedEvidence, [{ id: 'EV-001', reliability: 'high', adoptedFor: 'businessGoal' }]);
  assert.match(renderRequirementMarkdown(clarification), /userConclusion: 按 30 天保留/);
});

test('planClarificationRecovery returns only the rejected dimension or incomplete and affected dimensions', () => {
  const clarification = completeClarification('functional');
  assert.deepStrictEqual(planClarificationRecovery(clarification, { rejectedDimension: 'acceptanceCriteria' }), ['acceptanceCriteria']);

  delete clarification.dimensions.functionalScope;
  assert.deepStrictEqual(planClarificationRecovery(clarification, { affectedDimensions: ['constraintsAndRisks'] }), [
    'functionalScope', 'constraintsAndRisks',
  ]);
});

test('final confirmation is required after all conclusions and before release', () => {
  const clarification = completeClarification('functional', '需求', false);
  assert.deepStrictEqual(validateClarification(clarification), { complete: false, missing: ['finalConfirmation'] });
  recordFinalConfirmation(clarification, '2026-07-11T12:00:00Z');
  assert.deepStrictEqual(validateClarification(clarification), { complete: true, missing: [] });
});

test('technical impact inventory requires an explicit applicability decision', () => {
  const clarification = completeClarification('technical');
  clarification.noTechnicalImpacts = null;
  clarification.technicalImpacts.push({ id: 'deploy', name: '部署环境' });
  assert.deepStrictEqual(validateClarification(clarification), { complete: false, missing: ['technicalImpacts.deploy'] });

  recordTechnicalImpactDecision(clarification, 'deploy', '部署环境', 'not_applicable', '本次不改变部署环境', [{ kind: 'user' }], '2026-07-11');
  recordFinalConfirmation(clarification, '2026-07-11T12:00:00Z');
  assert.deepStrictEqual(validateClarification(clarification), { complete: true, missing: [] });
});

test('any substantive mutation invalidates final confirmation until the user confirms again', () => {
  const dimension = completeClarification('functional');
  recordConclusion(dimension, 'businessGoal', '更新后的业务目标', [{ kind: 'user' }], '2026-07-11T13:00:00Z');
  assert.deepStrictEqual(validateClarification(dimension), { complete: false, missing: ['finalConfirmation'] });
  recordFinalConfirmation(dimension, '2026-07-11T13:01:00Z');
  assert.deepStrictEqual(validateClarification(dimension), { complete: true, missing: [] });

  const impact = completeClarification('technical');
  recordTechnicalImpactDecision(impact, 'deploy', '部署环境', 'not_applicable', '不改部署', [{ kind: 'user' }], '2026-07-11T13:00:00Z');
  assert.deepStrictEqual(validateClarification(impact), { complete: false, missing: ['finalConfirmation'] });
  recordFinalConfirmation(impact, '2026-07-11T13:01:00Z');

  const contract = completeClarification('technical', '北向 API', false);
  addNorthboundApiContracts(contract, ['apiUrl', 'protocol', 'requestResponse', 'performance']);
  recordFinalConfirmation(contract, '2026-07-11T13:00:00Z');
  recordTechnicalConclusion(contract, contract.technicalContracts[0], 'protocol', 'HTTPS', [{ kind: 'user' }], '2026-07-11T13:01:00Z');
  assert.deepStrictEqual(validateClarification(contract), { complete: false, missing: ['finalConfirmation'] });
  recordFinalConfirmation(contract, '2026-07-11T13:02:00Z');
  assert.deepStrictEqual(validateClarification(contract), { complete: true, missing: [] });
});

test('shouldRequery 检出八类范围变化的中英文反馈', () => {
  for (const feedback of [
    '增加退款业务规则', 'add a business rule', '新增客户业务实体', 'introduce a business entity',
    '接入库存系统', 'connect another system', '新增订单模块', 'add a reporting module',
    '补充 REST API 协议', 'add a webhook interface', '切换通信协议', 'change the protocol',
    '保存审计数据', 'store additional data',
    '增加管理员权限', 'add permission checks', '满足 GDPR 合规', 'meet compliance requirements',
    '支持 10000 QPS 性能', 'improve performance', '提高系统容量', 'increase capacity',
    '部署到生产 Kubernetes 环境', 'change deployment', '切换运行环境', 'use another environment',
  ]) {
    assert.equal(shouldRequery(feedback), true, feedback);
  }
  assert.equal(shouldRequery('把说明文字改得更清楚'), false);
});

test('validateClarification 仅在类型、六个维度和适用技术契约均确认时放行', () => {
  const clarification = completeClarification('technical');
  const contract = { kind: 'api', applicable: true, name: '支付 API' };
  clarification.technicalContracts.push(contract);
  recordTechnicalImpactDecision(clarification, 'payment-api', '支付 API', 'applicable', '需要支付接口', [{ kind: 'user' }], '2026-07-11T10:00:00Z', '支付 API');
  assert.deepStrictEqual(validateClarification(clarification), {
    complete: false,
    missing: ['technicalImpacts.payment-api', 'technicalContracts.支付 API', 'finalConfirmation'],
  });

  recordTechnicalConclusion(clarification, contract, null, '支付 API 契约', [{ kind: 'user' }], '2026-07-11T10:00:00Z');
  recordFinalConfirmation(clarification, '2026-07-11T10:01:00Z');
  assert.deepStrictEqual(validateClarification(clarification), { complete: true, missing: [] });
});

test('validateClarification 不将功能需求的技术契约作为放行条件', () => {
  const clarification = completeClarification('functional');
  clarification.technicalContracts.push({ kind: 'api', applicable: true, name: '不应阻塞的 API' });
  assert.deepStrictEqual(validateClarification(clarification), { complete: true, missing: [] });
});

test('validateClarification 拒绝恢复状态中含歧义、无用户来源或无确认时间的技术契约和字段', () => {
  const invalidItems = [
    contract => { contract.conclusion = '可能支持同步'; },
    contract => { contract.sources = [{ kind: 'knowledge', evidenceId: 'EV-1' }]; },
    contract => { contract.confirmedAt = ''; },
    contract => { contract.protocol.conclusion = '待定'; },
    contract => { contract.requestResponse.sources = []; },
    contract => { contract.performance.confirmedAt = null; },
  ];
  for (const invalidate of invalidItems) {
    const clarification = completeClarification('technical');
    addNorthboundApiContracts(clarification, ['apiUrl', 'protocol', 'requestResponse', 'performance']);
    invalidate(clarification.technicalContracts[0]);
    assert.equal(validateClarification(clarification).complete, false);
  }
});

test('端到端：功能型背景图片需求完成六项结论且无需 API 技术契约后放行', () => {
  const { taskPath } = makeTask();
  const state = readState(taskPath);
  state.clarification = completeClarification('functional', '博客系统添加背景图片自定义功能');

  const { validation, reloadedState, nextAction } = persistClarificationAndResolve(taskPath, state);

  assert.deepStrictEqual(validation, { complete: true, missing: [] });
  assert.equal(reloadedState.clarification.originalRequirement, '博客系统添加背景图片自定义功能');
  assert.deepStrictEqual(reloadedState.clarification.technicalContracts, []);
  for (const field of ['apiUrl', 'protocol', 'requestResponse', 'performance']) {
    assert.equal(Object.hasOwn(reloadedState.clarification, field), false, field);
  }
  assert.equal(reloadedState.status, 'clarified');
  assert.equal(nextAction.skill, 'feature-assess');
});

test('端到端：技术型北向 API 缺任一 URL、协议、请求响应或性能契约时保持澄清门禁', () => {
  for (const missingContract of ['apiUrl', 'protocol', 'requestResponse', 'performance']) {
    const { taskPath } = makeTask();
    const state = readState(taskPath);
    state.clarification = completeClarification('technical');
    addNorthboundApiContracts(state.clarification, ['apiUrl', 'protocol', 'requestResponse', 'performance']
      .filter(contract => contract !== missingContract));

    const { validation, reloadedState, nextAction } = persistClarificationAndResolve(taskPath, state);

    assert.deepStrictEqual(validation, {
      complete: false,
      missing: [`technicalContracts.北向订单 API.${missingContract}`, 'finalConfirmation'],
    }, missingContract);
    assert.equal(reloadedState.status, 'initialized', missingContract);
    assert.equal(nextAction.skill, 'feature-clarify', missingContract);
  }
});

test('端到端：混合型需求同时要求六项功能结论和受影响的北向 API 契约', () => {
  const { taskPath } = makeTask();
  const state = readState(taskPath);
  state.clarification = completeClarification('mixed');
  delete state.clarification.dimensions.acceptanceCriteria;
  addNorthboundApiContracts(state.clarification, ['apiUrl', 'protocol']);

  const { validation, reloadedState, nextAction } = persistClarificationAndResolve(taskPath, state);

  assert.deepStrictEqual(validation, {
    complete: false,
    missing: [
      'dimensions.acceptanceCriteria',
      'technicalContracts.北向订单 API.requestResponse',
      'technicalContracts.北向订单 API.performance',
      'finalConfirmation',
    ],
  });
  assert.equal(reloadedState.status, 'initialized');
  assert.equal(nextAction.skill, 'feature-clarify');
});

test('端到端：完整混合型需求持久化澄清状态并路由到 feature-assess', () => {
  const { taskPath } = makeTask();
  const state = readState(taskPath);
  state.clarification = completeClarification('mixed', '博客系统支持背景图片并提供配置同步 API');
  addNorthboundApiContracts(state.clarification, ['apiUrl', 'protocol', 'requestResponse', 'performance']);
  recordFinalConfirmation(state.clarification, '2026-07-11T10:01:00Z');

  const { validation, reloadedState, nextAction } = persistClarificationAndResolve(taskPath, state);

  assert.deepStrictEqual(validation, { complete: true, missing: [] });
  assert.equal(reloadedState.status, 'clarified');
  assert.equal(nextAction.skill, 'feature-assess');
});

test('validateClarification 拒绝恢复状态中缺少用户确认的类型或结论', () => {
  for (const mutate of [
    clarification => { clarification.dimensions.businessGoal.sources = [{ kind: 'knowledge', evidenceId: 'EV-001' }]; },
    clarification => { clarification.dimensions.businessGoal.sources = []; },
    clarification => { clarification.typeConfirmedByUser = false; },
  ]) {
    const clarification = completeClarification();
    mutate(clarification);
    assert.equal(validateClarification(clarification).complete, false);
  }
});

test('validateClarification 对恢复的结论应用与记录相同的歧义校验', () => {
  const clarification = completeClarification();
  clarification.dimensions.businessGoal.conclusion = '可能支持导出';

  assert.equal(validateClarification(clarification).complete, false);
});

test('validateClarification 拒绝恢复状态中冲突的来源类型标记', () => {
  const clarification = completeClarification();
  clarification.dimensions.businessGoal.sources = [
    { type: 'knowledge', kind: 'user', evidenceId: 'EV-1' },
  ];

  assert.equal(validateClarification(clarification).complete, false);
});

test('validateClarification 仅在类型和全部结论均有用户确认时放行', () => {
  assert.deepStrictEqual(validateClarification(completeClarification()), { complete: true, missing: [] });
});

test('renderRequirementMarkdown 保留原始输入并输出规定标题、证据、缺口和历史', () => {
  const clarification = completeClarification('mixed');
  clarification.typeSources = [{ kind: 'knowledge', evidenceId: 'EV-type' }, { kind: 'user' }];
  recordEvidenceGap(clarification, { id: 'GAP-042', description: '等待接口字段定义', status: 'not_found', reliability: 'low', userResolution: '用户确认按当前字段实现' });
  const contract = { kind: 'api', applicable: true, name: '订单 API' };
  clarification.technicalContracts.push(contract);
  recordTechnicalConclusion(clarification, contract, null, '订单同步契约', [{ kind: 'knowledge', evidenceId: 'EV-API' }, { kind: 'user' }], '2026-07-11T10:00:00Z');
  const markdown = renderRequirementMarkdown(clarification);

  for (const heading of ['# 原始需求', '# 需求澄清', '## 需求类型', '## 结论', '## 知识证据缺口', '## 澄清记录']) {
    assert.ok(markdown.includes(heading), heading);
  }
  assert.ok(markdown.includes('为团队增加可追踪的需求澄清流程'));
  assert.ok(markdown.includes('EV-businessGoal'));
  assert.ok(markdown.includes('EV-type'));
  assert.ok(markdown.includes('订单同步契约'));
  assert.ok(markdown.includes('EV-API'));
  assert.ok(markdown.includes('GAP-042'));
  assert.ok(markdown.includes('not_found'));
  assert.ok(markdown.includes('low'));
  assert.ok(markdown.includes('用户确认按当前字段实现'));
  assert.ok(markdown.includes('requirement_type_confirmed'));
  assert.ok(markdown.includes('evidence_gap_recorded'));
});
