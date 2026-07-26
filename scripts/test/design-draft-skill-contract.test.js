'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('design-draft is a generic model-invocable lossless drafting method', () => {
  const skill = read('skills/design-draft/SKILL.md');

  assert.match(skill, /^name: design-draft$/m);
  assert.match(skill, /无损固化/);
  assert.match(skill, /当前会话/);
  assert.match(skill, /模板|Spec/);
  assert.match(skill, /目标文件/);
  assert.doesNotMatch(skill, /^disable-model-invocation:/m);
  assert.doesNotMatch(skill, /^user-invocable:\s*false$/m);
  assert.doesNotMatch(skill, /^context:\s*fork$/m);
});

test('design-draft preserves final design without taking over analysis or workflow', () => {
  const skill = read('skills/design-draft/SKILL.md');
  const process = skill.match(/## Process([\s\S]*?)## Rules/)[1];

  assert.strictEqual((process.match(/^\d\. /gm) || []).length, 3);
  for (const phrase of [
    /最终有效|仍然有效/,
    /不将设计压缩为摘要/,
    /修复遗漏、过度概括、语义变化和擅自新增/,
    /完整且可独立理解/,
    /最终结论优先/,
    /忠实性优先/,
    /模板不得过滤内容/,
    /上下文与演进关系充分/,
    /发现冲突、缺口或未决事项.*交回设计分析/s,
  ]) assert.match(skill, phrase);

  assert.doesNotMatch(skill, /Task List|Lint|Review|批准|发布|Baseline|designType|work\/<slug>/i);
});
