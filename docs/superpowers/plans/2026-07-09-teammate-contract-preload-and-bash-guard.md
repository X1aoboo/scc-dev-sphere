# Teammate 契约预加载 + Bash 绕过守卫 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two regressions — (1) SA teammate lost its scope/draft contract (Plan C moved it to unreferenced files), causing self-decided decisions and the user never being asked; (2) a Bash write bypass that let teammates write the decisions file via `cat`/heredoc after the Write guard denied them.

**Architecture:** Two plans. Plan E2 (script guard, TDD, ship first) — add a PreToolUse `Bash` guard denying commands that write to `decisions/` or `artifacts/` paths unless they invoke the `devsphere-decisions.js` CLI. Plan E1 (skill/agent content, scenario verification) — convert the three protocol reference files into preloaded skills (agent frontmatter `skills:`), so the contract is injected into every teammate's context at dispatch.

**Tech Stack:** Node.js (`node:test` + `node:assert`), no external deps. Scripts dual-use CLI + `require()`.

## Global Constraints

- Preserve agent-teams persistent teammate model — SA remains the decisions writer (has design context; lead does not transcribe).
- Bash guard rule: deny when `command` matches `/(decisions|artifacts)\//` AND `command` does NOT include `devsphere-decisions.js`. The CLI (`node devsphere-decisions.js <sub> <taskPath> <slug> ...`) is exempt because its argv contains no `decisions/` path and it includes `devsphere-decisions.js`.
- Protocol skills must NOT set `disable-model-invocation: true` (would prevent preload).
- Agent frontmatter `skills:` field injects the full SKILL.md body at dispatch — this is the contract delivery mechanism (markdown links in system prompts are NOT auto-read).
- Existing tests must stay green; net test count only grows.
- `--dangerously-skip-permissions` does not bypass hooks (confirmed) — guards fire normally.

---

## Plan E2: Bash Guard (TDD, ship first)

### Task E2-1: Add `checkDecisionsBashFromStdin` guard + CLI + tests

**Files:**
- Modify: `scripts/devsphere-guard.js` (add function after `checkTeammateDecisions` ~line 227; add CLI case after `check-teammate-decisions` ~line 320; update `module.exports`)
- Test: `scripts/test/devsphere-guard-decisions.test.js`

**Interfaces:**
- Consumes: stdin `tool_input.command` (Bash command string)
- Produces: `checkDecisionsBashFromStdin(stdinJson)` → `null` (allow) or `{hookSpecificOutput:{hookEventName,permissionDecision:'deny',permissionDecisionReason}}`; CLI `check-decisions-bash`

- [ ] **Step 1: Write failing tests**

Append to `scripts/test/devsphere-guard-decisions.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node scripts/test/devsphere-guard-decisions.test.js`
Expected: new tests fail (`checkDecisionsBashFromStdin is not a function`); existing tests still pass.

- [ ] **Step 3: Implement `checkDecisionsBashFromStdin`**

In `scripts/devsphere-guard.js`, add this function after `checkTeammateDecisions` (after its closing brace ~line 227):

```js
// PreToolUse Bash 守卫：禁止用 Bash 直接写 design-critical 文件（decisions/、artifacts/）。
// CLI（devsphere-decisions.js）走 Node fs，命令行不含 decisions/ 路径，且含脚本名 → 豁免。
function checkDecisionsBashFromStdin(stdinJson) {
  const ti = stdinJson && stdinJson.tool_input;
  if (!ti) return null;
  const command = ti.command;
  if (typeof command !== 'string') return null;

  // 含 decisions/ 或 artifacts/ 路径段，且不是 devsphere-decisions.js CLI 调用 → deny
  const targetsDesignFiles = /(decisions|artifacts)\//.test(command);
  const isCli = command.includes('devsphere-decisions.js');
  if (targetsDesignFiles && !isCli) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'design 文件（decisions/、artifacts/）禁止用 Bash 直接写：decisions 用 `devsphere-decisions.js` CLI（init/add/resolve），artifacts 用 Write 工具。',
      },
    };
  }
  return null;
}
```

