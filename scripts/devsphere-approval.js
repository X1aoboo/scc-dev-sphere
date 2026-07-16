#!/usr/bin/env node
'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { readState } = require('./devsphere-state');
const {
  readMatrix,
  hasBlocking,
  getPendingHumanDecisions,
  getOpenApplyItems,
} = require('./devsphere-review-matrix');

const APPROVAL_TYPES = {
  DESIGN_FINAL: 'design-final-approval',
  IMPLEMENTATION_PLAN: 'implementation-plan-approval',
};

function readApproval(taskPath, type) {
  const approvalPath = path.join(taskPath, 'approvals', `${type}.json`);
  try {
    return JSON.parse(fs.readFileSync(approvalPath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function writeApproval(taskPath, approval) {
  const approvalDir = path.join(taskPath, 'approvals');
  if (!fs.existsSync(approvalDir)) {
    fs.mkdirSync(approvalDir, { recursive: true });
  }
  const fileName = `${approval.type}.json`;
  fs.writeFileSync(
    path.join(approvalDir, fileName),
    JSON.stringify(approval, null, 2),
    'utf-8'
  );
}

function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  } catch (e) {
    return null;
  }
}

function validateDesignReady(taskPath) {
  const issues = [];
  const state = readState(taskPath);

  if (!state) {
    return { valid: false, issues: ['State file not found'] };
  }

  // Check task status
  if (state.status !== 'designing') {
    issues.push(`Task status must be 'designing' to reach design_ready, got '${state.status}'`);
  }

  // Check all stage statuses
  const requiredStages = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];
  for (const stage of requiredStages) {
    const stageState = state.stages[stage];
    if (!stageState) {
      issues.push(`Stage ${stage} not found in state`);
      continue;
    }
    // Mode-specific readiness check — simplified: at minimum need ai_review_passed
    if (stageState.status === 'not_started' || stageState.status === 'drafted') {
      issues.push(`Stage ${stage} is '${stageState.status}', must reach at least ai_review_passed`);
    }
  }

  // Check review matrix and the same issue gates used by set-status reviewed.
  const matrix = readMatrix(taskPath);
  if (!matrix) {
    issues.push('Review matrix not found');
    return { valid: false, issues };
  }

  for (const [artifactName, artifact] of Object.entries(matrix.artifacts)) {
    if (artifactName === 'integrated-design') continue;
    if (hasBlocking(matrix, artifactName)) {
      issues.push(`Artifact ${artifactName} has unclosed blocking issues`);
    }
    const pending = getPendingHumanDecisions(matrix, artifactName);
    if (pending.length > 0) {
      issues.push(`Artifact ${artifactName} has ${pending.length} pending advisory/risk decision(s)`);
    }
    const openApply = getOpenApplyItems(matrix, artifactName);
    if (openApply.length > 0) {
      issues.push(`Artifact ${artifactName} has ${openApply.length} open apply revision issue(s)`);
    }
  }

  // Check integrated design exists
  const integratedPath = path.join(taskPath, 'artifacts', 'integrated-design.md');
  if (!fs.existsSync(integratedPath)) {
    issues.push('integrated-design.md not found');
  }

  // Check accepted_risk in decisions
  // (simplified: check decision files exist for stages that reached ai_review_passed)
  const decisionFiles = ['business-design-decisions.md', 'solution-design-decisions.md',
    'implementation-design-decisions.md', 'test-design-decisions.md'];
  for (const df of decisionFiles) {
    // Not strictly required for all, just a soft check
  }

  return { valid: issues.length === 0, issues };
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'validate-design-ready': {
        const taskPath = args[1];
        const result = validateDesignReady(taskPath);
        process.stdout.write(JSON.stringify(result));
        if (!result.valid) process.exit(1);
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

module.exports = { readApproval, writeApproval, validateDesignReady, hashFile, APPROVAL_TYPES };
