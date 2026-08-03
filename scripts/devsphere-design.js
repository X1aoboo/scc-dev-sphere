#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJSON, writeJSON, readState, writeState } = require('./devsphere-state');

const IMPLEMENTATION_LEADING_SECTIONS = ['概述', '上游设计基线与实现追溯', '跨实现单元的目标执行路径'];
const IMPLEMENTATION_TRAILING_SECTIONS = ['跨单元失败行为', '开发实施与 TDD 交接', '开放事项', '参考资料'];

const DESIGN_TYPES = {
  businessDesign: {
    slug: 'business-design',
    artifactPrefix: 'BD',
    documentTitle: 'Business Design',
    exactSectionOrder: true,
    allowNumberedHeadings: true,
    coreSections: [
      '概述',
      '需求基线与业务设计范围',
      '业务目标态总览',
      '业务概念、对象与度量语义',
      '业务参与者、责任与适用范围',
      '业务功能点与业务场景设计',
      '业务规则与判定逻辑',
      '时间、状态与生命周期语义',
      '异常、边界与业务结果',
      '关键业务决策、约束与风险',
      '业务验收与需求追溯',
      '下游设计约束与交接',
      '词汇表',
      '参考资料',
    ],
    hasBusinessFeaturePoints: true,
    requiredBusinessFeaturePointSubsections: [
      '关联需求、业务目标与结果责任',
      '当前业务设计与依据',
      '本次业务变化',
      '目标态业务行为',
      '适用规则、状态和时间语义',
      '异常、边界与可观察结果',
      '业务验收实例',
    ],
    applicabilityItems: [],
  },
  solutionDesign: {
    slug: 'solution-design',
    artifactPrefix: 'SD',
    exactSectionOrder: true,
    allowNumberedHeadings: true,
    coreSections: [
      '概述',
      '特性需求概述',
      '需求场景与影响分析',
      '特性/功能实现原理',
      '接口与集成设计',
      '数据设计',
      '可靠性、可用性与功能安全设计',
      '安全、隐私与韧性设计',
      '非功能质量属性设计',
      '关键技术决策、取舍与风险',
      '需求分解分配与下游交接',
      '词汇表与参考资料',
    ],
    requiredSubsections: {
      '特性/功能实现原理': ['总体方案', '4+1 架构视图', '功能点设计'],
    },
    solutionViewSubsections: ['场景视图', '逻辑视图', '进程视图', '开发视图', '物理视图'],
    hasSolutionFeaturePoints: true,
    requiredFeaturePointSubsections: [
      '关联需求与设计目标',
      '当前设计',
      '本次变更',
      '目标态设计',
      '设计影响、约束与风险',
    ],
    applicabilityItems: [],
  },
  implementationDesign: {
    slug: 'implementation-design',
    artifactPrefix: 'IMPL',
    documentTitle: 'Implementation Design',
    allowNumberedHeadings: true,
    leadingSections: IMPLEMENTATION_LEADING_SECTIONS,
    trailingSections: IMPLEMENTATION_TRAILING_SECTIONS,
    coreSections: [...IMPLEMENTATION_LEADING_SECTIONS, ...IMPLEMENTATION_TRAILING_SECTIONS],
    unitSectionPrefix: '实现单元：',
    applicabilityItems: [],
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

function draftAssetsPath(taskPath, designType) {
  const slug = definitionFor(designType).slug;
  return path.join(designDir(taskPath, designType), `${slug}-assets`);
}

function notesPath(taskPath, designType) {
  return path.join(designDir(taskPath, designType), 'notes.md');
}

function artifactPath(taskPath, designType) {
  return path.join(taskPath, 'artifacts', `${definitionFor(designType).slug}.md`);
}

function artifactAssetsPath(taskPath, designType) {
  const slug = definitionFor(designType).slug;
  return path.join(taskPath, 'artifacts', `${slug}-assets`);
}

function reviewSummaryPath(taskPath, designType) {
  return path.join(designDir(taskPath, designType), 'review.json');
}

function reviewReportPath(taskPath, designType) {
  return path.join(designDir(taskPath, designType), 'review.md');
}

function lintStatusPath(taskPath, designType) {
  return path.join(designDir(taskPath, designType), 'lint.json');
}

function approvalPath(taskPath, designType) {
  return path.join(taskPath, 'approvals', `${definitionFor(designType).slug}.json`);
}

const REVIEW_POLICY_PATH = path.join(__dirname, '..', 'templates', 'config', 'design-review-policy.json');
const REVIEW_CHECKLIST_ROOT = path.join(__dirname, '..', 'skills', 'feature-design', 'references', 'review-checklists');

function loadReviewPolicy(designType) {
  definitionFor(designType);
  const raw = fs.readFileSync(REVIEW_POLICY_PATH);
  const policy = JSON.parse(raw.toString('utf8'));
  if (!policy || policy.schemaVersion !== 1 || !policy.designTypes || typeof policy.designTypes !== 'object') {
    throw new Error('Unsupported or invalid Design Review Policy');
  }
  for (const designType of DESIGN_TYPE_KEYS) {
    const entry = policy.designTypes[designType];
    if (!entry || !Array.isArray(entry.required) || !Array.isArray(entry.conditional)) {
      throw new Error(`Design Review Policy is incomplete for ${designType}`);
    }
    const all = [...entry.required, ...entry.conditional];
    const ids = all.map(item => item && item.checklistId);
    if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
      throw new Error(`Design Review Policy contains invalid or duplicate checklist IDs for ${designType}`);
    }
    for (const item of all) {
      if (typeof item.path !== 'string' || path.isAbsolute(item.path) || item.path.split(/[\\/]/).includes('..')) {
        throw new Error(`Design Review Policy contains an unsafe checklist path: ${item.checklistId}`);
      }
      const fullPath = path.resolve(__dirname, '..', item.path);
      if (path.dirname(fullPath) !== REVIEW_CHECKLIST_ROOT || !fs.existsSync(fullPath)) {
        throw new Error(`Design Review Policy checklist not found: ${item.checklistId}`);
      }
    }
    for (const item of entry.conditional) {
      if (typeof item.condition !== 'string' || !item.condition.trim()) {
        throw new Error(`Conditional checklist requires a condition: ${item.checklistId}`);
      }
    }
  }
  const unknown = Object.keys(policy.designTypes).filter(designType => !DESIGN_TYPES[designType]);
  if (unknown.length) throw new Error(`Design Review Policy contains unknown design type: ${unknown[0]}`);

  const hash = crypto.createHash('sha256');
  hash.update('devsphere-review-policy-v2\0');
  updateBundleHash(hash, 'policy', raw);
  for (const item of [...policy.designTypes[designType].required, ...policy.designTypes[designType].conditional]) {
    const checklistRaw = fs.readFileSync(path.resolve(__dirname, '..', item.path));
    updateBundleHash(hash, `checklist:${item.checklistId}:${item.path}`, checklistRaw);
  }
  return {
    policy,
    hash: `sha256:${hash.digest('hex')}`,
    legacyHash: sha256Buffer(raw),
    path: REVIEW_POLICY_PATH,
  };
}

function sha256Buffer(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function collectAssetFiles(rootPath) {
  if (!fs.existsSync(rootPath)) return [];
  const files = [];

  function visit(currentPath, relativeDir = '') {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true }).sort((a, b) => (
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    ))) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.join(relativeDir, entry.name).replace(/\\/g, '/');
      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) throw new Error(`Design assets cannot contain symbolic links: ${relativePath}`);
      if (stat.isDirectory()) visit(fullPath, relativePath);
      else if (stat.isFile()) files.push({ fullPath, relativePath, size: stat.size });
      else throw new Error(`Unsupported design asset: ${relativePath}`);
    }
  }

  visit(rootPath);
  return files;
}

