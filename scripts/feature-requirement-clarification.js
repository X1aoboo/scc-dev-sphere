#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { readState, writeState } = require('./devsphere-state');

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
const NORTHBOUND_API_CONTRACTS = ['apiUrl', 'protocol', 'requestResponse', 'performance'];

function createClarification(originalRequirement) {
  return {
    version: 1,
    originalRequirement,
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
  };
}

function validateSources(sources) {
  const normalizedSources = normalizeSources(sources);
  for (const { source, kind } of normalizedSources) {
    if (!['knowledge', 'inference', 'user'].includes(kind)) throw new Error('source 类型无效');
    if (kind === 'knowledge' && !nonBlank(source.evidenceId)) throw new Error('knowledge source 需要 evidenceId');
    if (kind === 'inference' && !nonBlank(source.basis)) throw new Error('inference source 需要 basis');
  }
  if (!hasUserConfirmation(normalizedSources)) throw new Error('结论需要 user source 明确确认');
  return normalizedSources;
}

function normalizeSources(sources) {
  if (!Array.isArray(sources)) throw new Error('sources 必须是数组');
  return sources.map(normalizeSource);
}

function normalizeSource(source) {
  if (!source || typeof source !== 'object') throw new Error('source 必须是对象');
  if (source.type !== undefined && source.kind !== undefined && source.type !== source.kind) {
    throw new Error('source type 和 kind 不一致');
  }
  return { source, kind: source.type ?? source.kind };
}

function hasUserConfirmation(normalizedSources) {
  return normalizedSources.some(({ kind }) => kind === 'user');
}

