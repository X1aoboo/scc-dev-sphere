#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { readState, writeState } = require('./devsphere-state');
const { designReady } = require('./devsphere-design');

const APPROVAL_TYPES = { DESIGN_FINAL: 'design-final-approval', IMPLEMENTATION_PLAN: 'implementation-plan-approval' };

function readApproval(taskPath, type) {
  try { return JSON.parse(fs.readFileSync(path.join(taskPath, 'approvals', `${type}.json`), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function writeApproval(taskPath, approval) {
  const target = path.join(taskPath, 'approvals', `${approval.type}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(approval, null, 2), 'utf8');
  return target;
}

function validateDesignReady(taskPath) {
  const issues = [];
  const state = readState(taskPath);
  if (!state) return { valid: false, issues: ['State file not found'] };
  if (state.status !== 'design_ready') {
    issues.push(`Task status must be design_ready, got '${state.status}'`);
  }
  const ready = designReady(taskPath);
  issues.push(...ready.issues);
  return {
    valid: issues.length === 0,
    issues,
    artifacts: ready.artifacts || {},
    designApprovals: ready.approvals || {},
    requiredDesignTypes: ready.requiredDesignTypes || [],
  };
}

function approveDesign(taskPath, input) {
  const state = readState(taskPath);
  if (!state || state.status !== 'design_ready') throw new Error('Overall approval requires design_ready');
  if (!input || input.approvedBy !== 'human') throw new Error('Overall design approval must be human');
  const ready = validateDesignReady(taskPath);
  if (!ready.valid) throw new Error(ready.issues.join('; '));
  const approval = {
    approvalId: `APP-${state.taskId}`,
    type: APPROVAL_TYPES.DESIGN_FINAL,
    taskId: state.taskId,
    artifacts: Object.entries(ready.artifacts).map(([designType, ref]) => ({ designType, ...ref })),
    risks: input.risks || [],
    limitations: input.limitations || [],
    approvedBy: 'human',
    approvedAt: new Date().toISOString(),
  };
  writeApproval(taskPath, approval);
  state.status = 'approved_for_implementation';
  writeState(taskPath, state);
  return approval;
}

function main() {
  const [command, taskPath, inputRaw] = process.argv.slice(2);
  try {
    let result;
    if (command === 'validate-design-ready') result = validateDesignReady(taskPath);
    else if (command === 'approve-design') result = approveDesign(taskPath, JSON.parse(inputRaw));
    else throw new Error(`Unknown command: ${command}`);
    process.stdout.write(JSON.stringify(result, null, 2));
    if (command === 'validate-design-ready' && !result.valid) process.exit(1);
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { readApproval, writeApproval, validateDesignReady, approveDesign, APPROVAL_TYPES };
