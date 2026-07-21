'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const readSkill = name => fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');

test('feature-clarify uses a dynamic requirement model and investigates queryable facts', () => {
  const skill = readSkill('feature-clarify');
  assert.match(skill, /原始问题 → 需求目标/);
  assert.match(skill, /边界 ↔ 验收/);
  assert.match(skill, /问题树/);
  assert.match(skill, /frontier/i);
  assert.match(skill, /重算整体需求理解和 frontier/i);
  assert.match(skill, /可查询事实[\s\S]*主动使用/);
  assert.match(skill, /knowledge-query/);
  assert.match(skill, /调用 `knowledge-query` Agent/);
  assert.match(skill, /用自然语言说明要查明什么以及必要背景/);
  assert.match(skill, /等待查询完成，只使用它返回的最终结果/);
  assert.match(skill, /不写入文件/);
  assert.doesNotMatch(skill, /`knowledge-query` Skill/);
  assert.doesNotMatch(skill, /knowledge-query[^\n]*(?:workspaceRoot|knowledgeQueryScriptPath|`topic`|`purpose`)/);
  assert.match(skill, /“未找到”只说明相关来源没有答案/);
});

test('feature-clarify creates exactly four delivery tasks and keeps micro-actions inside them', () => {
  const skill = readSkill('feature-clarify');
  assert.match(skill, /1\. \*\*收敛并确认需求内容\*\*/);
  assert.match(skill, /2\. \*\*形成可评审的 Requirement Draft\*\*/);
  assert.match(skill, /3\. \*\*独立 Review 并修订至满足基线条件\*\*/);
  assert.match(skill, /4\. \*\*获得用户最终批准并发布 Requirement Baseline\*\*/);
  assert.match(skill, /不要为查询、提问、修订单项内容或启动 Reviewer 创建任务/);
});

test('feature-clarify keeps artifacts semantic and paths external', () => {
  const skill = readSkill('feature-clarify');
  assert.match(skill, /从外层调用上下文取得过程产物的路径、命名和生命周期/);
  assert.match(skill, /已确认内容/);
  assert.match(skill, /暂定理解/);
  assert.match(skill, /开放事项/);
  assert.match(skill, /用户授权后移事项/);
  assert.doesNotMatch(skill, /ambiguity-backlog|clarification-log|requirement-checklist|feature-clarify\.js|state\.json/);
});

test('feature-clarify enforces Draft review and verbatim user-approved baseline', () => {
  const skill = readSkill('feature-clarify');
  assert.match(skill, /requirement-baseline\.md/);
  assert.match(skill, /requirement-reviewer\.md/);
  assert.match(skill, /全新的独立 Reviewer Subagent/);
  assert.match(skill, /model=sonnet/);
  assert.match(skill, /不与用户交互/);
  assert.match(skill, /不修改 Draft/);
  assert.match(skill, /评审结果仅返回主会话/);
  assert.match(skill, /需求语义变化[\s\S]*重新评审完整 Draft/);
  assert.match(skill, /用户批准后，将已评审 Draft 原样发布为 Requirement Baseline/);
  assert.match(skill, /用户批准前不得进入业务设计/);
});

test('feature-clarify supports user-authorized deferral without silent assumptions', () => {
  const skill = readSkill('feature-clarify');
  assert.match(skill, /由用户明确授权/);
  assert.match(skill, /表达“想后移”只算提议/);
  assert.match(skill, /再取得知情确认/);
  assert.match(skill, /最迟决策点/);
  assert.match(skill, /不得静默假设答案/);
});

