'use strict';

const path = require('path');
const fs = require('fs');
const {
  readMatrix, getPendingHumanDecisions, getOpenApplyItems,
} = require('../devsphere-review-matrix');
const { readCurrentTask, readState, writeState, getTaskPath } = require('../devsphere-state');
const { readDecisions, countGatedPending } = require('../devsphere-decisions');
const { stageToArtifact } = require('../feature-design-router');

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
      'feature-clarify', {}, [],
      'Task initialized. Clarify and confirm the requirement before complexity and risk assessment.',
      [], ['inputs/requirement.md']);
  }

  // --- clarified ---
  // Completeness of the clarification is judged by feature-clarify (and the user's
  // final confirmation) per the skill's written principles; routing here keys only
  // off status. There is intentionally no deterministic re-validation gate.
  if (status === 'clarified') {
    return makeAction('run_skill', state, null, null,
      'feature-assess', {}, [],
      'Requirement clarification is complete. Proceed with complexity and risk assessment.',
      ['inputs/requirement.md'], []);
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

        // 确定性事实：artifact 存在 + not_started + gated 决策已 resolved → drafted
        if (fs.existsSync(artifactPath) && stageData.status === 'not_started') {
          const slug = stageToArtifact(stageName);
          // 仅对四个设计阶段做决策门校验（integrated 等无 decisions）
          if (readDecisions(taskPath, slug) && countGatedPending(taskPath, slug) > 0) {
            // gated 未 resolved，禁止升 drafted（防错）
            continue;
          }
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
          const pendingReview = artifactMatrix
            ? getPendingHumanDecisions(matrix, artifactTarget) : [];
          const openApply = artifactMatrix
            ? getOpenApplyItems(matrix, artifactTarget) : [];
          if (artifactMatrix && artifactMatrix.issues
            && artifactMatrix.issues.blocking === 0
            && artifactMatrix.status !== 'pending'
            && pendingReview.length === 0
            && openApply.length === 0) {
            stageData.status = 'ai_review_passed';
            updated.push({ stage: stageName, from: 'drafted', to: 'ai_review_passed' });
          }
        }
      }

      writeState(taskPath, state);
      process.stdout.write(JSON.stringify({ synced: true, updated }));
      break;
    }
    case 'set-stage-status': {
      const taskPath = args[1];
      const stageName = args[2];
      const newStatus = args[3];
      const VALID_STAGE_STATUSES = ['not_started', 'drafted', 'ai_review_passed', 'human_approved'];
      if (!VALID_STAGE_STATUSES.includes(newStatus)) {
        process.stderr.write(`Invalid stage status: ${newStatus}. Valid: ${VALID_STAGE_STATUSES.join(', ')}\n`);
        process.exit(1);
      }
      const artifactTarget = stageToArtifact(stageName);
      const matrix = readMatrix(taskPath);
      const artifactMatrix = matrix && matrix.artifacts ? matrix.artifacts[artifactTarget] : null;
      if (artifactMatrix && (newStatus === 'ai_review_passed' || newStatus === 'human_approved')) {
        if (artifactMatrix.status !== 'reviewed') {
          process.stderr.write(`Cannot set stage '${stageName}': artifact review status is not reviewed\n`);
          process.exit(1);
        }
        const pendingReview = getPendingHumanDecisions(matrix, artifactTarget);
        const openApply = getOpenApplyItems(matrix, artifactTarget);
        if (artifactMatrix.issues.blocking > 0) {
          process.stderr.write(`Cannot set stage '${stageName}': open blocking issue(s) remain\n`);
          process.exit(1);
        }
        if (pendingReview.length > 0) {
          process.stderr.write(`Cannot set stage '${stageName}': pending advisory/risk decision(s) remain\n`);
          process.exit(1);
        }
        if (openApply.length > 0) {
          process.stderr.write(`Cannot set stage '${stageName}': apply revision issue(s) remain open\n`);
          process.exit(1);
        }
      }
      const { updateStageStatus } = require('../devsphere-state');
      updateStageStatus(taskPath, stageName, newStatus);
      process.stdout.write(JSON.stringify({ synced: true, stage: stageName, status: newStatus }));
      break;
    }
    case 'set-task-status': {
      const workspaceRoot = args[1];
      const newStatus = args[2];
      const workflowMode = args[3];
      const humanGateStages = args[4] ? args[4].split(',') : [];
      const ciCdRiskRaw = args[5];

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
      if (ciCdRiskRaw !== undefined) state.ciCdRisk = (ciCdRiskRaw === 'true');

      writeState(taskPath, state);
      process.stdout.write(JSON.stringify({ synced: true, status: state.status, workflowMode: state.workflowMode, humanGateStages: state.humanGateStages || [], ciCdRisk: state.ciCdRisk === true }));
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
