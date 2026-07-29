'use strict';

const fs = require('node:fs');
const path = require('node:path');

const templatePath = path.join(__dirname, 'solution-design.golden.md');
const assetsPath = path.join(__dirname, 'solution-design-assets');
const template = fs.readFileSync(templatePath, 'utf8');

function solutionDraft(taskId = 'FEAT-TEST-001') {
  return template.replaceAll('<TASK_ID>', taskId);
}

function installSolutionAssets(taskPath) {
  const target = path.join(taskPath, 'work', 'solution-design', 'solution-design-assets');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(assetsPath, target, { recursive: true });
  return target;
}

module.exports = {
  assetsPath,
  installSolutionAssets,
  solutionDraft,
  templatePath,
};
