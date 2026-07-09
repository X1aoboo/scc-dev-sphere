'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { renderDispatch, slugify } = require('../devsphere-dispatch');

test('slugify: stage camelCase → kebab', () => {
  assert.strictEqual(slugify('businessDesign'), 'business-design');
  assert.strictEqual(slugify('implementationDesign'), 'implementation-design');
  assert.strictEqual(slugify('testDesign'), 'test-design');
});

test('design + gated 渲染:含 gated 块、不含 non-gated 块', () => {
  const out = renderDispatch({ kind: 'design', role: 'sa', stage: 'businessDesign',
    taskPath: '/t', skill: 'scc-dev-sphere:feature-design-business', humanGated: 'true', mode: 'strict-human-loop' });
  assert.match(out, /sa teammate/);
  assert.match(out, /scc-dev-sphere:feature-design-business/);
  assert.match(out, /type=gated/);
  assert.match(out, /artifacts\/business-design\.md/);
  assert.doesNotMatch(out, /type=autonomous/);
  assert.doesNotMatch(out, /\{\{stage\}\}/); // 占位符已填
});

test('design + 非 gated 渲染:含 autonomous 块、不含 gated 块', () => {
  const out = renderDispatch({ kind: 'design', role: 'mde', stage: 'implementationDesign',
    taskPath: '/t', skill: 'scc-dev-sphere:feature-design-implementation', humanGated: 'false', mode: 'auto-design' });
  assert.match(out, /type=autonomous\+assumption/);
  assert.match(out, /artifacts\/implementation-design\.md/);
  assert.doesNotMatch(out, /type=gated/);
});

test('design 默认 humanGated=false(未传)', () => {
  const out = renderDispatch({ kind: 'design', role: 'se', stage: 'solutionDesign',
    taskPath: '/t', skill: 'scc-dev-sphere:feature-design-solution', mode: 'auto-design' });
  assert.match(out, /type=autonomous/);
});

test('review 渲染:含 artifactPath、不含 design 任务体', () => {
  const out = renderDispatch({ kind: 'review', role: 'se', stage: 'businessDesign',
    taskPath: '/t', skill: 'scc-dev-sphere:feature-review', artifactPath: '/t/artifacts/business-design.md' });
  assert.match(out, /评审 businessDesign 阶段产物/);
  assert.match(out, /\/t\/artifacts\/business-design\.md/);
  assert.match(out, /scc-dev-sphere:feature-review/);
  assert.doesNotMatch(out, /type=gated|type=autonomous/); // review 无 gated 块
});

test('通用约束段所有 kind 都有', () => {
  for (const kind of ['design', 'review']) {
    const out = renderDispatch({ kind, role: 'sa', stage: 'businessDesign', taskPath: '/t',
      skill: 'x', humanGated: 'true', mode: 'm', artifactPath: '/a' });
    assert.match(out, /devsphere-teammate-conduct/);
    assert.match(out, /devsphere-decisions\.js CLI/);
  }
});

test('占位符全部填充(无残留 {{ }})', () => {
  const out = renderDispatch({ kind: 'design', role: 'sa', stage: 'testDesign',
    taskPath: '/t', skill: 'sk', humanGated: 'true', mode: 'strict-human-loop' });
  assert.doesNotMatch(out, /\{\{/);
});

test('非法 kind 抛错', () => {
  assert.throws(() => renderDispatch({ kind: 'bogus', role: 'sa', stage: 'x', taskPath: '/t', skill: 's' }), /kind/);
});

test('CLI smoke: build design gated 输出 prompt', () => {
  const { execSync } = require('child_process');
  const out = execSync('node scripts/devsphere-dispatch.js build design sa businessDesign /t scc-dev-sphere:feature-design-business true strict-human-loop', { encoding: 'utf-8' });
  assert.match(out, /type=gated/);
  assert.match(out, /business-design\.md/);
});
