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
  if (input.type === 'gated') {
    if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 4) {
      throw new Error('gated decision requires 2-4 options');
    }
    if (!VALID_ASK_MODES.includes(input.askMode)) {
      throw new Error(`Invalid askMode: ${input.askMode}`);
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
  decisionsPath, readDecisions, writeDecisions, initDecisions,
  addDecision, resolveDecision, listGatedPending, countGatedPending,
};