- [ ] **Step 4: Add CLI case `check-decisions-bash`**

In `scripts/devsphere-guard.js` `main()` switch, add this case after the `check-teammate-decisions` case (before `default`):

```js
      case 'check-decisions-bash': {
        let stdinJson = null;
        try {
          stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8'));
        } catch (e) {
          process.exit(0);
        }
        const decision = checkDecisionsBashFromStdin(stdinJson);
        if (decision) {
          process.stdout.write(JSON.stringify(decision));
          process.exit(0);
        }
        process.exit(0);
        break;
      }
```

- [ ] **Step 5: Update `module.exports`**

Add `checkDecisionsBashFromStdin` to the `module.exports` object at the end of `scripts/devsphere-guard.js`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `node scripts/test/devsphere-guard-decisions.test.js`
Expected: ALL pass (existing + 13 new).

- [ ] **Step 7: Commit**

```bash
git add scripts/devsphere-guard.js scripts/test/devsphere-guard-decisions.test.js
git commit -m "feat(guard): add check-decisions-bash — deny Bash writes to decisions/|artifacts/ (CLI exempt)"
```

---

### Task E2-2: Wire `Bash` matcher in hooks.json + full suite

**Files:**
- Modify: `hooks/hooks.json` (add a third PreToolUse entry with matcher `Bash`)

- [ ] **Step 1: Add PreToolUse Bash entry**

In `hooks/hooks.json`, the `PreToolUse` array currently has two entries (matcher `Write|Edit` for `check-decisions-resolved` and `check-decisions-format`). Add a third entry for Bash. The `PreToolUse` array becomes:

```json
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-decisions-resolved"
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-decisions-format"
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/devsphere-guard.js\" check-decisions-bash"
          }
        ]
      }
    ],
```

- [ ] **Step 2: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf-8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3: Run full test suite**

Run:
```bash
node scripts/test/devsphere-decisions.test.js && node scripts/test/devsphere-decisions-resolve.test.js && node scripts/test/devsphere-guard-decisions.test.js && node scripts/test/feature-workflow-decisions.test.js && node scripts/test/design-loop-resolver.test.js
```
Expected: ALL pass.

- [ ] **Step 4: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat(hooks): wire Bash matcher → check-decisions-bash guard"
```

---

## Plan E1: Skill/Agent Content Layer (scenario verification; depends on E2)

### Task E1-1: Create 3 teammate skills

**Files:**
- Create: `skills/devsphere-teammate-design-protocol/SKILL.md`
- Create: `skills/devsphere-teammate-boundary/SKILL.md`
- Create: `skills/devsphere-teammate-review-backflow/SKILL.md`

- [ ] **Step 1: Create `skills/devsphere-teammate-design-protocol/SKILL.md`**

```markdown
---
name: devsphere-teammate-design-protocol
description: scc-dev-sphere 设计阶段 teammate（SA/SE/MDE/TSE）的 scope/draft 协议、硬契约、decisions CLI 用法。预加载给 sa/se/mde/tse。
---

# Teammate 设计循环协议

你（SA/SE/MDE/TSE）作为 teammate 被主会话派发，跑设计阶段的 scope/draft。本协议是硬契约。

## scope 模式（出土决策）

1. 调 `knowledge-query` 查受影响领域知识 → 拆功能点候选 → 识别**所有**不确定/待采纳点。保存 evidence（`evidence/knowledge/`）。
2. 据派发 prompt 的 `humanGated` 标志落 `decisions/<slug>-decisions.json`：
   - **humanGated=true**：每个需用户拍板的点用 CLI 写成 `type=gated` decision（含 `options` 2-4、`recommendation`、`askMode`、`rationale`、`evidence`、`impact`）。
   - **humanGated=false**：写成 `type=autonomous`（自决，不进闸口）。
3. **绝不自决 humanGated 点**。`needsConfirmation:false` 自决式条目是**违约**——门禁阶段每个不确定点必须是 `type=gated, status=pending`，由用户经主会话拍板。
4. 写完 decisions 即停当轮。**绝不写主产物、绝不擅自编答案。**

