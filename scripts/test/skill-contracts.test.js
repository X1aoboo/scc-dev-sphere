'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const readSkill = name => fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');

test('feature-clarify requires one-shot knowledge-query subagents and forbids direct main-session queries', () => {
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

  assert.match(skill, /createClarification/i);
  assert.match(skill, /feature-clarify/i);
});

test('feature-assess accepts only clarified tasks', () => {
  const skill = readSkill('feature-assess');

  assert.match(skill, /status !== 'clarified'/i);
  assert.match(skill, /MUST NOT assess/i);
});

test('workflow runs feature-clarify and feature-assess in the main session', () => {
  const skill = readSkill('workflow');

  assert.match(skill, /nextAction\.skill === 'feature-clarify'/i);
  assert.match(skill, /main session/i);
  assert.match(skill, /nextAction\.skill === 'feature-assess'/i);
  assert.match(skill, /feature-clarify.*knowledge-query.*subagents/is);
});

test('knowledge-query returns adoptable evidence and never asks the user', () => {
  const skill = readSkill('knowledge-query');

  assert.match(skill, /adoptable facts/i);
  assert.match(skill, /EV IDs/i);
  assert.match(skill, /reliability/i);
  assert.match(skill, /gaps/i);
  assert.match(skill, /MUST NOT ask the user/i);
});
