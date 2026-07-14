#!/usr/bin/env node
'use strict';

const path = require('path');
const { listGatedPending, readDecisions } = require('./devsphere-decisions');
const {
  readMatrix, getBaseReviewers, getPendingHumanDecisions, getRevisionItems,
} = require('./devsphere-review-matrix');
const { getDesignRevisionLimit } = require('./devsphere-state');
const {
  readArtifactVersion, getReviewStatus, snapshotPath, markdownPath,
} = require('./devsphere-review-state');

const DISPATCH_SCRIPT = path.join(__dirname, 'devsphere-dispatch.js');

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
  // One stable teammate per design role is reused as both owner and reviewer.
  // The stage remains a task parameter, not part of the teammate identity.
  return `design-${role}`;
}

function decisionPolicyFor(gated) {
  return gated ? 'lead-confirm' : 'agent-autonomy';
}

function designDispatchCmd(role, stage, taskPath, skill, decisionPolicy) {
  return `node "${DISPATCH_SCRIPT}" build design ${role} ${stage} ${taskPath} ${skill} ${decisionPolicy}`;
}

function maxBlockingRound(matrix, slug) {
  if (!matrix || !matrix.artifacts || !matrix.artifacts[slug]) return 0;
  const list = matrix.artifacts[slug].issuesList || [];
  return list.reduce(
    (m, i) => (i.type === 'blocking' && i.status === 'open' ? Math.max(m, i.round || 1) : m), 0);
}

function isCurrentReviewComplete(taskPath, artifact, entry) {
  if (!entry || entry.status !== 'reviewed') return false;
  try {
    const artifactVersion = readArtifactVersion(taskPath, artifact);
    return entry.reviewedVersion === artifactVersion
      && getReviewStatus(taskPath, artifact, artifactVersion).allCompleted;
  } catch (error) {
    return false;
  }
}

function reviewerName(role, stage) {
  return teammateName(role, stage);
}

function reviewPromptCmd(role, stage, taskPath, artifactPath, artifactVersion) {
  return `node "${DISPATCH_SCRIPT}" build review ${role} ${stage} ${taskPath} scc-dev-sphere:feature-review ${artifactPath} ${artifactVersion}`;
}

function buildReviewers(stage, slug, state, taskPath, artifactVersion) {
  const artifactPath = path.join(taskPath, 'artifacts', `${slug}.md`);
  const roles = getBaseReviewers(slug).slice();
  if (state.ciCdRisk === true && !roles.includes('cie')) roles.push('cie');
  return roles.map(role => ({
    role, name: reviewerName(role, stage),
    promptCmd: reviewPromptCmd(role, stage, taskPath, artifactPath, artifactVersion),
    reviewStatePath: snapshotPath(taskPath, slug, role),
    reviewMarkdownPath: markdownPath(taskPath, slug, role),
  }));
}

function buildRevisionAction(stage, slug, gated, role, skill, mode, name, taskPath, matrix, reason) {
  return {
    kind: 'produce_draft', stage, slug, humanGated: gated,
    reason, role, skill, mode, name,
    payload: {
      mode: 'revise',
      reviewItems: getRevisionItems(matrix, slug),
      requiresReReview: true,
      artifactPath: path.join(taskPath, 'artifacts', `${slug}.md`),
    },
    dispatchCmd: designDispatchCmd(role, stage, taskPath, skill, decisionPolicyFor(gated)),
  };
}

function buildDispatchReviewsAction(stage, slug, gated, state, taskPath, artifactVersion, reason) {
  const reviewers = buildReviewers(stage, slug, state, taskPath, artifactVersion);
  return {
    kind: 'dispatch_reviews', stage, slug, humanGated: gated, reason,
    artifactVersion,
    authorizeCmd: `node "${path.join(__dirname, 'devsphere-review-state.js')}" authorize ${taskPath} ${slug} ${artifactVersion}`,
    artifactPath: path.join(taskPath, 'artifacts', `${slug}.md`),
    reviewers,
  };
}

function buildMergeReviewsAction(stage, slug, gated, artifactVersion, taskPath, reason) {
  return {
    kind: 'merge_reviews', stage, slug, humanGated: gated, reason,
    artifactVersion,
    mergeCmd: `node "${path.join(__dirname, 'devsphere-review-state.js')}" merge ${taskPath} ${slug} ${artifactVersion}`,
  };
}

