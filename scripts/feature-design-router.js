#!/usr/bin/env node
'use strict';

const path = require('path');
const { listGatedPending, readDecisions } = require('./devsphere-decisions');
const { readMatrix, getBaseReviewers } = require('./devsphere-review-matrix');

const DISPATCH_SCRIPT = path.join(__dirname, 'devsphere-dispatch.js');
const MAX_REVISE = 3;

const DESIGN_STAGE_ORDER = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'];

function isHumanGated(mode, stageName, humanGates) {
  if (mode === 'strict-human-loop') return true;
  if (mode === 'collaborative-design' && Array.isArray(humanGates) && humanGates.includes(stageName)) return true;
  return false;
}

function isStageReady(stageStatus, stageName, mode, humanGates) {
  if (mode === 'strict-human-loop') return stageStatus === 'human_approved';
  if (mode === 'collaborative-design' && Array.isArray(humanGates) && humanGates.includes(stageName)) {
    return stageStatus === 'human_approved';
  }
  return stageStatus === 'ai_review_passed' || stageStatus === 'human_approved';
}

function stageToArtifact(stageName) {
  return {
    businessDesign: 'business-design',
    solutionDesign: 'solution-design',
    implementationDesign: 'implementation-design',
    testDesign: 'test-design',
  }[stageName] || stageName;
}

function getDesignAgent(stageName) {
  return { businessDesign: 'sa', solutionDesign: 'se', implementationDesign: 'mde', testDesign: 'tse' }[stageName];
}

function getDesignSkill(stageName) {
  return {
    businessDesign: 'feature-design-business',
    solutionDesign: 'feature-design-solution',
    implementationDesign: 'feature-design-implementation',
    testDesign: 'feature-design-test',
  }[stageName];
}

function teammateName(role, stage) {
  return `${role}-${stage}`;
}

function designDispatchCmd(role, stage, taskPath, skill, humanGated, mode) {
  return `node "${DISPATCH_SCRIPT}" build design ${role} ${stage} ${taskPath} ${skill} ${humanGated} ${mode}`;
}

function maxBlockingRound(matrix, slug) {
  if (!matrix || !matrix.artifacts || !matrix.artifacts[slug]) return 0;
  const list = matrix.artifacts[slug].issuesList || [];
  return list.reduce(
    (m, i) => (i.type === 'blocking' && i.status === 'open' ? Math.max(m, i.round || 1) : m), 0);
}

function openBlockingIssues(matrix, slug) {
  if (!matrix || !matrix.artifacts || !matrix.artifacts[slug]) return [];
  return (matrix.artifacts[slug].issuesList || [])
    .filter(i => i.type === 'blocking' && i.status === 'open');
}

function reviewerName(role, stage) {
  return `${role}-review-${stage}`;
}

function reviewDispatchCmd(role, stage, taskPath, artifactPath) {
  return `node "${DISPATCH_SCRIPT}" build review ${role} ${stage} ${taskPath} scc-dev-sphere:feature-review ${artifactPath}`;
}

function buildReviewers(stage, slug, state, taskPath) {
  const artifactPath = path.join(taskPath, 'artifacts', `${slug}.md`);
  const roles = getBaseReviewers(slug).slice();
  if (state.ciCdRisk === true && !roles.includes('cie')) roles.push('cie');
  return roles.map(role => ({
    role, name: reviewerName(role, stage),
    dispatchCmd: reviewDispatchCmd(role, stage, taskPath, artifactPath),
  }));
}

