'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { makeTask } = require('./helpers');
const { initDecisions, addDecision, resolveDecision, readDecisions } = require('../devsphere-decisions');
const { decideWrite, checkDecisionsResolvedFromStdin, slugToStage, checkDecisionsFormatFromStdin } = require('../devsphere-guard');
const { readState, writeState } = require('../devsphere-state');

function mainArtifactPath(taskPath, slug) {
  return path.join(taskPath, 'artifacts', `${slug}.md`);
}

test('非主产物放行', () => {
  const { taskPath } = makeTask();
  const r = decideWrite(path.join(taskPath, 'decisions', 'business-design-decisions.json'));
  assert.strictEqual(r.allow, true);
});

test('主产物但 decisions 文件不存在 → 拒绝（scoping 未完成）', () => {
  const { taskPath, taskId } = makeTask();
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /scoping/);
});

test('主产物且 gated pending>0 → 拒绝', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], rationale: 'test', askMode: 'single_select',
  });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /1 个 gated/);
});

test('主产物且 gated pending=0 → 放行', () => {
  const { taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], rationale: 'test', askMode: 'single_select',
  });
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, true);
});

test('integrated-design.md 非设计阶段主产物 → 放行', () => {
  const { taskPath } = makeTask();
  const r = decideWrite(path.join(taskPath, 'artifacts', 'integrated-design.md'));
  assert.strictEqual(r.allow, true);
});

// === Fix 3: C1/I1/I5 行为测试 ===

test('C1: auto-design 模式即使有 gated pending 也放行（mode-gate 豁免）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'auto-design' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], rationale: 'test', askMode: 'single_select',
  });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, true);
});

test('I1: 非 devsphere 路径（无 state.json）→ 放行', () => {
  // 不创建任何任务工作区；直接构造一个看起来像主产物的路径
  const fakePath = path.join('/tmp', 'ds-xyz-not-exist', 'artifacts', 'business-design.md');
  const r = decideWrite(fakePath);
  assert.strictEqual(r.allow, true);
});

test('I5: strict 模式 decisions 文件损坏 → fail-closed（拒绝）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  // 覆盖为损坏 JSON
  const decisionsFile = path.join(taskPath, 'decisions', 'business-design-decisions.json');
  fs.writeFileSync(decisionsFile, '{ not json');
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /损坏/);
});

// === Fix 2: checkDecisionsResolvedFromStdin (I4 stdin) 测试 ===

test('stdin: strict 任务主产物有 gated pending → deny 对象', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], rationale: 'test', askMode: 'single_select',
  });
  const stdin = { tool_input: { file_path: mainArtifactPath(taskPath, 'business-design') } };
  const result = checkDecisionsResolvedFromStdin(stdin);
  assert.ok(result, '应返回非 null deny 对象');
  assert.strictEqual(result.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.strictEqual(result.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(result.hookSpecificOutput.permissionDecisionReason.length > 0);
});

test('stdin: null → null（放行）', () => {
  assert.strictEqual(checkDecisionsResolvedFromStdin(null), null);
});

test('stdin: 缺 tool_input → null', () => {
  assert.strictEqual(checkDecisionsResolvedFromStdin({}), null);
});

test('stdin: tool_input 无 file_path → null', () => {
  assert.strictEqual(checkDecisionsResolvedFromStdin({ tool_input: {} }), null);
});

test('stdin: strict 任务主产物 gated pending=0（已 resolved）→ null（放行）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'strict-human-loop' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], rationale: 'test', askMode: 'single_select',
  });
  resolveDecision(taskPath, 'business-design', 'BD-DEC-001', { chosen: 'a', decidedAt: 't' });
  const stdin = { tool_input: { file_path: mainArtifactPath(taskPath, 'business-design') } };
  assert.strictEqual(checkDecisionsResolvedFromStdin(stdin), null);
});

test('stdin: auto-design 任务即使 gated pending → null（mode-gate 豁免）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'auto-design' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], rationale: 'test', askMode: 'single_select',
  });
  const stdin = { tool_input: { file_path: mainArtifactPath(taskPath, 'business-design') } };
  assert.strictEqual(checkDecisionsResolvedFromStdin(stdin), null);
});

// === Fix 2: collaborative stage-aware guard ===

