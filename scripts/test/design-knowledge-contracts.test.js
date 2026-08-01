'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { makeTask } = require('./helpers');
const {
  registerEvidenceRecord,
  readRegistry,
} = require('../knowledge-query');

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