// resolveDesignAction 其余分支在后续 task 增量补全。
function resolveDesignAction(taskPath, state) {
  const mode = state.workflowMode || 'auto-design';
  const humanGates = state.humanGateStages || [];
  const stages = state.stages || {};

  for (const stage of DESIGN_STAGE_ORDER) {
    const stageData = stages[stage] || { status: 'not_started' };
    if (isStageReady(stageData.status, stage, mode, humanGates)) continue;

    const slug = stageToArtifact(stage);
    const gated = isHumanGated(mode, stage, humanGates);
    const role = getDesignAgent(stage);
    const skill = getDesignSkill(stage);
    const name = teammateName(role, stage);

    if (stageData.status === 'not_started') {
      const pending = listGatedPending(taskPath, slug);
      if (pending.length > 0) {
        return {
          kind: 'ask_gated', stage, slug, humanGated: gated, reason: `${stage} 有 ${pending.length} 项 gated decision 待代问`,
          name, decisions: pending,
        };
      }
      // 检测"gated 已 resolve、续稿"场景:decisions 文件有已决定的 gated 项
      const decisionsFile = readDecisions(taskPath, slug);
      const resolvedGated = decisionsFile && Array.isArray(decisionsFile.decisions)
        ? decisionsFile.decisions.filter(d => d.type === 'gated' && d.status === 'decided')
        : [];
      if (resolvedGated.length > 0) {
        return {
          kind: 'produce_draft', stage, slug, humanGated: gated,
          reason: `${stage} gated 已 resolve,唤醒 owner 续稿`,
          role, skill, mode, name,
          payload: {
            mode: 'continue',
            resolutions: resolvedGated.map(d => ({
              id: d.id, summary: d.summary,
              chosen: d.resolution && d.resolution.chosen,
              note: d.resolution && d.resolution.note,
            })),
          },
          dispatchCmd: designDispatchCmd(role, stage, taskPath, skill, gated, mode),
        };
      }
      return {
        kind: 'produce_draft', stage, slug, humanGated: gated, reason: `${stage} 派发 owner 产 draft`,
        role, skill, mode, name, payload: { mode: 'initial' },
        dispatchCmd: designDispatchCmd(role, stage, taskPath, skill, gated, mode),
      };
    }

    if (stageData.status === 'drafted') {
      const matrix = readMatrix(taskPath);
      const entry = matrix && matrix.artifacts ? matrix.artifacts[slug] : null;
      const blocking = entry ? entry.issues.blocking : 0;
      const matrixStatus = entry ? entry.status : 'pending';

      if (maxBlockingRound(matrix, slug) >= MAX_REVISE) {
        return { kind: 'design_blocked', stage, slug, reason: `${stage} revise 超过 ${MAX_REVISE} 轮上限` };
      }
      if (blocking > 0) {
        return {
          kind: 'produce_draft', stage, slug, humanGated: gated,
          reason: `${stage} 评审 blocking=${blocking},回流 owner revise`,
          role, skill, mode, name,
          payload: { mode: 'revise', blockingItems: openBlockingIssues(matrix, slug) },
          dispatchCmd: designDispatchCmd(role, stage, taskPath, skill, gated, mode),
        };
      }
      if (matrixStatus === 'pending') {
        return {
          kind: 'dispatch_reviews', stage, slug, humanGated: gated,
          reason: `${stage} 派发交叉评审`,
          artifactPath: path.join(taskPath, 'artifacts', `${slug}.md`),
          reviewers: buildReviewers(stage, slug, state, taskPath),
        };
      }
      // matrixStatus === 'reviewed',blocking=0:sync 正常已升 ai_review_passed;兜底
      if (gated) return { kind: 'human_approve', stage, slug, humanGated: true, reason: `${stage} 评审通过,请求人工批准` };
      continue; // 非门禁视为完成
    }

    if (stageData.status === 'ai_review_passed') {
      if (gated) return { kind: 'human_approve', stage, slug, humanGated: true, reason: `${stage} 评审通过,请求人工批准` };
      continue; // 非门禁视为完成,下一阶段
    }
    // 'human_approved' → isStageReady 已 continue
  }
  return { kind: 'design_phase_complete', reason: '四个设计阶段全部完成,进入 integrated-design' };
}

const { readCurrentTask, getTaskPath, readState } = require('./devsphere-state');

function routeDesign(workspaceRoot) {
  const current = readCurrentTask(workspaceRoot);
  if (!current || !current.activeTaskId) {
    return { kind: 'show_status', reason: 'No active task.' };
  }
  const taskPath = getTaskPath(workspaceRoot);
  const state = readState(taskPath);
  if (!state) return { kind: 'blocked', reason: 'State file not found.' };
  return resolveDesignAction(taskPath, state);
}

function main() {
  const workspaceRoot = process.argv[2] || process.cwd();
  try {
    process.stdout.write(JSON.stringify(routeDesign(workspaceRoot), null, 2));
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  DESIGN_STAGE_ORDER, isHumanGated, isStageReady, stageToArtifact,
  getDesignAgent, getDesignSkill, resolveDesignAction, routeDesign, MAX_REVISE,
};
