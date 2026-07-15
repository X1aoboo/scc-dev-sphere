#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { init, checkComplete, readChecklist, confirmFinal, updateChecklist, waiveItem, checkStaleConfirmation } = require('../feature-clarify');

test('init creates reviews/ dir and copies checklist template', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-001');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');

  init(taskPath);

  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  assert.ok(fs.existsSync(checklistPath), 'checklist JSON exists');
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  assert.ok(Array.isArray(checklist.categories), 'has categories array');
  assert.ok(checklist.categories.length > 0, 'categories non-empty');

  const backlogPath = path.join(taskPath, 'inputs', 'ambiguity-backlog.json');
  assert.ok(fs.existsSync(backlogPath), 'backlog exists');
  const backlog = JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
  assert.ok(Array.isArray(backlog.ambiguities), 'has ambiguities array');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('init is idempotent', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-002');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');

  init(taskPath);
  const first = JSON.parse(fs.readFileSync(path.join(taskPath, 'reviews', 'requirement-checklist.json'), 'utf8'));
  init(taskPath);
  const second = JSON.parse(fs.readFileSync(path.join(taskPath, 'reviews', 'requirement-checklist.json'), 'utf8'));
  assert.deepStrictEqual(first, second, 'second init is no-op');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('init throws on missing taskPath', () => {
  assert.throws(() => init('/nonexistent/path'), /taskPath/);
});

