'use strict';

const fs = require('fs');
const path = require('path');
const { readCurrentTask, readState, writeState, getTaskPath } = require('../devsphere-state');
const {
  DESIGN_TYPES,
  designReady,
  inspectDesign,
  readArtifactRef,
  syncDesignState,
} = require('../devsphere-design');
const { TRANSITIONS } = require('../devsphere-guard');
const {
  EXTERNAL_TEST_DESIGN_OUTPUT_DIR,
  testDesignTaskIssues,
} = require('../devsphere-test-design-config');

const DESIGN_SEQUENCE = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];
const DESIGN_ENTRY_REQUIREMENTS = {
  businessDesign: { kind: 'requirement', path: 'inputs/requirement.md' },
  solutionDesign: { kind: 'design', designType: 'businessDesign', path: 'artifacts/business-design.md' },
  implementationDesign: { kind: 'design', designType: 'solutionDesign', path: 'artifacts/solution-design.md' },
  testDesign: { kind: 'design', designType: 'implementationDesign', path: 'artifacts/implementation-design.md' },
};

function nextRequiredDesignType(taskPath, state) {
  const required = state.requiredDesignTypes || [];
  return DESIGN_SEQUENCE.find(designType => required.includes(designType) && !readArtifactRef(taskPath, designType)) || null;
}

function validateDesignEntry(taskPath, designType) {
  if (!DESIGN_TYPES[designType]) throw new Error(`Unknown design type: ${designType}`);
  const state = readState(taskPath);
  if (!state) throw new Error('State file not found');
  if (state.status !== 'designing') {
    throw new Error(`Design entry requires task status 'designing', got '${state.status}'`);
  }

  const requirement = DESIGN_ENTRY_REQUIREMENTS[designType];
  if (requirement.kind === 'requirement') {
    const baseline = path.join(taskPath, requirement.path);
    if (!fs.existsSync(baseline) || !fs.readFileSync(baseline, 'utf8').trim()) {
      throw new Error(`Requirement Baseline is missing or empty: ${requirement.path}`);
    }
  } else {
    const upstream = inspectDesign(taskPath, requirement.designType);
    if (upstream.recovery !== 'baseline_complete' || !upstream.approval.valid) {
      throw new Error(`${DESIGN_TYPES[requirement.designType].slug} Baseline must be valid and human-approved before ${DESIGN_TYPES[designType].slug}`);
    }
  }

  return { valid: true, designType, requiredBaseline: requirement.path };
}

function makeAction(kind, state, stage, target, skill, agents, reason, required = [], expected = [], args = {}) {
  return {
    kind,
    taskType: 'feature',
    taskId: state.taskId,
    status: state.status,
    stage: stage || null,
    target: target || null,
    skill: skill || null,
    args,
    agents: agents || [],
    reason,
    requiredArtifacts: required,
    expectedArtifacts: expected,
    pause: null,
  };
}

function featureApproveAction(state) {
  return makeAction('run_skill', state, null, 'design-final', 'feature-approve', [],
    'The required design and test-design facts are ready for overall approval.',
    (state.requiredDesignTypes || []).map(designType => `artifacts/${({
      businessDesign: 'business-design',
      solutionDesign: 'solution-design',
      implementationDesign: 'implementation-design',
      testDesign: 'test-design',
    })[designType]}.md`),
    ['approvals/design-final-approval.json']);
}

function resolveNextAction(taskPath, state) {
  switch (state.status) {
    case 'initialized':
      return makeAction('run_skill', state, null, null, 'feature-clarify', [],
        'Clarify the existing proposal and publish an approved Requirement Baseline before design.',
        ['inputs/proposal.md'],
        ['inputs/requirement.md'],
        {
          proposalPath: 'inputs/proposal.md',
          draftPath: 'inputs/requirement-draft.md',
          baselinePath: 'inputs/requirement.md',
        });
    case 'clarified':
      return makeAction('run_skill', state, 'design', null, 'feature-design', [],
        'The approved Requirement Baseline is ready for Business Design.',
        ['inputs/requirement.md'], [], { designType: 'businessDesign' });
    case 'designing': {
      const designType = nextRequiredDesignType(taskPath, state);
      if (!designType) {
        return makeAction('sync_design_status', state, 'design', null, null, [],
          'All required Design Baselines exist. Synchronize design status before continuing.');
      }
      const requirement = DESIGN_ENTRY_REQUIREMENTS[designType];
      return makeAction('run_skill', state, 'design', null, 'feature-design', [],
        `Continue the fixed design sequence with ${designType}; the outer workflow validates its upstream Baseline.`,
        [requirement.path], [], { designType });
    }
    case 'design_ready':
      if (!state.externalTestDesign) return featureApproveAction(state);
      return makeAction('run_skill', state, 'external-test-design', null,
        state.externalTestDesign.skillId, [],
        'All required Design Baselines are ready. Run the configured external test-design Skill.',
        [
          'inputs/requirement.md',
          'artifacts/business-design.md',
          'artifacts/solution-design.md',
          'artifacts/implementation-design.md',
        ], [], { taskPath, outputDir: EXTERNAL_TEST_DESIGN_OUTPUT_DIR });
    case 'external_test_design_ready':
      return featureApproveAction(state);
    case 'approved_for_implementation':
      return makeAction('run_skill', state, null, 'implementation-plan', 'feature-plan-implementation', ['dev'],
        'Overall design approved. Generate the implementation plan.',
        ['approvals/design-final-approval.json'], ['implementation/implementation-plan.md']);
    case 'implementation_planned':
    case 'implementing':
      return makeAction('run_skill', state, null, 'implementation', 'feature-implement', ['dev'],
        'Implement the approved design.', ['implementation/implementation-plan.md'], ['implementation/implementation-log.md']);
    case 'verification_ready':
      return makeAction('run_skill', state, null, 'verification', 'feature-verify', ['dev'],
        'Verify the implementation.', [], ['verification/test-handoff.md']);
    case 'completed':
      return makeAction('completed', state, null, null, null, [], 'Task is completed.');
    case 'blocked':
      return makeAction('blocked', state, null, null, null, [], 'Task is blocked.');
    default:
      return makeAction('show_status', state, null, null, null, [], `Unhandled status: ${state.status}`);
  }
}