test('knowledge-query routes by relevance, expands on missing information, and returns sourced natural language', () => {
  const agent = fs.readFileSync(path.join(root, 'agents', 'knowledge-query.md'), 'utf8');
  assert.match(agent, /^name: knowledge-query$/m);
  assert.match(agent, /^model: sonnet$/m);
  assert.match(agent, /^effort: high$/m);
  assert.match(agent, /^background: false$/m);
  for (const tool of ['Agent', 'Write', 'Edit', 'NotebookEdit', 'TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate']) {
    assert.match(agent, new RegExp(`^  - ${tool}$`, 'm'));
  }
  assert.match(agent, /^description: 按需检索/m);
  assert.match(agent, /^## 检索循环$/m);
  assert.match(agent, /^## 输出$/m);
  assert.strictEqual((agent.match(/^完成标准：/gm) || []).length, 1);
  assert.match(agent, /可以包含多个子问题/);
  assert.match(agent, /返回所缺信息及其影响，由调用方补充后重新调用/);
  assert.match(agent, /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/knowledge-query\.js/);
  assert.match(agent, /问题、子问题和各知识源的 `description`/);
  assert.match(agent, /选择最可能提供答案的一个或多个来源/);
  assert.match(agent, /尚有缺口.*扩展到该来源/s);
  assert.match(agent, /每个子问题都有带来源的回答/);
  assert.match(agent, /直接返回自然语言结果/);
  assert.match(agent, /事实结论附带足以定位其依据的最小来源/);
  assert.match(agent, /冲突结论分别标明来源并保持并列/);
  assert.match(agent, /未找到信息、来源查询失败和输入不足分别说明/);
  assert.doesNotMatch(agent, /merge-results|priority|\{source, claims, gaps\}|coverage|固定 JSON/);
  assert.doesNotMatch(agent, /需求澄清|设计主会话|Reviewer|Evidence|Decision/);
  assert.strictEqual(fs.existsSync(path.join(root, 'skills', 'knowledge-query', 'SKILL.md')), false);
  assert.strictEqual(fs.existsSync(path.join(root, 'skills', 'knowledge-query', 'subagent-prompt.md')), false);
  assert.strictEqual(fs.existsSync(path.join(root, 'config', 'knowledge-sources.json')), true);
});

test('knowledge-config queries, modifies, and adds knowledge sources through the deterministic CLI', () => {
  const skill = readSkill('knowledge-config');
  assert.match(skill, /^name: knowledge-config$/m);
  assert.match(skill, /^description: 查询和维护项目知识源配置/m);
  assert.match(skill, /^## 查询当前配置$/m);
  assert.match(skill, /knowledge-query\.js" show-config "\$\{CLAUDE_PROJECT_DIR\}"/);
  assert.match(skill, /knowledge-query\.js" read-config "\$\{CLAUDE_PROJECT_DIR\}"/);
  assert.match(skill, /^## 修改已有配置$/m);
  assert.match(skill, /update-config "\$\{CLAUDE_PROJECT_DIR\}" sources\.<type>\.enabled <true\|false>/);
  assert.match(skill, /先用 `read-config` 确认来源存在/);
  assert.match(skill, /^## 新增知识源$/m);
  assert.match(skill, /upsert-source "\$\{CLAUDE_PROJECT_DIR\}" <type> "<target>"/);
  assert.match(skill, /只有新来源出现在生效配置中且 `enabled=true` 时才算完成/);
  assert.match(skill, /保持插件默认配置不变/);
  assert.doesNotMatch(skill, /Write.*knowledge-sources\.json|Edit.*knowledge-sources\.json/);
});

test('feature-clarify exposes bundled side effects as candidate scope expansion', () => {
  const skill = readSkill('feature-clarify');
  assert.match(skill, /“顺便”“同时”“兼容”/);
  assert.match(skill, /候选范围扩张/);
  assert.match(skill, /非自动吸收/);
});

test('feature-clarify contains only the approved skill resources', () => {
  const dir = path.join(root, 'skills', 'feature-clarify');
  const files = fs.readdirSync(dir).sort();
  const references = fs.readdirSync(path.join(dir, 'references')).sort();
  assert.deepStrictEqual(files, ['SKILL.md', 'references']);
  assert.deepStrictEqual(references, ['requirement-baseline.md', 'requirement-reviewer.md']);
  assert.strictEqual(fs.existsSync(path.join(root, 'scripts', 'feature-clarify.js')), false);
});

test('requirement reviewer reports only blocking or advisory findings without editing', () => {
  const reviewer = fs.readFileSync(path.join(root, 'skills', 'feature-clarify', 'references', 'requirement-reviewer.md'), 'utf8');
  assert.match(reviewer, /Result: pass \| issues-found/);
  assert.match(reviewer, /\[blocking\]/);
  assert.match(reviewer, /\[advisory\]/);
  assert.match(reviewer, /不要与用户交互/);
  assert.match(reviewer, /不要直接修改 Draft/);
  assert.match(reviewer, /静默加入用户未确认的需求假设/);
});

test('feature-init preserves the original proposal and routes users to clarification', () => {
  const skill = readSkill('feature-init');
  assert.match(skill, /inputs\/proposal\.md/i);
  assert.match(skill, /完成标准:[^\n]*inputs\/proposal\.md/i);
  assert.doesNotMatch(skill, /写入 `inputs\/requirement\.md`/i);
  assert.match(skill, /feature-clarify/i);
});

test('feature-assess is removed from the plugin surface', () => {
  assert.strictEqual(fs.existsSync(path.join(root, 'skills', 'feature-assess', 'SKILL.md')), false);
});

test('workflow executes every no-Agent action in the main session', () => {
  const skill = readSkill('workflow');
  const section = skill.match(/#### 无 Agent 场景([\s\S]*?)(?=\n#### )/);
  assert.ok(section);
  assert.match(section[0], /main 会话中直接执行 `nextAction\.skill`/i);
  assert.match(section[0], /taskId/);
  assert.match(section[0], /taskPath/);
  assert.match(section[0], /requiredArtifacts/);
  assert.match(section[0], /expectedArtifacts/);
  assert.match(section[0], /nextAction\.args/);
  assert.match(section[0], /调用 instruction/i);
  assert.match(section[0], /feature-design/);
  assert.match(section[0], /set-task-status \$\{CLAUDE_PROJECT_DIR\} designing/);
});

test('workflow owns clarified state sync only after the approved baseline completion fact', () => {
  const clarify = readSkill('feature-clarify');
  const workflow = readSkill('workflow');
  assert.match(clarify, /Requirement Baseline 已经用户批准并发布/);
  assert.match(clarify, /不要自行读取或修改外层工作流状态/);
  assert.match(workflow, /仅当它明确返回“Requirement Baseline 已经用户批准并发布”时/);
  assert.match(workflow, /set-task-status \$\{CLAUDE_PROJECT_DIR\} clarified/);
  assert.match(workflow, /暂停等待用户回答、Review 或最终批准，不得更新状态/);
});

test('workflow owns design entry and completion state synchronization', () => {
  const design = readSkill('feature-design');
  const workflow = readSkill('workflow');
  assert.doesNotMatch(design, /sync-state/);
  assert.match(design, /当前 Design Baseline 已获用户批准并发布/);
  assert.match(workflow, /set-task-status \$\{CLAUDE_PROJECT_DIR\} designing/);
  assert.match(workflow, /当前 Design Baseline 已获用户批准并发布/);
  assert.match(workflow, /sync-design-status \$\{CLAUDE_PROJECT_DIR\}/);
});
