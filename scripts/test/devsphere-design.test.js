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
