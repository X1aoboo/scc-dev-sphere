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
      issues: { blocking: 0, advisory: 0, risk_candidate: 0 },
      reviews: {},
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
  BASE_REVIEWERS,
};
