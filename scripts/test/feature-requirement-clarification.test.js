'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createClarification,
  recordConclusion,
  recordEvidenceGap,
  shouldRequery,
  validateClarification,
  renderRequirementMarkdown,
} = require('../feature-requirement-clarification');

const DIMENSIONS = [
  'businessGoal',
  'usersAndScenarios',
  'functionalScope',
  'nonGoalsAndBoundaries',
  'acceptanceCriteria',
  'constraintsAndRisks',
];

function completeClarification(type = 'functional') {
  const clarification = createClarification('为团队增加可追踪的需求澄清流程');
  recordConclusion(clarification, 'requirementType', type, [{ kind: 'user' }], '2026-07-11T09:00:00Z');
  for (const key of DIMENSIONS) {
    recordConclusion(clarification, key, `${key} 已确认`, [{ kind: 'knowledge', evidenceId: `EV-${key}` }], '2026-07-11T09:01:00Z');
  }
  return clarification;
}

test('createClarification 建立完整的初始状态', () => {
  const clarification = createClarification('  保留这段原始输入  ');

  assert.deepStrictEqual(clarification, {
    version: 1,
    originalRequirement: '  保留这段原始输入  ',
    requirementType: null,
    typeConfirmedAt: null,
    dimensions: {},
    technicalContracts: [],
    evidenceGaps: [],
    history: [],
  });
});

test('recordConclusion 持久化维度结论、来源与确认时间，并记录历史', () => {
  const clarification = createClarification('新增审批流程');
  recordConclusion(clarification, 'businessGoal', '缩短审批等待时间', [{ kind: 'knowledge', evidenceId: 'EV-001' }], '2026-07-11T09:00:00Z');

  assert.deepStrictEqual(clarification.dimensions.businessGoal, {
    conclusion: '缩短审批等待时间',
    sources: [{ kind: 'knowledge', evidenceId: 'EV-001' }],
    confirmedAt: '2026-07-11T09:00:00Z',
  });
  assert.equal(clarification.history.length, 1);
});

test('recordConclusion 用 requirementType 确认需求类型', () => {
  const clarification = createClarification('新增 API');
  recordConclusion(clarification, 'requirementType', 'technical', [{ kind: 'inference', basis: '涉及外部接口' }], '2026-07-11T09:00:00Z');

  assert.equal(clarification.requirementType, 'technical');
  assert.equal(clarification.typeConfirmedAt, '2026-07-11T09:00:00Z');
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

test('recordEvidenceGap 记录缺口及历史', () => {
  const clarification = createClarification('需求');
  recordEvidenceGap(clarification, { id: 'GAP-001', description: '尚未提供保留期规则' });

  assert.deepStrictEqual(clarification.evidenceGaps, [{ id: 'GAP-001', description: '尚未提供保留期规则' }]);
  assert.equal(clarification.history[0].action, 'evidence_gap_recorded');
});

test('shouldRequery 检出会引入关键范围的反馈', () => {
  for (const feedback of ['增加退款业务规则', '接入库存系统', '补充 REST API 协议', '保存审计数据', '增加管理员权限', '满足 GDPR 合规', '支持 10000 QPS 性能', '部署到生产 Kubernetes 环境']) {
    assert.equal(shouldRequery(feedback), true, feedback);
  }
  assert.equal(shouldRequery('把说明文字改得更清楚'), false);
});

test('validateClarification 仅在类型、六个维度和适用技术契约均确认时放行', () => {
  const clarification = completeClarification('technical');
  clarification.technicalContracts.push({ kind: 'api', applicable: true, name: '支付 API' });
  assert.deepStrictEqual(validateClarification(clarification), {
    complete: false,
    missing: ['technicalContracts.支付 API'],
  });

  clarification.technicalContracts[0].confirmedAt = '2026-07-11T10:00:00Z';
  assert.deepStrictEqual(validateClarification(clarification), { complete: true, missing: [] });
});

test('validateClarification 不将功能需求的技术契约作为放行条件', () => {
  const clarification = completeClarification('functional');
  clarification.technicalContracts.push({ kind: 'api', applicable: true, name: '不应阻塞的 API' });
  assert.deepStrictEqual(validateClarification(clarification), { complete: true, missing: [] });
});

test('renderRequirementMarkdown 保留原始输入并输出规定标题、证据、缺口和历史', () => {
  const clarification = completeClarification('mixed');
  recordEvidenceGap(clarification, { id: 'GAP-042', description: '等待接口字段定义' });
  clarification.technicalContracts.push({ kind: 'api', applicable: true, name: '订单 API', confirmedAt: '2026-07-11T10:00:00Z' });
  const markdown = renderRequirementMarkdown(clarification);

  for (const heading of ['# 原始需求', '# 需求澄清', '## 需求类型', '## 结论', '## 知识证据缺口', '## 澄清记录']) {
    assert.ok(markdown.includes(heading), heading);
  }
  assert.ok(markdown.includes('为团队增加可追踪的需求澄清流程'));
  assert.ok(markdown.includes('EV-businessGoal'));
  assert.ok(markdown.includes('GAP-042'));
  assert.ok(markdown.includes('requirement_type_confirmed'));
  assert.ok(markdown.includes('evidence_gap_recorded'));
});
