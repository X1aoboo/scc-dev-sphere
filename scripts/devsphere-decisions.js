#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  readJSON,
  writeJSON,
  readState,
} = require('./devsphere-state');

const SLUG_PREFIX = {
  'business-design': 'BD',
  'solution-design': 'SD',
  'implementation-design': 'IMPL',
  'test-design': 'TD',
};

const SLUG_STAGE = {
  'business-design': 'businessDesign',
  'solution-design': 'solutionDesign',
  'implementation-design': 'implementationDesign',
  'test-design': 'testDesign',
};

const REQUIRED_FIELDS = [
  'context',
  'userInput',
  'candidates',
  'recommendation',
  'finalDecision',
  'rationale',
  'impact',
  'evidence',
];

function decisionsPath(taskPath, slug) {
  return path.join(taskPath, 'decisions', `${slug}.json`);
}

function readDecisions(taskPath, slug) {
  return readJSON(decisionsPath(taskPath, slug));
}

function writeDecisions(taskPath, slug, data) {
  writeJSON(decisionsPath(taskPath, slug), data);
}

function initDecisions(taskPath, slug, taskId, stageName) {
  if (!taskPath || !SLUG_PREFIX[slug] || !taskId || !stageName) {
    throw new Error('initDecisions requires taskPath, known slug, taskId, and stageName');
  }
  const existing = readDecisions(taskPath, slug);
  if (existing) return existing;
  const data = { stage: stageName, taskId, decisions: [] };
  writeDecisions(taskPath, slug, data);
  return data;
}

function validateDecisionInput(input) {
  if (!input || typeof input !== 'object') throw new Error('Decision input must be an object');
  for (const field of REQUIRED_FIELDS) {
    if (!(field in input)) throw new Error(`Decision field is required: ${field}`);
  }
  for (const field of ['context', 'userInput', 'recommendation', 'finalDecision', 'rationale', 'impact']) {
    if (typeof input[field] !== 'string' || !input[field].trim()) throw new Error(`Decision ${field} must be non-empty`);
  }
  if (!Array.isArray(input.candidates) || input.candidates.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error('Decision candidates must be a string array');
  }
  if (!Array.isArray(input.evidence) || input.evidence.some(item => typeof item !== 'string')) {
    throw new Error('Decision evidence must be an EV ID array');
  }
  if (input.supersedes !== undefined && (
    !Array.isArray(input.supersedes)
    || input.supersedes.some(item => typeof item !== 'string' || !item.trim())
  )) {
    throw new Error('Decision supersedes must be a non-empty string array when provided');
  }
}

function nextDecisionId(decisions, slug) {
  const prefix = SLUG_PREFIX[slug];
  if (!prefix) throw new Error(`Unknown decision stage: ${slug}`);
  const max = decisions.reduce((current, decision) => {
    const match = String(decision.id || '').match(/-(\d+)$/);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `${prefix}-DEC-${String(max + 1).padStart(3, '0')}`;
}

function loadDecisionsForAdd(taskPath, slug) {
  if (!taskPath || !SLUG_PREFIX[slug]) {
    throw new Error('addDecision requires taskPath and a known slug');
  }
  const existing = readDecisions(taskPath, slug);
  if (existing) return existing;

  const state = readState(taskPath);
  if (!state || typeof state.taskId !== 'string' || !state.taskId.trim()) {
    throw new Error(`Cannot initialize Decision document without valid task state at ${taskPath}`);
  }
  return {
    stage: SLUG_STAGE[slug],
    taskId: state.taskId,
    decisions: [],
  };
}

function normalizeSupersedes(input) {
  return input.supersedes === undefined ? [] : [...input.supersedes];
}

function validateSupersedes(decisions, slug, supersedes) {
  const unique = new Set(supersedes);
  if (unique.size !== supersedes.length) {
    throw new Error('Decision supersedes contains duplicate targets');
  }

  const expectedPrefix = `${SLUG_PREFIX[slug]}-DEC-`;
  const byId = new Map(decisions.map(decision => [decision.id, decision]));
  const supersededIds = new Set(
    decisions.flatMap(decision => Array.isArray(decision.supersedes) ? decision.supersedes : []),
  );

  for (const targetId of supersedes) {
    if (!targetId.startsWith(expectedPrefix)) {
      throw new Error(`Decision supersedes target is not from the current design type: ${targetId}`);
    }
    if (!byId.has(targetId)) {
      throw new Error(`Decision supersedes target does not exist: ${targetId}`);
    }
    if (supersededIds.has(targetId)) {
      throw new Error(`Decision supersedes target is not currently effective: ${targetId}`);
    }
  }
}

function addDecision(taskPath, slug, input) {
  validateDecisionInput(input);
  const data = loadDecisionsForAdd(taskPath, slug);
  if (!Array.isArray(data.decisions)) throw new Error(`Invalid Decision document for ${slug}`);
  const supersedes = normalizeSupersedes(input);
  validateSupersedes(data.decisions, slug, supersedes);
  const decision = {
    id: nextDecisionId(data.decisions, slug),
    context: input.context,
    userInput: input.userInput,
    candidates: [...input.candidates],
    recommendation: input.recommendation,
    finalDecision: input.finalDecision,
    rationale: input.rationale,
    impact: input.impact,
    evidence: [...input.evidence],
    supersedes,
    recordedAt: new Date().toISOString(),
  };
  data.decisions.push(decision);
  writeDecisions(taskPath, slug, data);
  return decision;
}

const MAIN_ARTIFACT_FILES = Object.fromEntries(
  Object.keys(SLUG_PREFIX).map(slug => [`${slug}.md`, slug]),
);

function resolveMainArtifact(filePath) {
  if (typeof filePath !== 'string') return { isMainArtifact: false };
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const slug = MAIN_ARTIFACT_FILES[parts.at(-1)];
  if (!slug || parts.at(-2) !== 'artifacts') return { isMainArtifact: false };
  return { isMainArtifact: true, taskPath: parts.slice(0, -2).join('/'), slug };
}

function main() {
  const [command, taskPath, slug, ...rest] = process.argv.slice(2);
  try {
    let result;
    if (command === 'init') result = initDecisions(taskPath, slug, rest[0], rest[1]);
    else if (command === 'read') result = readDecisions(taskPath, slug);
    else if (command === 'add') result = addDecision(taskPath, slug, JSON.parse(rest[0]));
    else throw new Error(`Unknown command: ${command}`);
    process.stdout.write(JSON.stringify(result, null, 2));
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  SLUG_PREFIX,
  REQUIRED_FIELDS,
  decisionsPath,
  readDecisions,
  writeDecisions,
  initDecisions,
  validateDecisionInput,
  nextDecisionId,
  addDecision,
  resolveMainArtifact,
  MAIN_ARTIFACT_FILES,
};
