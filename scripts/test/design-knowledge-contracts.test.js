'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTask } = require('./helpers');
const {
  initDecisions,
  addDecision,
  readDecisions,
} = require('../devsphere-decisions');
const {
  mergeCandidateResults,
  registerEvidenceRecord,
  readRegistry,
} = require('../knowledge-query');

test('Decision stores substantive trade-offs without pending status, askMode, categories, or fixed option counts', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  const decision = addDecision(taskPath, 'business-design', {
    context: '审批撤回会改变状态模型',
    userInput: '只允许提交人在审批前撤回',
    candidates: ['审批前可撤回', '始终不可撤回', '任意时刻撤回'],
    recommendation: '审批前可撤回',
    finalDecision: '审批前可撤回',
    rationale: '兼顾纠错与审批稳定性',
    impact: '业务状态增加已撤回终态',
    evidence: ['EV-001'],
  });

  assert.strictEqual(decision.id, 'BD-DEC-001');
  assert.strictEqual(decision.status, undefined);
  assert.strictEqual(decision.askMode, undefined);
  assert.strictEqual(decision.category, undefined);
  assert.strictEqual(readDecisions(taskPath, 'business-design').decisions.length, 1);
});

test('Decision persistence never gates Draft or Artifact paths', () => {
  const { taskPath } = makeTask();
  initDecisions(taskPath, 'business-design', 'X', 'businessDesign');
  const source = fs.readFileSync(path.join(__dirname, '..', 'devsphere-design.js'), 'utf8');
  assert.doesNotMatch(source, /countGatedPending|listGatedPending|askMode|pending decision/);
});

test('Knowledge Query merges duplicate claims while preserving unique claims, conflicts, sources, and gaps', () => {
  const merged = mergeCandidateResults([
    { source: { type: 'repo', reference: 'src/a.js' }, claims: [{ key: 'timeout', text: 'Timeout is 30s' }], gaps: [] },
    { source: { type: 'local', reference: 'ops.md' }, claims: [{ key: 'timeout', text: 'Timeout is 30s' }, { key: 'owner', text: 'Team A' }], gaps: ['No rollback policy'] },
    { source: { type: 'web', reference: 'vendor docs' }, claims: [{ key: 'timeout', text: 'Timeout is 60s' }], gaps: [] },
  ]);

  assert.strictEqual(merged.candidates.length, 2);
  assert.strictEqual(merged.candidates.find(item => item.key === 'timeout').sources.length, 2);
  assert.strictEqual(merged.conflicts.length, 1);
  assert.deepStrictEqual(merged.gaps, ['No rollback policy']);
});

test('only the main session registers adopted multi-source Evidence with local source markers, including user input', () => {
  const { workspaceRoot } = makeTask();
  const record = registerEvidenceRecord(workspaceRoot, {
    topic: '审批超时策略',
    summary: '[S1][S2] 当前采用 30 秒超时；[S3] 用户要求失败后人工重试。',
    sources: [
      { type: 'repo', reference: 'src/a.js', summary: '30 秒' },
      { type: 'local', reference: 'ops.md', summary: '30 秒' },
      { type: 'user', reference: 'design discussion', summary: '失败后人工重试' },
    ],
    conflicts: [],
  });

  assert.strictEqual(record.id, 'EV-001');
  assert.deepStrictEqual(record.sources.map(source => source.marker), ['S1', 'S2', 'S3']);
  assert.strictEqual(readRegistry(workspaceRoot).evidences[0].topic, '审批超时策略');
});

test('Evidence rejects incomplete sources and summaries that do not bind every local marker', () => {
  const { workspaceRoot } = makeTask();
  assert.throws(() => registerEvidenceRecord(workspaceRoot, {
    topic: '超时',
    summary: '[S1] 当前为 30 秒。',
    sources: [{ type: 'repo', reference: '', summary: '30 秒' }],
  }), /source.*reference/i);
  assert.throws(() => registerEvidenceRecord(workspaceRoot, {
    topic: '超时',
    summary: '[S1] 当前为 30 秒。',
    sources: [
      { type: 'repo', reference: 'src/a.js', summary: '30 秒' },
      { type: 'user', reference: 'discussion', summary: '要求人工重试' },
    ],
  }), /S2/);
});
