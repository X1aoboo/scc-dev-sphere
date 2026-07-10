#!/usr/bin/env node
'use strict';

const DIMENSION_KEYS = [
  'businessGoal',
  'usersAndScenarios',
  'functionalScope',
  'nonGoalsAndBoundaries',
  'acceptanceCriteria',
  'constraintsAndRisks',
];
const REQUIREMENT_TYPES = new Set(['functional', 'technical', 'mixed']);
const AMBIGUOUS_CONCLUSION = /待定|可能|视情况/;

function createClarification(originalRequirement) {
  return {
    version: 1,
    originalRequirement,
    requirementType: null,
    typeConfirmedAt: null,
    dimensions: {},
    technicalContracts: [],
    evidenceGaps: [],
    history: [],
  };
}

function validateSources(sources) {
  if (!Array.isArray(sources)) throw new Error('sources 必须是数组');
  for (const source of sources) {
    if (!source || typeof source !== 'object') throw new Error('source 必须是对象');
    const kind = source.type || source.kind;
    if (!['knowledge', 'inference', 'user'].includes(kind)) throw new Error('source 类型无效');
    if (kind === 'knowledge' && !nonBlank(source.evidenceId)) throw new Error('knowledge source 需要 evidenceId');
    if (kind === 'inference' && !nonBlank(source.basis)) throw new Error('inference source 需要 basis');
  }
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function recordConclusion(clarification, key, conclusion, sources, confirmedAt) {
  if (!nonBlank(conclusion) || AMBIGUOUS_CONCLUSION.test(conclusion)) {
    throw new Error('结论不能为空或含有待定措辞');
  }
  validateSources(sources);
  if (!nonBlank(confirmedAt)) throw new Error('confirmedAt 不能为空');

  if (key === 'requirementType') {
    if (!REQUIREMENT_TYPES.has(conclusion)) throw new Error('需求类型必须为 functional、technical 或 mixed');
    clarification.requirementType = conclusion;
    clarification.typeConfirmedAt = confirmedAt;
    clarification.history.push({
      action: 'requirement_type_confirmed', conclusion, sources, confirmedAt,
    });
    return clarification;
  }
  if (!DIMENSION_KEYS.includes(key)) throw new Error(`未知澄清维度: ${key}`);

  clarification.dimensions[key] = { conclusion, sources, confirmedAt };
  clarification.history.push({
    action: 'conclusion_recorded', key, conclusion, sources, confirmedAt,
  });
  return clarification;
}

function recordEvidenceGap(clarification, gap) {
  clarification.evidenceGaps.push(gap);
  clarification.history.push({ action: 'evidence_gap_recorded', gap });
  return clarification;
}

function shouldRequery(feedback) {
  const text = typeof feedback === 'string' ? feedback : JSON.stringify(feedback || '');
  return /业务规则|业务实体|实体|system|系统|模块|module|接口|API|api|协议|protocol|数据|data|权限|permission|合规|compliance|性能|performance|容量|capacity|部署|deploy|环境|environment/i.test(text);
}

function validateClarification(clarification) {
  const missing = [];
  if (!REQUIREMENT_TYPES.has(clarification.requirementType) || !nonBlank(clarification.typeConfirmedAt)) {
    missing.push('requirementType');
  }
  for (const key of DIMENSION_KEYS) {
    const dimension = clarification.dimensions && clarification.dimensions[key];
    if (!dimension || !nonBlank(dimension.conclusion) || !Array.isArray(dimension.sources) || !nonBlank(dimension.confirmedAt)) {
      missing.push(`dimensions.${key}`);
    }
  }
  if (clarification.requirementType !== 'functional') {
    for (const contract of clarification.technicalContracts || []) {
      if (contract.applicable === true && !nonBlank(contract.confirmedAt)) {
        missing.push(`technicalContracts.${contract.name || contract.kind || 'unnamed'}`);
      }
    }
  }
  return { complete: missing.length === 0, missing };
}

function formatSource(source) {
  const kind = source.type || source.kind;
  if (kind === 'knowledge') return `knowledge: ${source.evidenceId}`;
  if (kind === 'inference') return `inference: ${source.basis}`;
  return 'user';
}

function formatGap(gap) {
  if (typeof gap === 'string') return gap;
  return `${gap.id || 'GAP'}: ${gap.description || JSON.stringify(gap)}`;
}

function renderRequirementMarkdown(clarification) {
  const lines = [
    '# 原始需求',
    '',
    String(clarification.originalRequirement),
    '',
    '# 需求澄清',
    '',
    '## 需求类型',
    '',
    `- ${clarification.requirementType || '未确认'}${clarification.typeConfirmedAt ? `（${clarification.typeConfirmedAt}）` : ''}`,
    '',
    '## 结论',
    '',
  ];
  for (const key of DIMENSION_KEYS) {
    const dimension = clarification.dimensions && clarification.dimensions[key];
    if (!dimension) {
      lines.push(`- ${key}: 未确认`);
      continue;
    }
    lines.push(`- ${key}: ${dimension.conclusion}`);
    lines.push(`  - 来源: ${dimension.sources.map(formatSource).join('; ')}`);
    lines.push(`  - 确认时间: ${dimension.confirmedAt}`);
  }
  lines.push('', '## 知识证据缺口', '');
  if ((clarification.evidenceGaps || []).length === 0) lines.push('- 无');
  else clarification.evidenceGaps.forEach(gap => lines.push(`- ${formatGap(gap)}`));

  lines.push('', '## 澄清记录', '');
  if ((clarification.history || []).length === 0) lines.push('- 无');
  else clarification.history.forEach(item => lines.push(`- ${JSON.stringify(item)}`));
  return `${lines.join('\n')}\n`;
}

module.exports = {
  createClarification,
  recordConclusion,
  recordEvidenceGap,
  shouldRequery,
  validateClarification,
  renderRequirementMarkdown,
};