## draft 模式（基于决议定稿）

1. 读 `decisions/<slug>-decisions.json` 的 `resolution`（主会话已逐项问过用户）。
2. 按你的 design skill 产出完整主产物（`artifacts/<slug>.md`），所有 gated 项必须按 `resolution` 落实。
3. 写完即停当轮。

## 硬契约

- 不确定 → gated decision，不臆测。
- scope 不碰主产物；draft 不改 decisions 的 `resolution`。
- 违约时 PreToolUse 守卫会拦下写入。

## decisions 只能用 CLI 增删改

**禁止用 Write/Edit/Bash 直接写 `decisions/` 和 `artifacts/` 文件**（守卫会 deny）。decisions 一律经 `devsphere-decisions.js` CLI：

```bash
# 初始化 decisions 文件（每阶段首次）
node scripts/devsphere-decisions.js init <taskPath> <slug> <taskId> <stage>

# 添加一条 gated decision（humanGated 阶段每个不确定点）
node scripts/devsphere-decisions.js add <taskPath> <slug> '{"type":"gated","category":"feature_scope","summary":"一句话","rationale":"从 knowledge-query 发现 → 不确定点 → 若不决策的后果","options":[{"label":"选项A","description":"A 的含义、取舍、适用场景"},{"label":"选项B","description":"B 的含义、取舍、适用场景"}],"recommendation":"选项A","askMode":"single_select","evidence":["EV-xxx"],"impact":"对下游阶段的影响"}'
```

字段规范见 `templates/decisions/README.md`。`options` 每项必须是 `{label, description}` 非空对象；`rationale` 必填。

## 完成消息（lead 推进的唯一触发）

- scope 完成：「✅ <stage> scope 完成：N 项 gated 决策已写入 `<slug>-decisions.json`，待 lead 代问」
- draft 完成：「✅ <stage> draft 完成：主产物 `<slug>.md` 已写入」

无完成消息，lead 不推进。

## 相关

- 边界规范：预加载的 `devsphere-teammate-boundary` skill
- 评审回流：预加载的 `devsphere-teammate-review-backflow` skill
```

- [ ] **Step 2: Create `skills/devsphere-teammate-boundary/SKILL.md`**

```markdown
---
name: devsphere-teammate-boundary
description: scc-dev-sphere 所有 teammate（SA/SE/MDE/TSE/DEV/CIE）的通用边界规范。预加载给全部 agent。
---

# Teammate 边界规范

你是 teammate，**不直接面对用户、不调用 AskUserQuestion**（该工具仅主会话可用）。

## 需要用户决策时

- 设计阶段 owner → 用 `devsphere-decisions.js` CLI 写 gated decision（见 `devsphere-teammate-design-protocol` skill）。
- 评审者 → 提 blocking item 回流给阶段 owner（见 `devsphere-teammate-review-backflow` skill）。

## askMode 语义（gated decision 由 lead 据此构造 AskUserQuestion）

- `single_select`：互斥单选（如功能点取舍）
- `confirm_gate`：高风险闸口确认（两选项确认式）
- `multi_select`：非互斥多选
```

- [ ] **Step 3: Create `skills/devsphere-teammate-review-backflow/SKILL.md`**

```markdown
---
name: devsphere-teammate-review-backflow
description: scc-dev-sphere teammate 评审者角色的 blocking→revise→owner 回流约定。预加载给全部 agent。
---

# 评审回流约定

你在评审者角色下（所有 agent 均可能）遵守此约定。

## blocking → revise → ask 回路

评审中发现「需用户决策」的点：

1. **提为 blocking issue**（经 `feature-review` + review-matrix），不自行决定。
2. **回流给阶段 owner**：owner 在 revise 轮用 `devsphere-decisions.js add` 把它补成 `type=gated` decision，进 ask 循环（主会话代问用户）。
3. **决策创作权始终在阶段 owner**：评审者提供风险评估和依据，但不替 owner 做决策。

## 评审时仍遵守 teammate 边界