test('slugToStage: business-design → businessDesign', () => {
  assert.strictEqual(slugToStage('business-design'), 'businessDesign');
  assert.strictEqual(slugToStage('implementation-design'), 'implementationDesign');
  assert.strictEqual(slugToStage('test-design'), 'testDesign');
});

test('collaborative: businessDesign 在 humanGateStages 中 + gated pending → 拒绝（门禁阶段强制）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'collaborative-design' });
  const st = readState(taskPath);
  st.humanGateStages = ['businessDesign'];
  writeState(taskPath, st);
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], rationale: 'test', askMode: 'single_select',
  });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /1 个 gated/);
});

test('collaborative: businessDesign 不在 humanGateStages（仅 testDesign 门禁）+ gated pending → 放行（非门禁阶段豁免）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'collaborative-design' });
  const st = readState(taskPath);
  st.humanGateStages = ['testDesign'];
  writeState(taskPath, st);
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], rationale: 'test', askMode: 'single_select',
  });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, true);
});

test('auto-design + gated pending → 放行（stage-aware：humanGated=false）', () => {
  const { taskPath, taskId } = makeTask({ workflowMode: 'auto-design' });
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], rationale: 'test', askMode: 'single_select',
  });
  const r = decideWrite(mainArtifactPath(taskPath, 'business-design'));
  assert.strictEqual(r.allow, true);
});

// === C1: checkDecisionsFormat tests ===

const { checkDecisionsFormat } = require('../devsphere-guard');

function decisionsFilePath(taskPath, slug) {
  return path.join(taskPath, 'decisions', `${slug}-decisions.json`);
}

test('format: 非 decisions 目录 → 放行', () => {
  const { taskPath } = makeTask();
  const r = checkDecisionsFormat(path.join(taskPath, 'artifacts', 'business-design.md'));
  assert.strictEqual(r.allow, true);
});

test('format: decisions 目录下 .md 文件 → 拒绝', () => {
  const { taskPath } = makeTask();
  const mdFile = path.join(taskPath, 'decisions', 'D-001-test.md');
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  fs.writeFileSync(mdFile, '# test');
  const r = checkDecisionsFormat(mdFile);
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /JSON/);
});

test('format: decisions 目录下 .txt 文件 → 拒绝', () => {
  const { taskPath } = makeTask();
  const txtFile = path.join(taskPath, 'decisions', 'notes.txt');
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  fs.writeFileSync(txtFile, 'notes');
  const r = checkDecisionsFormat(txtFile);
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /JSON/);
});

test('format: decisions JSON 损坏 → 拒绝', () => {
  const { taskPath } = makeTask();
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  const jf = decisionsFilePath(taskPath, 'business-design');
  fs.writeFileSync(jf, '{ not valid json');
  const r = checkDecisionsFormat(jf);
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /JSON/);
});

test('format: decisions JSON 但 options 为纯字符串 → 拒绝', () => {
  const { taskPath } = makeTask();
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  const jf = decisionsFilePath(taskPath, 'business-design');
  fs.writeFileSync(jf, JSON.stringify({
    stage: 'businessDesign', taskId: 'FEAT-001',
    decisions: [{ id: 'BD-DEC-001', type: 'gated', status: 'pending', category: 'feature_scope', summary: 'q', options: ['strA', 'strB'], rationale: 'ok' }],
  }));
  const r = checkDecisionsFormat(jf);
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /{label, description}/);
});

test('format: decisions JSON options 缺 description → 拒绝', () => {
  const { taskPath } = makeTask();
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  const jf = decisionsFilePath(taskPath, 'business-design');
  fs.writeFileSync(jf, JSON.stringify({
    stage: 'businessDesign', taskId: 'FEAT-001',
    decisions: [{ id: 'BD-DEC-001', type: 'gated', status: 'pending', category: 'feature_scope', summary: 'q', options: [{ label: 'a' }, { label: 'b', description: 'y' }], rationale: 'ok' }],
  }));
  const r = checkDecisionsFormat(jf);
  assert.strictEqual(r.allow, false);
});

