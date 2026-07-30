'use strict';

const fs = require('node:fs');
const path = require('node:path');

const templatePath = path.join(__dirname, 'business-design.golden.md');
const assetsPath = path.join(__dirname, 'business-design-assets');
const template = fs.readFileSync(templatePath, 'utf8');

function businessDraft(taskId = 'FEAT-TEST-001') {
  return template.replaceAll('<TASK_ID>', taskId);
}

function installBusinessAssets(taskPath) {
  const target = path.join(taskPath, 'work', 'business-design', 'business-design-assets');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(assetsPath, target, { recursive: true });
  return target;
}

module.exports = {
  assetsPath,
  businessDraft,
  installBusinessAssets,
  templatePath,
};
