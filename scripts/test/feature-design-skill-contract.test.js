'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('feature-design exposes five outcome tasks and keeps semantic analysis in the main skill', () => {
  const skill = read('skills/feature-design/SKILL.md');
  for (const phrase of [
    /恢复设计工作空间.*建立专业上下文/s,
    /完成并确认核心设计/,
    /形成可评审.*Draft/,
    /独立 Review.*修订/s,
    /发布 Design Baseline/,
    /先调查，再提问/,
    /design tree/i,
    /frontier/i,
    /当前理解.*推荐方案.*理由.*替代方案.*主要代价/s,
    /矛盾.*薄弱假设.*风险/s,
    /重新计算 design tree\/frontier/i,
    /Design Sections/,
    /Confirmed Design/,
    /整体确认/,
  ]) assert.match(skill, phrase);

  assert.doesNotMatch(skill, /businessDesign\s*→\s*solutionDesign|第一个缺失 Artifact|nextAction|Review Matrix/i);
});

test('feature-design progressively loads one Design Guide and Spec without stage orchestration', () => {
  const skill = read('skills/feature-design/SKILL.md');
  assert.match(skill, /inspect-workspace/);
  assert.match(skill, /init-design/);
  assert.match(skill, /references\/design-guides\/<slug>\.md/);
  assert.match(skill, /references\/specs\/<slug>\.md/);
  assert.match(skill, /当前设计目标.*相关 Artifact|相关 Artifact.*设计目标/s);
  assert.match(skill, /无法|冲突|多个候选/);
  assert.doesNotMatch(skill, /references\/stages|stage-contracts|current-stage|init-stage|inspect-stage|固定上游/);
});

test('feature-design keeps isolated review simple and leaves top-level state to workflow', () => {
  const skill = read('skills/feature-design/SKILL.md');
  assert.match(skill, /每份适用 Checklist.*新的.*隔离.*Reviewer/s);
  assert.match(skill, /评审规则和每个检查项/);
  assert.match(skill, /直接返回轻量 Markdown/);
  assert.match(skill, /语义修改.*全部适用.*完整复评/s);
  assert.match(skill, /record-review/);
  assert.match(skill, /approve-current-design/);
  assert.match(skill, /publish/);
  assert.doesNotMatch(skill, /sync-state/);
  assert.doesNotMatch(skill, /完成状态同步|状态同步成功/);
  assert.match(skill, /当前 Design Baseline 已获用户批准并发布/);
  assert.doesNotMatch(skill, /plan-reviews|record-reviews|allowedReads|disposition|plan-cross-review|record-cross-review/);
});

test('Design Guides contain professional differences and Specs remain independent contracts', () => {
  for (const slug of ['business-design', 'solution-design', 'implementation-design', 'test-design']) {
    const guide = read(`skills/feature-design/references/design-guides/${slug}.md`);
    const spec = read(`skills/feature-design/references/specs/${slug}.md`);
    for (const heading of ['专业边界', '专业原则', '分析透镜', '高价值矛盾', '风险缩放', 'Checklist 导航', '专业收敛标准']) {
      assert.match(guide, new RegExp(heading));
    }
    assert.match(spec, /核心章节/);
    assert.match(spec, /条件章节/);
    assert.match(spec, /适用性说明/);
    assert.doesNotMatch(guide, /Draft.*Lint.*Review.*Baseline/is);
  }
  assert.strictEqual(fs.existsSync(path.join(root, 'skills/feature-design/references/stage-contracts.json')), false);
  assert.strictEqual(fs.existsSync(path.join(root, 'skills/feature-design/references/stages')), false);
});

