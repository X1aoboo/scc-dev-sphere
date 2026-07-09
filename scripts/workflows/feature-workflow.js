'use strict';

const path = require('path');
const fs = require('fs');
const { readMatrix, hasBlocking } = require('../devsphere-review-matrix');
const { readCurrentTask, readState, writeState, getTaskPath } = require('../devsphere-state');
const { readDecisions, countGatedPending, listGatedPending } = require('../devsphere-decisions');

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

// 设计阶段决策循环动作（spec §4.2）。确定性：仅依据磁盘事实。
function resolveDesignStageAction(taskPath, stageName) {
  const slug = stageToArtifact(stageName);
  const artifactPath = path.join(taskPath, 'artifacts', `${slug}.md`);
  if (fs.existsSync(artifactPath)) {
    return { action: 'ready-for-review', slug, gatedPending: 0, reason: `${stageName} 主产物已存在，交评审流程` };
  }
  const decisions = readDecisions(taskPath, slug);
  if (!decisions) {
    return { action: 'scope', slug, gatedPending: 0, reason: `${stageName} 未 scope：派 SA 查知识 + 出土 gated 决策` };
  }
  const pending = countGatedPending(taskPath, slug);
  if (pending > 0) {
    return { action: 'ask', slug, gatedPending: pending, reason: `${stageName} 有 ${pending} 个 gated 决策待用户确认` };
  }
  return { action: 'draft', slug, gatedPending: 0, reason: `${stageName} gated 决策已全部 resolved，可定稿` };
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

const DESIGN_STAGE_ORDER = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];

// 当前阶段是否要求人工决策门（spec §4）。strict 全阶段；collaborative 仅门禁阶段；auto-design 否。
function isHumanGated(mode, stageName, humanGates) {
  if (mode === 'strict-human-loop') return true;
  if (mode === 'collaborative-design' && Array.isArray(humanGates) && humanGates.includes(stageName)) return true;
  return false;
}

// 把一条 gated decision 映射成主会话构造 AskUserQuestion 所需的最小数据（spec §6 字段映射的源）。
function toQuestionData(decision) {
  if (!decision) return null;
  return {
    id: decision.id,
    summary: decision.summary,
    options: Array.isArray(decision.options) ? decision.options : [],
    recommendation: decision.recommendation || '',
    askMode: decision.askMode || 'single_select',
  };
}

// 设计循环总入口（spec §2）。确定性：读 state + 磁盘事实，返回精确 nextAction。
function resolveDesignLoop(taskPath) {
  const state = readState(taskPath);
  if (!state || !state.stages) return { kind: 'show_status', reason: 'No stages in state' };
  const mode = state.workflowMode || 'auto-design';
  const humanGates = state.humanGateStages || [];

  const currentStage = DESIGN_STAGE_ORDER.find(
    s => !isStageReady((state.stages[s] || {}).status, s, mode, humanGates)
  );
  if (!currentStage) {
    return { kind: 'all_design_stages_ready', reason: '全部设计阶段就绪，进入 integrated-design' };
  }
  return resolveDesignStage(taskPath, state, currentStage, mode, humanGates);
}

// 单阶段路由：pre-artifact（scope/ask/draft）+ ready-for-review（post-artifact，Task 3 接管）。
function resolveDesignStage(taskPath, state, stage, mode, humanGates) {
  const slug = stageToArtifact(stage);
  const humanGated = isHumanGated(mode, stage, humanGates);
  const stageAction = resolveDesignStageAction(taskPath, stage);

  if (stageAction.action === 'scope') {
    return { kind: 'dispatch_agent', mode: 'scope', stage, slug, agent: getDesignAgent(stage), skill: getDesignSkill(stage), humanGated, reason: stageAction.reason };
  }
  if (stageAction.action === 'ask') {
    // 双重门控：仅 humanGated 才 ask；否则当 draft（防 auto-design 误产 gated）
    if (!humanGated) {
      return { kind: 'dispatch_agent', mode: 'draft', stage, slug, agent: getDesignAgent(stage), skill: getDesignSkill(stage), reason: `${stage}：非人工门禁，跳过 ask 直接定稿` };
    }
    const decisions = listGatedPending(taskPath, slug).map(toQuestionData);
    return { kind: 'ask_decisions', stage, slug, decisions, reason: stageAction.reason };
  }
  if (stageAction.action === 'draft') {
    return { kind: 'dispatch_agent', mode: 'draft', stage, slug, agent: getDesignAgent(stage), skill: getDesignSkill(stage), reason: stageAction.reason };
  }
  // ready-for-review → post-artifact
  return resolvePostArtifact(taskPath, state, stage, slug, mode, humanGates);
}

// post-artifact 路由（spec §2/§5）：blocking→revise；drafted→review（含 CIE）；ai_review_passed+人工模式→human_confirm。
function resolvePostArtifact(taskPath, state, stage, slug, mode, humanGates) {
  const matrix = readMatrix(taskPath);
  const stageStatus = (state.stages[stage] || {}).status;

  if (hasBlocking(matrix, slug)) {
    return { kind: 'dispatch_agent', mode: 'draft', stage, slug, agent: getDesignAgent(stage), skill: getDesignSkill(stage), reason: `${stage} 有 blocking 评审项，修订后重评审` };
  }
  if (stageStatus === 'drafted') {
    const reviewers = (getDesignReviewers(stage) || []).slice();
    if (state.ciCdRisk === true && !reviewers.includes('cie')) reviewers.push('cie');
    return { kind: 'dispatch_reviewers', stage, slug, reviewers, skill: 'feature-review', reason: `${stage} 已 drafted，派评审（reviewers: ${reviewers.join(',')}）` };
  }
  if (stageStatus === 'ai_review_passed' && isHumanGated(mode, stage, humanGates)) {
    return { kind: 'human_confirm', stage, slug, reason: `${stage} 评审通过，待人工批准` };
  }
  return { kind: 'show_status', stage, slug, reason: `${stage} 状态 ${stageStatus}，无明确下一步` };
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
    case 'design-stage-action': {
      const taskPath = args[1];
      const stageName = args[2];
      process.stdout.write(JSON.stringify(resolveDesignStageAction(taskPath, stageName)));
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

module.exports = { resolveNextAction, resolveDesignStageAction, resolveDesignLoop, isHumanGated, toQuestionData, DESIGN_STAGE_ORDER };