评审发现不确定/需用户拍板的点 → blocking item → 回流。评审者不直接向用户提问（见 `devsphere-teammate-boundary` skill）。
```

- [ ] **Step 4: Verify files readable**

Run: `ls skills/devsphere-teammate-*/SKILL.md`
Expected: 3 files listed.

- [ ] **Step 5: Commit**

```bash
git add skills/devsphere-teammate-design-protocol/SKILL.md skills/devsphere-teammate-boundary/SKILL.md skills/devsphere-teammate-review-backflow/SKILL.md
git commit -m "feat(skills): add 3 preloaded teammate protocol skills (design-protocol/boundary/review-backflow)"
```

---

### Task E1-2: Add `skills:` frontmatter to 6 agents + remove link sections

**Files:**
- Modify: `agents/sa.md`, `agents/se.md`, `agents/mde.md`, `agents/tse.md` (add `skills:` + remove `## teammate 交互协议`/`## 评审约定` link sections)
- Modify: `agents/cie.md`, `agents/dev.md` (add `skills:` + remove link sections)
- Delete: `references/teammate-design-protocol.md`, `references/teammate-boundary.md`, `references/teammate-review-backflow.md`

- [ ] **Step 1: Update `agents/sa.md` frontmatter**

Change the frontmatter (lines 1-4) from:
```yaml
---
name: sa
description: 业务分析师 — 负责需求业务分析、业务规则梳理、需求边界定义和术语一致性。用于业务设计、需求澄清和业务一致性评审。
---
```
to:
```yaml
---
name: sa
description: 业务分析师 — 负责需求业务分析、业务规则梳理、需求边界定义和术语一致性。用于业务设计、需求澄清和业务一致性评审。
skills:
  - devsphere-teammate-design-protocol
  - devsphere-teammate-boundary
  - devsphere-teammate-review-backflow
---
```

- [ ] **Step 2: Remove the link sections from `agents/sa.md`**

Delete the entire `## teammate 交互协议` section and `## 评审约定` section (the blocks containing the `references/teammate-*.md` links). These are now delivered via the preloaded skills.

- [ ] **Step 3: Repeat for `agents/se.md`**

Same frontmatter `skills:` block (3 skills) as Step 1, and remove the same link sections.

- [ ] **Step 4: Repeat for `agents/mde.md`**

Same frontmatter `skills:` block (3 skills), remove link sections.

- [ ] **Step 5: Repeat for `agents/tse.md`**

Same frontmatter `skills:` block (3 skills), remove link sections.

- [ ] **Step 6: Update `agents/cie.md` frontmatter**

Change frontmatter to:
```yaml
---
name: cie
description: 构建部署工程师 — 按需触发 Agent，负责部署、配置、流水线和环境风险评估。不在默认工作流中，当检测到相关风险时触发。
skills:
  - devsphere-teammate-boundary
  - devsphere-teammate-review-backflow
---
```
Remove the `## teammate 交互协议` link section (boundary + review-backflow links).

- [ ] **Step 7: Update `agents/dev.md` frontmatter**

Same as CIE — `skills:` with 2 skills (boundary + review-backflow), remove the link section.

- [ ] **Step 8: Delete the 3 reference files**

```bash
git rm references/teammate-design-protocol.md references/teammate-boundary.md references/teammate-review-backflow.md
```

- [ ] **Step 9: Verify no stale links + frontmatter valid**

Run:
```bash
grep -rn "references/teammate-" agents/ && echo "STALE LINKS FOUND" || echo "clean"
```
Expected: `clean` (no agent references the deleted files).

Run (YAML frontmatter sanity):
```bash
for f in agents/sa.md agents/se.md agents/mde.md agents/tse.md agents/cie.md agents/dev.md; do
  node -e "const fs=require('fs');const t=fs.readFileSync('$f','utf-8');const m=t.match(/^---\n([\s\S]*?)\n---/);if(!m){console.log('$f NO-FRONTMATTER');process.exit(1)}const y=m[1];if(!y.includes('skills:')){console.log('$f NO-SKILLS');process.exit(1)}console.log('$f OK')"
done
```
Expected: all 6 files print `OK`.

