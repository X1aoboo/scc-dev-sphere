'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

test('design-reopen skill has correct frontmatter and CLI references', () => {
  const skill = fs.readFileSync(path.join(root, 'skills', 'design-reopen', 'SKILL.md'), 'utf8');
  assert.match(skill, /^name: design-reopen$/m);
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.match(skill, /仅用户在主会话显式调用/);
  // Uses plugin CLI launcher
  assert.match(skill, /"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/devsphere"/);
  // No bare CLI calls or direct script references
  assert.doesNotMatch(skill, /\$\{CLAUDE_(?:SKILL_DIR|PROJECT_DIR)\}/);
  assert.doesNotMatch(skill, /node\s+[^\n]*scripts\/[\w/-]+\.js/);
  const bareCli = /(^|[\s`])devsphere\s+(?:workspace|workflow|design|approval|knowledge|state|guard)\b/m;
  assert.doesNotMatch(skill, bareCli);
});

test('design-reopen skill references required CLI commands', () => {
  const skill = fs.readFileSync(path.join(root, 'skills', 'design-reopen', 'SKILL.md'), 'utf8');
  // Gets taskPath from CLI, not from calling context
  assert.match(skill, /state get-task-path/);
  // Inspects workspace for baselined designs
  assert.match(skill, /design inspect-workspace/);
  // Executes reopen
  assert.match(skill, /design reopen/);
  // Transfers to feature-design
  assert.match(skill, /feature-design/);
});

test('design-reopen skill enforces change reason requirement', () => {
  const skill = fs.readFileSync(path.join(root, 'skills', 'design-reopen', 'SKILL.md'), 'utf8');
  assert.match(skill, /变更说明必填|变更说明.*必填|必填.*变更说明/);
});
