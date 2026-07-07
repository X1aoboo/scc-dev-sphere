'use strict';

const path = require('path');
const fs = require('fs');
const { readMatrix, hasBlocking } = require('../devsphere-review-matrix');

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
  if (status === 'assessed') {
    return makeAction('run_skill', state, 'design', null,
      'feature-design', {}, ['sa'],
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
  const stageOrder = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];
  const matrix = readMatrix(taskPath);

  // Check each stage in order
  for (const stageName of stageOrder) {
    const stage = stages[stageName];
    if (!stage) continue;

    const isReady = isStageReady(stage.status, stageName, mode, humanGates);

    if (!isReady) {
      // Check if stage needs review (has artifact but not reviewed)
      if (stage.status === 'drafted' && matrix) {
        const artifactTarget = stageToArtifact(stageName);
        if (matrix.artifacts[artifactTarget] &&
            matrix.artifacts[artifactTarget].status !== 'pending') {
          // Has been reviewed — check for blocking
          if (hasBlocking(matrix, artifactTarget)) {
            return makeHumanConfirm(state, stageName, artifactTarget,
              `Stage ${stageName} has unclosed blocking issues. Return to design agent for revision.`,
              [stage.artifact], [],
              { type: 'blocking_resolution', prompt: `Stage ${stageName} has unclosed blocking issues. Resolve blocking issues before continuing.` });
          }
          // No blocking but not ai_review_passed — needs review
          return makeAction('run_skill', state, stageName, artifactTarget,
            getDesignSkill(stageName), { mode: 'revise' }, [getDesignAgent(stageName)],
            `Stage ${stageName} requires re-review. Revise design and re-review.`,
            [stage.artifact], [stage.artifact]);
        }
      }

      // ai_review_passed but not yet human_approved — requires human confirmation
      if (stage.status === 'ai_review_passed') {
        if (mode === 'strict-human-loop' ||
            (mode === 'collaborative-design' && humanGates.includes(stageName))) {
          return makeAction('human_confirm', state, stageName, stageToArtifact(stageName),
            null, {}, [],
            `Stage ${stageName} passed AI review. Human confirmation required before proceeding.`,
            [stage.artifact],
            [],
            { type: 'stage_approval', prompt: `请确认 ${stageName} 阶段设计是否通过人工评审。回复 OK 确认通过，或提出修改意见。` });
        }
        // auto-design with ai_review_passed inside !isReady — defensive: fall through to catch-all
      }

      // Need to generate/revise design
      const artifactTarget = stageToArtifact(stageName);
      const designAgent = getDesignAgent(stageName);

      if (stage.status === 'not_started') {
        return makeAction('run_skill', state, 'design', null,
          'feature-design', {}, [designAgent],
          `Stage ${stageName} is not started. Begin design.`,
          [], [stage.artifact || `artifacts/${artifactTarget}.md`]);
      }

      // drafted — needs review
      const reviewers = getDesignReviewers(stageName);
      return makeAction('run_skill', state, stageName, artifactTarget,
        'feature-review', { target: artifactTarget }, reviewers,
        `Stage ${stageName} is drafted and ready for formal AI review.`,
        [stage.artifact, 'reviews/review-matrix.json'],
        reviewers.map(r => `reviews/${artifactTarget}/${r}-review.md`).concat(['reviews/review-matrix.json']));
    }

    // Stage is ready — check if next stage needs review scheduling
    if (stage.status === 'ai_review_passed' && mode !== 'auto-design') {
      if ((mode === 'strict-human-loop') ||
          (mode === 'collaborative-design' && humanGates.includes(stageName))) {
        return makeAction('human_confirm', state, stageName, stageToArtifact(stageName),
          null, {}, [],
          `Stage ${stageName} passed AI review. Human confirmation required before proceeding.`,
          [stage.artifact],
          [],
          { type: 'stage_approval', prompt: `请确认 ${stageName} 阶段设计是否通过人工评审。回复 OK 确认通过，或提出修改意见。` });
      }
    }
  }

  // All 4 stages ready — check integrated design
  const integratedPath = path.join(taskPath, 'artifacts', 'integrated-design.md');
  if (!fs.existsSync(integratedPath)) {
    return makeAction('run_skill', state, 'integration', 'integrated-design',
      'feature-design', {}, ['sa', 'se', 'mde', 'tse'],
      'All design phases complete. Generate integrated design.',
      stageOrder.map(s => stages[s]?.artifact).filter(Boolean),
      ['artifacts/integrated-design.md']);
  }

  // Check integrated review
  if (matrix && matrix.artifacts['integrated-design'] &&
      matrix.artifacts['integrated-design'].status !== 'passed') {
    if (hasBlocking(matrix, 'integrated-design')) {
      return makeHumanConfirm(state, 'integration', 'integrated-design',
        'Integrated design has unclosed blocking issues. Return to design agent for revision.',
        ['artifacts/integrated-design.md'], [],
        { type: 'blocking_resolution', prompt: 'Integrated design has unclosed blocking issues. Resolve blocking issues before continuing.' });
    }
    return makeAction('run_skill', state, 'integration', 'integrated-design',
      'feature-review', { target: 'integrated-design' }, ['sa', 'se', 'mde', 'tse'],
      'Integrated design needs consistency review.',
      ['artifacts/integrated-design.md', 'reviews/review-matrix.json'],
      ['reviews/review-matrix.json']);
  }

  // All done — ready for design_ready
  return makeAction('show_status', state, null, null, null, {}, [],
    'All design phases complete with reviews passed. Task can advance to design_ready.',
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

module.exports = { resolveNextAction };