function hasValidUserConfirmation(sources) {
  try {
    return hasUserConfirmation(validateSources(sources));
  } catch (_) {
    return false;
  }
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isClearConclusion(conclusion) {
  return nonBlank(conclusion) && !AMBIGUOUS_CONCLUSION.test(conclusion);
}

function isConfirmedItem(item) {
  return Boolean(item)
    && isClearConclusion(item.conclusion)
    && hasValidUserConfirmation(item.sources)
    && nonBlank(item.confirmedAt);
}

function createConfirmedItem(conclusion, sources, confirmedAt) {
  if (!isClearConclusion(conclusion)) {
    throw new Error('结论不能为空或含有待定措辞');
  }
  validateSources(sources);
  if (!nonBlank(confirmedAt)) throw new Error('confirmedAt 不能为空');
  return { conclusion, sources, confirmedAt };
}

function invalidateFinalConfirmation(clarification) {
  if (clarification.finalConfirmedAt) {
    clarification.finalConfirmedAt = null;
    clarification.history.push({ action: 'final_confirmation_invalidated' });
  }
}

function recordConclusion(clarification, key, conclusion, sources, confirmedAt) {
  const item = createConfirmedItem(conclusion, sources, confirmedAt);
  invalidateFinalConfirmation(clarification);

  if (key === 'requirementType') {
    if (!REQUIREMENT_TYPES.has(conclusion)) throw new Error('需求类型必须为 functional、technical 或 mixed');
    clarification.requirementType = conclusion;
    clarification.typeSources = sources;
    clarification.typeConfirmedAt = confirmedAt;
    clarification.typeConfirmedByUser = true;
    clarification.history.push({
      action: 'requirement_type_confirmed', conclusion, sources, confirmedAt,
    });
    return clarification;
  }
  if (!DIMENSION_KEYS.includes(key)) throw new Error(`未知澄清维度: ${key}`);

  clarification.dimensions[key] = item;
  clarification.history.push({
    action: 'conclusion_recorded', key, conclusion, sources, confirmedAt,
  });
  return clarification;
}

function recordTechnicalConclusion(clarification, contract, field, conclusion, sources, confirmedAt) {
  if (!clarification.technicalContracts?.includes(contract)) {
    throw new Error('technical contract 必须属于 clarification');
  }
  const item = createConfirmedItem(conclusion, sources, confirmedAt);
  invalidateFinalConfirmation(clarification);
  if (field === null || field === undefined) {
    Object.assign(contract, item);
  } else {
    contract[field] = item;
  }
  clarification.history.push({
    action: 'technical_conclusion_recorded',
    contract: contract.name || contract.kind || 'unnamed', field: field || null, ...item,
  });
  return clarification;
}

function recordEvidenceGap(clarification, gap) {
  invalidateFinalConfirmation(clarification);
  clarification.evidenceGaps.push(gap);
  clarification.history.push({ action: 'evidence_gap_recorded', gap });
  return clarification;
}

function recordTechnicalImpactDecision(clarification, id, name, applicability, conclusion, sources, confirmedAt, contractName) {
  if (!['applicable', 'not_applicable'].includes(applicability)) {
    throw new Error('technical impact applicability 必须为 applicable 或 not_applicable');
  }
  const decision = createConfirmedItem(conclusion, sources, confirmedAt);
  invalidateFinalConfirmation(clarification);
  const impacts = clarification.technicalImpacts || (clarification.technicalImpacts = []);
  const impact = impacts.find(item => item.id === id) || { id, name };
  impact.name = name || impact.name;
  impact.applicability = applicability;
  impact.decision = decision;
  if (contractName) impact.contractName = contractName;
  if (!impacts.includes(impact)) impacts.push(impact);
  clarification.noTechnicalImpacts = null;
  clarification.history.push({ action: 'technical_impact_decided', id, applicability, ...decision });
  return clarification;
}

function confirmNoTechnicalImpacts(clarification, conclusion, sources, confirmedAt) {
  const item = createConfirmedItem(conclusion, sources, confirmedAt);
  invalidateFinalConfirmation(clarification);
  clarification.noTechnicalImpacts = item;
  clarification.history.push({ action: 'no_technical_impacts_confirmed', ...clarification.noTechnicalImpacts });
  return clarification;
}

function recordFinalConfirmation(clarification, confirmedAt) {
  const validation = validateClarification(clarification, { requireFinalConfirmation: false });
  if (!validation.complete) throw new Error(`不能最终确认，缺少: ${validation.missing.join(', ')}`);
  if (!nonBlank(confirmedAt)) throw new Error('finalConfirmedAt 不能为空');
  clarification.finalConfirmedAt = confirmedAt;
  clarification.history.push({ action: 'final_confirmation_recorded', confirmedAt });
  return clarification;
}

function persistAdoptedEvidence(taskPath, clarification, evidence) {
  if (!nonBlank(evidence?.id) || !/^EV-/.test(evidence.id) || !nonBlank(evidence.content)) {
    throw new Error('evidence 需要 EV ID 和 content');
  }
  invalidateFinalConfirmation(clarification);
  const knowledgeDir = path.join(taskPath, 'evidence', 'knowledge');
  const registryPath = path.join(taskPath, 'evidence', 'evidence-registry.json');
  fs.mkdirSync(knowledgeDir, { recursive: true });
  const snapshotPath = path.join(knowledgeDir, `${evidence.id}.md`);
  fs.writeFileSync(snapshotPath, `# ${evidence.title || evidence.id}\n\n${evidence.content}\n`, 'utf8');
  let registry = { evidence: [] };
  if (fs.existsSync(registryPath)) registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  registry.evidence = (registry.evidence || []).filter(item => item.id !== evidence.id);
  const entry = { id: evidence.id, title: evidence.title || evidence.id, reliability: evidence.reliability || 'unknown', adoptedFor: evidence.adoptedFor || 'clarification' };
  registry.evidence.push(entry);
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
  const adopted = clarification.adoptedEvidence || (clarification.adoptedEvidence = []);
  const adoptedEntry = { id: entry.id, reliability: entry.reliability, adoptedFor: entry.adoptedFor };
  const index = adopted.findIndex(item => item.id === entry.id);
  if (index >= 0) adopted[index] = adoptedEntry;
  else adopted.push(adoptedEntry);
  clarification.history.push({ action: 'evidence_adopted', ...adoptedEntry });
  return { snapshotPath, registryPath, entry };
}

function planClarificationRecovery(clarification, { rejectedDimension, affectedDimensions = [] } = {}) {
  if (rejectedDimension) return [rejectedDimension];
  const incomplete = DIMENSION_KEYS.filter(key => !isConfirmedItem(clarification.dimensions?.[key]));
  return [...new Set([...incomplete, ...affectedDimensions])];
}

function shouldRequery(feedback) {
  const text = typeof feedback === 'string' ? feedback : JSON.stringify(feedback || '');
  return /业务规则|业务实体|\bbusiness\s+(?:rule|entity)\b|系统|模块|\b(?:system|module)\b|接口|协议|\b(?:interface|api|protocol)\b|数据|\bdata\b|权限|合规|\bpermissions?\b|\bcompliance\b|性能|容量|\b(?:performance|capacity)\b|部署|环境|\b(?:deployment|environment)\b/i.test(text);
}

function validateClarification(clarification, { requireFinalConfirmation = true } = {}) {
  const missing = [];
  if (!REQUIREMENT_TYPES.has(clarification.requirementType) || !nonBlank(clarification.typeConfirmedAt)
    || clarification.typeConfirmedByUser !== true || !hasValidUserConfirmation(clarification.typeSources)) {
    missing.push('requirementType');
  }
  for (const key of DIMENSION_KEYS) {
    const dimension = clarification.dimensions && clarification.dimensions[key];
    if (!isConfirmedItem(dimension)) {
      missing.push(`dimensions.${key}`);
    }
  }
  if (clarification.requirementType !== 'functional') {
    const impacts = clarification.technicalImpacts || [];
    const contracts = clarification.technicalContracts || [];
    if (impacts.length === 0 && (!isConfirmedItem(clarification.noTechnicalImpacts) || contracts.some(contract => contract.applicable === true))) {
      missing.push('technicalImpacts');
    }
    for (const impact of impacts) {
      if (!['applicable', 'not_applicable'].includes(impact.applicability) || !isConfirmedItem(impact.decision)) {
        missing.push(`technicalImpacts.${impact.id || impact.name || 'unnamed'}`);
        continue;
      }
      if (impact.applicability === 'applicable') {
        const contract = (clarification.technicalContracts || []).find(item => item.name === impact.contractName || item.impactId === impact.id);
        if (!contract || !isConfirmedItem(contract)) missing.push(`technicalImpacts.${impact.id || impact.name || 'unnamed'}`);
      }
    }
    for (const contract of contracts) {
      if (contract.applicable !== true) continue;
      const contractName = contract.name || contract.kind || 'unnamed';
      if (!isConfirmedItem(contract)) {
        missing.push(`technicalContracts.${contractName}`);
      }
      if (contract.kind === 'northboundApi') {
        for (const field of NORTHBOUND_API_CONTRACTS) {
          if (!isConfirmedItem(contract[field])) {
            missing.push(`technicalContracts.${contractName}.${field}`);
          }
        }
      }
    }
  }
  if (requireFinalConfirmation && !nonBlank(clarification.finalConfirmedAt)) missing.push('finalConfirmation');
  return { complete: missing.length === 0, missing };
}

function formatSource(source) {
  const { kind } = normalizeSource(source);
  if (kind === 'knowledge') return `knowledge: ${source.evidenceId}`;
  if (kind === 'inference') return `inference: ${source.basis}`;
  return 'user';
}

function formatGap(gap) {
  if (typeof gap === 'string') return gap;
  return [
    `${gap.id || 'GAP'}: ${gap.description || JSON.stringify(gap)}`,
    gap.status && `status: ${gap.status}`,
    gap.reliability && `reliability: ${gap.reliability}`,
    gap.userResolution && `userResolution: ${gap.userResolution}`,
    gap.userConclusion && `userConclusion: ${gap.userConclusion}`,
  ].filter(Boolean).join('; ');
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
    `  - 来源: ${(clarification.typeSources || []).map(formatSource).join('; ') || '未确认'}`,
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
  lines.push('', '## 技术契约', '');
  if ((clarification.technicalContracts || []).length === 0) lines.push('- 无');
  else for (const contract of clarification.technicalContracts) {
    const name = contract.name || contract.kind || 'unnamed';
    lines.push(`- ${name}: ${contract.conclusion || '未确认'}`);
    lines.push(`  - 来源: ${(contract.sources || []).map(formatSource).join('; ') || '未确认'}`);
    lines.push(`  - 确认时间: ${contract.confirmedAt || '未确认'}`);
    if (contract.kind === 'northboundApi') {
      for (const field of NORTHBOUND_API_CONTRACTS) {
        const item = contract[field];
        lines.push(`  - ${field}: ${item?.conclusion || '未确认'}`);
        lines.push(`    - 来源: ${(item?.sources || []).map(formatSource).join('; ') || '未确认'}`);
        lines.push(`    - 确认时间: ${item?.confirmedAt || '未确认'}`);
      }
    }
  }
  lines.push('', '## 技术影响清单', '');
  if ((clarification.technicalImpacts || []).length === 0) {
    lines.push(`- 无: ${clarification.noTechnicalImpacts?.conclusion || '未确认'}`);
  } else for (const impact of clarification.technicalImpacts) {
    lines.push(`- ${impact.name || impact.id}: ${impact.applicability || '未确认'}；${impact.decision?.conclusion || '未确认'}`);
  }
  lines.push('', '## 知识证据缺口', '');
  if ((clarification.evidenceGaps || []).length === 0) lines.push('- 无');
  else clarification.evidenceGaps.forEach(gap => lines.push(`- ${formatGap(gap)}`));

  lines.push('', '## 澄清记录', '');
  if ((clarification.history || []).length === 0) lines.push('- 无');
  else clarification.history.forEach(item => lines.push(`- ${JSON.stringify(item)}`));
  lines.push('', `## 最终确认\n\n- ${clarification.finalConfirmedAt || '未确认'}`);
  return `${lines.join('\n')}\n`;
}

function initClarification(taskPath) {
  const requirementPath = path.join(taskPath, 'inputs', 'requirement.md');
  const state = readState(taskPath);
  if (!state) throw new Error(`State not found at ${taskPath}`);
  const clarification = state.clarification || createClarification(fs.readFileSync(requirementPath, 'utf8'));
  if (!state.clarification) {
    state.clarification = clarification;
    writeState(taskPath, state);
  }
  fs.writeFileSync(requirementPath, renderRequirementMarkdown(clarification), 'utf8');
  return clarification;
}

function main() {
  const [command, taskPath] = process.argv.slice(2);
  try {
    if (command !== 'init' || !taskPath) {
      throw new Error('Usage: feature-requirement-clarification.js init <taskPath>');
    }
    const clarification = initClarification(taskPath);
    process.stdout.write(JSON.stringify({ taskPath, clarification }));
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
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
};
