#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { init, checkComplete, readChecklist, confirmFinal, updateChecklist } = require('../feature-clarify');

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
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# 原始需求\n\n## 11. 最终确认\n以上内容已经过用户确认。- **确认时间**：2026-07-14 10:00');
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
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# 原始需求\n\n## 11. 最终确认\n以上内容已经过用户确认。- **确认时间**：2026-07-14 10:00');

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

test('confirmFinal sets item 7.8.8 to pass', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-006');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  const result = confirmFinal(taskPath);
  assert.deepStrictEqual(result, { confirmed: true });

  const checklist = JSON.parse(fs.readFileSync(path.join(taskPath, 'reviews', 'requirement-checklist.json'), 'utf8'));
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.id === '7.8.8') {
        assert.strictEqual(item.result, 'pass');
        assert.strictEqual(item.evidence, '§11 最终确认');
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
  assert.deepStrictEqual(result, { updated: 1 });

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
  assert.deepStrictEqual(result, { updated: 2 });

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