function buildWaitReviewsAction(stage, slug, gated, artifactVersion, reviewStatus, reason) {
  return {
    kind: 'wait_reviews', stage, slug, humanGated: gated, reason,
    artifactVersion,
    pendingReviewers: reviewStatus.missingReviewers.concat(reviewStatus.pendingReviewers),
  };
}

function buildAskReviewAction(stage, slug, gated, name, matrix, reason) {
  return {
    kind: 'ask_review', stage, slug, humanGated: gated, name, reason,
    issues: getPendingHumanDecisions(matrix, slug),
  };
}

// resolveDesignAction: 按阶段顺序解析设计阶段下一步动作。
function resolveDesignAction(taskPath, state) {
  const mode = state.workflowMode || 'auto-design';
  const humanGates = state.humanGateStages || [];
  const stages = state.stages || {};
  let revisionLimit;
  try {
    revisionLimit = getDesignRevisionLimit(state);
  } catch (e) {
    return { kind: 'design_blocked', reason: `state.json 配置错误: ${e.message}` };
  }

  for (const stage of DESIGN_STAGE_ORDER) {
    const stageData = stages[stage] || { status: 'not_started' };
    if (isStageReady(stageData.status, stage, mode, humanGates)) {
      if (stageData.status !== 'ai_review_passed') continue;
      const readySlug = stageToArtifact(stage);
      const readyMatrix = readMatrix(taskPath);
      const readyEntry = readyMatrix && readyMatrix.artifacts ? readyMatrix.artifacts[readySlug] : null;
      // Do not let a manually/stale-set ai_review_passed flag bypass the
      // current artifact version review. A missing matrix is also unsafe.
      if (isCurrentReviewComplete(taskPath, readySlug, readyEntry)) continue;
    }

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
          dispatchCmd: designDispatchCmd(role, stage, taskPath, skill, decisionPolicyFor(gated)),
        };
      }
      return {
        kind: 'produce_draft', stage, slug, humanGated: gated, reason: `${stage} 派发 owner 产 draft`,
        role, skill, mode, name, payload: { mode: 'initial' },
        dispatchCmd: designDispatchCmd(role, stage, taskPath, skill, decisionPolicyFor(gated)),
      };
    }

    if (stageData.status === 'drafted') {
      let artifactVersion;
      try {
        artifactVersion = readArtifactVersion(taskPath, slug);
      } catch (error) {
        return { kind: 'design_blocked', stage, slug, reason: `无法读取当前 artifactVersion: ${error.message}` };
      }
      const matrix = readMatrix(taskPath);
      const entry = matrix && matrix.artifacts ? matrix.artifacts[slug] : null;
      const blocking = entry ? entry.issues.blocking : 0;
      const matrixStatus = entry && entry.status === 'reviewed'
        && entry.reviewedVersion === artifactVersion ? 'reviewed' : 'pending';
      const pendingReview = getPendingHumanDecisions(matrix, slug);
      let reviewStatus;
      try {
        reviewStatus = getReviewStatus(taskPath, slug, artifactVersion);
      } catch (error) {
        return { kind: 'design_blocked', stage, slug, reason: `无法读取当前评审状态: ${error.message}` };
      }

      // Human review decisions must be collected before any blocking/apply
      // revision is dispatched, so one revision can contain all issue types.
      if (pendingReview.length > 0) {
        return buildAskReviewAction(stage, slug, gated, name, matrix,
          `${stage} 有 ${pendingReview.length} 项 advisory/risk 待 Lead 确认`);
      }
      if (maxBlockingRound(matrix, slug) >= revisionLimit) {
        return { kind: 'design_blocked', stage, slug, reason: `${stage} revise 超过 ${revisionLimit} 轮上限` };
      }
      if (blocking > 0 || getRevisionItems(matrix, slug).length > 0) {
        return buildRevisionAction(stage, slug, gated, role, skill, mode, name, taskPath, matrix,
          `${stage} 汇总 blocking/advisory/risk 修订项,回流 owner revise`);
      }
      if (matrixStatus === 'pending') {
        if (reviewStatus.allCompleted) {
          return buildMergeReviewsAction(stage, slug, gated, artifactVersion, taskPath,
            `${stage} 所有角色评审完成,由 Lead 合并结论`);
        }
        if (!reviewStatus.hasCurrentReview) {
          return buildDispatchReviewsAction(stage, slug, gated, state, taskPath, artifactVersion,
            `${stage} Lead 授权并派发交叉评审`);
        }
        return buildWaitReviewsAction(stage, slug, gated, artifactVersion, reviewStatus,
          `${stage} 等待全部 Reviewer 完成当前版本评审`);
      }
      // matrixStatus === 'reviewed',blocking=0:sync 正常已升 ai_review_passed;兜底
      if (gated) return { kind: 'human_approve', stage, slug, humanGated: true, reason: `${stage} 评审通过,请求人工批准` };
      continue; // 非门禁视为完成
    }

    if (stageData.status === 'ai_review_passed') {
      // 人工驳回可能注入 blocking → 回流 revise,避免无限 human_approve
      let artifactVersion;
      try {
        artifactVersion = readArtifactVersion(taskPath, slug);
      } catch (error) {
        return { kind: 'design_blocked', stage, slug, reason: `无法读取当前 artifactVersion: ${error.message}` };
      }
      const matrix = readMatrix(taskPath);
      const entry = matrix && matrix.artifacts ? matrix.artifacts[slug] : null;
      const blocking = entry ? entry.issues.blocking : 0;
      const pendingReview = getPendingHumanDecisions(matrix, slug);
      if (pendingReview.length > 0) {
        return buildAskReviewAction(stage, slug, gated, name, matrix,
          `${stage} 有 ${pendingReview.length} 项 advisory/risk 待 Lead 确认`);
      }
      if (maxBlockingRound(matrix, slug) >= revisionLimit) {
        return { kind: 'design_blocked', stage, slug, reason: `${stage} revise 超过 ${revisionLimit} 轮上限` };
      }
      if (blocking > 0 || getRevisionItems(matrix, slug).length > 0) {
        return buildRevisionAction(stage, slug, gated, role, skill, mode, name, taskPath, matrix,
          `${stage} 人工反馈包含待修订 review issue,回流 owner revise`);
      }
      if (!entry) {
        return { kind: 'design_blocked', stage, slug, reason: `${stage} 缺少 review matrix,不能跳过当前版本评审` };
      }
      // A stage marked ai_review_passed is only reusable when the matrix and
      // all role snapshots refer to the same artifact version. This protects
      // the lead-driven state machine from a stale stage flag after a draft
      // was changed without completing its new review cycle.
      if (entry) {
        let reviewStatus;
        try {
          reviewStatus = getReviewStatus(taskPath, slug, artifactVersion);
        } catch (error) {
          return { kind: 'design_blocked', stage, slug, reason: `无法读取当前评审状态: ${error.message}` };
        }
        const currentReviewComplete = entry.status === 'reviewed'
          && entry.reviewedVersion === artifactVersion
          && reviewStatus.allCompleted;
        if (!currentReviewComplete) {
          if (reviewStatus.allCompleted) {
            return buildMergeReviewsAction(stage, slug, gated, artifactVersion, taskPath,
              `${stage} 当前版本评审已完成,由 Lead 合并结论`);
          }
          if (!reviewStatus.hasCurrentReview) {
            return buildDispatchReviewsAction(stage, slug, gated, state, taskPath, artifactVersion,
              `${stage} 当前版本尚未授权评审,由 Lead 派发`);
          }
          return buildWaitReviewsAction(stage, slug, gated, artifactVersion, reviewStatus,
            `${stage} 等待当前版本全部 Reviewer 完成`);
        }
      }
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
  if (process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS !== '1') {
    return {
      kind: 'design_blocked',
      reason: '设计阶段需要 Claude Code Agent Teams。请启用 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 后重试。',
    };
  }
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
  getDesignAgent, getDesignSkill, resolveDesignAction, routeDesign,
  buildRevisionAction, buildAskReviewAction, buildDispatchReviewsAction,
  buildMergeReviewsAction, buildWaitReviewsAction, decisionPolicyFor,
};
