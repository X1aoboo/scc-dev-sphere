#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { readJSON, readState } = require('./devsphere-state');
const {
  readMatrix,
  getBaseReviewers,
  applyReviewResults,
  setArtifactStatus,
} = require('./devsphere-review-matrix');

const REVIEW_ROOT = 'reviews';
const REVIEWER_ROLES = new Set(['sa', 'se', 'mde', 'tse', 'dev', 'cie']);

function validateSlug(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

function validateRole(role) {
  if (!REVIEWER_ROLES.has(role)) throw new Error(`Invalid reviewer role: ${role}`);
  return role;
}

function reviewDir(taskPath, artifact) {
  return path.join(taskPath, REVIEW_ROOT, validateSlug(artifact, 'artifact'));
}

function snapshotPath(taskPath, artifact, reviewer) {
  return path.join(reviewDir(taskPath, artifact), `${validateRole(reviewer)}.json`);
}

function markdownPath(taskPath, artifact, reviewer) {
  return path.join(reviewDir(taskPath, artifact), `${validateRole(reviewer)}-review.md`);
}

function writeAtomicJSON(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function readArtifactVersion(taskPath, artifact) {
  const filePath = path.join(taskPath, 'artifacts', `${validateSlug(artifact, 'artifact')}.md`);
  if (!fs.existsSync(filePath)) throw new Error(`Artifact not found: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf-8');
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) throw new Error(`Artifact frontmatter not found: ${artifact}`);
  const version = frontmatter[1].match(/^\s*version\s*:\s*["']?([^"'#\r\n]+?)["']?\s*$/m);
  if (!version || !version[1].trim()) throw new Error(`Artifact version not found: ${artifact}`);
  return version[1].trim();
}

function expectedReviewers(taskPath, artifact) {
  const matrix = readMatrix(taskPath);
  if (!matrix || !matrix.artifacts || !matrix.artifacts[artifact]) {
    throw new Error(`Unknown artifact: ${artifact}`);
  }
  const roles = Array.isArray(matrix.artifacts[artifact].requiredReviewers)
    ? matrix.artifacts[artifact].requiredReviewers.slice()
    : getBaseReviewers(artifact).slice();
  const state = readState(taskPath);
  if (state && state.ciCdRisk === true && !roles.includes('cie')) roles.push('cie');
  return roles.map(validateRole);
}

function readSnapshot(taskPath, artifact, reviewer) {
  return readJSON(snapshotPath(taskPath, artifact, reviewer));
}

function currentSnapshot(snapshot, artifact, artifactVersion) {
  return !!(snapshot
    && snapshot.artifactId === artifact
    && snapshot.artifactVersion === artifactVersion);
}

function authorizeReview(taskPath, artifact, artifactVersion, reviewers) {
  const currentVersion = readArtifactVersion(taskPath, artifact);
  if (currentVersion !== artifactVersion) {
    throw new Error(`Artifact version mismatch: expected ${currentVersion}, got ${artifactVersion}`);
  }
  const required = expectedReviewers(taskPath, artifact);
  const requested = reviewers === undefined ? required : reviewers.map(validateRole);
  if (requested.length !== required.length || requested.some(role => !required.includes(role))) {
    throw new Error(`Reviewers do not match required matrix: ${requested.join(', ')}`);
  }
  const now = new Date().toISOString();
  for (const reviewer of required) {
    const existing = readSnapshot(taskPath, artifact, reviewer);
    if (currentSnapshot(existing, artifact, artifactVersion)
      && ['completed', 'merged'].includes(existing.status)) continue;
    writeAtomicJSON(snapshotPath(taskPath, artifact, reviewer), {
      artifactId: artifact,
      artifactVersion,
      reviewer,
      status: 'authorized',
      issueFindings: [],
      closureDecisions: [],
      authorizedAt: now,
      updatedAt: now,
    });
  }
  return getReviewStatus(taskPath, artifact, artifactVersion);
}

function normalizeReviewResult(taskPath, artifact, reviewer, result) {
  validateRole(reviewer);
  if (!result || result.artifactId !== artifact) throw new Error('Review result artifactId mismatch');
  const artifactVersion = readArtifactVersion(taskPath, artifact);
  if (result.artifactVersion !== artifactVersion) {
    throw new Error(`Review result version mismatch: expected ${artifactVersion}, got ${result.artifactVersion}`);
  }
  const required = expectedReviewers(taskPath, artifact);
  if (!required.includes(reviewer)) throw new Error(`${reviewer} is not a required reviewer for ${artifact}`);
  const existing = readSnapshot(taskPath, artifact, reviewer);
  if (!currentSnapshot(existing, artifact, artifactVersion)) {
    throw new Error(`Review is not authorized for ${artifact}@${artifactVersion}: ${reviewer}`);
  }
  const issueFindings = Array.isArray(result.issueFindings) ? result.issueFindings : [];
  const seen = new Set();
  const normalizedFindings = issueFindings.map((finding, index) => {
    if (!finding || !['blocking', 'advisory', 'risk_candidate'].includes(finding.type)) {
      throw new Error(`Invalid review issue type from ${reviewer}`);
    }
    const findingId = finding.findingId || `${reviewer}-${String(index + 1).padStart(3, '0')}`;
    if (seen.has(findingId)) throw new Error(`Duplicate findingId from ${reviewer}: ${findingId}`);
    seen.add(findingId);
    return {
      findingId,
      type: finding.type,
      reviewerAgent: reviewer,
      round: finding.round || 1,
    };
  });
  const closureDecisions = Array.isArray(result.closureDecisions) ? result.closureDecisions.map(decision => {
    if (!decision || typeof decision.issueId !== 'string') throw new Error(`Invalid closure decision from ${reviewer}`);
    if (decision.status && !['open', 'closed'].includes(decision.status)) {
      throw new Error(`Invalid closure status for ${decision.issueId}`);
    }
    if (decision.status === 'closed' && !decision.closureEvidence) {
      throw new Error(`Closure evidence required for ${decision.issueId}`);
    }
    return {
      issueId: decision.issueId,
      status: decision.status || 'closed',
      closureEvidence: decision.closureEvidence || '',
    };
  }) : [];
  return {
    ...existing,
    artifactId: artifact,
    artifactVersion,
    reviewer,
    status: 'completed',
    issueFindings: normalizedFindings,
    closureDecisions,
    summary: result.summary || '',
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function recordReviewResult(taskPath, artifact, reviewer, result) {
  const normalized = normalizeReviewResult(taskPath, artifact, reviewer, result);
  writeAtomicJSON(snapshotPath(taskPath, artifact, reviewer), normalized);
  return normalized;
}

function getReviewStatus(taskPath, artifact, artifactVersion) {
  const version = artifactVersion || readArtifactVersion(taskPath, artifact);
  const requiredReviewers = expectedReviewers(taskPath, artifact);
  const snapshots = requiredReviewers.map(reviewer => ({
    reviewer,
    snapshot: readSnapshot(taskPath, artifact, reviewer),
  }));
  const missingReviewers = [];
  const staleReviewers = [];
  const pendingReviewers = [];
  const completedReviewers = [];
  const mergedReviewers = [];
  for (const { reviewer, snapshot } of snapshots) {
    if (!currentSnapshot(snapshot, artifact, version)) {
      if (snapshot) staleReviewers.push(reviewer);
      missingReviewers.push(reviewer);
      continue;
    }
    if (['completed', 'merged'].includes(snapshot.status)) completedReviewers.push(reviewer);
    if (snapshot.status === 'merged') mergedReviewers.push(reviewer);
    if (!['completed', 'merged'].includes(snapshot.status)) pendingReviewers.push(reviewer);
  }
  return {
    artifact,
    artifactVersion: version,
    requiredReviewers,
    snapshots,
    completedReviewers,
    mergedReviewers,
    missingReviewers,
    staleReviewers,
    pendingReviewers,
    hasCurrentReview: snapshots.some(({ snapshot }) => currentSnapshot(snapshot, artifact, version)),
    allCompleted: missingReviewers.length === 0 && pendingReviewers.length === 0,
    allMerged: mergedReviewers.length === requiredReviewers.length,
  };
}

function mergeReviewResults(taskPath, artifact, artifactVersion) {
  const status = getReviewStatus(taskPath, artifact, artifactVersion);
  if (!status.allCompleted) {
    throw new Error(`Cannot merge review results: incomplete reviewer(s): ${status.missingReviewers.concat(status.pendingReviewers).join(', ')}`);
  }
  const snapshots = status.snapshots
    .map(item => item.snapshot)
    .filter(snapshot => snapshot && snapshot.status === 'completed');
  let merged = null;
  if (snapshots.length > 0) {
    merged = applyReviewResults(taskPath, artifact, artifactVersion, snapshots);
  }
  const now = new Date().toISOString();
  for (const { reviewer, snapshot } of status.snapshots) {
    if (!snapshot || snapshot.status === 'merged') continue;
    writeAtomicJSON(snapshotPath(taskPath, artifact, reviewer), {
      ...snapshot,
      status: 'merged',
      mergedAt: now,
      updatedAt: now,
      assignedIssueIds: merged ? merged.assignedIssueIds.filter(item => item.reviewer === reviewer) : [],
    });
  }

  let artifactStatus = 'pending';
  let gateReason = '';
  try {
    setArtifactStatus(taskPath, artifact, 'reviewed');
    artifactStatus = 'reviewed';
  } catch (error) {
    gateReason = error.message;
  }
  return {
    artifact,
    artifactVersion,
    status: artifactStatus,
    gateReason,
    merged: !!merged,
    assignedIssueIds: merged ? merged.assignedIssueIds : [],
  };
}

function parseJSONArg(value, label) {
  try { return JSON.parse(value); }
  catch (error) { throw new Error(`Invalid ${label} JSON: ${error.message}`); }
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  try {
    switch (command) {
      case 'artifact-version':
        process.stdout.write(JSON.stringify({ artifactVersion: readArtifactVersion(args[1], args[2]) }));
        break;
      case 'authorize': {
        const reviewers = args[4] ? parseJSONArg(args[4], 'reviewers') : undefined;
        process.stdout.write(JSON.stringify(authorizeReview(args[1], args[2], args[3], reviewers), null, 2));
        break;
      }
      case 'complete':
        process.stdout.write(JSON.stringify(recordReviewResult(args[1], args[2], args[3], parseJSONArg(args[4], 'review result')), null, 2));
        break;
      case 'status':
        process.stdout.write(JSON.stringify(getReviewStatus(args[1], args[2], args[3]), null, 2));
        break;
      case 'merge':
        process.stdout.write(JSON.stringify(mergeReviewResults(args[1], args[2], args[3]), null, 2));
        break;
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        process.exit(1);
    }
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  REVIEW_ROOT,
  readArtifactVersion,
  reviewDir,
  snapshotPath,
  markdownPath,
  expectedReviewers,
  readSnapshot,
  authorizeReview,
  recordReviewResult,
  getReviewStatus,
  mergeReviewResults,
  writeAtomicJSON,
};
