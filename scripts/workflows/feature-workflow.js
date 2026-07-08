'use strict';

const path = require('path');
const fs = require('fs');
const { readMatrix, hasBlocking } = require('../devsphere-review-matrix');
const { readCurrentTask, readState, writeState, getTaskPath } = require('../devsphere-state');

/**
 * Feature workflow decision table (spec section 8).
 * Returns a nextAction object describing the single minimal next step.
 */
function resolveNextAction(taskPath, state) {
  const status = state.status;
  const stages = state.stages || {};
  const mode = state.workflowMode || 'auto-design';
  const humanGates = state.humanGateStages || [];

  // --- No active task edge case (handled by router) ---

  // --- initialized ---
  if (status === 'initialized') {
    return makeAction('run_skill', state, null, null,
      'feature-assess', {}, ['sa'],
      'Task initialized. Proceed with complexity and risk assessment.',
      [], []);
  }

  // --- assessed ---
  // feature-design is a sub-orchestrator that runs in the main session (agents=[]).
  // It must NOT be dispatched as an Agent task — it routes to design sub-skills itself.
  if (status === 'assessed') {
    return makeAction('run_skill', state, 'design', null,
      'feature-design', {}, [],
      'Assessment complete. Begin design phase.',
      [], ['artifacts/business-design.md']);
  }

  // --- designing ---
  if (status === 'designing') {
    return resolveDesigning(taskPath, state, stages, mode, humanGates);
  }

  // --- design_ready ---
  if (status === 'design_ready') {
    return makeAction('run_skill', state, null, 'design-final',
      'feature-approve', {}, [],
      'All design phases complete. Proceed with final design approval.',
      ['artifacts/integrated-design.md', 'reviews/review-matrix.json'],
      ['approvals/design-final-approval.json']);
  }

  // --- approved_for_implementation ---
  if (status === 'approved_for_implementation') {
    return makeAction('run_skill', state, null, 'implementation-plan',
      'feature-plan-implementation', {}, ['dev'],
      'Design approved. Generate implementation plan before coding.',
      ['approvals/design-final-approval.json'],
      ['implementation/implementation-plan.md']);
  }

  // --- implementation_planned ---
  if (status === 'implementation_planned') {
    return makeAction('run_skill', state, null, 'implementation',
      'feature-implement', {}, ['dev'],
      'Implementation plan ready. Begin code implementation. First code change requires human confirmation.',
      ['implementation/implementation-plan.md', 'links/repos.json'],
      ['implementation/implementation-log.md']);
  }

  // --- implementing ---
  if (status === 'implementing') {
    return makeAction('run_skill', state, null, 'implementation',
      'feature-implement', {}, ['dev'],
      'Continue implementation, fix issues, or supplement tests.',
      [], []);
  }

  // --- verification_ready ---
  if (status === 'verification_ready') {
    return makeAction('run_skill', state, null, 'verification',
      'feature-verify', {}, ['dev'],
      'Code implementation complete. Run verification and generate test handoff package.',
      [], ['verification/test-handoff.md']);
  }

  // --- completed ---
  if (status === 'completed') {
    return makeAction('completed', state, null, null, null, {}, [],
      'Task is completed. No further workflow actions available.',
      [], []);
  }

  // --- blocked ---
  if (status === 'blocked') {
    return makeAction('blocked', state, null, null, null, {}, [],
      'Task is blocked. Review the blocked reason and resolve before continuing.',
      [], []);
  }

  // --- fallback ---
  return makeAction('show_status', state, null, null, null, {}, [],
    `Unknown or unhandled status: ${status}`,
    [], []);
}

function resolveDesigning(taskPath, state, stages, mode, humanGates) {
  // All design sub-stage routing delegated to feature-design skill.
  // resolver only decides the top-level entry point.
  return makeAction('run_skill', state, 'design', null,
    'feature-design', {}, [],
    'Task is in designing phase. Delegate to feature-design for sub-stage routing.',
    [], []);
}

// --- Helpers ---

function isStageReady(stageStatus, stageName, mode, humanGates) {
  if (mode === 'strict-human-loop') return stageStatus === 'human_approved';
  if (mode === 'collaborative-design' && humanGates.includes(stageName)) {
    return stageStatus === 'human_approved';
  }
  return stageStatus === 'ai_review_passed' || stageStatus === 'human_approved';
}

