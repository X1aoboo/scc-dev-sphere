#!/usr/bin/env node
'use strict';

const path = require('path');
const { readJSON, writeJSON } = require('./devsphere-state');

const DECISIONS_DIR = 'decisions';
const SLUG_PREFIX = {
  'business-design': 'BD',
  'solution-design': 'SD',
  'implementation-design': 'ID',
  'test-design': 'TD',
};
const VALID_TYPES = ['gated', 'autonomous'];
const VALID_CATEGORIES = ['feature_scope', 'assumption', 'open_question', 'business_rule', 'tradeoff'];
const VALID_ASK_MODES = ['single_select', 'multi_select', 'confirm_gate'];

const VALID_DECISION_STATUS = ['pending', 'decided'];
const ALLOWED_TOPLEVEL = ['stage', 'taskId', 'decisions'];

// 校验单条 decision（persisted 形态）。不合法 → throw。addDecision 与守卫共用。
function validateDecisionElement(d) {
  if (!d || typeof d !== 'object') throw new Error('decision 必须为对象');
  if (typeof d.id !== 'string' || !d.id.trim()) throw new Error('decision id 必填');
  if (!VALID_TYPES.includes(d.type)) throw new Error(`decision type 非法: ${d.type}`);
  if (!d.category || !VALID_CATEGORIES.includes(d.category)) throw new Error(`decision category 非法: ${d.category}`);
  if (typeof d.summary !== 'string' || !d.summary.trim()) throw new Error('decision summary 必填');
  if (!VALID_DECISION_STATUS.includes(d.status)) throw new Error(`decision status 非法: ${d.status}`);
  if (d.type === 'gated') {
    if (!Array.isArray(d.options) || d.options.length < 2 || d.options.length > 4) {
      throw new Error('gated decision 需 2-4 options');
    }
    for (const opt of d.options) {
      if (typeof opt !== 'object' || opt === null
          || typeof opt.label !== 'string' || !opt.label.trim()
          || typeof opt.description !== 'string' || !opt.description.trim()) {
        throw new Error('gated decision options 元素必须是 {label, description} 非空对象');
      }
    }
    if (!VALID_ASK_MODES.includes(d.askMode)) throw new Error(`gated decision askMode 非法: ${d.askMode}`);
    if (typeof d.rationale !== 'string' || !d.rationale.trim()) {
      throw new Error('gated decision rationale 必填');
    }
  }
}

// 校验整个 decisions 文件结构。不合法 → throw。
function validateDecisionsFile(data) {
  if (!data || typeof data !== 'object') throw new Error('decisions 文件须为对象');
  for (const k of Object.keys(data)) {
    if (!ALLOWED_TOPLEVEL.includes(k)) throw new Error(`decisions 文件未知顶层字段: ${k}`);
  }
  if (typeof data.stage !== 'string' || !data.stage.trim()) throw new Error('decisions 文件 stage 必填');
  if (typeof data.taskId !== 'string' || !data.taskId.trim()) throw new Error('decisions 文件 taskId 必填');
  if (!Array.isArray(data.decisions)) throw new Error('decisions 文件 decisions 须为数组');
  for (const d of data.decisions) validateDecisionElement(d);
}

function decisionsPath(taskPath, slug) {
  return path.join(taskPath, DECISIONS_DIR, `${slug}-decisions.json`);
}

function readDecisions(taskPath, slug) {
  return readJSON(decisionsPath(taskPath, slug));
}

function writeDecisions(taskPath, slug, data) {
  writeJSON(decisionsPath(taskPath, slug), data);
}

function initDecisions(taskPath, slug, taskId, stageName) {
  if (!taskPath || !slug || !taskId || !stageName) {
    throw new Error('initDecisions requires taskPath, slug, taskId, stageName');
  }
  const data = { stage: stageName, taskId, decisions: [] };
  writeDecisions(taskPath, slug, data);
  return data;
}