test('solution design reference defines target-state architecture without a second workflow', () => {
  const guide = read('skills/feature-design/references/design-guides/solution-design.md');
  const spec = read('skills/feature-design/references/specs/solution-design.md');

  for (const phrase of [
    /目标态/,
    /新建特性/,
    /存量特性增强/,
    /新增.*受影响.*保持不变.*非目标/s,
    /4\+1/,
    /场景视图.*逻辑视图.*进程视图.*开发视图.*物理视图/s,
    /必须关闭的系统级决策/,
    /系统责任边界.*架构与微服务职责.*接口与集成契约.*数据归属与一致性.*关键质量属性.*异常与失败语义/s,
  ]) assert.match(guide, phrase);

  for (const heading of [
    '概述',
    '特性需求与设计上下文',
    '总体方案',
    '4\\+1 架构视图',
    '接口与集成设计',
    '数据设计',
    '可靠性、可用性与功能安全设计',
    '安全、隐私与韧性设计',
    '非功能质量属性设计',
    '关键技术决策、取舍与风险',
    '下游设计约束与交接',
    '需求追溯与覆盖关系',
    '词汇表',
    '参考资料',
  ]) assert.match(spec, new RegExp(`^## ${heading}$`, 'm'));

  for (const view of ['场景视图', '逻辑视图', '进程视图', '开发视图', '物理视图']) {
    assert.match(spec, new RegExp(`^### ${view}$`, 'm'));
  }

  assert.match(spec, /内容合同.*design tree\/frontier/s);
  assert.match(spec, /新建.*存量增强/s);
  assert.match(spec, /目标态正文|完整目标态/);
  assert.doesNotMatch(guide, /inspect-workspace|init-design|record-review|approve-current-design|publish|sync-state/);
  assert.doesNotMatch(spec, /businessDesign\s*→\s*solutionDesign|Business Baseline.*必须|固定前置/);
});

test('every Review Checklist is Chinese and defines applicability, rules, and concrete items', () => {
  const checklistDir = path.join(root, 'skills/feature-design/references/review-checklists');
  const files = fs.readdirSync(checklistDir).filter(file => file.endsWith('.md'));
  assert.ok(files.length >= 10);
  for (const file of files) {
    const checklist = fs.readFileSync(path.join(checklistDir, file), 'utf8');
    assert.match(checklist, /^# .+/m, file);
    assert.match(checklist, /^## 适用条件$/m, file);
    assert.match(checklist, /^## 评审规则$/m, file);
    assert.match(checklist, /^## 检查项$/m, file);
    assert.ok((checklist.match(/^- \[ \] /gm) || []).length >= 3, file);
    assert.doesNotMatch(checklist, /^Review |^Use when |^Check /m, file);
  }
});

test('feature-review directly returns Markdown and does not depend on a plan or matrix', () => {
  const skill = read('skills/feature-review/SKILL.md');
  assert.match(skill, /会话隔离/);
  assert.match(skill, /评审规则和所有检查项/);
  assert.match(skill, /不询问用户/);
  assert.match(skill, /不修改文件/);
  assert.match(skill, /blocking.*advisory.*risk/s);
  assert.match(skill, /轻量 Markdown/);
  assert.doesNotMatch(skill, /allowedReads|评审计划|record-reviews|disposition|Review Matrix|返回 JSON/i);
});

test('overall approval consumes the required baseline set without cross-stage artifacts', () => {
  const skill = read('skills/feature-approve/SKILL.md');
  assert.match(skill, /requiredDesignTypes/);
  assert.match(skill, /Baseline 集合/);
  assert.doesNotMatch(skill, /cross-stage|四份|integrated-design|review-matrix/i);
});

test('obsolete design control paths are removed from the plugin surface', () => {
  for (const relative of [
    'skills/feature-design-business/SKILL.md',
    'skills/feature-design-solution/SKILL.md',
    'skills/feature-design-implementation/SKILL.md',
    'skills/feature-design-test/SKILL.md',
    'skills/design-quality-gate/SKILL.md',
    'skills/design-template-check/SKILL.md',
    'scripts/devsphere-review-matrix.js',
    'templates/artifacts/integrated-design.md',
  ]) assert.strictEqual(fs.existsSync(path.join(root, relative)), false, relative);
});
