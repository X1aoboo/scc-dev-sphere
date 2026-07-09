#!/usr/bin/env node
'use strict';

const path = require('path');
const { listGatedPending } = require('./devsphere-decisions');
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

// resolveDesignAction 其余分支在后续 task 增量补全。
function resolveDesignAction(taskPath, state) {
  const mode = state.workflowMode || 'auto-design';
  const humanGates = state.humanGateStages || [];
  const stages = state.stages || {};

  for (const stage of DESIGN_STAGE_ORDER) {
    const stageData = stages[stage] || { status: 'not_started' };
    if (isStageReady(stageData.status, stage, mode, humanGates)) continue;
    // 其余分支后续 task 实现;本 task 先只处理"全完成"。
    return { kind: 'not_implemented', stage };
  }
  return { kind: 'design_phase_complete', reason: '四个设计阶段全部完成,进入 integrated-design' };
}

module.exports = {
  DESIGN_STAGE_ORDER, isHumanGated, isStageReady, stageToArtifact,
  getDesignAgent, getDesignSkill, resolveDesignAction, MAX_REVISE,
};

// CLI 入口在 Task 4 补。