test('format: decisions JSON gated 缺 rationale → 拒绝', () => {
  const { taskPath } = makeTask();
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  const jf = decisionsFilePath(taskPath, 'business-design');
  fs.writeFileSync(jf, JSON.stringify({
    stage: 'businessDesign', taskId: 'FEAT-001',
    decisions: [{ id: 'BD-DEC-001', type: 'gated', status: 'pending', category: 'feature_scope', summary: 'q', options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select' }],
  }));
  const r = checkDecisionsFormat(jf);
  assert.strictEqual(r.allow, false);
  assert.match(r.reason, /rationale/);
});

test('format: 合法 decisions JSON（options {label,description} + rationale）→ 放行', () => {
  const { taskPath } = makeTask();
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  const jf = decisionsFilePath(taskPath, 'business-design');
  fs.writeFileSync(jf, JSON.stringify({
    stage: 'businessDesign', taskId: 'FEAT-001',
    decisions: [{ id: 'BD-DEC-001', type: 'gated', status: 'pending', category: 'feature_scope', summary: 'q', options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], rationale: '从查询发现...不确定点...若不决策', askMode: 'single_select' }],
  }));
  const r = checkDecisionsFormat(jf);
  assert.strictEqual(r.allow, true);
});

test('format: decisions JSON 空 decisions 数组 → 放行', () => {
  const { taskPath } = makeTask();
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  const jf = decisionsFilePath(taskPath, 'business-design');
  fs.writeFileSync(jf, JSON.stringify({ stage: 'businessDesign', taskId: 'FEAT-001', decisions: [] }));
  const r = checkDecisionsFormat(jf);
  assert.strictEqual(r.allow, true);
});

test('format: decisions JSON autonomous 不需要 rationale/options → 放行', () => {
  const { taskPath } = makeTask();
  fs.mkdirSync(path.join(taskPath, 'decisions'), { recursive: true });
  const jf = decisionsFilePath(taskPath, 'business-design');
  fs.writeFileSync(jf, JSON.stringify({
    stage: 'businessDesign', taskId: 'FEAT-001',
    decisions: [{ id: 'BD-DEC-001', type: 'autonomous', status: 'pending', category: 'tradeoff', summary: '自决', options: [], rationale: '' }],
  }));
  const r = checkDecisionsFormat(jf);
  assert.strictEqual(r.allow, true);
});

// === Plan D2-2: checkDecisionsFormatFromStdin validates INCOMING content ===

test('stdin-format: Write 合法 content → null（放行）', () => {
  const content = JSON.stringify({
    stage: 'businessDesign', taskId: 'FEAT-1',
    decisions: [{ id: 'BD-DEC-001', type: 'gated', category: 'feature_scope', status: 'pending', summary: 'q', rationale: 'ctx', options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select' }],
  });
  const stdin = { tool_input: { file_path: '/x/decisions/business-design-decisions.json', content } };
  assert.strictEqual(checkDecisionsFormatFromStdin(stdin), null);
});

test('stdin-format: Write 自创 schema（无 type）→ deny', () => {
  const content = JSON.stringify({
    stage: 'businessDesign', taskId: 'FEAT-1', mode: 'scope',
    decisions: [{ id: 'DEC-BD-001', topic: 't', question: 'q', options: [] }],
  });
  const stdin = { tool_input: { file_path: '/x/decisions/business-design-decisions.json', content } };
  const r = checkDecisionsFormatFromStdin(stdin);
  assert.ok(r);
  assert.strictEqual(r.hookSpecificOutput.permissionDecision, 'deny');
});

test('stdin-format: Write 未知顶层字段 openQuestions → deny', () => {
  const content = JSON.stringify({ stage: 's', taskId: 't', decisions: [], openQuestions: [] });
  const stdin = { tool_input: { file_path: '/x/decisions/business-design-decisions.json', content } };
  const r = checkDecisionsFormatFromStdin(stdin);
  assert.ok(r);
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /openQuestions/);
});

test('stdin-format: Write 空 content → deny（解析失败）', () => {
  const stdin = { tool_input: { file_path: '/x/decisions/business-design-decisions.json', content: '' } };
  const r = checkDecisionsFormatFromStdin(stdin);
  assert.ok(r);
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /解析失败/);
});

test('stdin-format: Write 到非 decisions 路径 → null（放行）', () => {
  const stdin = { tool_input: { file_path: '/x/artifacts/business-design.md', content: 'whatever' } };
  assert.strictEqual(checkDecisionsFormatFromStdin(stdin), null);
});

test('stdin-format: Write 到 decisions/ 但非 .json → deny', () => {
  const stdin = { tool_input: { file_path: '/x/decisions/D-001.md', content: '# md' } };
  const r = checkDecisionsFormatFromStdin(stdin);
  assert.ok(r);
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /JSON/);
});

