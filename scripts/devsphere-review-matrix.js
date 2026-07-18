#!/usr/bin/env node
'use strict';

const path = require('path');
const { readJSON, writeJSON } = require('./devsphere-state');

const MATRIX_PATH = 'reviews/review-matrix.json';

// Base review matrix (spec section 9)
const BASE_REVIEWERS = {
  'business-design': ['se'],
  'solution-design': ['sa', 'mde', 'tse'],
  'implementation-design': ['se', 'dev', 'tse'],
  'test-design': ['sa', 'se', 'mde'],
  'integrated-design': ['sa', 'se', 'mde', 'tse'],
};

function readMatrix(taskPath) {
  return readJSON(path.join(taskPath, MATRIX_PATH));
}

function writeMatrix(taskPath, matrix) {
  writeJSON(path.join(taskPath, MATRIX_PATH), matrix);
}

function getBaseReviewers(artifact) {
  return BASE_REVIEWERS[artifact] || [];
}

function initMatrix(taskPath) {
  const matrix = { artifacts: {} };

  for (const [artifact, reviewers] of Object.entries(BASE_REVIEWERS)) {
    matrix.artifacts[artifact] = {
      requiredReviewers: reviewers,
      status: 'pending',
      reviewedVersion: null,
      issues: { blocking: 0, advisory: 0, risk_candidate: 0 },
      issuesList: [],
    };
  }

  writeMatrix(taskPath, matrix);
  return matrix;
}

function hasBlocking(matrix, artifact) {
  if (!matrix || !matrix.artifacts || !matrix.artifacts[artifact]) return false;
  return matrix.artifacts[artifact].issues.blocking > 0;
}

function getPendingAdvisoryItems(matrix) {
  const items = [];
  if (!matrix || !matrix.artifacts) return items;
  for (const [artifactName, artifact] of Object.entries(matrix.artifacts)) {
    if (artifact.issues.advisory > 0) {
      items.push({ artifact: artifactName, count: artifact.issues.advisory });
    }
  }
  return items;
}

// --- Structured issue model ---
// issuesList holds machine-state per issue (no prose — prose lives in review .md, linked by id).
// issues.{blocking,advisory,risk_candidate} are DERIVED counts kept in sync by recomputeCounts,
// so existing consumers (hasBlocking, sync-stage-status, approval) work unchanged.

const TYPE_PREFIX = { blocking: 'B', advisory: 'ADV', risk_candidate: 'RISK' };
const VALID_HUMAN_DECISIONS = ['pending', 'apply', 'no_change', 'convert_to_blocking', 'accepted_risk', 'mitigated', 'rejected'];

function ensureIssuesList(artifactEntry) {
  if (!Array.isArray(artifactEntry.issuesList)) artifactEntry.issuesList = [];
  return artifactEntry.issuesList;
}

