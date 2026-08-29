#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_DEFAULT_CONFIG = path.join(__dirname, '..', 'config', 'test-design.json');
const EXTERNAL_TEST_DESIGN_OUTPUT_DIR = 'artifacts/test-design/';
const BUILTIN_REQUIRED_DESIGN_TYPES = Object.freeze([
  'businessDesign',
  'solutionDesign',
  'implementationDesign',
  'testDesign',
]);
const EXTERNAL_REQUIRED_DESIGN_TYPES = Object.freeze(
  BUILTIN_REQUIRED_DESIGN_TYPES.filter(designType => designType !== 'testDesign'),
);

function readJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function validateTestDesignConfig(raw, source = 'test-design config') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${source} must be a JSON object`);
  }

  const allowedKeys = new Set(['mode', 'externalSkillId']);
  const unknownKeys = Object.keys(raw).filter(key => !allowedKeys.has(key));
  if (unknownKeys.length) {
    throw new Error(`${source} has unsupported fields: ${unknownKeys.join(', ')}`);
  }
  if (!['external', 'builtin'].includes(raw.mode)) {
    throw new Error(`${source}.mode must be 'external' or 'builtin'`);
  }

  if (raw.mode === 'builtin') {
    if (Object.prototype.hasOwnProperty.call(raw, 'externalSkillId')) {
      throw new Error(`${source}.externalSkillId is not allowed in builtin mode`);
    }
    return { mode: 'builtin' };
  }

  if (typeof raw.externalSkillId !== 'string' || !raw.externalSkillId.trim()) {
    throw new Error(`${source}.externalSkillId must be a non-empty string in external mode`);
  }
  return { mode: 'external', externalSkillId: raw.externalSkillId.trim() };
}

function projectConfigPath(workspaceRoot) {
  return path.join(workspaceRoot, '.devsphere', 'config', 'test-design.json');
}

function readPluginDefaultTestDesignConfig() {
  return validateTestDesignConfig(readJSON(PLUGIN_DEFAULT_CONFIG), PLUGIN_DEFAULT_CONFIG);
}

function readEffectiveTestDesignConfig(workspaceRoot) {
  if (typeof workspaceRoot !== 'string' || !workspaceRoot) {
    throw new Error('workspaceRoot is required to read test-design config');
  }
  const projectFile = projectConfigPath(workspaceRoot);
  if (!fs.existsSync(projectFile)) return readPluginDefaultTestDesignConfig();
  return validateTestDesignConfig(readJSON(projectFile), projectFile);
}

function sameDesignTypes(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((designType, index) => designType === expected[index]);
}

function testDesignTaskIssues(state) {
  if (!state || typeof state !== 'object') return ['Task state is required'];
  if (state.externalTestDesign) {
    const issues = [];
    if (typeof state.externalTestDesign.skillId !== 'string' || !state.externalTestDesign.skillId.trim()) {
      issues.push('External test design requires a non-empty skillId');
    }
    if (!sameDesignTypes(state.requiredDesignTypes, EXTERNAL_REQUIRED_DESIGN_TYPES)) {
      issues.push(`External test design requires exactly: ${EXTERNAL_REQUIRED_DESIGN_TYPES.join(', ')}`);
    }
    return issues;
  }
  return sameDesignTypes(state.requiredDesignTypes, BUILTIN_REQUIRED_DESIGN_TYPES)
    ? []
    : [`Builtin test design requires exactly: ${BUILTIN_REQUIRED_DESIGN_TYPES.join(', ')}`];
}

module.exports = {
  BUILTIN_REQUIRED_DESIGN_TYPES,
  EXTERNAL_REQUIRED_DESIGN_TYPES,
  EXTERNAL_TEST_DESIGN_OUTPUT_DIR,
  PLUGIN_DEFAULT_CONFIG,
  projectConfigPath,
  readEffectiveTestDesignConfig,
  readPluginDefaultTestDesignConfig,
  testDesignTaskIssues,
  validateTestDesignConfig,
};
