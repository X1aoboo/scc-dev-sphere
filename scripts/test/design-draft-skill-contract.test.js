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

  assert.strictEqual((process.match(/^\d\. /gm) || []).length, 5);
  for (const phrase of [
    /最终有效|仍然有效/,
    /模板内容合同和文档位置/,
    /根据语义选择正文、步骤、表格、图示、契约、示例、代码结构或调用方提供的配套资产目录/,
    /输入是否足以满足模板要求的具体行为、机制、边界、异常和验证内容/,
    /只有概括性结论.*列出缺口并交回设计分析/s,
    /不将详细设计压缩为摘要/,
    /内容映射、模板合同和目标读者用途/,
    /修复遗漏、过度概括、语义变化、不合适的表达形式和擅自新增/,
    /完整且可独立理解/,
    /具体内容优先/,
    /最终结论优先/,
    /忠实性优先/,
    /表达选择不是新增设计/,
    /模板不得过滤内容/,
    /上下文与演进关系充分/,
    /文档形式服务于用途/,
    /单一信息源/,
    /配套资产使用 Draft 中的稳定相对路径引用/,
    /线框图、原型快照、标注图.*写入该目录/s,
    /发现冲突、缺口或未决事项.*交回设计分析/s,
    /输入本身缺少必要设计时不得宣告完成/,
  ]) assert.match(skill, phrase);

  assert.doesNotMatch(skill, /Task List|Lint|Review|批准|发布|Baseline|designType|work\/<slug>/i);
});
