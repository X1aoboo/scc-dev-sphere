'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('feature-design exposes five outcome tasks and delegates semantic analysis to its internal skill', () => {
  const skill = read('skills/feature-design/SKILL.md');
  const analysis = read('skills/feature-design-analysis/SKILL.md');
  for (const phrase of [
    /恢复设计工作空间.*建立专业上下文/s,
    /完成并确认核心设计/,
    /形成可评审.*Draft/,
    /集中 Review.*修订/s,
    /发布 Design Baseline/,
  ]) assert.match(skill, phrase);

  assert.match(skill, /\/scc-dev-sphere:feature-design-analysis/);
  assert.match(analysis, /^user-invocable: false$/m);
  for (const phrase of [
    /design tree/i,
    /frontier/i,
    /Design Sections/,
    /完整设计已经由用户分段确认/,
    /用户明确确认设计已经收敛并允许进入 Draft/,
  ]) assert.match(analysis, phrase);

  assert.doesNotMatch(skill, /businessDesign\s*→\s*solutionDesign|第一个缺失 Artifact|nextAction|Review Matrix/i);
});

test('feature-design delegates lossless Draft writing and retains workflow-owned Lint', () => {
  const skill = read('skills/feature-design/SKILL.md');
  const task3 = skill.match(/## 步骤3\. 形成可评审 Draft([\s\S]*?)## 步骤4\./)[1];

  assert.match(task3, /\/scc-dev-sphere:design-draft/);
  assert.match(task3, /当前会话中已经确认的完整设计.*设计来源/s);
  assert.match(task3, /当前 Spec.*模板/s);
  assert.match(task3, /work\/<slug>\/draft\.md.*目标文件/s);
  assert.match(task3, /design-draft.*完成对照检查/s);
  assert.match(task3, /devsphere-design\.js lint <taskPath> <designType>/);
  assert.match(task3, /不判断方案是否具体、专业或语义成立/);
  assert.match(task3, /Design Guide 收敛标准、适用 Checklist 和用户评审/);
  assert.match(task3, /任务 3.*pending.*任务 2.*in_progress/s);
  assert.match(task3, /重新调用 `feature-design-analysis`/);
  assert.match(task3, /最终有效设计及必要上下文.*完整、忠实/s);
});

test('feature-design keeps external evidence and decision persistence out of its contract', () => {
  const skill = read('skills/feature-design/SKILL.md');
  const taskHarness = skill.match(/## 步骤0\. 创建执行任务([\s\S]*?)## (?:步骤)?1\./)[1];

  assert.strictEqual((taskHarness.match(/^\d\. \*\*/gm) || []).length, 5);
  assert.match(taskHarness, /2\. \*\*完成并确认核心设计\*\*/);
  assert.match(taskHarness, /4\. \*\*集中 Review 并修订至满足发布条件\*\*/);
  assert.strictEqual((skill.match(/^## Evidence 与 Decision$/gm) || []).length, 0);
  assert.doesNotMatch(skill, /register-evidence-record|devsphere-decisions\.js add|devsphere-decisions\.js init/);
});

test('feature-design delegates analysis without embedding persistence commands', () => {
  const skill = read('skills/feature-design/SKILL.md');
  assert.match(skill, /feature-design-analysis/);
  assert.doesNotMatch(skill, /register-evidence-record|devsphere-decisions\.js add|devsphere-decisions\.js init/);
});

test('feature-design maintains only semantic knowledge introduced by Review', () => {
  const skill = read('skills/feature-design/SKILL.md');
  const task4 = skill.match(/## (?:步骤)?4\. 集中 Review 并修订([\s\S]*?)## (?:步骤)?5\./)[1];

  assert.match(task4, /Reviewer finding.*不.*Evidence/s);
  assert.match(task4, /知识缺口.*调用 `knowledge-query` Agent.*采用.*Evidence/s);
  assert.match(task4, /用户.*确认.*新.*实质取舍.*Decision/s);
  assert.match(task4, /supersedes.*当前有效/s);
  assert.match(task4, /排版|措辞/);
  assert.doesNotMatch(task4, /register-evidence-record|devsphere-decisions\.js add/);
  assert.doesNotMatch(skill, /固定.*Evidence\/Decision.*章节|Evidence\/Decision.*状态机|第六个.*任务/);
});

test('feature-design progressively loads one Design Guide and Spec without stage orchestration', () => {
  const skill = read('skills/feature-design/SKILL.md');
  assert.match(skill, /inspect-workspace/);
  assert.match(skill, /init-design/);
  assert.match(skill, /references\/design-guides\/<slug>\.md/);
  assert.match(skill, /references\/specs\/<slug>\.md/);
  assert.match(skill, /`inputs\/` 目录内的所有文件都是当前需求输入/);
  assert.match(skill, /当前阶段所需的上游 Design Baseline/);
  assert.match(skill, /无法|冲突|多个候选/);
  assert.doesNotMatch(skill, /references\/stages|stage-contracts|current-stage|init-stage|inspect-stage|固定上游|validate-design-entry|外层 Workflow.*固定顺序/s);
});

test('feature-design delegates one centralized review and leaves top-level state to workflow', () => {
  const skill = read('skills/feature-design/SKILL.md');
  assert.match(skill, /调用 `design-reviewer` Agent.*等待它完成/s);
  assert.match(skill, /单独的上下文中依次执行全部适用 Checklist/);
  assert.match(skill, /主会话.*不创建、修改或刷新 Review 摘要/s);
  assert.match(skill, /语义修改.*完整评审全部适用 Checklist/s);
  assert.match(skill, /mode=format-refresh/);
  assert.doesNotMatch(skill, /为每份适用 Checklist 创建.*Reviewer/);
  assert.doesNotMatch(skill, /node .*record-review/);
  assert.match(skill, /approve-current-design/);
  assert.match(skill, /publish/);
  assert.doesNotMatch(skill, /sync-state/);
  assert.doesNotMatch(skill, /完成状态同步|状态同步成功/);
  assert.match(skill, /当前 Design Baseline 已获用户批准并发布/);
  assert.doesNotMatch(skill, /plan-reviews|record-reviews|allowedReads|disposition|plan-cross-review|record-cross-review/);
});

test('feature-design turns explicit user approval into the canonical human approval record', () => {
  const skill = read('skills/feature-design/SKILL.md');
  const approvalStep = skill.match(/## 步骤5\. 批准并发布 Baseline([\s\S]*?)完成条件：/)[1];

  assert.match(approvalStep, /AskUserQuestion/);
  assert.match(approvalStep, /"approvedBy"\s*:\s*"human"/);
  assert.match(approvalStep, /"acceptedRisks"\s*:/);
  assert.match(approvalStep, /"acceptedRisks"\s*:\s*\[\]/);
  assert.match(approvalStep, /"acceptedRisks"\s*:\s*\["<accepted-risk>"\]/);
  assert.match(approvalStep, /不得保留占位符/);
  assert.match(approvalStep, /"summary"\s*:/);
  assert.match(approvalStep, /主会话.*直接落盘/s);
  assert.match(approvalStep, /无需外部审批接口/);
});

test('feature-design-analysis owns factual investigation and user-facing design questions', () => {
  const analysis = read('skills/feature-design-analysis/SKILL.md');
  assert.match(analysis, /创建 `knowledge-query` SubAgent/);
  assert.match(analysis, /不要直接向用户询问任何你自己可以查到的信息/);
  assert.match(analysis, /现在就处理其余的 frontier 问题/);
  assert.doesNotMatch(analysis, /workspaceRoot|knowledgeQueryScriptPath|输入为 .*`topic`.*`purpose`/);
});

test('Design Guides contain professional differences and Specs remain independent contracts', () => {
  for (const slug of ['business-design', 'solution-design', 'implementation-design', 'test-design']) {
    const guide = read(`skills/feature-design/references/design-guides/${slug}.md`);
    const spec = read(`skills/feature-design/references/specs/${slug}.md`);
    for (const heading of ['专业边界', '专业原则', '分析透镜', '高价值矛盾', '风险缩放', 'Checklist 导航', '专业收敛标准']) {
      assert.match(guide, new RegExp(heading));
    }
    if (slug === 'business-design') {
      assert.match(spec, /十四个主章节固定存在/);
      assert.match(spec, /低影响或沿用现状/);
    } else if (slug === 'solution-design') {
      assert.match(spec, /十二个主章节.*固定骨架/s);
      assert.match(spec, /功能点作为纵向主线/);
      assert.match(spec, /完成标准/);
    } else {
      assert.match(spec, /核心章节/);
      assert.match(spec, /条件章节/);
      assert.match(spec, /适用性说明/);
    }
    assert.doesNotMatch(guide, /Draft.*Lint.*Review.*Baseline/is);
  }
  assert.strictEqual(fs.existsSync(path.join(root, 'skills/feature-design/references/stage-contracts.json')), false);
  assert.strictEqual(fs.existsSync(path.join(root, 'skills/feature-design/references/stages')), false);
});

test('all Design Draft contracts require Mermaid for suitable semantic diagrams', () => {
  for (const slug of ['business-design', 'solution-design', 'implementation-design', 'test-design']) {
    const guide = read(`skills/feature-design/references/design-guides/${slug}.md`);
    const spec = read(`skills/feature-design/references/specs/${slug}.md`);

    assert.match(guide, /降低理解成本.*Mermaid/s, `${slug} Guide should select Mermaid when a diagram helps`);
    assert.match(guide, /不要求.*图示.*数量/s, `${slug} Guide should not require diagrams or a diagram count`);
    assert.match(guide, /界面设计.*不适合 Mermaid.*不强制/s, `${slug} Guide should exempt unsuitable UI design`);
    assert.match(guide, /禁止.*ASCII.*语义图/s, `${slug} Guide should prohibit ASCII semantic diagrams`);
    assert.doesNotMatch(guide, /```text[\s\S]*?[→←][\s\S]*?```/, `${slug} Guide should not model relationships with fenced ASCII arrows`);

    assert.match(spec, /语义图.*Mermaid/s, `${slug} Spec should require Mermaid semantic diagrams`);
    assert.match(spec, /禁止.*ASCII.*语义图/s, `${slug} Spec should prohibit ASCII semantic diagrams`);
    assert.match(spec, /不要求.*图示.*数量/s, `${slug} Spec should not require diagrams or a diagram count`);
    assert.match(spec, /界面设计.*不适合 Mermaid.*不强制/s, `${slug} Spec should exempt unsuitable UI design`);
    assert.match(spec, /Markdown 表格.*目录树.*代码片段.*不属于.*ASCII.*语义图/s, `${slug} Spec should preserve non-diagram technical text`);
  }

  const traceability = read('skills/feature-design/references/review-checklists/design-traceability.md');
  assert.match(traceability, /所有设计类型必选/);
  assert.match(traceability, /ASCII.*语义图.*blocking/s);
  assert.match(traceability, /没有图示.*不.*finding/s);
  assert.match(traceability, /界面设计.*Markdown 表格.*目录树.*代码片段/s);
});

test('business design Guide is a semantic reference with the approved coverage and checklist navigation', () => {
  const guide = read('skills/feature-design/references/design-guides/business-design.md');
  const headings = [...guide.matchAll(/^## (.+)$/gm)].map(match => match[1]);
  assert.deepStrictEqual(headings, [
    '专业边界',
    '设计场景',
    '专业原则',
    '业务语义分析透镜',
    '必须关闭的业务级决策',
    '高价值矛盾',
    '风险缩放',
    'Checklist 导航',
    '专业收敛标准',
  ]);
  for (const phrase of [
    /业务语义目标态/,
    /新建特性.*存量增强/s,
    /业务概念与度量语义.*适用范围、参与者与业务责任.*业务规则与判定逻辑.*时间、状态与生命周期语义.*业务场景、异常与结果语义.*存量影响与业务验收契约.*用户任务与业务交互语义/s,
    /返回需求澄清.*留在业务设计.*留给方案设计/s,
    /业务功能点.*当前业务设计.*新增\/修改\/删除.*完整业务行为/s,
    /business-semantic-consistency.*business-documentation-quality.*design-traceability.*business-change-impact-review/s,
  ]) assert.match(guide, phrase);
  for (const phrase of [/用户研究/, /用户任务/, /服务蓝图/, /业务概念原型/, /walkthrough/, /可用性/]) {
    assert.match(guide, phrase);
  }
  assert.doesNotMatch(guide, /businessType|impactLevel|KPI 专属|init-design|record-review|approve-current-design|publish/);
});

test('business design Spec defines exactly fourteen content chapters without a questionnaire or technical solution', () => {
  const spec = read('skills/feature-design/references/specs/business-design.md');
  const headings = [...spec.matchAll(/^## (.+)$/gm)].map(match => match[1]);
  assert.deepStrictEqual(headings, [
    '1. 概述',
    '2. 需求基线与业务设计范围',
    '3. 业务目标态总览',
    '4. 业务概念、对象与度量语义',
    '5. 业务参与者、责任与适用范围',
    '6. 业务功能点与业务场景设计',
    '7. 业务规则与判定逻辑',
    '8. 时间、状态与生命周期语义',
    '9. 异常、边界与业务结果',
    '10. 关键业务决策、约束与风险',
    '11. 业务验收与需求追溯',
    '12. 下游设计约束与交接',
    '13. 词汇表',
    '14. 参考资料',
  ]);
  assert.match(spec, /内容合同.*不规定分析步骤、提问顺序/s);
  assert.match(spec, /低影响.*核验范围、当前结论、判断依据/s);
  assert.match(spec, /不规定.*图表数量/);
  assert.match(spec, /功能点 \| 关联需求 \| 变更类型 \| 业务目标与边界 \| 详细设计位置/);
  for (const subsection of [
    '关联需求、业务目标与结果责任',
    '当前业务设计与依据',
    '本次业务变化',
    '目标态业务行为',
    '适用规则、状态和时间语义',
    '异常、边界与可观察结果',
    '业务验收实例',
  ]) assert.match(spec, new RegExp(`^#### 6\\.x\\.\\d ${subsection}$`, 'm'));
  assert.match(spec, /UCD 依据、用户任务与可用性目标（按影响触发）/);
  assert.match(spec, /低保真概念原型.*不确定最终页面、组件、像素和 Design Token/s);
  assert.match(spec, /Requirement\/NFR → 业务功能点 → 权威规则 → 代表场景 → 必须得到的业务结果/);
  assert.doesNotMatch(spec, /businessType|impactLevel|designMode|status:|checklists:|固定问卷|Outbox|Kafka|MySQL|Redis/);
});

test('business review navigation has three required checklists and one conditional change-impact checklist', () => {
  const guide = read('skills/feature-design/references/design-guides/business-design.md');
  const semantic = read('skills/feature-design/references/review-checklists/business-semantic-consistency.md');
  const documentationQuality = read('skills/feature-design/references/review-checklists/business-documentation-quality.md');
  const traceability = read('skills/feature-design/references/review-checklists/design-traceability.md');
  const impact = read('skills/feature-design/references/review-checklists/business-change-impact-review.md');

  assert.strictEqual((guide.match(/\.\.\/review-checklists\//g) || []).length, 4);
  assert.match(semantic, /概念.*规则引用.*适用.*优先级.*时间.*状态.*场景.*异常.*验收.*目标态.*技术.*Solution Design/s);
  assert.match(documentationQuality, /当前设计.*本次变化.*完整目标态/s);
  assert.match(documentationQuality, /当前业务设计与依据.*本次新增\/修改\/删除.*完整业务行为/s);
  assert.match(documentationQuality, /用户能够评审.*Solution Design.*Test Design/s);
  assert.match(documentationQuality, /人机交互.*用户任务.*必要信息.*动作.*反馈/s);
  assert.match(documentationQuality, /不按最低字数、段落数、图示数或关键词出现次数/);
  assert.match(traceability, /Requirement 目标.*正式范围.*结果责任.*Requirement Acceptance.*方案偏好.*最迟决策点.*下游交接/s);
  assert.match(impact, /仅当存量增强实质改变/);
  assert.match(impact, /可信现状.*新增、受影响、保持不变和非目标.*历史对象.*完整业务目标态/s);
  for (const checklist of [semantic, documentationQuality, traceability, impact]) {
    assert.match(checklist, /blocking.*advisory.*risk/s);
    assert.match(checklist, /不与用户交互/);
    assert.match(checklist, /对 Draft 和正式 Artifact 保持只读/);
  }
  assert.strictEqual(fs.existsSync(path.join(root, 'skills/feature-design/references/review-checklists/business-coverage.md')), false);
  assert.strictEqual(fs.existsSync(path.join(root, 'skills/feature-design/references/review-checklists/business-traceability.md')), false);
  assert.doesNotMatch(guide, /KPI|privacy-review|流程评审|权限评审/);
});

test('business golden fixture is the reviewable design contract with versioned UCD assets', () => {
  const golden = read('scripts/test/fixtures/business-design.golden.md');
  const fixtureSource = read('scripts/test/fixtures/business-design.js');
  const {
    assetsPath,
    businessDraft,
    installBusinessAssets,
  } = require('./fixtures/business-design');

  assert.match(fixtureSource, /readFileSync\(templatePath, 'utf8'\)/);
  assert.match(fixtureSource, /business-design\.golden\.md/);
  assert.match(fixtureSource, /function installBusinessAssets/);
  assert.strictEqual(typeof installBusinessAssets, 'function');
  assert.strictEqual(businessDraft('FEAT-GOLD-001'), golden.replaceAll('<TASK_ID>', 'FEAT-GOLD-001'));

  for (const phrase of [
    /REQ-SLA-008/,
    /NFR-SLA-004/,
    /业务功能点清单/,
    /当前业务设计与依据/,
    /本次业务变化/,
    /目标态业务行为/,
    /业务处置服务蓝图/,
    /UCD-SLA-001/,
    /UCD 依据、用户任务与可用性目标/,
    /business-design-assets\/ucd\/escalation-list-business-concept\.svg/,
    /第一轮 walkthrough.*第二轮评审/s,
    /情况已变化.*尚未确认/s,
    /WCAG 2\.2 AA/,
    /需求—功能点—规则—场景关系/,
    /Solution Design 必须保持的业务语义/,
  ]) assert.match(golden, phrase);

  for (const file of [
    'escalation-list-business-concept.svg',
    'escalation-detail-business-concept.svg',
    'escalation-recovery-business-concept.svg',
  ]) {
    const svg = fs.readFileSync(path.join(assetsPath, 'ucd', file), 'utf8');
    assert.match(svg, /^<svg[\s>]/);
    assert.match(svg, /aria-labelledby=/);
    assert.match(svg, /<title/);
    assert.match(svg, /<desc/);
  }
});

test('solution design reference defines target-state architecture without a second workflow', () => {
  const guide = read('skills/feature-design/references/design-guides/solution-design.md');
  const spec = read('skills/feature-design/references/specs/solution-design.md');
  const documentationQuality = read('skills/feature-design/references/review-checklists/architecture-documentation-quality.md');
  const analysis = read('skills/feature-design-analysis/SKILL.md');
  const golden = read('scripts/test/fixtures/solution-design.golden.md');
  const fixtureSource = read('scripts/test/fixtures/solution-design.js');
  const {
    assetsPath,
    installSolutionAssets,
    solutionDraft,
  } = require('./fixtures/solution-design');

  for (const phrase of [
    /目标态/,
    /新建特性/,
    /存量特性增强/,
    /新增.*修改.*删除.*保持不变.*非目标/s,
    /具体如何实现和运行/,
    /实现链/,
    /4\+1/,
    /场景视图.*逻辑视图.*进程视图.*开发视图.*物理视图/s,
    /需求功能点.*纵向主线/,
    /触发与前置条件.*参与系统、服务和关键组件.*处理步骤、判断和分支.*数据和状态.*接口、事件.*事务、并发、幂等和一致性.*异常、超时、重复.*最终业务结果.*部署、兼容、迁移、回退/s,
    /只写.*采用 Outbox.*不是实现链/s,
    /用户交互与前端设计透镜/,
    /初始、加载、空、成功、校验失败、业务失败、技术失败、部分成功、无权限、数据过期和刷新后的界面状态/,
    /Mermaid 不用于替代线框图或视觉稿/,
    /用户研究、现状观察、支持工单、可用性数据或明确待验证假设/,
    /关键设计至少经过一次.*walkthrough、原型评审或用户可用性验证/s,
    /关键页面同时保留评审快照/,
    /不涉及用户界面时.*不生成空页面清单/s,
    /必须关闭的系统级设计/,
    /责任与流程.*接口与集成.*数据与状态.*正确性机制.*可靠性与运维.*安全与隐私.*质量属性.*部署与演进/s,
    /architecture-consistency.*architecture-documentation-quality.*design-traceability/s,
  ]) assert.match(guide, phrase);

  for (const [number, heading] of [
    ['1', '概述'],
    ['2', '特性需求概述'],
    ['3', '需求场景与影响分析'],
    ['4', '特性\\/功能实现原理'],
    ['5', '接口与集成设计'],
    ['6', '数据设计'],
    ['7', '可靠性、可用性与功能安全设计'],
    ['8', '安全、隐私与韧性设计'],
    ['9', '非功能质量属性设计'],
    ['10', '关键技术决策、取舍与风险'],
    ['11', '需求分解分配与下游交接'],
    ['12', '词汇表与参考资料'],
  ]) assert.match(spec, new RegExp(`^## ${number}\\. ${heading}$`, 'm'));

  for (const [number, subsection] of [
    ['4\\.1', '总体方案'],
    ['4\\.2', '4\\+1 架构视图'],
    ['4\\.3', '功能点设计'],
  ]) {
    assert.match(spec, new RegExp(`^### ${number} ${subsection}$`, 'm'));
  }
  for (const [index, view] of ['场景视图', '逻辑视图', '进程视图', '开发视图', '物理视图'].entries()) {
    assert.match(spec, new RegExp(`^#### 4\\.2\\.${index + 1} ${view}$`, 'm'));
  }
  for (const subsection of ['关联需求与设计目标', '当前设计', '本次变更', '目标态设计', '设计影响、约束与风险']) {
    assert.match(spec, new RegExp(`^##### ${subsection}$`, 'm'));
  }

  assert.match(spec, /内容合同.*design tree\/frontier/s);
  assert.match(spec, /新建/);
  assert.match(spec, /存量增强/);
  assert.match(spec, /目标态正文|完整目标态/);
  assert.match(spec, /功能点 \| 关联需求 \| 主要变更类型 \| 设计目标与边界 \| 详细设计位置/);
  assert.match(spec, /只写.*采用某技术.*属于方案结论，不是完整设计/s);
  assert.match(spec, /用户交互与前端设计（按影响触发）/);
  assert.match(spec, /在现有章节中承载前端方案，不新增固定主章节/);
  assert.match(spec, /用户旅程、导航和页面状态.*页面布局与视觉层级/s);
  assert.match(spec, /服务端权威状态与 URL、筛选、草稿、缓存、乐观状态/s);
  assert.match(spec, /目标用户、关键任务、使用环境、痛点、用户研究或运行证据、待验证假设和可用性目标/);
  assert.match(spec, /页面区域表只能补充.*不能.*替代视觉产物/s);
  assert.match(spec, /Draft、配套资产、Review、人工批准和发布必须绑定同一设计包版本/);
  assert.match(spec, /不涉及界面时.*不生成空内容/s);
  assert.match(spec, /用户能够评审具体方案，下游只需在已确定边界内细化服务内部实现/);
  assert.match(documentationQuality, /具体如何实现和运行/);
  assert.match(documentationQuality, /不以最低字数、段落数、图示数或关键词出现次数/);
  assert.match(documentationQuality, /必须阻断的表现/);
  assert.match(documentationQuality, /只写采用某项技术.*没有说明具体如何工作/s);
  assert.match(documentationQuality, /用户交互与前端（按影响触发）/);
  assert.match(documentationQuality, /目标用户、关键任务、使用环境、痛点、用户研究或运行证据/);
  assert.match(documentationQuality, /关键页面线框图\/原型快照/);
  assert.match(documentationQuality, /walkthrough、原型评审或用户可用性验证/);
  assert.match(documentationQuality, /设计资产.*Draft、Review、人工批准和发布.*同一版本/s);
  assert.match(documentationQuality, /初始、加载、空、成功、校验失败、业务失败、技术失败、部分成功、无权限、数据过期和刷新状态/);
  assert.match(documentationQuality, /需求改变用户界面.*只有页面名称、静态截图或 Happy Path/s);
  assert.match(documentationQuality, /下游必须重新发明跨服务流程、事务、数据状态或失败恢复/);
  assert.match(fixtureSource, /readFileSync\(templatePath, 'utf8'\)/);
  assert.match(fixtureSource, /solution-design\.golden\.md/);
  assert.match(fixtureSource, /function installSolutionAssets/);
  assert.strictEqual(typeof installSolutionAssets, 'function');
  assert.doesNotMatch(fixtureSource, /# 审批任务 SLA 自动升级方案设计/);
  assert.strictEqual(solutionDraft('FEAT-GOLD-001'), golden.replaceAll('<TASK_ID>', 'FEAT-GOLD-001'));
  for (const phrase of [
    /业务唯一键定义为/,
    /Command Handler 在一个本地数据库事务内执行/,
    /升级处理状态机如下/,
    /故障模式与恢复/,
    /质量属性场景/,
    /REQ-SLA-008/,
    /升级处置工作台/,
    /UCD-SLA-001/,
    /UCD 依据与可用性目标/,
    /关键页面线框图/,
    /solution-design-assets\/ucd\/escalation-list-wireframe\.svg/,
    /第一轮 walkthrough.*第二轮原型评审/s,
    /页面信息结构/,
    /界面状态与反馈/,
    /服务端权威状态/,
    /actionId.*expectedVersion/s,
    /结果未知/,
    /WCAG 2\.2 AA/,
    /Implementation Design 约束/,
  ]) assert.match(golden, phrase);
  for (const file of [
    'escalation-list-wireframe.svg',
    'escalation-detail-wireframe.svg',
    'recovery-states-wireframe.svg',
  ]) {
    const svg = fs.readFileSync(path.join(assetsPath, 'ucd', file), 'utf8');
    assert.match(svg, /^<svg[\s>]/);
    assert.match(svg, /aria-labelledby=/);
    assert.match(svg, /<title/);
  }
  assert.doesNotMatch(guide, /inspect-workspace|init-design|record-review|approve-current-design|publish|sync-state/);
  assert.doesNotMatch(spec, /businessDesign\s*→\s*solutionDesign|Business Baseline.*必须|固定前置|外层 Workflow/);
  assert.doesNotMatch(analysis, /需求功能点清单|功能点分析透镜|4\+1 架构视图/);
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

test('design-reviewer is the single review contract with denied mutation and direct knowledge tools', () => {
  const agent = read('agents/design-reviewer.md');
  assert.match(agent, /^name: design-reviewer$/m);
  assert.doesNotMatch(agent, /^model:/m);
  assert.doesNotMatch(agent, /^effort:/m);
  assert.match(agent, /调用 `knowledge-query` Agent/);
  assert.match(agent, /用自然语言说明 Checklist 判断所需查明的事实和必要背景/);
  assert.match(agent, /等待查询完成，只使用它返回的最终结果/);
  assert.doesNotMatch(agent, /knowledgeQueryScriptPath|输入为 .*`topic`.*`purpose`/);
  assert.doesNotMatch(agent, /^skills:/m);
  assert.match(agent, /^disallowedTools:$/m);
  assert.doesNotMatch(agent, /^tools:$/m);
  for (const tool of ['Write', 'Edit', 'NotebookEdit', 'Skill', 'WebSearch', 'WebFetch', 'AskUserQuestion', 'Workflow', 'mcp__\\*']) {
    assert.match(agent, new RegExp(`^  - ${tool}$`, 'm'));
  }
  assert.doesNotMatch(agent, /^  - (Agent|TaskCreate|TaskGet|TaskList|TaskUpdate|ToolSearch)$/m);
  assert.match(agent, /^background: false$/m);
  assert.match(agent, /^## 工作流$/m);
  assert.match(agent, /^### 步骤1：读取并规划 Checklist 执行$/m);
  assert.match(agent, /^### 步骤2：串行执行 Checklist$/m);
  assert.match(agent, /^### 步骤3：维护并验证 Review 摘要$/m);
  assert.match(agent, /^### 步骤4：返回 Review 结果$/m);
  assert.match(agent, /前一步完成条件未满足时，不进入下一步/);
  assert.strictEqual((agent.match(/^完成条件：/gm) || []).length, 4);
  assert.match(agent, /步骤2：串行执行 Checklist[\s\S]*同一时刻只评审一份 Checklist/);
  assert.match(agent, /全部适用 Checklist 均须执行，不得跳过或遗漏/);
  assert.match(agent, /knowledge-query.*视为正在评审当前 Checklist/s);
  assert.match(agent, /Reviewer 不把 Checklist 评审交给其他 Agent/);
  assert.match(agent, /record-review/);
  assert.match(agent, /refresh-format-review/);
  assert.match(agent, /不与用户交互/);
  assert.match(agent, /不修改 Draft、Artifact、Approval 或 Feature 状态/);
  assert.strictEqual(fs.existsSync(path.join(root, 'skills/feature-review/SKILL.md')), false);
  for (const relative of ['skills/feature-design/SKILL.md', 'agents/dev.md', 'agents/cie.md', 'README.md']) {
    assert.doesNotMatch(read(relative), /feature-review/, relative);
  }
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
    'skills/feature-review/SKILL.md',
    'scripts/devsphere-review-matrix.js',
    'templates/artifacts/integrated-design.md',
  ]) assert.strictEqual(fs.existsSync(path.join(root, relative)), false, relative);
});