- [ ] **Step 10: Commit**

```bash
git add agents/sa.md agents/se.md agents/mde.md agents/tse.md agents/cie.md agents/dev.md
git commit -m "refactor(agents): preload teammate protocol via skills: frontmatter; remove link sections; delete references"
```

---

### Task E1-3: feature-design SKILL dispatch-prompt reinforcement (F2) + docs

**Files:**
- Modify: `skills/feature-design/SKILL.md` (scope/draft dispatch rows)
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-07-09-design-stage-decision-loop-design.md` (§4.4)

- [ ] **Step 1: Reinforce the scope dispatch prompt in `skills/feature-design/SKILL.md`**

Find the `dispatch_agent` (mode=`scope`) table row. It currently instructs to dispatch with humanGated etc. Append to that row's instruction (within the cell) a mandatory prompt fragment the lead must include when dispatching:

```
派发 prompt 必含一行硬规则：「decisions 只能用 devsphere-decisions.js CLI 改（init/add/resolve）；禁止 Write/Edit/Bash 直接写 decisions/ 和 artifacts/（守卫拦）。humanGated 阶段每个不确定点 add 写成 type=gated、绝不自决（needsConfirmation:false 是违约）。完整契约见已预加载的 devsphere-teammate-design-protocol skill。」并附 verbatim `add` 命令模板。
```

Read the file first to locate the exact current row text, then use Edit to append the fragment.

- [ ] **Step 2: Reinforce the draft dispatch prompt**

Find the `dispatch_agent` (mode=`draft`) table row. Append:

```
派发 prompt 提示：draft 读 decisions 的 resolution 按 skill 写主产物（artifacts/<slug>.md 用 Write 工具，不用 Bash）。
```

- [ ] **Step 3: Update `CLAUDE.md`**

In the `### 设计阶段决策循环` section, after the existing PreToolUse 双守卫 + TeammateIdle paragraph, add a new paragraph:

```
teammate 契约预加载：SA/SE/MDE/TSE 经 agent frontmatter `skills:` 预加载 `devsphere-teammate-design-protocol`/`-boundary`/`-review-backflow` skill（完整契约在派发时注入上下文；markdown 链接不会被自动读取）。Bash 守卫（`check-decisions-bash`）：禁止 Bash 直接写 `decisions/`/`artifacts/`，CLI（`devsphere-decisions.js`）豁免——强制 decisions 走脚本、artifacts 走 Write 工具（触发 sync-artifact）。
```

- [ ] **Step 4: Update original spec §4.4**

In `docs/superpowers/specs/2026-07-09-design-stage-decision-loop-design.md` §4.4, append:

```
**补充（2026-07-09 追加）：** teammate 契约改为 agent frontmatter `skills:` 预加载 3 个 teammate skill（design-protocol/boundary/review-backflow）——系统提示词里的 markdown 链接不会被 teammate 自动读取，必须用 `skills:` 强制注入。新增 PreToolUse `Bash` 守卫 `check-decisions-bash`：禁止 Bash 直接写 `decisions/`/`artifacts/`（堵 teammate 被 Write 守卫拒后改用 Bash 的绕过），`devsphere-decisions.js` CLI 豁免。详见 `docs/superpowers/specs/2026-07-09-teammate-contract-preload-and-bash-guard.md`。
```

- [ ] **Step 5: Commit**

```bash
git add skills/feature-design/SKILL.md CLAUDE.md docs/superpowers/specs/2026-07-09-design-stage-decision-loop-design.md
git commit -m "docs(skill): reinforce dispatch prompt + CLAUDE.md/spec — teammate skill preload + bash guard"
```

---

## Execution Order

1. **Plan E2 first** (Tasks E2-1 → E2-2): deterministic Bash guard, TDD, independently testable. Ship before E1 — closes the bypass so E1's contract instruction isn't undone by Bash escapes.
2. **Plan E1 second** (Tasks E1-1 → E1-2 → E1-3): content layer; depends on E2's guard contract. Verified by scenario (teammate produces canonical gated decisions, user gets asked).