function stageToArtifact(stageName) {
  const map = {
    businessDesign: 'business-design',
    solutionDesign: 'solution-design',
    implementationDesign: 'implementation-design',
    testDesign: 'test-design',
  };
  return map[stageName] || stageName;
}

function getDesignSkill(stageName) {
  const map = {
    businessDesign: 'feature-design-business',
    solutionDesign: 'feature-design-solution',
    implementationDesign: 'feature-design-implementation',
    testDesign: 'feature-design-test',
  };
  return map[stageName];
}

function getDesignAgent(stageName) {
  const map = {
    businessDesign: 'sa',
    solutionDesign: 'se',
    implementationDesign: 'mde',
    testDesign: 'tse',
  };
  return map[stageName];
}

function getDesignReviewers(stageName) {
  const map = {
    businessDesign: ['se'],
    solutionDesign: ['sa', 'mde', 'tse'],
    implementationDesign: ['se', 'dev', 'tse'],
    testDesign: ['sa', 'se', 'mde'],
  };
  return map[stageName] || [];
}

function makeAction(kind, state, stage, target, skill, args, agents, reason, required, expected, pause) {
  return {
    kind,
    taskType: 'feature',
    taskId: state.taskId,
    status: state.status,
    stage: stage || null,
    target: target || null,
    skill: skill || null,
    args: args || {},
    agents: agents || [],
    reason,
    requiredArtifacts: required || [],
    expectedArtifacts: expected || [],
    pause: pause || null,
  };
}

function makeHumanConfirm(state, stage, target, reason, required, expected, pause) {
  return makeAction('human_confirm', state, stage, target, null, {}, [],
    reason, required || [], expected || [], pause || null);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'sync-stage-status': {
      const workspaceRoot = args[1];
      const current = readCurrentTask(workspaceRoot);
      if (!current || !current.activeTaskId) {
        process.stdout.write(JSON.stringify({ synced: false, reason: 'No active task' }));
        process.exit(0);
      }
      const taskPath = getTaskPath(workspaceRoot);
      const state = readState(taskPath);
      if (!state || !state.stages) {
        process.stdout.write(JSON.stringify({ synced: false, reason: 'No stages in state' }));
        process.exit(0);
      }

      const updated = [];
      for (const [stageName, stageData] of Object.entries(state.stages)) {
        if (!stageData.artifact) continue;
        const artifactPath = path.join(taskPath, stageData.artifact);

        // 确定性事实：artifact 存在 + not_started → drafted
        if (fs.existsSync(artifactPath) && stageData.status === 'not_started') {
          stageData.status = 'drafted';
          updated.push({ stage: stageName, from: 'not_started', to: 'drafted' });
        }
      }

      // 评审状态同步
      const matrix = readMatrix(taskPath);
      if (matrix && matrix.artifacts) {
        for (const [stageName, stageData] of Object.entries(state.stages)) {
          if (stageData.status !== 'drafted') continue;
          const artifactTarget = stageToArtifact(stageName);
          const artifactMatrix = matrix.artifacts[artifactTarget];
          if (artifactMatrix && artifactMatrix.issues && artifactMatrix.issues.blocking === 0 && artifactMatrix.status !== 'pending') {
            stageData.status = 'ai_review_passed';
            updated.push({ stage: stageName, from: 'drafted', to: 'ai_review_passed' });
          }
        }
      }

      writeState(taskPath, state);
      process.stdout.write(JSON.stringify({ synced: true, updated }));
      break;
    }
    case 'set-task-status': {
      const workspaceRoot = args[1];
      const newStatus = args[2];
      const workflowMode = args[3];
      const humanGateStages = args[4] ? args[4].split(',') : [];

      const current = readCurrentTask(workspaceRoot);
      if (!current || !current.activeTaskId) {
        process.stdout.write(JSON.stringify({ synced: false, reason: 'No active task' }));
        process.exit(0);
      }
      const taskPath = getTaskPath(workspaceRoot);
      const state = readState(taskPath);
      if (!state) {
        process.stdout.write(JSON.stringify({ synced: false, reason: 'No state file' }));
        process.exit(0);
      }

      if (newStatus) state.status = newStatus;
      if (workflowMode) state.workflowMode = workflowMode;
      if (humanGateStages.length > 0) state.humanGateStages = humanGateStages;

      writeState(taskPath, state);
      process.stdout.write(JSON.stringify({ synced: true, status: state.status, workflowMode: state.workflowMode }));
      break;
    }
    default:
      break;
  }
}

if (require.main === module) {
  main();
}

module.exports = { resolveNextAction };