function nextDecisionId(decisions, slug) {
  const prefix = SLUG_PREFIX[slug];
  if (!prefix) throw new Error(`Unknown slug: ${slug}`);
  let max = 0;
  for (const d of decisions) {
    const m = typeof d.id === 'string' ? d.id.match(/-(\d+)$/) : null;
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-DEC-${String(max + 1).padStart(3, '0')}`;
}

function addDecision(taskPath, slug, input) {
  if (!input || !VALID_TYPES.includes(input.type)) {
    throw new Error(`Invalid decision type: ${input && input.type}`);
  }
  if (!input.category || !VALID_CATEGORIES.includes(input.category)) {
    throw new Error(`Invalid category: ${input.category}`);
  }
  if (typeof input.summary !== 'string' || !input.summary.trim()) {
    throw new Error('summary is required');
  }
  if (input.type === 'gated') {
    if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 4) {
      throw new Error('gated decision requires 2-4 options');
    }
    for (const opt of input.options) {
      if (typeof opt !== 'object' || opt === null
          || typeof opt.label !== 'string' || !opt.label.trim()
          || typeof opt.description !== 'string' || !opt.description.trim()) {
        throw new Error('gated decision options must be {label, description} objects with non-empty strings');
      }
    }
    if (!VALID_ASK_MODES.includes(input.askMode)) {
      throw new Error(`Invalid askMode: ${input.askMode}`);
    }
    if (typeof input.rationale !== 'string' || !input.rationale.trim()) {
      throw new Error('rationale is required for gated decisions');
    }
  }
  const data = readDecisions(taskPath, slug);
  if (!data) throw new Error(`Decisions file not initialized for ${slug}`);
  const decision = {
    id: nextDecisionId(data.decisions, slug),
    type: input.type,
    category: input.category,
    summary: input.summary,
    rationale: input.rationale || '',
    options: input.type === 'gated' ? input.options : [],
    recommendation: input.recommendation || '',
    askMode: input.type === 'gated' ? input.askMode : null,
    status: 'pending',
    resolution: null,
    evidence: input.evidence || [],
    impact: input.impact || '',
  };
  data.decisions.push(decision);
  validateDecisionElement(decision); // 双保险：persisted 形态再校验一次
  writeDecisions(taskPath, slug, data);
  return decision;
}

function resolveDecision(taskPath, slug, decisionId, resolution) {
  const data = readDecisions(taskPath, slug);
  if (!data) throw new Error(`Decisions file not initialized for ${slug}`);
  const d = data.decisions.find(x => x.id === decisionId);
  if (!d) throw new Error(`Decision not found: ${decisionId}`);
  if (!resolution || typeof resolution.chosen !== 'string') {
    throw new Error('resolution.chosen required');
  }
  d.status = 'decided';
  d.resolution = {
    chosen: resolution.chosen,
    note: resolution.note || '',
    decidedAt: resolution.decidedAt || new Date().toISOString(),
  };
  writeDecisions(taskPath, slug, data);
  return d;
}

function listGatedPending(taskPath, slug) {
  const data = readDecisions(taskPath, slug);
  if (!data) return [];
  return data.decisions.filter(d => d.type === 'gated' && d.status === 'pending');
}

function countGatedPending(taskPath, slug) {
  return listGatedPending(taskPath, slug).length;
}

const MAIN_ARTIFACT_FILES = {
  'business-design.md': 'business-design',
  'solution-design.md': 'solution-design',
  'implementation-design.md': 'implementation-design',
  'test-design.md': 'test-design',
};

// 给定 Write/Edit 的绝对 file_path，判断是否为某设计阶段主产物；
// 若是，返回 {isMainArtifact:true, taskPath, slug}。taskPath = 主产物所在 artifacts 目录的父目录。
function resolveMainArtifact(filePath) {
  if (typeof filePath !== 'string') return { isMainArtifact: false };
  const norm = filePath.replace(/\\/g, '/');
  const parts = norm.split('/');
  const fileName = parts[parts.length - 1];
  const slug = MAIN_ARTIFACT_FILES[fileName];
  if (!slug) return { isMainArtifact: false };
  // parts: [..., '<taskPath>', 'artifacts', '<file>']
  if (parts[parts.length - 2] !== 'artifacts') return { isMainArtifact: false };
  const taskPath = parts.slice(0, -2).join('/');
  if (!taskPath) return { isMainArtifact: false };
  return { isMainArtifact: true, taskPath, slug };
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  try {
    switch (command) {
      case 'init': {
        const [taskPath, slug, taskId, stageName] = args.slice(1);
        process.stdout.write(JSON.stringify(initDecisions(taskPath, slug, taskId, stageName)));
        break;
      }
      case 'read': {
        process.stdout.write(JSON.stringify(readDecisions(args[1], args[2])));
        break;
      }
      case 'add': {
        let input;
        try { input = JSON.parse(args[3]); } catch (e) { throw new Error(`Invalid decision JSON: ${e.message}`); }
        process.stdout.write(JSON.stringify(addDecision(args[1], args[2], input)));
        break;
      }
      case 'resolve': {
        let resolution;
        try { resolution = JSON.parse(args[4]); } catch (e) { throw new Error(`Invalid resolution JSON: ${e.message}`); }
        process.stdout.write(JSON.stringify(resolveDecision(args[1], args[2], args[3], resolution)));
        break;
      }
      case 'count-gated-pending': {
        process.stdout.write(JSON.stringify({ count: countGatedPending(args[1], args[2]) }));
        break;
      }
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        process.exit(1);
    }
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DECISIONS_DIR, SLUG_PREFIX, VALID_TYPES, VALID_CATEGORIES, VALID_ASK_MODES,
  VALID_DECISION_STATUS, ALLOWED_TOPLEVEL,
  decisionsPath, readDecisions, writeDecisions, initDecisions,
  addDecision, resolveDecision, listGatedPending, countGatedPending,
  resolveMainArtifact, MAIN_ARTIFACT_FILES,
  validateDecisionElement, validateDecisionsFile,
};
