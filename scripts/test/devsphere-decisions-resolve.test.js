'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { resolveMainArtifact } = require('../devsphere-decisions');

test('主产物路径解析出 taskPath 与 slug', () => {
  const r = resolveMainArtifact('/tmp/x/.devsphere/tasks/feature/FEAT-1/artifacts/business-design.md');
  assert.strictEqual(r.isMainArtifact, true);
  assert.strictEqual(r.slug, 'business-design');
  assert.strictEqual(r.taskPath, '/tmp/x/.devsphere/tasks/feature/FEAT-1');
});

test('四个设计阶段主产物都能解析', () => {
  for (const slug of ['business-design', 'solution-design', 'implementation-design', 'test-design']) {
    const r = resolveMainArtifact(`/p/t/artifacts/${slug}.md`);
    assert.strictEqual(r.isMainArtifact, true);
    assert.strictEqual(r.slug, slug);
    assert.strictEqual(r.taskPath, '/p/t');
  }
});

test('非主产物返回 isMainArtifact=false', () => {
  assert.strictEqual(resolveMainArtifact('/p/t/decisions/business-design-decisions.json').isMainArtifact, false);
  assert.strictEqual(resolveMainArtifact('/p/t/artifacts/integrated-design.md').isMainArtifact, false);
  assert.strictEqual(resolveMainArtifact('/p/t/inputs/requirement.md').isMainArtifact, false);
  assert.strictEqual(resolveMainArtifact('/unrelated/file.txt').isMainArtifact, false);
});
