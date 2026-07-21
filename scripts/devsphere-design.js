#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJSON, writeJSON, readState, writeState } = require('./devsphere-state');

const DESIGN_TYPES = {
  businessDesign: {
    slug: 'business-design',
    artifactPrefix: 'BD',
    documentTitle: 'Business Design',
    exactSectionOrder: true,
    coreSections: [
      '概述',
      '需求基线与业务设计范围',
      '业务目标态总览',
      '业务概念、对象与度量语义',
      '业务参与者、责任与适用范围',
      '业务场景与业务行为',
      '业务规则与判定逻辑',
      '时间、状态与生命周期语义',
      '异常、边界与业务结果',
      '关键业务决策、约束与风险',
      '业务验收与需求追溯',
      '下游设计约束与交接',
      '词汇表',
      '参考资料',
    ],
    applicabilityItems: [],
  },
  solutionDesign: {
    slug: 'solution-design',
    artifactPrefix: 'SD',
    coreSections: [
      '概述',
      '特性需求与设计上下文',
      '总体方案',
      '4+1 架构视图',
      '接口与集成设计',
      '数据设计',
      '可靠性、可用性与功能安全设计',
      '安全、隐私与韧性设计',
      '非功能质量属性设计',
      '关键技术决策、取舍与风险',
      '下游设计约束与交接',
      '需求追溯与覆盖关系',
      '词汇表',
      '参考资料',
    ],
    requiredSubsections: {
      '4+1 架构视图': ['场景视图', '逻辑视图', '进程视图', '开发视图', '物理视图'],
    },
    applicabilityItems: [],
  },
  implementationDesign: {
    slug: 'implementation-design',
    artifactPrefix: 'IMPL',
    coreSections: ['实现范围与代码影响', '模块接口与调用链', '错误、并发与数据一致性', '迁移、回滚与可测试性', '适用性说明', '关联设计与交接'],
    applicabilityItems: ['并发', '迁移', '运维', '资源约束'],
  },
  testDesign: {
    slug: 'test-design',
    artifactPrefix: 'TD',
    coreSections: ['风险与测试范围', '测试策略与场景', '数据、环境与自动化', '不可测项与转测准入', '适用性说明', '关联设计与交接'],
    applicabilityItems: ['安全', '性能', '兼容性', '迁移外部集成'],
  },
};

const DESIGN_TYPE_KEYS = Object.keys(DESIGN_TYPES);
const DESIGN_SLUGS = Object.fromEntries(
  Object.entries(DESIGN_TYPES).map(([designType, definition]) => [designType, definition.slug]),
);

function definitionFor(designType) {
  const definition = DESIGN_TYPES[designType];
  if (!definition) throw new Error(`Unknown design type: ${designType}`);
  return definition;
}

function requiredDesignTypes(taskPath) {
  const state = readState(taskPath);
  if (!state) throw new Error('State file not found');
  const required = state.requiredDesignTypes;
  if (!Array.isArray(required) || required.length === 0) {
    throw new Error('state.requiredDesignTypes must contain at least one design type');
  }
  if (new Set(required).size !== required.length) throw new Error('state.requiredDesignTypes contains duplicates');
  for (const designType of required) definitionFor(designType);
  return required;
}

function designDir(taskPath, designType) {
  return path.join(taskPath, 'work', definitionFor(designType).slug);
}

function draftPath(taskPath, designType) {
  return path.join(designDir(taskPath, designType), 'draft.md');
}

function notesPath(taskPath, designType) {
  return path.join(designDir(taskPath, designType), 'notes.md');
}

function artifactPath(taskPath, designType) {
  return path.join(taskPath, 'artifacts', `${definitionFor(designType).slug}.md`);
}

function lintPath(taskPath, designType) {
  return path.join(taskPath, 'quality-gates', `${definitionFor(designType).slug}-lint.json`);
}

function reviewSummaryPath(taskPath, designType) {
  return path.join(taskPath, 'reviews', definitionFor(designType).slug, 'summary.json');
}

function approvalPath(taskPath, designType) {
  return path.join(taskPath, 'approvals', `${definitionFor(designType).slug}.json`);
}

