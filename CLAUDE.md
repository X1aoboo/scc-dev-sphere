# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**`scc-dev-sphere`** is a Claude Code plugin that implements a multi-role, human-in-the-loop feature development workflow — from requirements analysis through design, AI cross-review, human approval, code implementation, and test handoff.

It does **not** have its own runtime. It composes Claude Code primitives: `skills` (slash commands), `agents` (custom subagents with role contexts), `hooks` (hard gates), and Node.js `scripts` (deterministic state/validation logic).

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
node scripts/devsphere-review-state.js status <task-path> <artifact>
node scripts/devsphere-review-state.js merge <task-path> <artifact> <artifact-version>
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
  ├── devsphere-review-matrix.js Review matrix CRUD and Lead merge gate
  ├── devsphere-review-state.js Role-owned review snapshots, version checks, and merge
  ├── devsphere-approval.js     Design-ready validation, approval record management
  ├── devsphere-workspace.js    Task workspace/directory creation
  ├── devsphere-workflow.js     Main router: state → nextAction (run skill, human confirm, etc.)
  └── workflows/
      └── feature-workflow.js   Feature task state machine resolver

hooks/            Claude Code lifecycle hooks (hooks.json)
  ├── UserPromptExpansion — guards on /feature-implement and /feature-approve entry
  ├── PreToolUse — decisions/artifact/review JSON write guards
  ├── TeammateIdle — decision-file quality fallback
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

### 设计阶段决策循环

设计阶段由 `feature-design` skill（主会话薄编排器）驱动：入口创建当前会话内的固定设计团队，按阶段顺序向稳定 teammate 派发 owner 任务；评审时由 Lead 授权当前 artifact version，直接向已有 reviewer teammate 并行派发，全部角色快照完成后再统一合并。Lead 负责咨询 router、写 artifact/stage 状态和用户交互，不由 teammate 直接推进流程。

设计团队逻辑成员为 `design-sa`、`design-se`、`design-mde`、`design-tse`、`design-dev`，`ciCdRisk=true` 时加 `design-cie`。Agent Teams 不可用时设计阶段阻断，不回退临时串行 Agent；Agent ID 不持久化，新会话按逻辑名称重新 bootstrap。

teammate 行为准则（`devsphere-teammate-conduct` skill，frontmatter `skills:` 预加载给全部 agent）：需用户决策时按派发 prompt 的 `decisionPolicy`——`lead-confirm` 记 `type=gated` + 停 + Lead 代问；`agent-autonomy` 记 `type=autonomous` + assumption 自决。设计领域 Skill 不读取 workflow mode。vague 需求按维度拆解出土 decision。

守卫（唯一确定性兜底）：`check-decisions-resolved`（人工门禁阶段 gated pending>0 拒写主产物）、`check-decisions-format`（decisions 写入内容 schema 校验）、`check-decisions-bash`（禁 Bash 写 decisions/|artifacts/，CLI 豁免）、`check-review-writes`/`check-review-bash`（禁止直接写共享 matrix 或角色评审 JSON）、`check-teammate-decisions`（TeammateIdle 磁盘兜底）。

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

The `feature-design` skill acts as a **sub-orchestrator** — it reads stage statuses and executes the deterministic design action returned by `feature-design-router.js`. Actions include stable-team draft dispatch, `dispatch_reviews`, `wait_reviews`, `merge_reviews`, `ask_review`, revision, and human approval; the Lead performs each action and owns persisted state.

### AI cross-review system

Each required Reviewer writes only its current snapshot at `reviews/<artifact>/<role>.json` and appends narrative history to `reviews/<artifact>/<role>-review.md`. The snapshot is keyed by the artifact frontmatter `version`; a stale version cannot complete the current review. The Lead invokes `devsphere-review-state.js merge` after all required snapshots are complete, and only then updates `reviews/review-matrix.json`.

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

Agents are defined as markdown files in `agents/` with YAML frontmatter (`name`, `description`). The design Lead bootstraps stable logical teammates by name; the router returns role/name/prompt data but never persists Agent IDs.

### Script cross-dependencies

```
devsphere-state.js  ←  all other scripts (foundational I/O)
devsphere-review-state.js  →  devsphere-review-matrix.js (Lead merge; matrix lazily imports review-state for the final gate)
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
