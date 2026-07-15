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
      if (item.result === 'fail') {
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

  // 3. (removed — final confirmation check no longer used)

  return { complete: failures.length === 0, failures };
}

// --- readChecklist ---

function readChecklist(taskPath) {
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = readJSON(checklistPath);
  if (!checklist) return null;

  let total = 0, passed = 0, failed = 0, waived = 0;
  const categories = checklist.categories.map(cat => {
    let catPassed = 0, catFailed = 0, catWaived = 0;
    const items = cat.items.map(item => {
      total++;
      if (item.result === 'pass') { passed++; catPassed++; }
      else if (item.result === 'fail') { failed++; catFailed++; }
      else if (item.result === 'waived') { waived++; catWaived++; }
      return { ...item };
    });
    return { id: cat.id, name: cat.name, passed: catPassed, failed: catFailed, waived: catWaived, total: cat.items.length, items };
  });

  return { passed, failed, waived, total, categories };
}

// --- confirmFinal ---

function confirmFinal(taskPath) {
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = readJSON(checklistPath);
  if (!checklist) throw new Error('requirement-checklist.json not found');

  let found = false;
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.8.8') {
        item.result = 'pass';
        found = true;
        break;
      }
    }
    if (found) break;
  }

  if (!found) throw new Error('checklist item 7.8.8 not found');
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));
  return { confirmed: true };
}

// --- updateChecklist ---

function updateChecklist(taskPath, payload) {
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('payload.items must be an array');
  }
  for (const item of payload.items) {
    if (!item.id || !item.result) {
      throw new Error(`item missing id or result: ${JSON.stringify(item)}`);
    }
    if (!['pass', 'fail'].includes(item.result)) {
      throw new Error(`invalid result for ${item.id}: ${item.result}`);
    }
  }

  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = readJSON(checklistPath);
  if (!checklist) throw new Error('requirement-checklist.json not found');

  // Reject updates to reserved items
  for (const update of payload.items) {
    for (const cat of checklist.categories) {
      const item = cat.items.find(i => i.id === update.id);
      if (item && item.reserved) {
        throw new Error(`item ${update.id} is reserved — only main session can update`);
      }
    }
  }

  let updated = 0;
  for (const update of payload.items) {
    let found = false;
    for (const cat of checklist.categories) {
      for (const item of cat.items) {
        if (item.id === update.id) {
          item.result = update.result;
          item.evidence = update.evidence || '';
          item.note = update.note || '';
          found = true;
          updated++;
          break;
        }
      }
      if (found) break;
    }
    if (!found) throw new Error(`checklist item not found: ${update.id}`);
  }

  if (payload.incrementReviewVersion) {
    checklist.reviewVersion = (checklist.reviewVersion || 0) + 1;
  }

  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));
  return { updated, reviewVersion: checklist.reviewVersion };
}

// --- waiveItem ---

function waiveItem(taskPath, payload) {
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('payload.items must be an array');
  }
  for (const item of payload.items) {
    if (!item.id || !item.reason) {
      throw new Error(`waive item missing id or reason: ${JSON.stringify(item)}`);
    }
  }

  // Read designRevisionLimit from state.json
  const statePath = path.join(taskPath, 'state.json');
  let designRevisionLimit = 25;
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    designRevisionLimit = state.designRevisionLimit || 25;
  }

  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = readJSON(checklistPath);
  if (!checklist) throw new Error('requirement-checklist.json not found');

  if ((checklist.reviewVersion || 0) < designRevisionLimit) {
    throw new Error(
      `cannot waive: reviewVersion ${checklist.reviewVersion || 0} < designRevisionLimit ${designRevisionLimit}`
    );
  }

  let waived = 0;
  for (const update of payload.items) {
    let found = false;
    for (const cat of checklist.categories) {
      for (const item of cat.items) {
        if (item.id === update.id) {
          if (item.result !== 'fail') {
            throw new Error(`item ${update.id} is not fail, cannot waive`);
          }
          item.result = 'waived';
          item.note = `用户接受风险: ${update.reason}`;
          found = true;
          waived++;
          break;
        }
      }
      if (found) break;
    }
    if (!found) throw new Error(`checklist item not found: ${update.id}`);
  }

  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));
  return { waived };
}

// --- checkStaleConfirmation ---

function checkStaleConfirmation(taskPath) {
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const reqPath = path.join(taskPath, 'inputs', 'requirement.md');

  if (!fs.existsSync(checklistPath)) {
    return { stale: false, reason: 'checklist not found' };
  }
  if (!fs.existsSync(reqPath)) {
    return { stale: false, reason: 'requirement.md not found' };
  }

  const checklist = readJSON(checklistPath);

  // Find 7.8.8
  let item788 = null;
  for (const cat of checklist.categories) {
    const found = cat.items.find(i => i.id === '7.8.8');
    if (found) { item788 = found; break; }
  }
  if (!item788) return { stale: false, reason: '7.8.8 not found' };
  if (item788.result !== 'pass') return { stale: false, reason: 'not yet confirmed' };

  // Compare mtimes
  const checklistMtime = fs.statSync(checklistPath).mtimeMs;
  const reqMtime = fs.statSync(reqPath).mtimeMs;

  if (reqMtime > checklistMtime) {
    // Stale: reset 7.8.8 to fail
    item788.result = 'fail';
    fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));
    return { stale: true, reason: 'requirement.md modified after confirmation, 7.8.8 reset to fail' };
  }

  return { stale: false };
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
    case 'confirm-final':
      console.log(JSON.stringify(confirmFinal(taskPath)));
      break;
    case 'update-checklist': {
      const payload = JSON.parse(args[1]);
      console.log(JSON.stringify(updateChecklist(taskPath, payload)));
      break;
    }
    case 'waive-item': {
      const payload = JSON.parse(args[1]);
      console.log(JSON.stringify(waiveItem(taskPath, payload)));
      break;
    }
    case 'check-stale-confirmation':
      console.log(JSON.stringify(checkStaleConfirmation(taskPath)));
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

module.exports = { init, checkComplete, readChecklist, confirmFinal, updateChecklist, waiveItem, checkStaleConfirmation };