test('stdin-format: 无 tool_input → null', () => {
  assert.strictEqual(checkDecisionsFormatFromStdin({}), null);
});

test('stdin-format: tool_input 无 file_path → null', () => {
  assert.strictEqual(checkDecisionsFormatFromStdin({ tool_input: { content: '{}' } }), null);
});

test('stdin-format: Edit 用 new_string 重建校验 → deny（重建后非法）', () => {
  const { taskPath } = makeTask();
  const dir = path.join(taskPath, 'decisions');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, 'business-design-decisions.json');
  // 磁盘上是合法文件（无空格紧凑 JSON，与 JSON.stringify 默认一致）
  fs.writeFileSync(fp, JSON.stringify({ stage: 'businessDesign', taskId: 'FEAT-1', decisions: [] }));
  // Edit 把 decisions 数组替换成非法（无 type）；old_string 必须精确匹配磁盘字节
  const stdin = {
    tool_input: {
      file_path: fp,
      old_string: '"decisions":[]',
      new_string: '"decisions":[{"id":"X","topic":"t"}]',
    },
  };
  const r = checkDecisionsFormatFromStdin(stdin);
  assert.ok(r);
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /type/);
});

test('stdin-format: 校验 incoming content 而非磁盘（磁盘空但 content 合法 → 放行）', () => {
  const { taskPath } = makeTask();
  const dir = path.join(taskPath, 'decisions');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, 'business-design-decisions.json');
  fs.writeFileSync(fp, ''); // 磁盘空文件
  const content = JSON.stringify({ stage: 'businessDesign', taskId: 'FEAT-1', decisions: [] });
  const stdin = { tool_input: { file_path: fp, content } };
  assert.strictEqual(checkDecisionsFormatFromStdin(stdin), null); // 放行：校验 incoming content
});

// === Plan D2-3: checkTeammateDecisions (TeammateIdle gate) ===

const { checkTeammateDecisions } = require('../devsphere-guard');

test('teammate-idle: 无活跃任务 → {ok:true}', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-ti-'));
  const r = checkTeammateDecisions(tmpRoot);
  assert.strictEqual(r.ok, true);
});

test('teammate-idle: 有任务但无 decisions 目录 → {ok:true}', () => {
  const { workspaceRoot } = makeTask();
  const r = checkTeammateDecisions(workspaceRoot);
  assert.strictEqual(r.ok, true);
});

test('teammate-idle: decisions 文件全部合法 → {ok:true}', () => {
  const { workspaceRoot, taskPath, taskId } = makeTask();
  initDecisions(taskPath, 'business-design', taskId, 'businessDesign');
  addDecision(taskPath, 'business-design', {
    type: 'gated', category: 'feature_scope', summary: 'q', rationale: 'ctx',
    options: [{ label: 'a', description: 'x' }, { label: 'b', description: 'y' }], askMode: 'single_select',
  });
  const r = checkTeammateDecisions(workspaceRoot);
  assert.strictEqual(r.ok, true);
});

test('teammate-idle: decisions 文件非法（空内容）→ {ok:false}', () => {
  const { workspaceRoot, taskPath } = makeTask();
  const dir = path.join(taskPath, 'decisions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'business-design-decisions.json'), '');
  const r = checkTeammateDecisions(workspaceRoot);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /解析失败/);
});

test('teammate-idle: decisions 文件自创 schema（无 type）→ {ok:false}', () => {
  const { workspaceRoot, taskPath } = makeTask();
  const dir = path.join(taskPath, 'decisions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'business-design-decisions.json'), JSON.stringify({
    stage: 'businessDesign', taskId: 'X', mode: 'scope',
    decisions: [{ id: 'D1', topic: 't', options: [] }],
  }));
  const r = checkTeammateDecisions(workspaceRoot);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /type|mode/);
});

