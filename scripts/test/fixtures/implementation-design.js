'use strict';

const fs = require('node:fs');
const path = require('node:path');

const templatePath = path.join(__dirname, 'implementation-design.golden.md');
const assetsPath = path.join(__dirname, 'implementation-design-assets');
const template = fs.readFileSync(templatePath, 'utf8');

function implementationDraft(taskId = 'FEAT-TEST-001') {
  return template.replaceAll('<TASK_ID>', taskId);
}

function installImplementationAssets(taskPath) {
  const target = path.join(taskPath, 'work', 'implementation-design', 'implementation-design-assets');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(assetsPath, target, { recursive: true });
  return target;
}

module.exports = {
  assetsPath,
  implementationDraft,
  installImplementationAssets,
  templatePath,
};