test('checkComplete returns false when all items fail', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-003');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# 原始需求\n\n## 2. 需求概述\n\n### 2.1 业务目标\n\n测试业务目标');
  init(taskPath);

  const result = checkComplete(taskPath);
  assert.strictEqual(result.complete, false);
  assert.ok(result.failures.length > 0, 'has failure details');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('checkComplete returns true when all items pass and confirmed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-004');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# 原始需求\n\n## 2. 需求概述\n\n### 2.1 业务目标\n\n测试业务目标');

  init(taskPath);
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      item.result = 'pass';
      item.evidence = 'test';
    }
  }
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));

  const result = checkComplete(taskPath);
  assert.strictEqual(result.complete, true, `expected complete=true, failures: ${JSON.stringify(result.failures)}`);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('readChecklist returns counts', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-005');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  const result = readChecklist(taskPath);
  assert.ok(result.total > 0, 'has total');
  assert.strictEqual(result.passed, 0, 'all fail by default');
  assert.strictEqual(result.failed, result.total, 'failed equals total');
  assert.ok(Array.isArray(result.categories), 'has categories array');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('confirmFinal sets item 7.8.8 to pass without touching evidence', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-006');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  // Set evidence to something existing to verify it is NOT overwritten
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.8.8') {
        item.evidence = 'preexisting-evidence';
        item.note = 'preexisting-note';
      }
    }
  }
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));

  const result = confirmFinal(taskPath);
  assert.deepStrictEqual(result, { confirmed: true });

  const updated = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  for (const cat of updated.categories) {
    for (const item of cat.items) {
      if (item.id === '7.8.8') {
        assert.strictEqual(item.result, 'pass');
        assert.strictEqual(item.evidence, 'preexisting-evidence', 'evidence NOT overwritten by confirmFinal');
        assert.strictEqual(item.note, 'preexisting-note', 'note NOT overwritten by confirmFinal');
      }
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('confirmFinal throws on missing checklist', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-007');

  assert.throws(() => confirmFinal(taskPath), /requirement-checklist\.json not found/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('updateChecklist updates a single item', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-008');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  const result = updateChecklist(taskPath, { items: [{ id: '7.1.1', result: 'pass', evidence: '§2.1', note: '' }] });
  assert.deepStrictEqual(result, { updated: 1, reviewVersion: 0 });

  const checklist = JSON.parse(fs.readFileSync(path.join(taskPath, 'reviews', 'requirement-checklist.json'), 'utf8'));
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.1.1') {
        assert.strictEqual(item.result, 'pass');
        assert.strictEqual(item.evidence, '§2.1');
      }
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('updateChecklist updates multiple items', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-009');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  const result = updateChecklist(taskPath, {
    items: [
      { id: '7.1.1', result: 'pass', evidence: 'ok', note: '' },
      { id: '7.1.2', result: 'fail', evidence: '', note: 'missing' },
    ],
  });
  assert.deepStrictEqual(result, { updated: 2, reviewVersion: 0 });

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('updateChecklist rejects invalid payload', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-010');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  assert.throws(() => updateChecklist(taskPath, null), /payload\.items must be an array/);
  assert.throws(() => updateChecklist(taskPath, { items: 'not-array' }), /payload\.items must be an array/);
  assert.throws(() => updateChecklist(taskPath, { items: [{ result: 'pass' }] }), /missing id or result/);
  assert.throws(() => updateChecklist(taskPath, { items: [{ id: '7.1.1' }] }), /missing id or result/);
  assert.throws(() => updateChecklist(taskPath, { items: [{ id: '7.1.1', result: 'invalid' }] }), /invalid result/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('updateChecklist rejects missing item id', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-011');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  assert.throws(() => updateChecklist(taskPath, { items: [{ id: '99.99.99', result: 'pass', evidence: '', note: '' }] }), /checklist item not found/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('updateChecklist rejects reserved items', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-012');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  assert.throws(
    () => updateChecklist(taskPath, { items: [{ id: '7.8.8', result: 'pass', evidence: '', note: '' }] }),
    /reserved/
  );

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('updateChecklist increments reviewVersion when requested', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-013');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  // First round
  const r1 = updateChecklist(taskPath, { items: [{ id: '7.1.1', result: 'pass', evidence: 'ok', note: '' }], incrementReviewVersion: true });
  assert.strictEqual(r1.reviewVersion, 1);

  // Second round
  const r2 = updateChecklist(taskPath, { items: [{ id: '7.1.2', result: 'pass', evidence: 'ok', note: '' }], incrementReviewVersion: true });
  assert.strictEqual(r2.reviewVersion, 2);

  // Without increment, version stays
  const r3 = updateChecklist(taskPath, { items: [{ id: '7.1.3', result: 'pass', evidence: 'ok', note: '' }] });
  assert.strictEqual(r3.reviewVersion, 2);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('checkComplete returns true when items are pass or waived (no fail)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-014');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.1.1' || item.id === '7.1.2') {
        item.result = 'waived';
        item.note = '用户接受风险';
      } else {
        item.result = 'pass';
      }
    }
  }
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));

  const result = checkComplete(taskPath);
  assert.strictEqual(result.complete, true, `expected complete=true, failures: ${JSON.stringify(result.failures)}`);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('checkComplete returns false when any item is still fail (waived ok)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-015');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.1.1') {
        item.result = 'waived';
        item.note = '用户接受风险';
      } else if (item.id === '7.8.8') {
        // leave as fail — reserved item, still blocks
        item.result = 'fail';
      } else {
        item.result = 'pass';
      }
    }
  }
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));

  const result = checkComplete(taskPath);
  assert.strictEqual(result.complete, false);
  assert.ok(result.failures.some(f => f.includes('7.8.8')), '7.8.8 still blocks when fail');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('waiveItem sets items to waived when reviewVersion >= limit', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-016');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  // Set reviewVersion >= designRevisionLimit (default 25)
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  checklist.reviewVersion = 25;
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));

  const result = waiveItem(taskPath, { items: [{ id: '7.1.1', reason: '低风险' }] });
  assert.deepStrictEqual(result, { waived: 1 });

  const updated = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  for (const cat of updated.categories) {
    for (const item of cat.items) {
      if (item.id === '7.1.1') {
        assert.strictEqual(item.result, 'waived');
        assert.ok(item.note.includes('低风险'), `note contains reason: ${item.note}`);
      }
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('waiveItem throws when reviewVersion < designRevisionLimit', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-017');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  // reviewVersion is 0, limit is 25
  assert.throws(
    () => waiveItem(taskPath, { items: [{ id: '7.1.1', reason: '低风险' }] }),
    /cannot waive/
  );

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('waiveItem throws when item is not fail', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-018');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  checklist.reviewVersion = 25;
  // 7.1.1 is fail by default, change 7.1.2 to pass
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.1.2') item.result = 'pass';
    }
  }
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));

  assert.throws(
    () => waiveItem(taskPath, { items: [{ id: '7.1.2', reason: 'test' }] }),
    /not fail/
  );

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('checkStaleConfirmation detects stale confirmation and resets 7.8.8', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-019');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  // Set 7.8.8 to pass (simulate confirmed)
  confirmFinal(taskPath);

  // Verify it's pass
  let checklist = JSON.parse(fs.readFileSync(path.join(taskPath, 'reviews', 'requirement-checklist.json'), 'utf8'));
  let item788 = null;
  for (const cat of checklist.categories) {
    const found = cat.items.find(i => i.id === '7.8.8');
    if (found) { item788 = found; break; }
  }
  assert.strictEqual(item788.result, 'pass');

  // Touch requirement.md to make it newer than checklist (use future time to guarantee mtime gap)
  const futureDate = new Date(Date.now() + 2000);
  fs.utimesSync(path.join(taskPath, 'inputs', 'requirement.md'), futureDate, futureDate);

  // Check stale
  const result = checkStaleConfirmation(taskPath);
  assert.strictEqual(result.stale, true, `expected stale=true, got: ${JSON.stringify(result)}`);

  // Verify 7.8.8 was reset to fail
  checklist = JSON.parse(fs.readFileSync(path.join(taskPath, 'reviews', 'requirement-checklist.json'), 'utf8'));
  for (const cat of checklist.categories) {
    const found = cat.items.find(i => i.id === '7.8.8');
    if (found) { item788 = found; break; }
  }
  assert.strictEqual(item788.result, 'fail', '7.8.8 should be reset to fail');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('checkStaleConfirmation returns stale=false when not yet confirmed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-020');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  // No confirmFinal called, 7.8.8 is still fail
  const result = checkStaleConfirmation(taskPath);
  assert.strictEqual(result.stale, false);

  fs.rmSync(tmp, { recursive: true, force: true });
});
