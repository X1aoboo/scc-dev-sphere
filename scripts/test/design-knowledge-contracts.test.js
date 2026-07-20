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
  writeDecisions,
} = require('../devsphere-decisions');
const {
  mergeCandidateResults,
  registerEvidenceRecord,
  readRegistry,
} = require('../knowledge-query');

function decisionInput(overrides = {}) {
  return {
    context: '审批撤回会改变状态模型',
    userInput: '只允许提交人在审批前撤回',
    candidates: ['审批前可撤回', '始终不可撤回', '任意时刻撤回'],
    recommendation: '审批前可撤回',
    finalDecision: '审批前可撤回',
    rationale: '兼顾纠错与审批稳定性',
    impact: '业务状态增加已撤回终态',
    evidence: [],
    ...overrides,
  };
}

test('Decision add auto-initializes from task state and stores a normalized immutable record', () => {
  const { taskPath, taskId } = makeTask();
  const decision = addDecision(taskPath, 'business-design', decisionInput({ evidence: ['EV-001'] }));
  const document = readDecisions(taskPath, 'business-design');

  assert.strictEqual(decision.id, 'BD-DEC-001');
  assert.deepStrictEqual(decision.supersedes, []);
  assert.strictEqual(decision.status, undefined);
  assert.strictEqual(decision.askMode, undefined);
  assert.strictEqual(decision.category, undefined);
  assert.strictEqual(document.taskId, taskId);
  assert.strictEqual(document.stage, 'businessDesign');
  assert.strictEqual(document.decisions.length, 1);
});

test('Decision add appends to an existing document and explicit init remains compatible', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'solution-design', taskId, 'solutionDesign');
  const first = addDecision(taskPath, 'solution-design', decisionInput({ finalDecision: '使用同步调用' }));
  const snapshot = JSON.parse(JSON.stringify(first));
  const second = addDecision(taskPath, 'solution-design', decisionInput({ finalDecision: '使用异步事件' }));
  const document = readDecisions(taskPath, 'solution-design');

  assert.strictEqual(second.id, 'SD-DEC-002');
  assert.strictEqual(document.decisions.length, 2);
  assert.deepStrictEqual(document.decisions[0], snapshot);
});

test('legacy Decision records without supersedes remain readable and effective', () => {
  const { taskPath, taskId } = makeTask();
  const legacy = {
    id: 'BD-DEC-001',
    ...decisionInput(),
    recordedAt: '2026-01-01T00:00:00.000Z',
  };
  delete legacy.supersedes;
  writeDecisions(taskPath, 'business-design', {
    stage: 'businessDesign',
    taskId,
    decisions: [legacy],
  });

  const next = addDecision(taskPath, 'business-design', decisionInput({
    finalDecision: '采用新状态机',
    supersedes: ['BD-DEC-001'],
  }));
  const document = readDecisions(taskPath, 'business-design');

  assert.deepStrictEqual(document.decisions[0], legacy);
  assert.deepStrictEqual(next.supersedes, ['BD-DEC-001']);
});

test('a Decision can supersede multiple currently effective records without mutating history', () => {
  const { taskPath } = makeTask();
  const first = addDecision(taskPath, 'test-design', decisionInput({ finalDecision: '逐层验证' }));
  const second = addDecision(taskPath, 'test-design', decisionInput({ finalDecision: '关键链路回归' }));
  const historyBefore = JSON.parse(JSON.stringify(readDecisions(taskPath, 'test-design').decisions));
  const replacement = addDecision(taskPath, 'test-design', decisionInput({
    finalDecision: '统一风险驱动验证',
    supersedes: [first.id, second.id],
  }));
  const document = readDecisions(taskPath, 'test-design');

  assert.deepStrictEqual(replacement.supersedes, [first.id, second.id]);
  assert.deepStrictEqual(document.decisions.slice(0, 2), historyBefore);
  for (const historical of document.decisions.slice(0, 2)) {
    assert.strictEqual(historical.status, undefined);
    assert.strictEqual(historical.active, undefined);
    assert.strictEqual(historical.obsolete, undefined);
  }
});

test('Decision supersedes rejects nonexistent, duplicate, cross-stage, and historical targets', () => {
  const { taskPath } = makeTask();
  const first = addDecision(taskPath, 'implementation-design', decisionInput());

  assert.throws(() => addDecision(taskPath, 'implementation-design', decisionInput({
    supersedes: ['IMPL-DEC-999'],
  })), /does not exist/i);
  assert.throws(() => addDecision(taskPath, 'implementation-design', decisionInput({
    supersedes: [first.id, first.id],
  })), /duplicate/i);
  assert.throws(() => addDecision(taskPath, 'implementation-design', decisionInput({
    supersedes: ['SD-DEC-001'],
  })), /current design type/i);

  addDecision(taskPath, 'implementation-design', decisionInput({
    finalDecision: '新方案',
    supersedes: [first.id],
  }));
  assert.throws(() => addDecision(taskPath, 'implementation-design', decisionInput({
    finalDecision: '再次替代历史记录',
    supersedes: [first.id],
  })), /not currently effective/i);
  assert.strictEqual(readDecisions(taskPath, 'implementation-design').decisions.length, 2);
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