function updateBundleHash(hash, name, content) {
  const nameBuffer = Buffer.from(name);
  hash.update(Buffer.from(`${nameBuffer.length}:${content.length}:`));
  hash.update(nameBuffer);
  hash.update(content);
}

function hashDocumentAndAssets(documentBuffer, assetsPath) {
  const assets = collectAssetFiles(assetsPath);
  if (assets.length === 0) return sha256Buffer(documentBuffer);
  const hash = crypto.createHash('sha256');
  hash.update('devsphere-design-bundle-v1\0');
  updateBundleHash(hash, 'document', documentBuffer);
  for (const asset of assets) {
    updateBundleHash(hash, asset.relativePath, fs.readFileSync(asset.fullPath));
  }
  return `sha256:${hash.digest('hex')}`;
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

function designSemanticHash(raw, assetsPath) {
  const normalized = raw
    .replace(/<!--([\s\S]*?)-->/g, '')
    .split('\n')
    .map(line => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('\n');
  return hashDocumentAndAssets(Buffer.from(normalized), assetsPath);
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
  const assetsPath = draftAssetsPath(taskPath, designType);
  return {
    ...frontmatter,
    hash: hashDocumentAndAssets(Buffer.from(raw), assetsPath),
    semanticHash: designSemanticHash(raw, assetsPath),
    assets: collectAssetFiles(assetsPath).map(asset => ({
      path: asset.relativePath,
      hash: sha256File(asset.fullPath),
      size: asset.size,
    })),
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
  const assetsPath = artifactAssetsPath(taskPath, designType);
  return {
    ...frontmatter,
    hash: hashDocumentAndAssets(fs.readFileSync(file), assetsPath),
    assets: collectAssetFiles(assetsPath).map(asset => ({
      path: asset.relativePath,
      hash: sha256File(asset.fullPath),
      size: asset.size,
    })),
  };
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function inspectDesign(taskPath, designType) {
  definitionFor(designType);
  const draft = readDraftRef(taskPath, designType);
  const artifact = readArtifactRef(taskPath, designType);
  const lint = readJSON(lintStatusPath(taskPath, designType));
  const review = readJSON(reviewSummaryPath(taskPath, designType));
  const approval = readJSON(approvalPath(taskPath, designType));
  const hasWork = fileExists(notesPath(taskPath, designType)) || fileExists(draftPath(taskPath, designType));
  const lintValid = Boolean(draft && lint && lint.status === 'pass' && lint.draftHash === draft.hash);
  let reviewValid = false;
  try { reviewValid = validatePersistedReview(taskPath, designType).valid; } catch (error) { reviewValid = false; }
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
  fs.mkdirSync(draftAssetsPath(taskPath, designType), { recursive: true });
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
    assets: draftAssetsPath(taskPath, designType),
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

function extractHeadingSections(raw, level) {
  const marker = '#'.repeat(level);
  const headingPattern = new RegExp(`^${marker}\\s+([^#].*?)\\s*$`);
  const boundaryPattern = new RegExp(`^${marker}\\s+`);
  const lines = raw.split(/\r?\n/);
  const sections = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(headingPattern);
    if (!match) continue;
    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (boundaryPattern.test(lines[cursor])) {
        end = cursor;
        break;
      }
    }
    sections.push({ heading: match[1], content: lines.slice(index + 1, end).join('\n').trim() });
  }
  return sections;
}

function parseMarkdownTable(content) {
  const rows = content.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('|') && line.endsWith('|'))
    .map(line => line.slice(1, -1).split('|').map(cell => cell.trim()));
  if (rows.length < 3) return null;
  if (!rows[1].every(cell => /^:?-{3,}:?$/.test(cell))) return null;
  return { header: rows[0], rows: rows.slice(2) };
}

function sameValues(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function sameSets(actual, expected) {
  return actual.length === expected.length && actual.every(value => expected.includes(value));
}

function canonicalHeading(heading) {
  return heading.replace(/^\d+(?:\.\d+)*\.?\s+/, '').trim();
}

function headingValue(heading, definition) {
  return definition.allowNumberedHeadings ? canonicalHeading(heading) : heading;
}

function extractDefinitionSection(raw, definition, heading) {
  if (!definition.allowNumberedHeadings) return extractSection(raw, heading);
  const section = extractHeadingSections(raw, 2)
    .find(candidate => canonicalHeading(candidate.heading) === heading);
  return section ? section.content : '';
}

function extractDefinitionSubsection(raw, definition, parentHeading, heading) {
  if (!definition.allowNumberedHeadings) return extractSubsection(raw, parentHeading, heading);
  const parent = extractDefinitionSection(raw, definition, parentHeading);
  if (!parent) return '';
  const subsection = extractHeadingSections(parent, 3)
    .find(candidate => canonicalHeading(candidate.heading) === heading);
  return subsection ? subsection.content : '';
}

function hasSubstantiveSectionContent(content) {
  const normalized = content
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, '')
    .replace(/[。；;.]$/u, '');
  return Boolean(normalized) && !['无', '不适用', '沿用现状'].includes(normalized);
}

function markdownImageTargets(raw) {
  const targets = [];
  const pattern = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g;
  let match;
  while ((match = pattern.exec(raw)) !== null) targets.push(match[1] || match[2]);
  return targets;
}

function addDesignAssetChecks(raw, taskPath, designType, checks) {
  const definition = definitionFor(designType);
  const assetsRoot = draftAssetsPath(taskPath, designType);
  const assetFiles = collectAssetFiles(assetsRoot);
  const expectedPrefix = `${definition.slug}-assets/`;
  const localTargets = markdownImageTargets(raw)
    .filter(target => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target));

  const referencesValid = localTargets.every(target => {
    let decoded;
    try {
      decoded = decodeURIComponent(target.split(/[?#]/, 1)[0]).replace(/\\/g, '/');
    } catch {
      return false;
    }
    if (!decoded.startsWith(expectedPrefix)) return false;
    const resolved = path.resolve(path.dirname(draftPath(taskPath, designType)), decoded);
    const root = path.resolve(assetsRoot);
    const relative = path.relative(root, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
    if (!fs.existsSync(resolved)) return false;
    const stat = fs.lstatSync(resolved);
    return stat.isFile() && !stat.isSymbolicLink();
  });

  const assetsReferenced = assetFiles.every(asset => raw.includes(`${expectedPrefix}${asset.relativePath}`));
  checks.push({
    code: 'design asset bundle',
    result: referencesValid && assetsReferenced ? 'pass' : 'fail',
  });
}

function addImplementationChecks(raw, definition, checks) {
  const sections = extractHeadingSections(raw, 2);
  const headings = sections.map(section => canonicalHeading(section.heading));
  const units = sections.filter(section => canonicalHeading(section.heading).startsWith(definition.unitSectionPrefix));
  const unitNames = units.map(section => (
    canonicalHeading(section.heading).slice(definition.unitSectionPrefix.length).trim()
  ));
  const expectedOrder = [
    ...definition.leadingSections,
    ...units.map(section => canonicalHeading(section.heading)),
    ...definition.trailingSections,
  ];

  checks.push({
    code: 'implementation section order',
    result: sameValues(headings, expectedOrder) ? 'pass' : 'fail',
  });
  checks.push({
    code: 'implementation unit count',
    result: units.length > 0 ? 'pass' : 'fail',
  });
  checks.push({
    code: 'implementation unit names',
    result: unitNames.length > 0
      && unitNames.every(Boolean)
      && new Set(unitNames).size === unitNames.length
      ? 'pass'
      : 'fail',
  });

  for (const unit of units) {
    const unitName = canonicalHeading(unit.heading).slice(definition.unitSectionPrefix.length).trim();
    const subsections = extractHeadingSections(unit.content, 3);
    checks.push({
      code: `implementation unit detail:${unitName}`,
      result: hasSubstantiveSectionContent(unit.content)
        && subsections.length > 0
        && subsections.every(section => hasSubstantiveSectionContent(section.content))
        ? 'pass'
        : 'fail',
    });
  }

  const mapping = parseMarkdownTable(
    extractDefinitionSubsection(
      raw,
      definition,
      '上游设计基线与实现追溯',
      '功能点到实现点映射',
    ),
  );
  const mappingHeader = ['方案功能点', '实现点', '实现单元', '主要入口', '变更类型'];
  const mappedUnits = mapping ? [...new Set(mapping.rows.map(row => row[2]))] : [];
  const implementationPoints = mapping ? mapping.rows.map(row => row[1]) : [];
  checks.push({
    code: 'implementation point mapping',
    result: mapping
      && sameValues(mapping.header, mappingHeader)
      && mapping.rows.length > 0
      && mapping.rows.every(row => row.length === mappingHeader.length && row.every(hasSubstantiveSectionContent))
      ? 'pass'
      : 'fail',
  });
  checks.push({
    code: 'implementation mapping coverage',
    result: sameSets(mappedUnits, unitNames) ? 'pass' : 'fail',
  });
  checks.push({
    code: 'implementation point identifiers',
    result: implementationPoints.length > 0
      && implementationPoints.every(point => /\bIMP-[A-Z0-9-]+\b/.test(point))
      && new Set(implementationPoints).size === implementationPoints.length
      ? 'pass'
      : 'fail',
  });
}

function addSolutionChecks(raw, definition, checks) {
  const implementationPrinciple = extractDefinitionSection(raw, definition, '特性/功能实现原理');
  const principleSections = extractHeadingSections(implementationPrinciple, 3);
  const architectureViews = principleSections
    .find(section => canonicalHeading(section.heading) === '4+1 架构视图');
  const featurePointDesign = principleSections
    .find(section => canonicalHeading(section.heading) === '功能点设计');

  const views = architectureViews ? extractHeadingSections(architectureViews.content, 4) : [];
  checks.push({
    code: 'solution view order',
    result: sameValues(views.map(view => canonicalHeading(view.heading)), definition.solutionViewSubsections)
      ? 'pass'
      : 'fail',
  });
  for (const viewName of definition.solutionViewSubsections) {
    const view = views.find(candidate => canonicalHeading(candidate.heading) === viewName);
    checks.push({
      code: `solution view:${viewName}`,
      result: view && hasSubstantiveSectionContent(view.content) ? 'pass' : 'fail',
    });
  }

  const featurePoints = featurePointDesign
    ? extractHeadingSections(featurePointDesign.content, 4)
    : [];
  const featurePointNames = featurePoints
    .map(section => canonicalHeading(section.heading).replace(/^功能点[：:]\s*/, '').trim());
  checks.push({
    code: 'solution feature point count',
    result: featurePoints.length > 0 ? 'pass' : 'fail',
  });
  checks.push({
    code: 'solution feature point names',
    result: featurePointNames.length > 0
      && featurePointNames.every(Boolean)
      && new Set(featurePointNames).size === featurePointNames.length
      ? 'pass'
      : 'fail',
  });

  for (const featurePoint of featurePoints) {
    const featurePointName = canonicalHeading(featurePoint.heading)
      .replace(/^功能点[：:]\s*/, '')
      .trim();
    const subsections = extractHeadingSections(featurePoint.content, 5);
    checks.push({
      code: `solution feature point subsection order:${featurePointName}`,
      result: sameValues(
        subsections.map(section => canonicalHeading(section.heading)),
        definition.requiredFeaturePointSubsections,
      )
        ? 'pass'
        : 'fail',
    });
    for (const subsectionName of definition.requiredFeaturePointSubsections) {
      const subsection = subsections
        .find(candidate => canonicalHeading(candidate.heading) === subsectionName);
      checks.push({
        code: `required feature point subsection:${featurePointName}/${subsectionName}`,
        result: subsection && hasSubstantiveSectionContent(subsection.content) ? 'pass' : 'fail',
      });
    }
  }

  const mapping = parseMarkdownTable(
    extractDefinitionSubsection(raw, definition, '特性需求概述', '需求功能点清单'),
  );
  const mappingHeader = ['功能点', '关联需求', '主要变更类型', '设计目标与边界', '详细设计位置'];
  const allowedChangeTypes = ['新增', '修改', '删除', '保持不变'];
  const mappedFeaturePoints = mapping ? [...new Set(mapping.rows.map(row => row[0]))] : [];
  checks.push({
    code: 'solution feature point mapping table',
    result: mapping
      && sameValues(mapping.header, mappingHeader)
      && mapping.rows.length > 0
      && mappedFeaturePoints.length === mapping.rows.length
      && mapping.rows.every(row => {
        if (row.length !== mappingHeader.length) return false;
        const changeTypes = row[2].split(/[/、,，]/).map(value => value.trim()).filter(Boolean);
        return row.every(hasSubstantiveSectionContent)
          && changeTypes.length > 0
          && changeTypes.every(value => allowedChangeTypes.includes(value));
      })
      ? 'pass'
      : 'fail',
  });
  checks.push({
    code: 'solution feature point mapping coverage',
    result: sameSets(mappedFeaturePoints, featurePointNames) ? 'pass' : 'fail',
  });
}

function canonicalBusinessFeaturePoint(value) {
  return canonicalHeading(value)
    .replace(/^(FP-BIZ-\d+)\s*[：:]\s*/i, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addBusinessChecks(raw, definition, checks) {
  const featurePointDesign = extractDefinitionSection(raw, definition, '业务功能点与业务场景设计');
  const featurePoints = extractHeadingSections(featurePointDesign, 3)
    .filter(section => /^FP-BIZ-\d+\s*[：:]/i.test(canonicalHeading(section.heading)));
  const featurePointNames = featurePoints.map(section => canonicalBusinessFeaturePoint(section.heading));

  checks.push({
    code: 'business feature point count',
    result: featurePoints.length > 0 ? 'pass' : 'fail',
  });
  checks.push({
    code: 'business feature point names',
    result: featurePointNames.length > 0
      && featurePointNames.every(Boolean)
      && new Set(featurePointNames).size === featurePointNames.length
      ? 'pass'
      : 'fail',
  });

  for (const featurePoint of featurePoints) {
    const featurePointName = canonicalBusinessFeaturePoint(featurePoint.heading);
    const subsections = extractHeadingSections(featurePoint.content, 4);
    checks.push({
      code: `business feature point subsection order:${featurePointName}`,
      result: sameValues(
        subsections.map(section => canonicalHeading(section.heading)),
        definition.requiredBusinessFeaturePointSubsections,
      )
        ? 'pass'
        : 'fail',
    });
    for (const subsectionName of definition.requiredBusinessFeaturePointSubsections) {
      const subsection = subsections
        .find(candidate => canonicalHeading(candidate.heading) === subsectionName);
      checks.push({
        code: `required business feature point subsection:${featurePointName}/${subsectionName}`,
        result: subsection && hasSubstantiveSectionContent(subsection.content) ? 'pass' : 'fail',
      });
    }
  }

  const mapping = parseMarkdownTable(
    extractDefinitionSubsection(raw, definition, '需求基线与业务设计范围', '业务功能点清单'),
  );
  const mappingHeader = ['功能点', '关联需求', '变更类型', '业务目标与边界', '详细设计位置'];
  const allowedChangeTypes = ['新增', '修改', '删除', '保持不变'];
  const mappedFeaturePoints = mapping
    ? [...new Set(mapping.rows.map(row => canonicalBusinessFeaturePoint(row[0])))]
    : [];
  checks.push({
    code: 'business feature point mapping table',
    result: mapping
      && sameValues(mapping.header, mappingHeader)
      && mapping.rows.length > 0
      && mappedFeaturePoints.length === mapping.rows.length
      && mapping.rows.every(row => {
        if (row.length !== mappingHeader.length) return false;
        const changeTypes = row[2].split(/[/、,，]/).map(value => value.trim()).filter(Boolean);
        return row.every(hasSubstantiveSectionContent)
          && changeTypes.length > 0
          && changeTypes.every(value => allowedChangeTypes.includes(value));
      })
      ? 'pass'
      : 'fail',
  });
  checks.push({
    code: 'business feature point mapping coverage',
    result: sameSets(mappedFeaturePoints, featurePointNames) ? 'pass' : 'fail',
  });
}

function checklistPath(checklistId) {
  return path.join(__dirname, '..', 'skills', 'feature-design', 'references', 'review-checklists', `${checklistId}.md`);
}

function listFilesRecursively(rootPath) {
  if (!fs.existsSync(rootPath)) return [];
  const files = [];
  function visit(currentPath) {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  visit(rootPath);
  return files;
}

function reviewRequiredArtifacts(taskPath, designType) {
  const inputs = listFilesRecursively(path.join(taskPath, 'inputs'));
  const upstream = {
    businessDesign: [],
    solutionDesign: ['businessDesign'],
    implementationDesign: ['businessDesign', 'solutionDesign'],
    testDesign: ['businessDesign', 'solutionDesign', 'implementationDesign'],
  }[designType].map(type => artifactPath(taskPath, type)).filter(fs.existsSync);
  return [...inputs, ...upstream];
}

function currentLintStatus(taskPath, designType, draft) {
  const lint = readJSON(lintStatusPath(taskPath, designType));
  return lint && draft && lint.status === 'pass' && lint.draftHash === draft.hash ? lint : null;
}

function reviewSummaryIssue(review) {
  if (!review || ![2, 3].includes(review.schemaVersion)) {
    return 'Review state schema is outdated; obtain explicit user approval to rebuild the Review baseline';
  }
  if (!['pass', 'blocked'].includes(review.status)) return `Review status is invalid: ${review.status}`;
  const findingSummary = review.findingSummary;
  const findingTypes = ['blocking', 'advisory', 'risk'];
  if (!findingSummary || findingTypes.some(type => !Number.isInteger(findingSummary[type]) || findingSummary[type] < 0)) {
    return 'Review state contains an invalid finding summary';
  }
  if (!Number.isInteger(findingSummary.total)
      || findingSummary.total !== findingTypes.reduce((total, type) => total + findingSummary[type], 0)) {
    return 'Review state contains inconsistent finding counts';
  }
  if ((review.status === 'blocked') !== (findingSummary.blocking > 0)) {
    return 'Review status does not match the blocking finding count';
  }
  if (!Array.isArray(review.checklists) || review.checklists.length === 0 || !Array.isArray(review.notApplicable)) {
    return 'Review state contains invalid checklist dispositions';
  }
  const executed = review.checklists.map(item => item && item.checklistId);
  const notApplicable = review.notApplicable.map(item => item && item.checklistId);
  if ([...executed, ...notApplicable].some(id => typeof id !== 'string' || !id)) {
    return 'Review state contains an invalid checklist ID';
  }
  if (new Set([...executed, ...notApplicable]).size !== executed.length + notApplicable.length) {
    return 'Review state contains duplicate checklist dispositions';
  }
  if (review.checklists.some(item => !['pass', 'findings'].includes(item.result))) {
    return 'Review state contains an invalid checklist result';
  }
  if (review.notApplicable.some(item => typeof item.reason !== 'string' || !item.reason.trim())) {
    return 'Review state contains an invalid not-applicable reason';
  }
  return null;
}

function reviewDispositionIssue(review, policy) {
  const executed = review.checklists.map(item => item.checklistId);
  const notApplicable = review.notApplicable.map(item => item.checklistId);
  const required = policy.required.map(item => item.checklistId);
  const conditional = policy.conditional.map(item => item.checklistId);
  const known = new Set([...required, ...conditional]);
  if (executed.some(id => !known.has(id)) || notApplicable.some(id => !conditional.includes(id))) {
    return 'Review state contains a checklist outside the current Review Policy';
  }
  if (required.some(id => !executed.includes(id))) return 'Review state omits required checklists';
  if (conditional.some(id => !executed.includes(id) && !notApplicable.includes(id))) {
    return 'Review state omits conditional checklist dispositions';
  }
  return null;
}

function readReviewHistory(taskPath, designType) {
  const summaryFile = reviewSummaryPath(taskPath, designType);
  const reportFile = reviewReportPath(taskPath, designType);
  const summaryExists = fs.existsSync(summaryFile);
  const reportExists = fs.existsSync(reportFile);
  if (!summaryExists && !reportExists) return null;
  if (!summaryExists) {
    throw new Error('Review state is missing while review.md exists; obtain explicit user approval to rebuild the Review baseline');
  }
  const review = readJSON(summaryFile);
  const issue = reviewSummaryIssue(review);
  if (issue) throw new Error(issue);
  if (review.schemaVersion === 2) {
    if (reportExists) {
      throw new Error('Legacy Review state conflicts with review.md; obtain explicit user approval to rebuild the Review baseline');
    }
    return { kind: 'legacy', review, reportPath: reportFile, reportHash: null };
  }
  if (!reportExists) {
    throw new Error('Review report is missing; obtain explicit user approval to rebuild the Review baseline');
  }
  const reportHash = sha256File(reportFile);
  if (typeof review.reportHash !== 'string' || review.reportHash !== reportHash) {
    throw new Error('Review report hash mismatch; obtain explicit user approval to rebuild the Review baseline');
  }
  return { kind: 'ledger', review, reportPath: reportFile, reportHash };
}

function validatePersistedReview(taskPath, designType, options = {}) {
  const draft = readDraftRef(taskPath, designType);
  let history;
  try {
    history = readReviewHistory(taskPath, designType);
  } catch (error) {
    return { valid: false, reason: error.message };
  }
  if (!draft || !history) return { valid: false, reason: 'Review state is missing' };
  if (!currentLintStatus(taskPath, designType, draft)) {
    return { valid: false, reason: 'Review state has no matching passing lint state' };
  }
  const review = history.review;
  const loaded = loadReviewPolicy(designType);
  const policy = loaded.policy.designTypes[designType];
  if (review.draftHash !== draft.hash || review.semanticHash !== draft.semanticHash) {
    return { valid: false, reason: 'Review state does not bind the current Draft' };
  }
  const expectedPolicyHash = history.kind === 'legacy' ? loaded.legacyHash : loaded.hash;
  if (review.reviewKey !== `${designType}:${draft.semanticHash}` || review.policyHash !== expectedPolicyHash) {
    return { valid: false, reason: 'Review state does not bind the current Review Policy' };
  }
  if (!['pass', 'blocked'].includes(review.status) || (!options.allowBlocked && review.status !== 'pass')) {
    return { valid: false, reason: `Review status is not acceptable: ${review.status}` };
  }
  const dispositionIssue = reviewDispositionIssue(review, policy);
  if (dispositionIssue) return { valid: false, reason: dispositionIssue };
  return { valid: true, review, draft };
}

function validateReview(taskPath, designType) {
  definitionFor(designType);
  try {
    const result = validatePersistedReview(taskPath, designType);
    return result.valid
      ? { valid: true, designType }
      : { valid: false, designType, issues: [result.reason] };
  } catch (error) {
    return { valid: false, designType, issues: [error.message] };
  }
}

function reviewContext(taskPath, designType) {
  definitionFor(designType);
  const draft = readDraftRef(taskPath, designType);
  if (!draft) throw new Error(`No valid Draft for ${designType}`);
  const lint = currentLintStatus(taskPath, designType, draft);
  if (!lint) throw new Error('lint_not_ready: current Draft must have a matching passing lint state before review');
  const loaded = loadReviewPolicy(designType);
  const policy = loaded.policy.designTypes[designType];
  const expand = item => ({
    ...item,
    path: path.resolve(__dirname, '..', item.path),
  });
  let history = null;
  let historyIssue = null;
  try {
    history = readReviewHistory(taskPath, designType);
  } catch (error) {
    historyIssue = error.message;
  }
  let previousReview = history && history.review;
  if (!previousReview && fs.existsSync(reviewSummaryPath(taskPath, designType))) {
    try {
      const candidate = readJSON(reviewSummaryPath(taskPath, designType));
      if (!reviewSummaryIssue(candidate)) previousReview = candidate;
    } catch (error) {
      // A malformed summary is exposed as a rebuild-required integrity failure below.
    }
  }
  const previousIsLegacy = Boolean(previousReview && previousReview.schemaVersion === 2);
  const expectedPreviousPolicyHash = previousIsLegacy ? loaded.legacyHash : loaded.hash;
  const policyChanged = Boolean(previousReview && previousReview.policyHash !== expectedPreviousPolicyHash);
  const formatRefreshEligible = Boolean(
    previousReview
    && previousReview.status === 'pass'
    && previousReview.semanticHash === draft.semanticHash
    && !policyChanged
    && !historyIssue,
  );
  const rebuildBaselineRequired = Boolean(
    historyIssue
    || (previousReview && (policyChanged || (previousIsLegacy && !formatRefreshEligible))),
  );
  const reportFile = reviewReportPath(taskPath, designType);
  const actualReportHash = fs.existsSync(reportFile) ? sha256File(reportFile) : null;
  return {
    reviewKey: `${designType}:${draft.semanticHash}`,
    designType,
    draft: {
      path: draftPath(taskPath, designType),
      assetsPath: draftAssetsPath(taskPath, designType),
      draftHash: draft.hash,
      semanticHash: draft.semanticHash,
    },
    requiredArtifacts: reviewRequiredArtifacts(taskPath, designType),
    policyHash: loaded.hash,
    requiredChecklists: policy.required.map(expand),
    conditionalChecklists: policy.conditional.map(expand),
    reviewMode: rebuildBaselineRequired
      ? 'rebuild-full-required'
      : !previousReview
        ? 'initial-full'
        : formatRefreshEligible
          ? 'format-refresh'
          : 'incremental',
    formatRefreshEligible,
    rebuildBaselineRequired,
    policyChanged,
    historyIssue,
    report: {
      path: reportFile,
      exists: fs.existsSync(reportFile),
      hash: actualReportHash,
      expectedHash: previousReview ? previousReview.reportHash || null : null,
    },
    previousReview: previousReview ? {
      schemaVersion: previousReview.schemaVersion,
      status: previousReview.status,
      draftHash: previousReview.draftHash,
      semanticHash: previousReview.semanticHash,
      policyHash: previousReview.policyHash,
      reportHash: previousReview.reportHash || null,
      checklists: previousReview.checklists,
      notApplicable: previousReview.notApplicable,
      findingSummary: previousReview.findingSummary,
    } : null,
  };
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
    result: /(?<![A-Za-z0-9_<])<[A-Za-z][A-Za-z0-9_.:/-]*>|\{\{[^}\r\n]+\}\}|\b(?:TODO|TBD)\b/i.test(raw)
      ? 'fail'
      : 'pass',
  });
  if (definition.documentTitle) {
    const titles = raw.split(/\r?\n/).filter(line => /^#\s+/.test(line));
    checks.push({
      code: 'document title',
      result: titles.length === 1 && titles[0].trim() === `# ${definition.documentTitle}` ? 'pass' : 'fail',
    });
  }
  if (definition.exactSectionOrder) {
    const headings = extractLevelTwoHeadings(raw).map(heading => headingValue(heading, definition));
    checks.push({
      code: 'core section order',
      result: headings.length === definition.coreSections.length
        && headings.every((heading, index) => heading === definition.coreSections[index])
        ? 'pass'
        : 'fail',
    });
  }
  if (definition.unitSectionPrefix) addImplementationChecks(raw, definition, checks);
  if (definition.hasBusinessFeaturePoints) addBusinessChecks(raw, definition, checks);
  if (definition.hasSolutionFeaturePoints) addSolutionChecks(raw, definition, checks);
  addDesignAssetChecks(raw, taskPath, designType, checks);
  for (const section of definition.coreSections) {
    const content = extractDefinitionSection(raw, definition, section);
    checks.push({
      code: `core section:${section}`,
      result: hasSubstantiveSectionContent(content) ? 'pass' : 'fail',
    });
  }
  for (const [parent, subsections] of Object.entries(definition.requiredSubsections || {})) {
    for (const subsection of subsections) {
      checks.push({
        code: `required subsection:${parent}/${subsection}`,
        result: extractDefinitionSubsection(raw, definition, parent, subsection) ? 'pass' : 'fail',
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
    semanticHash: draftRef ? draftRef.semanticHash : semanticHash(raw),
    status: checks.some(check => check.result === 'fail') ? 'fail' : 'pass',
    checks,
  };
  writeJSON(lintStatusPath(taskPath, designType), {
    schemaVersion: 1,
    designType,
    draftHash: result.draftHash,
    semanticHash: result.semanticHash,
    status: result.status,
    lintedAt: new Date().toISOString(),
  });
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
  if (!draft) throw new Error(`No valid Draft for ${designType}`);
  if (!currentLintStatus(taskPath, designType, draft)) throw new Error('lint_not_ready: current Draft must have a matching passing lint state before review');
  const loaded = loadReviewPolicy(designType);
  const policy = loaded.policy.designTypes[designType];
  if (!input || input.draftHash !== draft.hash) throw new Error('Review summary does not bind the current Draft');
  if (input.rebuildBaseline !== undefined && typeof input.rebuildBaseline !== 'boolean') {
    throw new Error('rebuildBaseline must be a boolean when provided');
  }
  const rebuildBaseline = input.rebuildBaseline === true;
  if (typeof input.reportAppend !== 'string' || !input.reportAppend.trim()) {
    throw new Error('Review reportAppend must be non-empty Markdown');
  }
  const reviewKey = `${designType}:${draft.semanticHash}`;
  if (input.reviewKey !== reviewKey) throw new Error('Review summary does not bind the current semantic Draft');
  if (input.policyHash !== loaded.hash) throw new Error('Review summary does not bind the current Review Policy');
  if (!Array.isArray(input.checklists) || input.checklists.length === 0) {
    throw new Error('Review summary requires at least one executed checklist');
  }
  const checklistIds = input.checklists.map(item => item.checklistId);
  if (new Set(checklistIds).size !== checklistIds.length) throw new Error('Review summary contains duplicate checklists');
  const notApplicable = input.notApplicable || [];
  if (!Array.isArray(notApplicable)) throw new Error('Review summary notApplicable must be an array');
  const notApplicableIds = notApplicable.map(item => item.checklistId);
  if (new Set(notApplicableIds).size !== notApplicableIds.length) throw new Error('Review summary contains duplicate not-applicable checklists');
  const requiredIds = policy.required.map(item => item.checklistId);
  const conditionalIds = policy.conditional.map(item => item.checklistId);
  const knownIds = new Set([...requiredIds, ...conditionalIds]);
  for (const checklistId of checklistIds) {
    if (!knownIds.has(checklistId)) throw new Error(`Review summary contains unknown checklist: ${checklistId}`);
  }
  for (const checklistId of notApplicableIds) {
    if (!conditionalIds.includes(checklistId)) throw new Error(`Checklist cannot be marked not applicable: ${checklistId}`);
    if (checklistIds.includes(checklistId)) throw new Error(`Checklist cannot be both executed and not applicable: ${checklistId}`);
  }
  for (const checklistId of requiredIds) {
    if (!checklistIds.includes(checklistId)) throw new Error(`Required review checklist was not executed: ${checklistId}`);
  }
  for (const checklistId of conditionalIds) {
    if (!checklistIds.includes(checklistId) && !notApplicableIds.includes(checklistId)) {
      throw new Error(`Conditional review checklist has no disposition: ${checklistId}`);
    }
  }
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
    if (checklist.result === 'findings' && checklistFindings.length === 0) {
      throw new Error(`Checklist marked findings must contain findings: ${checklist.checklistId}`);
    }
    findings.push(...checklistFindings.map(finding => ({ checklistId: checklist.checklistId, ...finding })));
  }
  for (const item of notApplicable) {
    if (!item.checklistId || !item.reason) throw new Error('Not-applicable checklist requires checklistId and reason');
  }
  const findingSummary = {
    blocking: findings.filter(finding => finding.type === 'blocking').length,
    advisory: findings.filter(finding => finding.type === 'advisory').length,
    risk: findings.filter(finding => finding.type === 'risk').length,
    total: findings.length,
  };
  const summary = {
    schemaVersion: 3,
    designType,
    reviewKey,
    draftHash: draft.hash,
    semanticHash: draft.semanticHash,
    policyHash: loaded.hash,
    status: findingSummary.blocking > 0 ? 'blocked' : 'pass',
    checklists: input.checklists.map(item => ({
      checklistId: item.checklistId,
      result: item.result,
      summary: item.summary || '',
    })),
    notApplicable,
    findingSummary,
    reviewedAt: new Date().toISOString(),
  };

  const summaryFile = reviewSummaryPath(taskPath, designType);
  const reportFile = reviewReportPath(taskPath, designType);
  const hasSummary = fs.existsSync(summaryFile);
  const hasReport = fs.existsSync(reportFile);
  let history = null;
  if (rebuildBaseline) {
    if (!hasSummary && !hasReport) {
      throw new Error('rebuildBaseline is not needed for an initial Review');
    }
    if (input.baseReportHash !== null) {
      throw new Error('A rebuilt Review baseline requires baseReportHash null');
    }
  } else {
    history = readReviewHistory(taskPath, designType);
    if (!history) {
      if (input.baseReportHash !== null) throw new Error('An initial Review requires baseReportHash null');
    } else {
      if (history.kind === 'legacy') {
        throw new Error('Legacy Review has no review.md; obtain explicit user approval and set rebuildBaseline true');
      }
      if (history.review.policyHash !== loaded.hash) {
        throw new Error('Review Policy or Checklist content changed; obtain explicit user approval and set rebuildBaseline true');
      }
      if (input.baseReportHash !== history.reportHash) {
        throw new Error('baseReportHash is stale or does not match the current Review report');
      }
    }
  }

  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  if (rebuildBaseline) {
    fs.writeFileSync(reportFile, input.reportAppend, 'utf8');
  } else if (!history) {
    fs.writeFileSync(reportFile, input.reportAppend, { encoding: 'utf8', flag: 'wx' });
  } else {
    fs.appendFileSync(reportFile, input.reportAppend, 'utf8');
  }
  summary.reportHash = sha256File(reportFile);
  // The report is written first. If the JSON write fails, subsequent commands detect
  // the hash mismatch and fail closed; concurrent Review writers are not supported.
  writeJSON(summaryFile, summary);
  return summary;
}

function refreshFormattingReview(taskPath, designType) {
  const draft = readDraftRef(taskPath, designType);
  if (!draft || !currentLintStatus(taskPath, designType, draft)) throw new Error('Current Draft must have a matching passing lint state');
  const history = readReviewHistory(taskPath, designType);
  const summary = history && history.review;
  const loaded = loadReviewPolicy(designType);
  const expectedPolicyHash = history && history.kind === 'legacy' ? loaded.legacyHash : loaded.hash;
  if (!summary || summary.semanticHash !== draft.semanticHash || summary.policyHash !== expectedPolicyHash || summary.status !== 'pass') {
    throw new Error('Change is semantic; all applicable reviews must run again');
  }
  summary.draftHash = draft.hash;
  summary.formattingRefresh = true;
  summary.refreshedAt = new Date().toISOString();
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
  } else if (['design_ready', 'external_test_design_ready', 'approved_for_implementation'].includes(state.status) && !ready.valid) {
    state.status = 'designing';
    if (state.externalTestDesign) delete state.externalTestDesign.completedAt;
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
  const lint = currentLintStatus(taskPath, designType, draft);
  const approval = readJSON(approvalPath(taskPath, designType));
  if (!lint) throw new Error('Current lint is not passing');
  if (!approval || approval.draftHash !== draft.hash || approval.approvedBy !== 'human') throw new Error('Current human approval is missing');

  const source = draftPath(taskPath, designType);
  const sourceAssets = draftAssetsPath(taskPath, designType);
  const target = artifactPath(taskPath, designType);
  const targetAssets = artifactAssetsPath(taskPath, designType);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    const artifact = readArtifactRef(taskPath, designType);
    if (!artifact || draft.hash !== artifact.hash) {
      throw new Error('Existing Baseline differs from approved Draft; explicitly reopen this design before publishing');
    }
    unlinkIfExists(reviewSummaryPath(taskPath, designType));
    unlinkIfExists(reviewReportPath(taskPath, designType));
    return {
      designType,
      artifactPath: target,
      assetsPath: artifact.assets.length > 0 ? targetAssets : undefined,
      hash: artifact.hash,
      version: draft.version,
      idempotent: true,
    };
  }
  const review = validatePersistedReview(taskPath, designType);
  if (!review.valid) throw new Error(`Current review is not passing: ${review.reason}`);
  if (fs.existsSync(targetAssets)) throw new Error('Design Baseline assets already exist without a Baseline document');
  try {
    fs.copyFileSync(source, target);
    copyAssetFiles(sourceAssets, targetAssets);
    const artifact = readArtifactRef(taskPath, designType);
    if (!artifact || artifact.hash !== draft.hash) throw new Error('Published Artifact bundle differs from approved Draft bundle');
  } catch (error) {
    unlinkIfExists(target);
    removeDirectoryIfExists(targetAssets);
    throw error;
  }
  unlinkIfExists(reviewSummaryPath(taskPath, designType));
  unlinkIfExists(reviewReportPath(taskPath, designType));
  const artifact = readArtifactRef(taskPath, designType);
  return {
    designType,
    artifactPath: target,
    assetsPath: artifact.assets.length > 0 ? targetAssets : undefined,
    hash: artifact.hash,
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

function removeDirectoryIfExists(dirPath) {
  if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
}

function copyAssetFiles(sourceRoot, targetRoot) {
  const files = collectAssetFiles(sourceRoot);
  if (files.length === 0) return false;
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const asset of files) {
    const target = path.join(targetRoot, ...asset.relativePath.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(asset.fullPath, target);
  }
  return true;
}

function reopenDesign(taskPath, designType) {
  const definition = definitionFor(designType);
  const artifact = artifactPath(taskPath, designType);
  const artifactAssets = artifactAssetsPath(taskPath, designType);
  const ref = readArtifactRef(taskPath, designType);
  if (!ref) throw new Error(`No valid Baseline to reopen: ${designType}`);
  const historyDir = path.join(taskPath, 'artifacts', 'history', definition.slug, ref.version);
  const history = path.join(historyDir, 'design.md');
  const historyAssets = path.join(historyDir, `${definition.slug}-assets`);
  fs.mkdirSync(historyDir, { recursive: true });
  fs.copyFileSync(artifact, history);
  copyAssetFiles(artifactAssets, historyAssets);
  initDesign(taskPath, designType);
  removeDirectoryIfExists(draftAssetsPath(taskPath, designType));
  copyAssetFiles(artifactAssets, draftAssetsPath(taskPath, designType));
  fs.writeFileSync(draftPath(taskPath, designType), bumpMajorVersion(fs.readFileSync(artifact, 'utf8')), 'utf8');
  unlinkIfExists(artifact);
  removeDirectoryIfExists(artifactAssets);
  unlinkIfExists(reviewSummaryPath(taskPath, designType));
  unlinkIfExists(reviewReportPath(taskPath, designType));
  unlinkIfExists(lintStatusPath(taskPath, designType));
  unlinkIfExists(approvalPath(taskPath, designType));
  return {
    designType,
    historyFile: history,
    historyAssets: ref.assets.length > 0 ? historyAssets : undefined,
    draft: draftPath(taskPath, designType),
    draftAssets: ref.assets.length > 0 ? draftAssetsPath(taskPath, designType) : undefined,
  };
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
      case 'validate-review': result = validateReview(args[0], args[1]); break;
      case 'review-context': result = reviewContext(args[0], args[1]); break;
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
  draftAssetsPath,
  notesPath,
  artifactPath,
  artifactAssetsPath,
  reviewSummaryPath,
  reviewReportPath,
  lintStatusPath,
  approvalPath,
  sha256File,
  semanticHash,
  designSemanticHash,
  parseDraftFrontmatter: parseFrontmatter,
  readDraftRef,
  readArtifactRef,
  inspectWorkspace,
  initDesign,
  inspectDesign,
  lintDraft,
  loadReviewPolicy,
  reviewContext,
  validatePersistedReview,
  validateReview,
  recordReview,
  refreshFormattingReview,
  approveCurrentDesign,
  publish,
  reopenDesign,
  designReady,
  syncDesignState,
};
