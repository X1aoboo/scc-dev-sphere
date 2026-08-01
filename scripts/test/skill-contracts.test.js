'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const readSkill = name => fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');

test('active skills, agents, and hooks use the plugin CLI launcher through CLAUDE_PLUGIN_ROOT', () => {
  const skillNames = fs.readdirSync(path.join(root, 'skills'))
    .filter(name => fs.existsSync(path.join(root, 'skills', name, 'SKILL.md')));
  const cliSkills = new Set([
    'feature-approve', 'feature-design', 'feature-init', 'knowledge-config', 'status', 'workflow',
  ]);
  const bareCli = /(^|[\s`])devsphere\s+(?:workspace|workflow|design|approval|knowledge|state|guard)\b/m;
  for (const name of skillNames) {
    const skill = readSkill(name);
    assert.doesNotMatch(skill, /\$\{CLAUDE_(?:SKILL_DIR|PROJECT_DIR)\}|\$ARGUMENTS/, name);
    assert.doesNotMatch(skill, /\$\{CLAUDE_PLUGIN_ROOT\}(?!\/bin\/devsphere)/, name);
    assert.doesNotMatch(skill, bareCli, name);
    assert.doesNotMatch(skill, /node\s+[^\n]*scripts\/[\w/-]+\.js/, name);
    if (cliSkills.has(name)) assert.match(skill, /"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/devsphere"/, name);
  }
  for (const name of ['design-reviewer.md', 'knowledge-query.md']) {
    const agent = fs.readFileSync(path.join(root, 'agents', name), 'utf8');
    assert.doesNotMatch(agent, /\$\{CLAUDE_(?:SKILL_DIR|PROJECT_DIR)\}|reviewScriptPath/, name);
    assert.doesNotMatch(agent, /\$\{CLAUDE_PLUGIN_ROOT\}(?!\/bin\/devsphere)/, name);
    assert.doesNotMatch(agent, bareCli, name);
    assert.match(agent, /"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/devsphere"/, name);
    assert.doesNotMatch(agent, /node\s+[^\n]*scripts\/[\w/-]+\.js/, name);
  }
  const hooksText = fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8');
  assert.match(hooksText, /\$\{CLAUDE_PLUGIN_ROOT\}/);
  assert.doesNotMatch(hooksText, /scripts\/(?:devsphere-guard|knowledge-query)\.js/);
  const hooks = JSON.parse(hooksText).hooks;
  assert.strictEqual(Object.prototype.hasOwnProperty.call(hooks, 'SessionStart'), false);
  const preToolHooks = hooks.PreToolUse.flatMap(entry => entry.hooks);
  for (const hook of preToolHooks) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(hook, 'args'), false);
  }
  for (const action of ['evidence-write', 'evidence-shell', 'knowledge-config-write', 'knowledge-config-shell']) {
    assert.ok(preToolHooks.some(hook => hook.command
      === `"${'${CLAUDE_PLUGIN_ROOT}'}/bin/devsphere" guard ${action}`), action);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'scripts', 'setup-devsphere-bash-path.sh'), 'utf8'), /--claude-session/);
  for (const relative of ['bin/devsphere', 'bin/devsphere.cmd', 'scripts/devsphere-cli.js', 'scripts/setup-devsphere-bash-path.sh']) {
    assert.strictEqual(fs.existsSync(path.join(root, relative)), true, relative);
  }
});

test('feature-clarify-analysis owns the clarification method and completion gate', () => {
  const skill = readSkill('feature-clarify-analysis');
  assert.match(skill, /^user-invocable: false$/m);
  assert.match(skill, /原始问题及其实际影响/);
  assert.match(skill, /需求目标、范围和验收/);
  assert.match(skill, /当前整体理解/);
  assert.match(skill, /最高价值问题/);
  assert.match(skill, /当前最高价值问题/);
  assert.match(skill, /knowledge-query/);
  assert.match(skill, /需求澄清结果/);
  assert.match(skill, /用户明确确认/);
  assert.doesNotMatch(skill, /^## (?:执行任务|Review|批准|发布)/m);
});

test('feature-clarify creates exactly three orchestration tasks without duplicating analysis', () => {
  const skill = readSkill('feature-clarify');
  assert.match(skill, /1\. \*\*澄清、确认并记录需求\*\*/);
  assert.match(skill, /2\. \*\*独立 Review 并修订\*\*/);
  assert.match(skill, /3\. \*\*获得用户批准\*\*/);
  assert.match(skill, /feature-clarify-analysis/);
  assert.doesNotMatch(skill, /原始问题 → 需求目标|frontier/i);
  assert.doesNotMatch(skill, /Requirement Draft|requirement-draft\.md|inputs\/requirement\.md/);
});

test('knowledge-query routes by relevance, expands on missing information, and returns sourced natural language', () => {
  const agent = fs.readFileSync(path.join(root, 'agents', 'knowledge-query.md'), 'utf8');
  assert.match(agent, /^name: knowledge-query$/m);
  assert.doesNotMatch(agent, /^model:/m);
  assert.doesNotMatch(agent, /^effort:/m);
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
  assert.match(agent, /"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/devsphere" knowledge read-config/);
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
  assert.match(skill, /"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/devsphere" knowledge show-config/);
  assert.match(skill, /"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/devsphere" knowledge read-config/);
  assert.match(skill, /^## 修改已有配置$/m);
  assert.match(skill, /update-config --key sources\.<type>\.enabled --value <true\|false>/);
  assert.match(skill, /先用 `read-config` 确认来源存在/);
  assert.match(skill, /^## 新增知识源$/m);
  assert.match(skill, /upsert-source --type <type> --target "<target>"/);
  assert.match(skill, /只有新来源出现在生效配置中且 `enabled=true` 时才算完成/);
  assert.match(skill, /保持插件默认配置不变/);
  assert.doesNotMatch(skill, /Write.*knowledge-sources\.json|Edit.*knowledge-sources\.json/);
});

test('feature-clarify records one clarification artifact and fails closed on reviewer errors', () => {
  const skill = readSkill('feature-clarify');
  assert.match(skill, /requirement-clarification-contract\.md/);
  assert.match(skill, /requirement-clarification-review\.md/);
  assert.match(skill, /inputsPath/);
  assert.match(skill, /clarificationPath/);
  assert.match(skill, /全部文件/);
  assert.doesNotMatch(skill, /proposalPath/);
  assert.match(skill, /缺失、报错、格式无效或仅返回运行状态/);
  assert.match(skill, /不得由主会话自行评审/);
  assert.match(skill, /需求澄清结果已经用户批准/);
});

test('feature-clarify contains only the approved skill resources', () => {
  const dir = path.join(root, 'skills', 'feature-clarify');
  const files = fs.readdirSync(dir).sort();
  const references = fs.readdirSync(path.join(dir, 'references')).sort();
  assert.deepStrictEqual(files, ['SKILL.md', 'references']);
  assert.deepStrictEqual(references, ['requirement-clarification-contract.md', 'requirement-clarification-review.md']);
  assert.strictEqual(fs.existsSync(path.join(root, 'scripts', 'feature-clarify.js')), false);
});

test('requirement clarification contract records only confirmed clarification results', () => {
  const contract = fs.readFileSync(path.join(
    root,
    'skills',
    'feature-clarify',
    'references',
    'requirement-clarification-contract.md',
  ), 'utf8');
  assert.match(contract, /只记录需求澄清产生的结果/);
  assert.match(contract, /不复述未变化的需求输入/);
  assert.match(contract, /`inputs\/`/);
  assert.match(contract, /目标/);
  assert.match(contract, /范围与排除项/);
  assert.match(contract, /验收/);
  assert.match(contract, /修正、替换或覆盖/);
  assert.match(contract, /最迟决策点/);
  assert.match(contract, /足以定位依据的最小来源/);
  assert.match(contract, /未被明确修正、替换或排除的内容继续有效/);
});

test('requirement clarification reviewer reviews the combined baseline without copying proposal', () => {
  const reviewer = fs.readFileSync(path.join(
    root,
    'skills',
    'feature-clarify',
    'references',
    'requirement-clarification-review.md',
  ), 'utf8');
  assert.match(reviewer, /Result: pass \| issues-found/);
  assert.match(reviewer, /\[blocking\]/);
  assert.match(reviewer, /\[advisory\]/);
  assert.match(reviewer, /不要与用户交互/);
  assert.match(reviewer, /完整读取/);
  assert.match(reviewer, /`inputs\/` 目录中的全部文件/);
  assert.match(reviewer, /requirement-clarification\.md/);
  assert.match(reviewer, /共同构成/);
  assert.match(reviewer, /不要求澄清文件复制其他需求输入/);
  assert.match(reviewer, /未固化方案/);
  assert.match(reviewer, /来源/);
});

test('feature-init preserves the original proposal and routes users to clarification', () => {
  const skill = readSkill('feature-init');
  assert.match(skill, /inputs\/proposal\.md/i);
  assert.match(skill, /完成标准:[^\n]*inputs\/proposal\.md/i);
  assert.match(skill, /create-feature-task[^\n]*evidence\/evidence-registry\.json|CLI[^\n]*evidence\/evidence-registry\.json/i);
  assert.doesNotMatch(skill, /^- 初始化 `evidence\/evidence-registry\.json`/m);
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
  assert.match(section[0], /"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/devsphere" workflow set-task-status --status designing/);
});

test('workflow declares every feature-clarify required artifact as a requirement source', () => {
  const workflow = readSkill('workflow');
  assert.match(workflow, /nextAction\.skill === 'feature-clarify'[\s\S]*全部 `requiredArtifacts` 都是需求数据源/);
  assert.match(workflow, /不得只读取 `proposal\.md`/);
});

test('workflow owns clarified state sync only after the approved baseline completion fact', () => {
  const clarify = readSkill('feature-clarify');
  const workflow = readSkill('workflow');
  assert.match(clarify, /需求澄清结果已经用户批准/);
  assert.match(clarify, /不要自行读取或修改外层工作流状态/);
  assert.match(workflow, /仅当它明确返回“需求澄清结果已经用户批准”时/);
  assert.match(workflow, /"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/devsphere" workflow set-task-status --status clarified/);
  assert.match(workflow, /暂停等待用户回答、Review 或最终批准，不得更新状态/);
});

test('workflow owns design entry and completion state synchronization', () => {
  const design = readSkill('feature-design');
  const workflow = readSkill('workflow');
  assert.doesNotMatch(design, /sync-state/);
  assert.match(design, /当前 Design Baseline 已获用户批准并发布/);
  assert.match(workflow, /"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/devsphere" workflow set-task-status --status designing/);
  assert.match(workflow, /当前 Design Baseline 已获用户批准并发布/);
  assert.match(workflow, /"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/devsphere" workflow sync-design-status/);
});

test('workflow handles external test design as a confirmed one-shot main-session action', () => {
  const workflow = readSkill('workflow');
  assert.match(workflow, /#### `sync_design_status`/);
  assert.match(workflow, /status` 仍为 `designing`[^\n]*展示 `issues`/);
  assert.match(workflow, /nextAction\.stage === 'external-test-design'/);
  assert.match(workflow, /taskPath\/nextAction\.args\.outputDir/);
  assert.match(workflow, /Skill 执行过程中不再发起人工交互/);
  assert.match(workflow, /"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/devsphere" workflow complete-external-test-design/);
  assert.match(workflow, /status: external_test_design_ready/);
});
