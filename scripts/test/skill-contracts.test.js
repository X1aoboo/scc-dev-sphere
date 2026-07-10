'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const readSkill = name => fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');

test('feature-clarify independently requires one-shot subagents, waiting, and a direct-query ban', () => {
  const skill = readSkill('feature-clarify');

  assert.match(skill, /MUST dispatch a one-shot `knowledge-query` subagent/i);
  assert.match(skill, /MUST NOT directly query the knowledge base in the main session/i);
  assert.match(skill, /MUST wait for the structured EV\/gap result/i);
  assert.match(skill, /MUST NOT reuse agent IDs/i);
  assert.match(skill, /MUST NOT use teammate/i);
});

test('feature-clarify records only user-confirmed conclusions and validates before clarified', () => {
  const skill = readSkill('feature-clarify');

  assert.match(skill, /only persist user-confirmed conclusions/i);
  assert.match(skill, /one requirement dimension at a time/i);
  assert.match(skill, /shouldRequery/i);
  assert.match(skill, /validateClarification/i);
  assert.match(skill, /set-task-status <workspaceRoot> clarified/i);
});

test('feature-init initializes clarification state and routes users to clarification', () => {
  const skill = readSkill('feature-init');

  assert.match(skill, /feature-requirement-clarification\.js init "<taskPath>"/i);
  assert.match(skill, /reads the already-written `inputs\/requirement\.md`/i);
  assert.match(skill, /feature-clarify/i);
});

test('feature-assess accepts only clarified tasks', () => {
  const skill = readSkill('feature-assess');

  assert.match(skill, /status !== 'clarified'/i);
  assert.match(skill, /MUST NOT assess/i);
});

test('workflow binds feature-clarify itself to main-session execution and its query subagents', () => {
  const skill = readSkill('workflow');
  const clarifySection = skill.match(/特别地，如果 `nextAction\.skill === 'feature-clarify'`([\s\S]*?)(?=\n#### )/);

  assert.ok(clarifySection, 'feature-clarify dispatch section');
  assert.match(clarifySection[0], /main session/i);
  assert.match(clarifySection[0], /knowledge-query.*subagents/is);
  assert.match(clarifySection[0], /must not.*background teammate/i);
});

test('workflow binds feature-assess itself to main-session execution', () => {
  const skill = readSkill('workflow');
  const assessSection = skill.match(/特别地，如果 `nextAction\.skill === 'feature-assess'`([\s\S]*?)(?=\n特别地，如果|\n#### )/);

  assert.ok(assessSection, 'feature-assess dispatch section');
  assert.match(assessSection[0], /main session/i);
});

test('knowledge-query persists every adopted fact, including clarification facts', () => {
  const skill = readSkill('knowledge-query');

  assert.match(skill, /every adopted fact/i);
  assert.match(skill, /including clarification-adopted facts/i);
  assert.match(skill, /EV snapshot/i);
  assert.match(skill, /evidence registry/i);
});

test('knowledge-query returns adoptable evidence and never asks the user', () => {
  const skill = readSkill('knowledge-query');

  assert.match(skill, /adoptable facts/i);
  assert.match(skill, /EV IDs/i);
  assert.match(skill, /reliability/i);
  assert.match(skill, /gaps/i);
  assert.match(skill, /MUST NOT ask the user/i);
});
