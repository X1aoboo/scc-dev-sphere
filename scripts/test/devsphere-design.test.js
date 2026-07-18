'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');

test('createFeatureTask 创建 work/ 目录', () => {
  const { taskPath } = makeTask();
  assert.ok(fs.existsSync(path.join(taskPath, 'work')));
});

const {
  sha256File, parseDraftFrontmatter, readDraftRef, progressPath, STAGE_SLUG,
} = require('../devsphere-design');

test('sha256File 返回 sha256: 前缀的 hex', () => {
  const { taskPath } = makeTask();
  const f = path.join(taskPath, 'work', 'tmp.txt');
  fs.writeFileSync(f, 'hello');
  const h = sha256File(f);
  assert.ok(h.startsWith('sha256:'));
  assert.strictEqual(h, 'sha256:' + require('crypto').createHash('sha256').update('hello').digest('hex'));
});

test('parseDraftFrontmatter 读取 artifactId 与 version', () => {
  const { taskPath } = makeTask();
  const f = path.join(taskPath, 'work', 'x.md');
  fs.writeFileSync(f, '---\nartifactId: "BD-1"\nversion: "0.1.0"\n---\n\nbody\n');
  assert.deepStrictEqual(parseDraftFrontmatter(f), { artifactId: 'BD-1', version: '0.1.0' });
});

test('STAGE_SLUG 映射 businessDesign → business-design', () => {
  assert.strictEqual(STAGE_SLUG.businessDesign, 'business-design');
});

const { initStage } = require('../devsphere-design');

test('initStage 创建四份 work 文件 + progress.json，幂等', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  const dir = path.join(taskPath, 'work', 'business-design');
  for (const f of ['analysis.md', 'discovery.md', 'design.md', 'draft.md']) {
    assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);
  }
  const prog = JSON.parse(fs.readFileSync(path.join(dir, 'progress.json'), 'utf-8'));
  assert.deepStrictEqual(prog, { step: 'analyze', ready: { analysis: false, discovery: false } });
  // 幂等
  assert.doesNotThrow(() => initStage(taskPath, 'businessDesign'));
});

const { markReady } = require('../devsphere-design');

test('markReady analysis 置位并推进 step', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'analysis');
  const prog = JSON.parse(fs.readFileSync(progressPath(taskPath, 'businessDesign'), 'utf-8'));
  assert.strictEqual(prog.ready.analysis, true);
  assert.strictEqual(prog.step, 'discover');
});

test('markReady discovery 置位', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  markReady(taskPath, 'businessDesign', 'discovery');
  const prog = JSON.parse(fs.readFileSync(progressPath(taskPath, 'businessDesign'), 'utf-8'));
  assert.strictEqual(prog.ready.discovery, true);
});

test('markReady 拒绝非法 which', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  assert.throws(() => markReady(taskPath, 'businessDesign', 'design'), /which/);
});

const { recordGate, readGate } = require('../devsphere-design');

function writeDraft(taskPath, stage, artifactId, version, body = '# draft') {
  const dp = path.join(taskPath, 'work', STAGE_SLUG[stage], 'draft.md');
  fs.writeFileSync(dp, `---\nartifactId: "${artifactId}"\nversion: "${version}"\n---\n\n${body}\n`, 'utf-8');
}

test('recordGate 写入绑定 draft hash 的结果', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0');
  recordGate(taskPath, 'businessDesign', 'pass', { templateChecks: [], qualityChecks: [] });
  const g = readGate(taskPath, 'businessDesign');
  assert.strictEqual(g.status, 'pass');
  assert.strictEqual(g.draftRef.version, '0.1.0');
  assert.ok(g.draftRef.hash.startsWith('sha256:'));
});

test('recordGate 拒绝非法 status', () => {
  const { taskPath } = makeTask();
  initStage(taskPath, 'businessDesign');
  writeDraft(taskPath, 'businessDesign', 'BD-1', '0.1.0');
  assert.throws(() => recordGate(taskPath, 'businessDesign', 'requires_human', { templateChecks: [], qualityChecks: [] }), /status/);
});