function completeExternalTestDesign(workspaceRoot) {
  const taskPath = getTaskPath(workspaceRoot);
  if (!taskPath) throw new Error('No active task');
  const state = readState(taskPath);
  if (!state) throw new Error('No state file');
  if (state.status !== 'design_ready') {
    throw new Error(`complete-external-test-design requires status 'design_ready', got '${state.status}'`);
  }
  if (!state.externalTestDesign || typeof state.externalTestDesign.skillId !== 'string'
      || !state.externalTestDesign.skillId.trim()) {
    throw new Error('External test design is not enabled for this task');
  }
  const contractIssues = testDesignTaskIssues(state);
  if (contractIssues.length) throw new Error(contractIssues.join('; '));
  const ready = designReady(taskPath);
  if (!ready.valid) throw new Error(ready.issues.join('; '));

  const requiredInputs = [
    'inputs/requirement.md',
    'artifacts/business-design.md',
    'artifacts/solution-design.md',
    'artifacts/implementation-design.md',
  ];
  const missing = requiredInputs.filter(relative => !fs.existsSync(path.join(taskPath, relative)));
  if (missing.length) throw new Error(`Missing external test-design inputs: ${missing.join(', ')}`);
  if (!(TRANSITIONS.design_ready || []).includes('external_test_design_ready')) {
    throw new Error('Invalid transition: design_ready -> external_test_design_ready');
  }

  state.externalTestDesign.completedAt = new Date().toISOString();
  state.status = 'external_test_design_ready';
  writeState(taskPath, state);
  return {
    synced: true,
    status: state.status,
    externalTestDesign: state.externalTestDesign,
  };
}

function setTaskStatus(workspaceRoot, newStatus) {
  const current = readCurrentTask(workspaceRoot);
  if (!current || !current.activeTaskId) throw new Error('No active task');
  const taskPath = getTaskPath(workspaceRoot);
  const state = readState(taskPath);
  if (!state) throw new Error('No state file');
  if (newStatus === 'approved_for_implementation') {
    throw new Error('Overall approval must use devsphere-approval.js approve-design');
  }
  const allowedTransitions = {
    initialized: ['clarified'],
    clarified: ['designing'],
    designing: ['design_ready'],
  };
  if (newStatus && newStatus !== state.status && !(allowedTransitions[state.status] || []).includes(newStatus)) {
    throw new Error(`Invalid generic status transition: ${state.status} -> ${newStatus}`);
  }
  if (newStatus === 'design_ready') {
    const ready = designReady(taskPath);
    if (!ready.valid) throw new Error(ready.issues.join('; '));
  }
  if (newStatus) state.status = newStatus;
  writeState(taskPath, state);
  return { synced: true, status: state.status };
}

function main() {
  const args = process.argv.slice(2);
  const [command, workspaceRoot, newStatus] = args;
  try {
    let result;
    if (command === 'set-task-status') {
      if (args.length !== 3) throw new Error('Usage: set-task-status <workspaceRoot> <newStatus>');
      result = setTaskStatus(workspaceRoot, newStatus);
    } else if (command === 'sync-design-status') {
      if (args.length !== 2) throw new Error('Usage: sync-design-status <workspaceRoot>');
      const taskPath = getTaskPath(workspaceRoot);
      if (!taskPath) throw new Error('No active task');
      result = syncDesignState(taskPath);
    } else if (command === 'validate-design-entry') {
      if (args.length !== 3) throw new Error('Usage: validate-design-entry <workspaceRoot> <designType>');
      const taskPath = getTaskPath(workspaceRoot);
      if (!taskPath) throw new Error('No active task');
      result = validateDesignEntry(taskPath, newStatus);
    } else if (command === 'complete-external-test-design') {
      if (args.length !== 2) throw new Error('Usage: complete-external-test-design <workspaceRoot>');
      result = completeExternalTestDesign(workspaceRoot);
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  DESIGN_SEQUENCE,
  DESIGN_ENTRY_REQUIREMENTS,
  EXTERNAL_TEST_DESIGN_OUTPUT_DIR,
  nextRequiredDesignType,
  validateDesignEntry,
  resolveNextAction,
  setTaskStatus,
  completeExternalTestDesign,
};
