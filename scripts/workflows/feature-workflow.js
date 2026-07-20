'use strict';

const { readCurrentTask, readState, writeState, getTaskPath } = require('../devsphere-state');
const { designReady, syncDesignState } = require('../devsphere-design');

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

function resolveNextAction(taskPath, state) {
  switch (state.status) {
    case 'initialized':
      return makeAction('run_skill', state, null, null, 'feature-clarify', [],
        'Clarify the existing proposal and publish an approved Requirement Baseline before design.',
        ['inputs/proposal.md'],
        ['inputs/requirement.md'],
        {
          proposalPath: 'inputs/proposal.md',
          draftPath: 'work/requirement-draft.md',
          baselinePath: 'inputs/requirement.md',
        });
    case 'clarified':
      return makeAction('run_skill', state, 'design', null, 'feature-design', [],
        'The approved Requirement Baseline is ready for collaborative Feature Design.',
        ['inputs/requirement.md']);
    case 'designing':
      return makeAction('run_skill', state, 'design', null, 'feature-design', [],
        'Feature Design runs in the main session, recovers the current design activity from workspace facts, and applies one shared design process.');
    case 'design_ready':
      return makeAction('run_skill', state, null, 'design-final', 'feature-approve', [],
        'The required Design Baseline set is ready for overall approval.',
        (state.requiredDesignTypes || []).map(designType => `artifacts/${({
          businessDesign: 'business-design',
          solutionDesign: 'solution-design',
          implementationDesign: 'implementation-design',
          testDesign: 'test-design',
        })[designType]}.md`),
        ['approvals/design-final-approval.json']);
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

module.exports = { resolveNextAction, setTaskStatus };