function sha256Buffer(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function semanticHash(raw) {
  const normalized = raw
    .replace(/<!--([\s\S]*?)-->/g, '')
    .split('\n')
    .map(line => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('\n');
  return sha256Buffer(Buffer.from(normalized));
}

function parseFrontmatter(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fields = match[1].split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (fields.length !== 2 || !fields.some(line => /^artifactId:/.test(line)) || !fields.some(line => /^version:/.test(line))) {
    return null;
  }
  const artifactId = match[1].match(/^artifactId:\s*["']?([^"'\n]+)["']?/m);
  const version = match[1].match(/^version:\s*["']?([^"'\n]+)["']?/m);
  if (!artifactId || !version) return null;
  return { artifactId: artifactId[1].trim(), version: version[1].trim() };
}

function readDraftRef(taskPath, designType) {
  const file = draftPath(taskPath, designType);
  const frontmatter = parseFrontmatter(file);
  if (!frontmatter) return null;
  const raw = fs.readFileSync(file, 'utf8');
  return {
    ...frontmatter,
    hash: sha256Buffer(Buffer.from(raw)),
    semanticHash: semanticHash(raw),
  };
}

function readArtifactRef(taskPath, designType) {
  const file = artifactPath(taskPath, designType);
  const frontmatter = parseFrontmatter(file);
  if (!frontmatter) return null;
  const state = readState(taskPath);
  const definition = definitionFor(designType);
  if (
    !state
    || frontmatter.artifactId !== `${definition.artifactPrefix}-${state.taskId}`
    || !/^\d+\.\d+\.\d+$/.test(frontmatter.version)
  ) return null;
  return { ...frontmatter, hash: sha256File(file) };
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function inspectDesign(taskPath, designType) {
  definitionFor(designType);
  const draft = readDraftRef(taskPath, designType);
  const artifact = readArtifactRef(taskPath, designType);
  const lint = readJSON(lintPath(taskPath, designType));
  const review = readJSON(reviewSummaryPath(taskPath, designType));
  const approval = readJSON(approvalPath(taskPath, designType));
  const hasWork = fileExists(notesPath(taskPath, designType)) || fileExists(draftPath(taskPath, designType));
  const lintValid = Boolean(draft && lint && lint.status === 'pass' && lint.draftHash === draft.hash);
  const reviewValid = Boolean(draft && review && review.status === 'pass' && review.draftHash === draft.hash);
  const approvalValid = Boolean(draft && approval && approval.approvedBy === 'human' && approval.draftHash === draft.hash);

  if (draft && artifact && draft.hash !== artifact.hash) {
    return {
      designType,
      slug: definitionFor(designType).slug,
      recovery: 'needs_user_confirmation',
      reason: 'Draft and Baseline both exist with different content; confirm whether this design was intentionally reopened.',
      hasWork,
      draft,
      artifact,
      lint: { valid: lintValid },
      review: { valid: reviewValid },
      approval: { valid: approvalValid },
    };
  }
  if (artifact) {
    return {
      designType,
      slug: definitionFor(designType).slug,
      recovery: 'baseline_complete',
      hasWork,
      artifact,
      lint: { valid: true },
      review: { valid: true },
      approval: { valid: Boolean(approval && approval.approvedBy === 'human' && approval.draftHash === artifact.hash) },
    };
  }
  if (!draft) {
    return {
      designType,
      slug: definitionFor(designType).slug,
      recovery: hasWork ? 'resume_collaboration' : 'not_started',
      reason: hasWork ? 'Resume from work notes and user-confirmed design.' : 'No persisted work exists for this design type.',
      hasWork,
      lint: { valid: false },
      review: { valid: false },
      approval: { valid: false },
    };
  }
  return {
    designType,
    slug: definitionFor(designType).slug,
    recovery: 'resume_from_draft',
    hasWork,
    draft,
    lint: { valid: lintValid },
    review: { valid: reviewValid },
    approval: { valid: approvalValid },
  };
}

function inspectWorkspace(taskPath, requestedDesignType) {
  const designs = Object.fromEntries(DESIGN_TYPE_KEYS.map(designType => [designType, inspectDesign(taskPath, designType)]));
  const conflicts = DESIGN_TYPE_KEYS.filter(designType => designs[designType].recovery === 'needs_user_confirmation');
  const active = DESIGN_TYPE_KEYS.filter(designType => ['resume_collaboration', 'resume_from_draft'].includes(designs[designType].recovery));
  const completed = DESIGN_TYPE_KEYS.filter(designType => designs[designType].recovery === 'baseline_complete');

  if (requestedDesignType) {
    definitionFor(requestedDesignType);
    return {
      recovery: conflicts.includes(requestedDesignType) ? 'needs_user_confirmation' : 'design_identified',
      designType: requestedDesignType,
      design: designs[requestedDesignType],
      conflicts,
      active,
      completed,
      requiredDesignTypes: requiredDesignTypes(taskPath),
    };
  }
  if (conflicts.length || active.length > 1) {
    return {
      recovery: 'needs_user_confirmation',
      reason: conflicts.length ? 'Persisted Draft and Baseline facts conflict.' : 'Multiple unfinished design activities exist.',
      candidates: [...new Set([...conflicts, ...active])],
      designs,
      completed,
      requiredDesignTypes: requiredDesignTypes(taskPath),
    };
  }
  if (active.length === 1) {
    return {
      recovery: 'design_inferred',
      designType: active[0],
      design: designs[active[0]],
      completed,
      requiredDesignTypes: requiredDesignTypes(taskPath),
    };
  }
  return {
    recovery: 'needs_design_selection',
    reason: 'No unfinished design activity can be inferred from persisted work; use the current user goal or caller context.',
    completed,
    availableDesignTypes: DESIGN_TYPE_KEYS,
    requiredDesignTypes: requiredDesignTypes(taskPath),
  };
}

function initDesign(taskPath, designType) {
  const definition = definitionFor(designType);
  const dir = designDir(taskPath, designType);
  fs.mkdirSync(dir, { recursive: true });
  const notes = notesPath(taskPath, designType);
  if (!fs.existsSync(notes)) {
    fs.writeFileSync(notes, '# 设计工作笔记\n\n保存恢复所需的事实、已确认设计和开放事项。\n', 'utf8');
  }
  return {
    designType,
    slug: definition.slug,
    dir,
    notes,
    draft: draftPath(taskPath, designType),
    guide: `skills/feature-design/references/design-guides/${definition.slug}.md`,
    spec: `skills/feature-design/references/specs/${definition.slug}.md`,
  };
}

function extractSection(raw, heading) {
  const marker = `## ${heading}`;
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex(line => line.trimEnd() === marker);
  if (start < 0) return '';
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n').trim();
}

function extractSubsection(raw, parentHeading, heading) {
  const parent = extractSection(raw, parentHeading);
  if (!parent) return '';
  const marker = `### ${heading}`;
  const lines = parent.split(/\r?\n/);
  const start = lines.findIndex(line => line.trimEnd() === marker);
  if (start < 0) return '';
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^###\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n').trim();
}

function extractLevelTwoHeadings(raw) {
  return raw.split(/\r?\n/)
    .map(line => line.match(/^##\s+([^#].*?)\s*$/))
    .filter(Boolean)
    .map(match => match[1]);
}

function hasSubstantiveSectionContent(content) {
  const normalized = content
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, '')
    .replace(/[。；;.]$/u, '');
  return Boolean(normalized) && !['无', '不适用', '沿用现状'].includes(normalized);
}

function checklistPath(checklistId) {
  return path.join(__dirname, '..', 'skills', 'feature-design', 'references', 'review-checklists', `${checklistId}.md`);
}

function lintDraft(taskPath, designType) {
  const definition = definitionFor(designType);
  const file = draftPath(taskPath, designType);
  if (!fs.existsSync(file)) throw new Error(`Draft not found: ${file}`);
  const raw = fs.readFileSync(file, 'utf8');
  const draftRef = readDraftRef(taskPath, designType);
  const state = readState(taskPath);
  const frontmatter = parseFrontmatter(file);
  const checks = [];

  checks.push({
    code: 'frontmatter',
    result: frontmatter ? 'pass' : 'fail',
  });
  checks.push({
    code: 'artifact id',
    result: frontmatter && state && frontmatter.artifactId === `${definition.artifactPrefix}-${state.taskId}` ? 'pass' : 'fail',
  });
  checks.push({
    code: 'version',
    result: frontmatter && /^\d+\.\d+\.\d+$/.test(frontmatter.version) ? 'pass' : 'fail',
  });
  checks.push({
    code: 'placeholder',
    result: /<[^>]+>|\{\{[^}]+\}\}|\b(?:TODO|TBD)\b/i.test(raw) ? 'fail' : 'pass',
  });
  if (definition.documentTitle) {
    const titles = raw.split(/\r?\n/).filter(line => /^#\s+/.test(line));
    checks.push({
      code: 'document title',
      result: titles.length === 1 && titles[0].trim() === `# ${definition.documentTitle}` ? 'pass' : 'fail',
    });
  }
  if (definition.exactSectionOrder) {
    const headings = extractLevelTwoHeadings(raw);
    checks.push({
      code: 'core section order',
      result: headings.length === definition.coreSections.length
        && headings.every((heading, index) => heading === definition.coreSections[index])
        ? 'pass'
        : 'fail',
    });
  }
  for (const section of definition.coreSections) {
    const content = extractSection(raw, section);
    checks.push({
      code: `core section:${section}`,
      result: hasSubstantiveSectionContent(content) ? 'pass' : 'fail',
    });
  }
  for (const [parent, subsections] of Object.entries(definition.requiredSubsections || {})) {
    for (const subsection of subsections) {
      checks.push({
        code: `required subsection:${parent}/${subsection}`,
        result: extractSubsection(raw, parent, subsection) ? 'pass' : 'fail',
      });
    }
  }
  const applicability = extractSection(raw, '适用性说明');
  for (const item of definition.applicabilityItems) {
    const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const decision = applicability.split(/\r?\n/).find(line => new RegExp(`^-\\s*${escaped}[：:]`).test(line.trim()));
    checks.push({
      code: `applicability:${item}`,
      result: decision && new RegExp(`^-\\s*${escaped}[：:]\\s*(生成|不适用)[：:]\\s*\\S+`).test(decision.trim()) ? 'pass' : 'fail',
    });
  }

  const result = {
    designType,
    draftHash: draftRef ? draftRef.hash : sha256Buffer(Buffer.from(raw)),
    semanticHash: semanticHash(raw),
    status: checks.some(check => check.result === 'fail') ? 'fail' : 'pass',
    checks,
  };
  writeJSON(lintPath(taskPath, designType), result);
  return result;
}

function validateFinding(finding) {
  if (!finding || !['blocking', 'advisory', 'risk'].includes(finding.type)) {
    throw new Error('Review finding type must be blocking|advisory|risk');
  }
  if (!finding.location || !finding.issue || !finding.impact || !finding.recommendation) {
    throw new Error('Review finding requires location, issue, impact, and recommendation');
  }
}

function recordReview(taskPath, designType, input) {
  definitionFor(designType);
  const draft = readDraftRef(taskPath, designType);
  const lint = readJSON(lintPath(taskPath, designType));
  if (!draft) throw new Error(`No valid Draft for ${designType}`);
  if (!lint || lint.status !== 'pass' || lint.draftHash !== draft.hash) {
    throw new Error('Current Draft must pass deterministic lint before review');
  }
  if (!input || input.draftHash !== draft.hash) throw new Error('Review summary does not bind the current Draft');
  if (!Array.isArray(input.checklists) || input.checklists.length === 0) {
    throw new Error('Review summary requires at least one executed checklist');
  }
  const checklistIds = input.checklists.map(item => item.checklistId);
  if (new Set(checklistIds).size !== checklistIds.length) throw new Error('Review summary contains duplicate checklists');
  const findings = [];
  for (const checklist of input.checklists) {
    if (!checklist.checklistId || !['pass', 'findings'].includes(checklist.result)) {
      throw new Error('Checklist result must contain checklistId and pass|findings');
    }
    if (!fs.existsSync(checklistPath(checklist.checklistId))) {
      throw new Error(`Review checklist not found: ${checklist.checklistId}`);
    }
    const checklistFindings = checklist.findings || [];
    for (const finding of checklistFindings) validateFinding(finding);
    if (checklist.result === 'pass' && checklistFindings.length) {
      throw new Error(`Passing checklist cannot contain findings: ${checklist.checklistId}`);
    }
    findings.push(...checklistFindings.map(finding => ({ checklistId: checklist.checklistId, ...finding })));
  }
  const notApplicable = input.notApplicable || [];
  for (const item of notApplicable) {
    if (!item.checklistId || !item.reason) throw new Error('Not-applicable checklist requires checklistId and reason');
    if (!fs.existsSync(checklistPath(item.checklistId))) throw new Error(`Review checklist not found: ${item.checklistId}`);
  }
  const summary = {
    designType,
    draftHash: draft.hash,
    semanticHash: draft.semanticHash,
    status: findings.some(finding => finding.type === 'blocking') ? 'blocked' : 'pass',
    checklists: input.checklists.map(item => ({
      checklistId: item.checklistId,
      result: item.result,
      summary: item.summary || '',
    })),
    notApplicable,
    findings,
  };
  writeJSON(reviewSummaryPath(taskPath, designType), summary);
  return summary;
}

function refreshFormattingReview(taskPath, designType) {
  const draft = readDraftRef(taskPath, designType);
  const lint = readJSON(lintPath(taskPath, designType));
  const summary = readJSON(reviewSummaryPath(taskPath, designType));
  if (!draft || !lint || lint.status !== 'pass' || lint.draftHash !== draft.hash) {
    throw new Error('Current Draft must pass lint');
  }
  if (!summary || summary.semanticHash !== draft.semanticHash || summary.status !== 'pass') {
    throw new Error('Change is semantic; all applicable reviews must run again');
  }
  summary.draftHash = draft.hash;
  summary.formattingRefresh = true;
  writeJSON(reviewSummaryPath(taskPath, designType), summary);
  return summary;
}

function approveCurrentDesign(taskPath, designType, approval) {
  const status = inspectDesign(taskPath, designType);
  if (!status.draft || !status.lint.valid || !status.review.valid) {
    throw new Error('Current Draft does not have passing lint and review');
  }
  if (!approval || approval.approvedBy !== 'human') throw new Error('Design approval must be human');
  const record = {
    designType,
    draftHash: status.draft.hash,
    approvedBy: 'human',
    acceptedRisks: approval.acceptedRisks || [],
    summary: approval.summary || '',
    approvedAt: new Date().toISOString(),
  };
  writeJSON(approvalPath(taskPath, designType), record);
  return record;
}

function designReady(taskPath) {
  const required = requiredDesignTypes(taskPath);
  const artifacts = {};
  const approvals = {};
  const issues = [];
  for (const designType of required) {
    const artifact = readArtifactRef(taskPath, designType);
    const approval = readJSON(approvalPath(taskPath, designType));
    if (!artifact) {
      issues.push(`Missing required Design Baseline: ${designType}`);
      continue;
    }
    artifacts[designType] = artifact;
    approvals[designType] = approval;
    if (!approval || approval.approvedBy !== 'human' || approval.draftHash !== artifact.hash) {
      issues.push(`Current Design Baseline has no matching human approval: ${designType}`);
    }
  }
  return { valid: issues.length === 0, issues, requiredDesignTypes: required, artifacts, approvals };
}

function syncDesignState(taskPath) {
  const state = readState(taskPath);
  if (!state) throw new Error('State file not found');
  const previousStatus = state.status;
  const ready = designReady(taskPath);
  if (state.status === 'designing') {
    state.status = ready.valid ? 'design_ready' : 'designing';
  } else if (['design_ready', 'approved_for_implementation'].includes(state.status) && !ready.valid) {
    state.status = 'designing';
  }
  writeState(taskPath, state);
  return {
    synced: true,
    previousStatus,
    status: state.status,
    ready: ready.valid,
    issues: ready.issues,
    requiredDesignTypes: ready.requiredDesignTypes,
  };
}

function publish(taskPath, designType) {
  const draft = readDraftRef(taskPath, designType);
  if (!draft) throw new Error(`No valid Draft for ${designType}`);
  const lint = readJSON(lintPath(taskPath, designType));
  const review = readJSON(reviewSummaryPath(taskPath, designType));
  const approval = readJSON(approvalPath(taskPath, designType));
  if (!lint || lint.status !== 'pass' || lint.draftHash !== draft.hash) throw new Error('Current lint is not passing');
  if (!review || review.status !== 'pass' || review.draftHash !== draft.hash) throw new Error('Current review is not passing');
  if (!approval || approval.draftHash !== draft.hash || approval.approvedBy !== 'human') throw new Error('Current human approval is missing');

  const source = draftPath(taskPath, designType);
  const target = artifactPath(taskPath, designType);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    if (sha256File(source) !== sha256File(target)) {
      throw new Error('Existing Baseline differs from approved Draft; explicitly reopen this design before publishing');
    }
    return {
      designType,
      artifactPath: target,
      hash: sha256File(target),
      version: draft.version,
      idempotent: true,
    };
  }
  fs.copyFileSync(source, target);
  if (sha256File(source) !== sha256File(target)) throw new Error('Published Artifact differs from approved Draft');
  return {
    designType,
    artifactPath: target,
    hash: sha256File(target),
    version: draft.version,
  };
}

function bumpMajorVersion(raw) {
  const match = raw.match(/^version:\s*["']?(\d+)\.(\d+)\.(\d+)["']?/m);
  if (!match) throw new Error('Baseline Artifact has no semantic version');
  return raw.replace(
    /^version:\s*["']?\d+\.\d+\.\d+["']?/m,
    `version: "${Number(match[1]) + 1}.0.0"`,
  );
}

function unlinkIfExists(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function reopenDesign(taskPath, designType) {
  definitionFor(designType);
  const artifact = artifactPath(taskPath, designType);
  const ref = readArtifactRef(taskPath, designType);
  if (!ref) throw new Error(`No valid Baseline to reopen: ${designType}`);
  const history = path.join(taskPath, 'artifacts', 'history', definitionFor(designType).slug, `${ref.version}.md`);
  fs.mkdirSync(path.dirname(history), { recursive: true });
  fs.copyFileSync(artifact, history);
  initDesign(taskPath, designType);
  fs.writeFileSync(draftPath(taskPath, designType), bumpMajorVersion(fs.readFileSync(artifact, 'utf8')), 'utf8');
  unlinkIfExists(artifact);
  unlinkIfExists(lintPath(taskPath, designType));
  unlinkIfExists(reviewSummaryPath(taskPath, designType));
  unlinkIfExists(approvalPath(taskPath, designType));
  return { designType, historyFile: history, draft: draftPath(taskPath, designType) };
}

function parseJSONArg(raw, name) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid ${name} JSON: ${error.message}`);
  }
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  try {
    let result;
    switch (command) {
      case 'inspect-workspace': result = inspectWorkspace(args[0], args[1]); break;
      case 'init-design': result = initDesign(args[0], args[1]); break;
      case 'inspect-design': result = inspectDesign(args[0], args[1]); break;
      case 'lint': result = lintDraft(args[0], args[1]); break;
      case 'record-review': result = recordReview(args[0], args[1], parseJSONArg(args[2], 'review summary')); break;
      case 'refresh-format-review': result = refreshFormattingReview(args[0], args[1]); break;
      case 'approve-current-design': result = approveCurrentDesign(args[0], args[1], parseJSONArg(args[2], 'approval')); break;
      case 'publish': result = publish(args[0], args[1]); break;
      case 'reopen': result = reopenDesign(args[0], args[1]); break;
      case 'sync-state': result = syncDesignState(args[0]); break;
      case 'design-ready': result = designReady(args[0]); break;
      default: throw new Error(`Unknown command: ${command}`);
    }
    process.stdout.write(JSON.stringify(result, null, 2));
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  DESIGN_TYPES,
  DESIGN_TYPE_KEYS,
  DESIGN_SLUGS,
  requiredDesignTypes,
  designDir,
  draftPath,
  notesPath,
  artifactPath,
  lintPath,
  reviewSummaryPath,
  approvalPath,
  sha256File,
  semanticHash,
  parseDraftFrontmatter: parseFrontmatter,
  readDraftRef,
  readArtifactRef,
  inspectWorkspace,
  initDesign,
  inspectDesign,
  lintDraft,
  recordReview,
  refreshFormattingReview,
  approveCurrentDesign,
  publish,
  reopenDesign,
  designReady,
  syncDesignState,
};
