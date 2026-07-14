'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { renderDispatch, slugify } = require('../devsphere-dispatch');

test('slugify: stage camelCase → kebab', () => {
  assert.strictEqual(slugify('businessDesign'), 'business-design');
  assert.strictEqual(slugify('implementationDesign'), 'implementation-design');
  assert.strictEqual(slugify('testDesign'), 'test-design');
});

test('design + Lead decision policy 渲染', () => {
  const out = renderDispatch({ kind: 'design', role: 'sa', stage: 'businessDesign',
    taskPath: '/t', skill: 'scc-dev-sphere:feature-design-business', decisionPolicy: 'lead-confirm' });
  assert.match(out, /sa teammate/);
  assert.match(out, /scc-dev-sphere:feature-design-business/);
  assert.match(out, /decisionPolicy=lead-confirm/);
  assert.match(out, /artifacts\/business-design\.md/);
  assert.doesNotMatch(out, /humanGated|workflow mode/);
  assert.doesNotMatch(out, /\{\{stage\}\}/);
});

test('design + Agent autonomy policy 渲染', () => {
  const out = renderDispatch({ kind: 'design', role: 'mde', stage: 'implementationDesign',
    taskPath: '/t', skill: 'scc-dev-sphere:feature-design-implementation', decisionPolicy: 'agent-autonomy' });
  assert.match(out, /decisionPolicy=agent-autonomy/);
  assert.match(out, /artifacts\/implementation-design\.md/);
  assert.doesNotMatch(out, /humanGated|workflow mode/);
});

test('design 默认 decisionPolicy=agent-autonomy', () => {
  const out = renderDispatch({ kind: 'design', role: 'se', stage: 'solutionDesign',
    taskPath: '/t', skill: 'scc-dev-sphere:feature-design-solution' });
  assert.match(out, /decisionPolicy=agent-autonomy/);
});

test('review 渲染:含 artifactPath/version、不含 design 任务体', () => {
  const out = renderDispatch({ kind: 'review', role: 'se', stage: 'businessDesign',
    taskPath: '/t', skill: 'scc-dev-sphere:feature-review',
    artifactPath: '/t/artifacts/business-design.md', artifactVersion: '0.2.0',
    reviewStatePath: '/t/reviews/business-design/se.json',
    reviewMarkdownPath: '/t/reviews/business-design/se-review.md' });
  assert.match(out, /评审 businessDesign 阶段产物/);
  assert.match(out, /\/t\/artifacts\/business-design\.md/);
  assert.match(out, /0\.2\.0/);
  assert.match(out, /scc-dev-sphere:feature-review/);
  assert.match(out, /reviews\/business-design\/se\.json/);
  assert.doesNotMatch(out, /type=gated|type=autonomous/);
});

test('通用约束段所有 kind 都有', () => {
  for (const kind of ['design', 'review']) {
    const out = renderDispatch({ kind, role: 'sa', stage: 'businessDesign', taskPath: '/t',
      skill: 'x', decisionPolicy: 'lead-confirm', artifactPath: '/a' });
    assert.match(out, /devsphere-teammate-conduct/);
    assert.match(out, /devsphere-decisions\.js CLI/);
  }
});

test('占位符全部填充(无残留 {{ }})', () => {
  const out = renderDispatch({ kind: 'design', role: 'sa', stage: 'testDesign',
    taskPath: '/t', skill: 'sk', decisionPolicy: 'lead-confirm' });
  assert.doesNotMatch(out, /\{\{/);
});

test('非法 kind 抛错', () => {
  assert.throws(() => renderDispatch({ kind: 'bogus', role: 'sa', stage: 'x', taskPath: '/t', skill: 's' }), /kind/);
});

test('CLI smoke: build design policy 输出 prompt', () => {
  const { execSync } = require('child_process');
  const out = execSync('node scripts/devsphere-dispatch.js build design sa businessDesign /t scc-dev-sphere:feature-design-business lead-confirm', { encoding: 'utf-8' });
  assert.match(out, /decisionPolicy=lead-confirm/);
  assert.match(out, /business-design\.md/);
});

test('CLI smoke: build review 输出含 artifactPath、version', () => {
  const { execSync } = require('child_process');
  const out = execSync('node scripts/devsphere-dispatch.js build review se businessDesign /t scc-dev-sphere:feature-review /t/artifacts/business-design.md 0.2.0', { encoding: 'utf-8' });
  assert.match(out, /\/t\/artifacts\/business-design\.md/);
  assert.match(out, /评审 businessDesign/);
  assert.match(out, /0\.2\.0/);
});

test('bootstrap 渲染固定设计团队成员契约', () => {
  const out = renderDispatch({ kind: 'bootstrap', role: 'se', stage: 'designTeam',
    taskPath: '/t', skill: 'scc-dev-sphere:devsphere-teammate-conduct' });
  assert.match(out, /design-se/);
  assert.match(out, /不要创建嵌套团队/);
});
