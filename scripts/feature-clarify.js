#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..', 'skills', 'feature-clarify');
const CHECKLIST_TEMPLATE = path.join(SKILL_DIR, 'requirement-checklist.json');

function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// --- init ---

function init(taskPath) {
  if (!fs.existsSync(taskPath)) throw new Error(`taskPath does not exist: ${taskPath}`);

  const reviewsDir = path.join(taskPath, 'reviews');
  const checklistPath = path.join(reviewsDir, 'requirement-checklist.json');
  const backlogPath = path.join(taskPath, 'inputs', 'ambiguity-backlog.json');

  // Copy checklist template (idempotent: skip if exists)
  ensureDir(reviewsDir);
  if (!fs.existsSync(checklistPath)) {
    fs.copyFileSync(CHECKLIST_TEMPLATE, checklistPath);
  }

  // Init ambiguity backlog (idempotent: skip if exists)
  const inputsDir = path.join(taskPath, 'inputs');
  ensureDir(inputsDir);
  if (!fs.existsSync(backlogPath)) {
    fs.writeFileSync(backlogPath, JSON.stringify({ ambiguities: [] }, null, 2));
  }
}

// --- checkComplete ---

function checkComplete(taskPath) {
  const failures = [];

  // 1. Checklist all pass
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = readJSON(checklistPath);
  if (!checklist) {
    return { complete: false, failures: ['requirement-checklist.json not found'] };
  }
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.result !== 'pass') {
        failures.push(`${item.id}: ${item.note || item.check}`);
      }
    }
  }

  // 2. Backlog no open core ambiguities
  const backlogPath = path.join(taskPath, 'inputs', 'ambiguity-backlog.json');
  const backlog = readJSON(backlogPath);
  if (backlog) {
    for (const amb of backlog.ambiguities || []) {
      if (amb.status === 'open') {
        failures.push(`Open ambiguity: ${amb.id} - ${amb.issue}`);
      }
    }
  }

  // 3. requirement.md has final confirmation
  const reqPath = path.join(taskPath, 'inputs', 'requirement.md');
  if (!fs.existsSync(reqPath)) {
    failures.push('requirement.md not found');
  } else {
    const content = fs.readFileSync(reqPath, 'utf8');
    if (!content.includes('最终确认')) {
      failures.push('requirement.md missing final confirmation');
    }
  }

  return { complete: failures.length === 0, failures };
}

// --- readChecklist ---

function readChecklist(taskPath) {
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = readJSON(checklistPath);
  if (!checklist) return null;

  let total = 0, passed = 0;
  const categories = checklist.categories.map(cat => {
    let catPassed = 0;
    const items = cat.items.map(item => {
      total++;
      if (item.result === 'pass') { passed++; catPassed++; }
      return { ...item };
    });
    return { id: cat.id, name: cat.name, passed: catPassed, total: cat.items.length, items };
  });

  return { passed, failed: total - passed, total, categories };
}

// --- CLI ---

if (require.main === module) {
  const [,, cmd, ...args] = process.argv;
  const taskPath = args[0];
  if (!taskPath) { console.error('Usage: feature-clarify.js <command> <taskPath>'); process.exit(1); }

  switch (cmd) {
    case 'init':
      init(taskPath);
      console.log(JSON.stringify({ init: true, taskPath }));
      break;
    case 'check-complete':
      console.log(JSON.stringify(checkComplete(taskPath)));
      break;
    case 'read-checklist':
      console.log(JSON.stringify(readChecklist(taskPath)));
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

module.exports = { init, checkComplete, readChecklist };