function nextIssueId(artifactEntry, type) {
  const prefix = TYPE_PREFIX[type];
  if (!prefix) throw new Error(`Unknown issue type: ${type}`);
  const list = ensureIssuesList(artifactEntry);
  let max = 0;
  for (const it of list) {
    const m = typeof it.id === 'string' ? it.id.match(/^([A-Z]+)-(\d+)$/) : null;
    if (m && m[1] === prefix) max = Math.max(max, parseInt(m[2], 10));
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

// Derive issues.{blocking,advisory,risk_candidate} from issuesList.
function recomputeCounts(artifactEntry) {
  const list = ensureIssuesList(artifactEntry);
  artifactEntry.issues = {
    blocking: list.filter(i => i.type === 'blocking' && i.status === 'open').length,
    advisory: list.filter(i => i.type === 'advisory' && i.humanDecision === 'pending').length,
    risk_candidate: list.filter(i => i.type === 'risk_candidate' && i.humanDecision === 'pending').length,
  };
  return artifactEntry.issues;
}

function findIssue(matrix, issueId) {
  if (!matrix || !matrix.artifacts) return null;
  for (const [artifact, entry] of Object.entries(matrix.artifacts)) {
    const list = ensureIssuesList(entry);
    const idx = list.findIndex(i => i.id === issueId);
    if (idx >= 0) return { artifact, entry, index: idx, issue: list[idx] };
  }
  return null;
}

function addIssue(taskPath, artifact, input) {
  const matrix = readMatrix(taskPath);
  if (!matrix || !matrix.artifacts || !matrix.artifacts[artifact]) {
    throw new Error(`Unknown artifact: ${artifact}`);
  }
  if (!input || !TYPE_PREFIX[input.type]) throw new Error(`Invalid issue type: ${input && input.type}`);
  if (!input.reviewerAgent) throw new Error('reviewerAgent required');
  const entry = matrix.artifacts[artifact];
  const issue = {
    id: nextIssueId(entry, input.type),
    type: input.type,
    reviewerAgent: input.reviewerAgent,
    status: input.status || 'open',
    round: input.round || 1,
    humanDecision: input.humanDecision || 'pending',
    closureEvidence: input.closureEvidence || '',
  };
  ensureIssuesList(entry).push(issue);
  recomputeCounts(entry);
  writeMatrix(taskPath, matrix);
  return issue;
}

function closeIssue(taskPath, issueId, update) {
  const matrix = readMatrix(taskPath);
  const found = findIssue(matrix, issueId);
  if (!found) throw new Error(`Issue not found: ${issueId}`);
  const { entry, issue } = found;
  if (update.status) issue.status = update.status;
  if (update.humanDecision) {
    if (!VALID_HUMAN_DECISIONS.includes(update.humanDecision)) {
      throw new Error(`Invalid humanDecision: ${update.humanDecision}`);
    }
    issue.humanDecision = update.humanDecision;
  }
  if (update.closureEvidence !== undefined) issue.closureEvidence = update.closureEvidence;
  recomputeCounts(entry);
  writeMatrix(taskPath, matrix);
  return issue;
}

function listIssues(taskPath, filters) {
  const matrix = readMatrix(taskPath);
  const out = [];
  if (!matrix || !matrix.artifacts) return out;
  const f = filters || {};
  for (const [artifact, entry] of Object.entries(matrix.artifacts)) {
    if (f.artifact && artifact !== f.artifact) continue;
    for (const it of ensureIssuesList(entry)) {
      if (f.type && it.type !== f.type) continue;
      if (f.status === 'open' && it.status !== 'open') continue;
      if (f.status === 'closed' && it.status === 'open') continue;
      if (f.status === 'pending' && it.humanDecision !== 'pending') continue;
      out.push({ artifact, ...it });
    }
  }
  return out;
}

function getPendingHumanDecisions(matrix, artifact) {
  const out = [];
  if (!matrix || !matrix.artifacts) return out;
  for (const [a, entry] of Object.entries(matrix.artifacts)) {
    if (artifact && a !== artifact) continue;
    for (const it of ensureIssuesList(entry)) {
      if ((it.type === 'advisory' || it.type === 'risk_candidate') && it.humanDecision === 'pending') {
        out.push({ artifact: a, ...it });
      }
    }
  }
  return out;
}

// Issues selected for the next design revision. Blocking issues are always
// included while open; advisory/risk issues are included only after the lead
// records the user's apply decision and before the reviewer closes them.
function getRevisionItems(matrix, artifact) {
  const out = [];
  if (!matrix || !matrix.artifacts) return out;
  for (const [a, entry] of Object.entries(matrix.artifacts)) {
    if (artifact && a !== artifact) continue;
    for (const it of ensureIssuesList(entry)) {
      const blocking = it.type === 'blocking' && it.status === 'open';
      const applied = (it.type === 'advisory' || it.type === 'risk_candidate')
        && it.status === 'open' && it.humanDecision === 'apply';
      if (blocking || applied) out.push({ artifact: a, ...it });
    }
  }
  return out;
}

function getOpenApplyItems(matrix, artifact) {
  return getRevisionItems(matrix, artifact)
    .filter(it => it.humanDecision === 'apply');
}

// Deterministic gate: a non-pending (passed) status requires blocking=0 and all
// advisory/risk decided. This is what enforces "advisory/risk can't pass without human decision".
// New flow: reviewer completion is stamped directly by record-review, so this
// gate only enforces the blocking/pending/apply guards.
function setArtifactStatus(taskPath, artifact, status) {
  const matrix = readMatrix(taskPath);
  if (!matrix || !matrix.artifacts || !matrix.artifacts[artifact]) {
    throw new Error(`Unknown artifact: ${artifact}`);
  }
  const entry = matrix.artifacts[artifact];
  if (status !== 'pending') {
    recomputeCounts(entry);
    const pending = getPendingHumanDecisions(matrix, artifact);
    if (entry.issues.blocking > 0) {
      throw new Error(`Cannot set status '${status}': ${entry.issues.blocking} open blocking issue(s) remain`);
    }
    if (pending.length > 0) {
      throw new Error(`Cannot set status '${status}': ${pending.length} pending advisory/risk decision(s) remain`);
    }
    const openApply = getOpenApplyItems(matrix, artifact);
    if (openApply.length > 0) {
      throw new Error(`Cannot set status '${status}': ${openApply.length} apply revision issue(s) remain open`);
    }
  }
  entry.status = status;
  if (status === 'reviewed') {
    const { parseDraftFrontmatter } = require('./devsphere-design');
    const ap = path.join(taskPath, 'artifacts', `${artifact}.md`);
    const fm = parseDraftFrontmatter(ap);
    entry.reviewedVersion = fm ? fm.version : null;
  } else if (status === 'pending') {
    entry.reviewedVersion = null;
  }
  writeMatrix(taskPath, matrix);
  return { artifact, status: entry.status, issues: entry.issues };
}

// Apply a complete set of role-owned review conclusions in one matrix write.
// Reviewers never call this directly; Lead invokes it after all role snapshots
// for the current artifactVersion are complete.
function applyReviewResults(taskPath, artifact, artifactVersion, snapshots) {
  const matrix = readMatrix(taskPath);
  if (!matrix || !matrix.artifacts || !matrix.artifacts[artifact]) {
    throw new Error(`Unknown artifact: ${artifact}`);
  }
  const entry = matrix.artifacts[artifact];
  const assignedIssueIds = [];
  const normalizedSnapshots = Array.isArray(snapshots) ? snapshots : [];

  // Validate all closure decisions before mutating the matrix so a malformed
  // reviewer result cannot leave a partially merged matrix.
  for (const snapshot of normalizedSnapshots) {
    if (!snapshot || snapshot.artifactId !== artifact || snapshot.artifactVersion !== artifactVersion) {
      throw new Error(`Review result version mismatch for ${snapshot && snapshot.reviewer}`);
    }
    for (const decision of snapshot.closureDecisions || []) {
      if (!decision || typeof decision.issueId !== 'string') {
        throw new Error(`Invalid closure decision from ${snapshot.reviewer}`);
      }
      const found = findIssue(matrix, decision.issueId);
      if (!found || found.artifact !== artifact) {
        throw new Error(`Issue not found in ${artifact}: ${decision.issueId}`);
      }
      if (decision.status && !['open', 'closed'].includes(decision.status)) {
        throw new Error(`Invalid closure status for ${decision.issueId}: ${decision.status}`);
      }
      if (decision.status === 'closed' && !decision.closureEvidence) {
        throw new Error(`Closure evidence required for ${decision.issueId}`);
      }
    }
  }

  for (const snapshot of normalizedSnapshots) {
    for (const decision of snapshot.closureDecisions || []) {
      const found = findIssue(matrix, decision.issueId);
      const issue = found.issue;
      if (decision.status) issue.status = decision.status;
      if (decision.closureEvidence !== undefined) issue.closureEvidence = decision.closureEvidence;
    }

    for (const finding of snapshot.issueFindings || []) {
      if (!finding || !TYPE_PREFIX[finding.type]) {
        throw new Error(`Invalid issue type from ${snapshot.reviewer}: ${finding && finding.type}`);
      }
      const findingId = finding.findingId;
      if (typeof findingId !== 'string' || findingId.length === 0) {
        throw new Error(`findingId required for ${snapshot.reviewer}`);
      }
      const source = `${artifact}@${artifactVersion}:${snapshot.reviewer}:${findingId}`;
      const existing = ensureIssuesList(entry).find(issue => issue.source === source);
      if (existing) {
        assignedIssueIds.push({ reviewer: snapshot.reviewer, findingId, issueId: existing.id, reused: true });
        continue;
      }
      const issue = {
        id: nextIssueId(entry, finding.type),
        type: finding.type,
        reviewerAgent: finding.reviewerAgent || snapshot.reviewer,
        status: 'open',
        round: finding.round || 1,
        // Human decisions are owned by Lead. Reviewers can only propose an
        // issue; advisory/risk therefore always start as pending.
        humanDecision: 'pending',
        closureEvidence: '',
        source,
      };
      ensureIssuesList(entry).push(issue);
      assignedIssueIds.push({ reviewer: snapshot.reviewer, findingId, issueId: issue.id, reused: false });
    }
  }

  recomputeCounts(entry);
  writeMatrix(taskPath, matrix);
  return { artifact, artifactVersion, assignedIssueIds, issues: entry.issues };
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'init': {
        const taskPath = args[1];
        const matrix = initMatrix(taskPath);
        process.stdout.write(JSON.stringify(matrix));
        break;
      }
      case 'read': {
        const taskPath = args[1];
        const matrix = readMatrix(taskPath);
        process.stdout.write(JSON.stringify(matrix));
        break;
      }
      case 'has-blocking': {
        const taskPath = args[1];
        const artifact = args[2];
        const matrix = readMatrix(taskPath);
        process.stdout.write(JSON.stringify({ blocking: hasBlocking(matrix, artifact) }));
        break;
      }
      case 'add': {
        const taskPath = args[1];
        const artifact = args[2];
        let input;
        try { input = JSON.parse(args[3]); } catch (e) {
          throw new Error(`Invalid issue JSON arg: ${e.message}`);
        }
        process.stdout.write(JSON.stringify(addIssue(taskPath, artifact, input)));
        break;
      }
      case 'list': {
        const taskPath = args[1];
        const filters = {};
        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--artifact') filters.artifact = args[++i];
          else if (args[i] === '--type') filters.type = args[++i];
          else if (args[i] === '--status') filters.status = args[++i];
        }
        process.stdout.write(JSON.stringify(listIssues(taskPath, filters), null, 2));
        break;
      }
      case 'close': {
        const taskPath = args[1];
        const issueId = args[2];
        const update = {};
        for (let i = 3; i < args.length; i++) {
          if (args[i] === '--status') update.status = args[++i];
          else if (args[i] === '--decision') update.humanDecision = args[++i];
          else if (args[i] === '--closure') update.closureEvidence = args[++i];
        }
        process.stdout.write(JSON.stringify(closeIssue(taskPath, issueId, update)));
        break;
      }
      case 'set-status': {
        const taskPath = args[1];
        const artifact = args[2];
        const status = args[3];
        process.stdout.write(JSON.stringify(setArtifactStatus(taskPath, artifact, status)));
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
  readMatrix, writeMatrix, initMatrix,
  hasBlocking, getPendingAdvisoryItems, getBaseReviewers,
  addIssue, closeIssue, listIssues, recomputeCounts, setArtifactStatus,
  getPendingHumanDecisions, findIssue,
  getRevisionItems, getOpenApplyItems,
  applyReviewResults,
  ensureIssuesList, nextIssueId,
  BASE_REVIEWERS, TYPE_PREFIX, VALID_HUMAN_DECISIONS,
};