test('teammate-idle: 非法文件名 .json 之外的 .md 被忽略（只扫 .json）→ {ok:true}', () => {
  const { workspaceRoot, taskPath } = makeTask();
  const dir = path.join(taskPath, 'decisions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'D-001.md'), '# bogus');
  const r = checkTeammateDecisions(workspaceRoot);
  assert.strictEqual(r.ok, true);
});

// === Plan E2: checkDecisionsBashFromStdin (Bash bypass guard) ===

const { checkDecisionsBashFromStdin } = require('../devsphere-guard');

function bashStdin(command) {
  return { tool_name: 'Bash', tool_input: { command } };
}

test('bash: cat 写 decisions/ → deny', () => {
  const r = checkDecisionsBashFromStdin(bashStdin('cat > .devsphere/tasks/feature/F1/decisions/business-design-decisions.json <<EOF\n{}\nEOF'));
  assert.ok(r);
  assert.strictEqual(r.hookSpecificOutput.permissionDecision, 'deny');
});

test('bash: echo 重定向写 decisions/ → deny', () => {
  const r = checkDecisionsBashFromStdin(bashStdin('echo "{}" > x/decisions/y.json'));
  assert.ok(r);
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /decisions|artifacts/);
});

test('bash: printf 写 artifacts/ → deny', () => {
  const r = checkDecisionsBashFromStdin(bashStdin('printf "# title" > .devsphere/tasks/feature/F1/artifacts/business-design.md'));
  assert.ok(r);
  assert.strictEqual(r.hookSpecificOutput.permissionDecision, 'deny');
});

test('bash: node -e fs.writeFileSync 写 decisions/ → deny', () => {
  const r = checkDecisionsBashFromStdin(bashStdin('node -e "require(\'fs\').writeFileSync(\'a/decisions/b.json\',\'{}\')"'));
  assert.ok(r);
  assert.strictEqual(r.hookSpecificOutput.permissionDecision, 'deny');
});

test('bash: tee 写 decisions/ → deny', () => {
  const r = checkDecisionsBashFromStdin(bashStdin('echo {} | tee decisions/x.json'));
  assert.ok(r);
  assert.strictEqual(r.hookSpecificOutput.permissionDecision, 'deny');
});

test('bash: CLI add 放行（含 devsphere-decisions.js，无 decisions/ 路径）', () => {
  const cmd = 'node scripts/devsphere-decisions.js add .devsphere/tasks/feature/F1 business-design \'{"type":"gated"}\'';
  const r = checkDecisionsBashFromStdin(bashStdin(cmd));
  assert.strictEqual(r, null);
});

test('bash: CLI init 放行', () => {
  const cmd = 'node scripts/devsphere-decisions.js init .devsphere/tasks/feature/F1 business-design FEAT-1 businessDesign';
  assert.strictEqual(checkDecisionsBashFromStdin(bashStdin(cmd)), null);
});

test('bash: CLI resolve 放行', () => {
  const cmd = 'node scripts/devsphere-decisions.js resolve .devsphere/tasks/feature/F1 business-design BD-DEC-001 \'{"chosen":"a"}\'';
  assert.strictEqual(checkDecisionsBashFromStdin(bashStdin(cmd)), null);
});

test('bash: 无关命令放行（git status / ls / npm test）', () => {
  assert.strictEqual(checkDecisionsBashFromStdin(bashStdin('git status')), null);
  assert.strictEqual(checkDecisionsBashFromStdin(bashStdin('npm test')), null);
  assert.strictEqual(checkDecisionsBashFromStdin(bashStdin('ls -la')), null);
});

test('bash: 脚本名 devsphere-decisions.js（无斜杠）不被 decisions/ 误伤', () => {
  // 命令含脚本名但无 "decisions/" 路径段 → 放行
  assert.strictEqual(checkDecisionsBashFromStdin(bashStdin('node devsphere-decisions.js count-gated-pending tp business-design')), null);
});

test('bash: 无 tool_input 或 command → 放行（null）', () => {
  assert.strictEqual(checkDecisionsBashFromStdin({}), null);
  assert.strictEqual(checkDecisionsBashFromStdin({ tool_input: {} }), null);
  assert.strictEqual(checkDecisionsBashFromStdin({ tool_input: { command: 123 } }), null);
});

test('bash: decisions/ 出现在 CLI 的 JSON 参数里但命令含 devsphere-decisions.js → 放行（CLI 豁免）', () => {
  const cmd = 'node scripts/devsphere-decisions.js add tp business-design \'{"summary":"see decisions/foo"}\'';
  assert.strictEqual(checkDecisionsBashFromStdin(bashStdin(cmd)), null);
});
