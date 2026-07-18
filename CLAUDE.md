# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**`scc-dev-sphere`** is a Claude Code plugin that implements a multi-role, human-in-the-loop feature development workflow — from requirements analysis through design, AI cross-review, human approval, code implementation, and test handoff.

It does **not** have its own runtime. It composes Claude Code primitives: `skills` (slash commands), `agents` (custom subagents with role contexts), `hooks` (hard gates), and Node.js `scripts` (deterministic state/validation logic).

## Global constraints

1. **Claude Code plugin boundary.** `scc-dev-sphere` is a Claude Code plugin, not a standalone agent platform or application. All architecture, design, and implementation decisions MUST conform to the current [official Claude Code plugin documentation](https://code.claude.com/docs/en/plugins) and its supported schemas and extension points. When repository conventions conflict with the official plugin contract, the official contract takes precedence. Use Claude Code-native plugin components and paths; do not invent parallel plugin semantics.
2. **Simplicity first; avoid an Agent runtime.** Prefer the smallest design that solves the stated problem and reuse Claude Code behavior before adding abstractions. Do not introduce a separate Agent runtime, including a custom agent scheduler, lifecycle manager, registry, message bus, persistent agent-ID system, or execution engine. Node.js scripts may provide deterministic state, routing, validation, and artifact operations, but must remain bounded helpers rather than a self-built runtime. Any exception requires an explicit requirement, documented tradeoff, and confirmation that the official plugin model cannot satisfy it.

## Commands

This is not a traditional npm project — there is no `package.json`, no build step, no test suite for the plugin itself. The only runnable code is the Node.js scripts:

```bash
# Test script output manually
node scripts/devsphere-workflow.js <workspace-root>
node scripts/devsphere-state.js read-state <task-path>
node scripts/devsphere-state.js read-current-task <workspace-root>
node scripts/devsphere-guard.js check-implement <workspace-root>
node scripts/devsphere-guard.js check-approve <workspace-root>
node scripts/devsphere-review-matrix.js init <task-path>
node scripts/devsphere-review-matrix.js read <task-path>
node scripts/devsphere-design.js <init-stage|mark-ready|inspect|record-gate|record-review|publish|current-stage|reopen> <task-path> <stage>
node scripts/devsphere-approval.js validate-design-ready <task-path>
node scripts/devsphere-workspace.js create-feature-task <workspace-root> <task-id> [workflow-mode]
```

Scripts are dual-use: CLI-callable via `node <script>.js <command> <args>` AND `require()`-able between scripts (functions exported via `module.exports`).

## Architecture

### Component layers

```
skills/          Slash-command entry points (/scc-dev-sphere:feature-init, etc.)
  ├── workflow/  Main orchestrator — routes to next action based on state
  ├── status/    Read-only task status display
  └── feature-*  One skill per workflow stage (init, assess, design, review, approve, implement, verify)

agents/           Role-specific subagent definitions (frontmatter + system prompt)
  ├── sa.md      Business Analyst — business design, business-alignment review
  ├── se.md      System Architect — solution design, architecture review
  ├── mde.md     Module Dev Expert — implementation design, module impact analysis
  ├── dev.md     Developer — implementation plan, coding, verification
  ├── tse.md     Test Engineer — test design, testability review
  └── cie.md     CI/Deploy Engineer — on-demand, triggered by deployment/config risks

scripts/          Deterministic Node.js — no AI, no ambiguity
  ├── devsphere-state.js       Read/write state.json and current-task.json
  ├── devsphere-guard.js        Hard gates: state transition validation, entry guards
  ├── devsphere-decisions.js   Decision record CRUD + resolve/apply
  ├── devsphere-design.js       Design lifecycle: init-stage/mark-ready/inspect/record-gate/record-review/publish/current-stage/reopen
  ├── devsphere-review-matrix.js Review matrix CRUD and merge gate
  ├── devsphere-approval.js     Design-ready validation, approval record management
  ├── devsphere-workspace.js    Task workspace/directory creation
  ├── devsphere-workflow.js     Main router: state → nextAction (run skill, human confirm, etc.)
  └── workflows/
      └── feature-workflow.js   Feature task state machine resolver

hooks/            Claude Code lifecycle hooks (hooks.json)
  ├── UserPromptExpansion — guards on /feature-implement and /feature-approve entry
  ├── PreToolUse — decisions/review/evidence/clarify write+Bash guards
  └── PostToolUse — auto-syncs artifact existence to state after Write/Edit

templates/        Document templates copied into new task workspaces
  ├── artifacts/   business-design, solution-design, implementation-design, test-design, integrated-design
  ├── approvals/   approval-template.json
  ├── reviews/     review-template.md
  └── verification/ test-handoff-template.md

references/       interaction-guidelines.md — AskUserQuestion patterns for Chinese UI
docs/             PRD, technical design doc, Q&A history
```

### Feature task state machine

```
initialized → clarified → assessed → designing → design_ready → approved_for_implementation
→ implementation_planned → implementing → verification_ready → completed

blocked ↪ designing | implementing (resolve and re-enter)
```

Valid transitions are defined in `devsphere-guard.js` `VALID_TRANSITIONS`. Scripts enforce these — never skip states in skill prompts.

### 设计阶段生命周期

设计阶段由 `feature-design` skill（主会话生命周期入口）驱动：主会话读 `devsphere-design.js current-stage` 解析当前阶段 → `inspect` 拿 nextAction → 按动作执行（run_stage/ask_decision/ask_review/run_gate/run_review/baseline/complete）→ 重读 inspect。主会话承担分析/调查/设计推演（落 `work/<stage>/`）、Gate/Review 调度、用户交互；不创建长期 Agent。

四个设计环节（business/solution/implementation/test）共享 analyze→discover→design→validate→review→revise→baseline 生命周期；每阶段按固定评审视角表派发一次性 Review Subagent（各视角加载 `feature-review` job skill + 对应 `agents/*.md` 评审段），findings 经 `record-review` 合并到 review matrix，绑定 draft hash。integrated 走精简生命周期（assemble→gate→4 维度承接 review→baseline→design_ready）。

基线后设计变更：写 `design_change` decision → 用户批准 → `reopen`（bump version、清固定下游 baseline、重置 ready、写 design-change blocking）→ 主会话判断变更规模用 `mark-ready` 定起点 → revise 关闭 design-change blocking → 重 Gate/Review → 重 baseline。

守卫（确定性兜底）：`check-decisions-resolved`、`check-decisions-format`、`check-decisions-bash`、`check-review-writes`/`check-review-bash`（评审 matrix 只经 CLI）、`check-evidence-writes`/`-bash`、`check-clarify-checklist`/`-bash`。

决策内容持久化在 `decisions/<slug>-decisions.json`（双用途：闸口 + 知识沉淀）。

### Task workspace layout

Tasks live at `.devsphere/tasks/feature/<task-id>/` with:
```
state.json              # status, workflowMode, stages with per-stage status
inputs/                 # requirement.md
artifacts/              # business-design.md, solution-design.md, etc.
reviews/                # review-matrix.json, per-artifact role snapshots and Markdown history
approvals/              # design-final-approval.json
implementation/         # implementation-plan.md, implementation-log.md
verification/           # test-handoff.md
decisions/              # per-stage decision records
evidence/               # knowledge/ and repository/ snapshots
links/                  # repos.json
```

`current-task.json` at `.devsphere/current-task.json` points to the active task.

### Design stages and their owners

| Stage | Agent | Artifact | Reviewers |
|-------|-------|----------|-----------|
| businessDesign | SA | business-design.md | SE |
| solutionDesign | SE | solution-design.md | SA, MDE, TSE |
| implementationDesign | MDE | implementation-design.md | SE, DEV, TSE |
| testDesign | TSE | test-design.md | SA, SE, MDE |
| integrated-design | — | integrated-design.md | SA, SE, MDE, TSE |

### Workflow routing

`devsphere-workflow.js` → `workflows/feature-workflow.js` reads `state.json` and returns a deterministic `nextAction` object:
- `kind: "run_skill"` → invoke the named skill with listed agents
- `kind: "human_confirm"` → present a confirmation gate to the user
- `kind: "show_status"` / `"blocked"` / `"completed"` → terminal display states

The `feature-design` skill is the design-phase lifecycle entry — it reads `nextAction` from `devsphere-design.js inspect` and executes it (run_stage/ask_decision/ask_review/run_gate/run_review/baseline/complete). The main session performs each action and owns persisted state.

### AI cross-review system

Each required Reviewer is a one-shot Review Subagent that loads the `feature-review` job skill plus the corresponding `agents/*.md` review profile, reads the frozen draft (hash-bound), and emits structured `issueFindings`/`closureDecisions`. The main session collects snapshots and invokes `devsphere-design.js record-review` to merge them into `reviews/review-matrix.json`, binding conclusions to the current draft hash.

The review matrix (`reviews/review-matrix.json`) tracks per-artifact merged conclusions with three issue types:
- **blocking** — must be resolved before the artifact passes
- **advisory** — recommendations, need human confirmation
- **risk_candidate** — flagged risks for human awareness

The review-revise loop is: complete all role reviews → Lead merges → resolve pending advisory/risk decisions → send one unified `reviewItems` list (open blocking plus apply advisory/risk) to the design owner → increment artifact version → re-review. Reviewers record original issue closure decisions; Lead applies them during merge, preserving issue IDs. The task-level `state.json.designRevisionLimit` defaults to 25 and remains configurable.

## Key conventions

### Human interaction (Chinese UI)

When presenting options to the user, **must use `AskUserQuestion`** — never plain text lists. Follow the three patterns in `references/interaction-guidelines.md`:
- `single_select` — for mutually exclusive choices
- `confirm_gate` — for high-risk confirmation gates
- `multi_select` — for non-exclusive multi-select

### State management

- State reads/writes go through `devsphere-state.js` functions — never read/write JSON files directly in skill prompts unless you're the script itself.
- After any agent produces an artifact, the `PostToolUse` hook on `Write|Edit` auto-syncs artifact existence to state.
- State transitions must pass `devsphere-guard.js check-advance` validation.
- `sync-stage-status` (in feature-workflow.js) syncs deterministic facts: artifact file exists → `drafted`; only a current-version, all-reviewers-complete matrix with no blocking/pending/apply issue → `ai_review_passed`.

### Agent invocation

`agents/*.md` are the source documents for each role's review checklist; the default workflow does not create Agents from them. Design is performed by the main session plus stage skills; review is performed by one-shot Review Subagents that load the `feature-review` job skill plus the corresponding agent profile.

### Script cross-dependencies

```
devsphere-state.js  ←  all other scripts (foundational I/O)
devsphere-decisions.js  ←  devsphere-design.js (decision CRUD + resolve/apply)
devsphere-design.js  →  devsphere-review-matrix.js (record-review merges into matrix)
devsphere-review-matrix.js  ←  devsphere-approval.js, devsphere-workflow.js
devsphere-approval.js  ←  devsphere-workflow.js
devsphere-guard.js  ←  hooks (standalone, but imports state)
```

---

## Behavioral guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
