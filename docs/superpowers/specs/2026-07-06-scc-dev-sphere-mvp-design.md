# scc-dev-sphere MVP Design Spec

## 1. Overview

`scc-dev-sphere` is a Claude Code plugin that transforms team requirement-development workflows into auditable, controllable, progressively-automated AI-assisted pipelines. It does NOT build its own Agent runtime — it composes Claude Code native components: `skills`, `agents`, `hooks`, `scripts`, and `.mcp.json`.

**MVP focus**: Requirement from design to code delivery.

```
需求输入 → 业务设计+评审 → 方案设计+评审 → 实现/测试设计+评审
→ 集成一致性评审 → 人工最终批准 → 开发执行计划 → 代码落地 → 转测包
```

Reference docs (authoritative for implementation details):
- `docs/scc-dev-sphere-PRD.md` — product positioning, MVP scope, core principles
- `docs/scc-dev-sphere-技术方案.md` — technical architecture, schemas, state machines
- `docs/插件设计澄清-QA.md` — design decision records (44 Q&A items)

## 2. Component Architecture

| Component | Responsibility | Anti-Responsibility |
|-----------|---------------|---------------------|
| `skills/` | Callable work units; generate/update agreed artifacts | Do NOT decide cross-stage advancement |
| `agents/` | Role context (SA/SE/MDE/DEV/TSE/CIE); define responsibility perspective | NOT the workflow backbone |
| `hooks/` | Hard gates + artifact registry + deterministic state sync + consistency checks | Do NOT substitute review judgment; do NOT auto-accept risk/advisory |
| `scripts/` | Deterministic state I/O, review matrix updates, workflow resolver logic | Do NOT generate design content; do NOT invoke agents |
| `workflow` Skill | Unified entry; read taskType → call resolver → output nextAction → guide agent/skill in session | Does NOT directly execute actions |
| `status` Skill | Read-only: display task summary, pending items, next action suggestion | Does NOT modify files or advance state |

### Interaction Model

**Artifact + State driven**: Skills produce artifacts; the workflow resolver computes `nextAction` based on `state.json`, artifacts, review matrix, decisions, and approvals. Skill execution perceptions (`success`/`needs_input`/`failed`) are hints only — not machine contracts.

## 3. Plugin Package Structure

```
scc-dev-sphere/
  .claude-plugin/
    plugin.json
  skills/
    feature-init/SKILL.md
    feature-assess/SKILL.md
    feature-design/SKILL.md
    feature-design-business/SKILL.md
    feature-design-solution/SKILL.md
    feature-design-implementation/SKILL.md
    feature-design-test/SKILL.md
    feature-review/SKILL.md
    feature-approve/SKILL.md
    feature-plan-implementation/SKILL.md
    feature-implement/SKILL.md
    feature-verify/SKILL.md
    workflow/SKILL.md
    status/SKILL.md
    knowledge-query/SKILL.md
    backend-development/SKILL.md
    frontend-development/SKILL.md
    fullstack-change-planning/SKILL.md
  agents/
    sa.md
    se.md
    mde.md
    dev.md
    tse.md
    cie.md
  hooks/
    hooks.json
  .mcp.json
  scripts/
    devsphere-state.js
    devsphere-review-matrix.js
    devsphere-approval.js
    devsphere-guard.js
    devsphere-workspace.js
    devsphere-workflow.js
    workflows/
      feature-workflow.js
  templates/
```

Agent files (`agents/*.md`) must be Claude Code custom subagent definitions with YAML frontmatter. `name` uses lowercase kebab-case (e.g., `sa`, `se`). They do NOT depend on `hooks`, `mcpServers`, or `permissionMode` frontmatter fields.

## 4. User Entry Points

### Primary (for regular users)
- `/scc-dev-sphere:workflow` — advance current task; reads state, computes nextAction, guides agent/skill
- `/scc-dev-sphere:status` — view current task summary, stage status, pending confirmations, risks, next step

### Stage Skills (for expert intervention, revision, recovery, debugging)
```
/scc-dev-sphere:feature-init
/scc-dev-sphere:feature-assess
/scc-dev-sphere:feature-design
/scc-dev-sphere:feature-design-business
/scc-dev-sphere:feature-design-solution
/scc-dev-sphere:feature-design-implementation
/scc-dev-sphere:feature-design-test
/scc-dev-sphere:feature-review --target <artifact>
/scc-dev-sphere:feature-approve
/scc-dev-sphere:feature-plan-implementation
/scc-dev-sphere:feature-implement
/scc-dev-sphere:feature-verify
```

### Workflow Routing
```
/scc-dev-sphere:workflow
  → skills/workflow/SKILL.md
  → reads .devsphere/current-task.json
  → identifies taskType
  → calls scripts/devsphere-workflow.js
  → delegates to taskType-specific resolver (MVP: feature-workflow.js)
  → outputs nextAction
  → guides corresponding Agent/Skill in Claude Code session
```

## 5. Task Workspace & State Model

### Workspace Location

Claude workspace-level `.devsphere/`, NOT inside code repos:
```
.devsphere/
  current-task.json
  tasks/
    feature/<task-id>/
      state.json
      inputs/
      artifacts/
        business-design.md
        solution-design.md
        implementation-design.md
        test-design.md
        integrated-design.md
      reviews/
        review-matrix.json
        advisory-confirmation.json
        business-design/se-review.md
        solution-design/{sa,mde,tse}-review.md
        implementation-design/{se,dev,tse}-review.md
        test-design/{sa,se,mde}-review.md
      approvals/
        design-final-approval.json
        implementation-plan-approval.json
      implementation/
      verification/
      links/
        repos.json
      decisions/
        decision-index.json
        business-design-decisions.md
        solution-design-decisions.md
        implementation-design-decisions.md
        test-design-decisions.md
      evidence/
        evidence-registry.json
        knowledge/
        repository/
```

### current-task.json

```json
{
  "activeTaskId": "FEAT-20260629-001",
  "activeTaskType": "feature",
  "workspaceRoot": "/path/to/workspace",
  "taskPath": ".devsphere/tasks/feature/FEAT-20260629-001"
}
```

### Task-Level Status (state.status)

```
initialized → assessed → designing → design_ready
→ approved_for_implementation → implementation_planned
→ implementing → verification_ready → completed
```
Exception: `blocked`

- `designing` covers generation, AI review, human clarification, revision, re-review cycles.
- `implementing` covers coding, verification-failure fixes, test supplementation.
- `verification_ready` means the implementation agent declares code complete; it does NOT mean "verifying".
- `completed` is the only normal terminal state for MVP.

### Feature Stage Status (state.stages.*.status)

```
not_started → drafted → ai_review_passed → human_approved
```

Only stable boundaries are recorded — NOT transient states like `drafting` or `ai_reviewing`.

### state.json (Feature MVP Example)

```json
{
  "taskId": "FEAT-20260629-001",
  "taskType": "feature",
  "workflowMode": "auto-design",
  "humanGateStages": [],
  "status": "designing",
  "stages": {
    "businessDesign": {
      "status": "not_started",
      "artifact": "artifacts/business-design.md"
    },
    "solutionDesign": {
      "status": "not_started",
      "artifact": "artifacts/solution-design.md"
    },
    "implementationDesign": {
      "status": "not_started",
      "artifact": "artifacts/implementation-design.md"
    },
    "testDesign": {
      "status": "not_started",
      "artifact": "artifacts/test-design.md"
    }
  }
}
```

### Code Change Entry Gate

Only `implementation_planned` and `implementing` allow code modification.

## 6. Workflow Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `auto-design` | AI auto-advances design phases; stages reach `ai_review_passed` as input for downstream. Human final approval still required before code. | Simple requirements |
| `strict-human-loop` | Each stage must reach `human_approved` before the next can begin. | High-risk or compliance requirements |
| `collaborative-design` | Stages NOT in `humanGateStages` advance at `ai_review_passed`; stages in `humanGateStages` must reach `human_approved`. | Complex requirements needing selective human gates |

Mode selection: AI recommends based on hard risk rules + explanation → user confirms. High-risk triggers (cross-system, data migration, security, API changes, core path, etc.) force a default recommendation of `strict-human-loop`. Downgrading requires recording the decision with reason and risk acceptance.

## 7. nextAction Schema

The workflow resolver outputs a stable `nextAction` structure. Skills and the `workflow` Skill interact through this contract.

### Schema

```json
{
  "kind": "run_skill | human_confirm | show_status | blocked | completed",
  "taskType": "feature",
  "taskId": "FEAT-20260629-001",
  "status": "designing",
  "stage": "businessDesign",
  "target": "business-design",
  "skill": "feature-design-business",
  "args": {},
  "agents": ["sa"],
  "reason": "businessDesign is not started",
  "requiredArtifacts": [],
  "expectedArtifacts": ["artifacts/business-design.md"],
  "pause": null
}
```

### Kind Definitions

| kind | Meaning |
|------|---------|
| `run_skill` | Guide corresponding agent/skill in session |
| `human_confirm` | Pause and wait for human confirmation |
| `show_status` | Display status, todos, or suggestions only |
| `blocked` | Show blocking reason and recovery suggestions |
| `completed` | Show completion state, no further advancement |

### Schema Boundaries

- `skill` stores only the skill name; params go in `args` (never concatenated as pseudo-subcommands).
- `agents[]` is a role manifest, not skill params or a script-level scheduling plan.
- No `afterCompletion`, `stateEffects`, `guards`, or `onFailure` fields.
- `kind=human_confirm` already expresses pause; no separate `requiresHumanInput` flag.
- Resolver does NOT introduce DSL, condition expressions, or self-built runtime.

## 8. Feature Next-Step Decision Table

The feature workflow resolver uses this table to compute `nextAction`. Each call advances exactly ONE minimal next step.

| Current State / Condition | nextAction | Pause Point | Key Artifacts |
|---|---|---|---|
| No active task | `show_status` — prompt to create | Wait for requirement input | None |
| `initialized` | `run_skill feature-assess` | Wait for mode/humanGateStages confirmation | assessment |
| `assessed` | `run_skill feature-design-business agents=[sa]` | Clarify if requirements incomplete | `business-design.md` |
| `designing` + businessDesign not ready | `feature-design-business agents=[sa]` then `feature-review target=business-design agents=[se]` | Pause if strict/humanGate hit | business artifact, SE review |
| businessDesign ready, solutionDesign not ready | `feature-design-solution agents=[se]` then `feature-review target=solution-design agents=[sa,mde,tse]` | Pause if strict/humanGate hit | solution artifact, reviews |
| solutionDesign ready, implementationDesign not ready | `feature-design-implementation agents=[mde]` then `feature-review target=implementation-design agents=[se,dev,tse]` | Pause if strict/humanGate hit | implementation artifact, reviews |
| solutionDesign ready, testDesign not ready | `feature-design-test agents=[tse]` then `feature-review target=test-design agents=[sa,se,mde]` | Pause if strict/humanGate hit | test artifact, reviews |
| All 4 stages ready, no integrated-design or integrated review not passed | Generate/refresh integrated design; `feature-review target=integrated-design agents=[sa,se,mde,tse]` | Pause if blocking/advisory/risk/assumption pending | integrated design, integrated review |
| All reviews passed, advisory/risk/assumption resolved | `design_ready` — state sync | None | state update |
| `design_ready` | `run_skill feature-approve` | Wait for human final approval | `design-final-approval.json` |
| `approved_for_implementation` | `run_skill feature-plan-implementation agents=[dev]` | Wait for plan approval if high-risk/strict | implementation plan |
| `implementation_planned` | `run_skill feature-implement agents=[dev]` | Action-level confirm before first code change | implementation log, code changes |
| `implementing` | Continue implementation, fixes, test additions | Pause if scope drift detected | code changes, tests |
| `verification_ready` | `run_skill feature-verify` | Pause if verification fails and risk acceptance needed | verification result, test handoff |
| `completed` | `completed` | None | Completion summary |
| `blocked` | `blocked` — show reason and recovery suggestions | Wait for human resolution | blocked reason |

### Stage Readiness Rules

- `auto-design`: stage reaches `ai_review_passed`.
- `collaborative-design`: stages NOT in `humanGateStages` reach `ai_review_passed`; stages IN `humanGateStages` must reach `human_approved`.
- `strict-human-loop`: stage must reach `human_approved`.

### Exception Rules

- Review has blocking → nextAction returns to design agent for revision.
- Advisory unconfirmed → `human_confirm`, requiring human to choose `apply` / `no_change` / `convert_to_blocking`.
- risk_candidate unhandled → `human_confirm`, requiring human to decide accept or return to design.
- Assumption unconfirmed → `human_confirm` or requirement clarification.
- Knowledge query insufficient but artifact claims factual basis → return to design phase to supplement evidence.
- CIE risk triggered → append CIE to review matrix; affected reviews add `cie` to `agents[]`.
- Code implementation deviates from plan → generate deviation notice, write to implementation log, require human confirmation.

## 9. Review Model

### Base Review Matrix

| Artifact | Required Reviewers |
|----------|-------------------|
| business-design | SE |
| solution-design | SA, MDE, TSE |
| implementation-design | SE, DEV, TSE |
| test-design | SA, SE, MDE |
| integrated-design | SA, SE, MDE, TSE (consistency check) |

### Risk-Enhanced Reviewers

- Deployment, config, pipeline, environment, release strategy → append CIE
- Security, permission, audit → security perspective (MVP: SE/TSE dual-hat)
- Performance, capacity, stability → SE/MDE performance perspective
- Data migration or model change → MDE/DEV/TSE data impact check

### Review Issue Categories (only 3)

| Type | Handling |
|------|----------|
| `blocking` | Must be fixed by original design agent; verified and closed by the reviewer who raised it |
| `advisory` | AI does NOT auto-fix; human must choose `apply` / `no_change` / `convert_to_blocking` |
| `risk_candidate` | AI-identified risk; only becomes `accepted_risk` after explicit human acceptance |

### AI Review-Revision Loop

```
Artifact generated
  → AI cross-review
  → Discover blocking/advisory/risk_candidate
  → Return blocking to design agent for revision
  → Original reviewer re-verifies
  → If blocking remains, continue loop
  → When blocking=0, compile advisory confirmation checklist
  → Decide stage human confirmation based on workflowMode / humanGateStages
  → Pause for human confirm if needed → human_approved
  → User feedback → record issues, return to design revision
```

Exit conditions:
- All blocking closed, advisory compiled into confirmation checklist.
- Max 3 AI internal revision rounds reached.
- Irresolvable conflicts between review agents.
- Human information or decision needed.

### review-matrix.json

```json
{
  "artifacts": {
    "solution-design": {
      "requiredReviewers": ["SA", "MDE", "TSE"],
      "status": "in_review",
      "issues": { "blocking": 1, "advisory": 2, "risk_candidate": 0 },
      "reviews": {
        "SA": { "status": "passed", "file": "reviews/solution-design/sa-review.md" },
        "MDE": { "status": "blocking", "file": "reviews/solution-design/mde-review.md" },
        "TSE": { "status": "passed_with_advice", "file": "reviews/solution-design/tse-review.md" }
      }
    }
  }
}
```

## 10. Approval Mechanism

### Stage-Level Human Confirmation
- Updates `stages.*.status=human_approved`.
- Does NOT generate an approval file.
- Confirmation facts written to review details or decisions.

### Final Design Approval (`feature-approve`)
- Only valid when `state.status=design_ready`.
- Validates: blocking=0, all advisory confirmed, accepted_risk written to decisions, integrated-design includes risk summary.
- Generates `approvals/design-final-approval.json`.
- Updates `status=approved_for_implementation`.

```json
{
  "approvalId": "APP-001",
  "type": "design-final-approval",
  "taskId": "FEAT-20260629-001",
  "approvedArtifacts": [
    { "file": "artifacts/business-design.md", "hash": "sha256:..." },
    { "file": "artifacts/solution-design.md", "hash": "sha256:..." },
    { "file": "artifacts/implementation-design.md", "hash": "sha256:..." },
    { "file": "artifacts/test-design.md", "hash": "sha256:..." },
    { "file": "artifacts/integrated-design.md", "hash": "sha256:..." }
  ],
  "approvedScope": ["backend/order", "frontend/order-ui"],
  "limitations": ["no database migration in MVP"],
  "approvedBy": "human",
  "approvedAt": "2026-06-29T10:30:00+08:00"
}
```

If design is revised after `design_ready`, status returns to `designing` and affected stage reviews + integrated consistency review must be redone.

## 11. Hook Design

### Event-Responsibility Matrix

| Event | Purpose | Can Block |
|-------|---------|-----------|
| `UserPromptExpansion` | Entry check for direct slash calls to high-risk skills (approve, implement, revise approved artifacts) | YES |
| `PreToolUse` / `PermissionRequest` | MVP: only auxiliary state-advance validation when needed | Only when validating state preconditions |
| `PostToolUse` | Registry, index, state sync, post-implementation diff summary, deviation notice | NO |

### Hard Gates (MUST block)

- Advancing workflow state without an active task.
- Launching `feature-implement` when status is NOT `implementation_planned` or `implementing`.
- Generating approval when unclosed blocking exists.
- Entering code implementation when implementation plan is missing.

### Prompts (warn + require human confirmation)

- Missing test suggestions.
- CIE risk unevaluated.
- Insufficient knowledge citations.
- Advisory items without human confirmation.
- Low-risk but uncertain implementation suggestions.
- Post-implementation diff summary showing significant scope deviation from plan.

### Allowed State Syncs

- Artifact generated → sync stage to `drafted`.
- Review blocking=0 → sync stage to `ai_review_passed`.
- All stages ready + integrated review no blocking → sync `status=design_ready`.
- Approval written → sync `status=approved_for_implementation`.
- Implementation plan meets conditions → sync `status=implementation_planned`.
- First code modification confirmed → sync `status=implementing`.
- Code complete → sync `status=verification_ready`.
- Verification + handoff complete → sync `status=completed`.
- Unrecoverable → sync `status=blocked`.

### Forbidden for Hooks

- Judging design quality.
- Deciding whether blocking is truly closed.
- Auto-accepting or rejecting advisory/assumption/risk_candidate.
- Deciding to skip stages or enter code implementation.
- Generating decision semantics.

## 12. Decision Records

Organized by design artifact type:
```
decisions/
  decision-index.json
  business-design-decisions.md
  solution-design-decisions.md
  implementation-design-decisions.md
  test-design-decisions.md
```

Each decision entry: ID, related artifact, timestamp, participants, context, options, final choice, rationale, risks, downstream impact, status.

**Semantic vs Bookkeeping separation**: Skills/Agents/Humans generate decision semantics. Hooks/scripts handle bookkeeping: assign/validate IDs, update index, check format, verify cross-references.

## 13. Evidence Process Artifacts

Evidence snapshots of knowledge/repository queries actually used in design, review, or implementation:
```
evidence/
  evidence-registry.json
  knowledge/
    EV-001-approval-rules.md
  repository/
    EV-010-order-service-impact.md
```

Rules:
- Only query results actually used in artifacts are saved.
- Knowledge results save summaries, source identifiers, query conditions, timestamps, key findings.
- Repository evidence saves impact analysis, relevant file paths, key symbols, call relationships — NOT large source dumps.
- Claims about existing facts, external constraints, or code status MUST cite evidence IDs (`依据：EV-001, EV-003`).
- New design decisions need no evidence but must state rationale and trade-offs.
- Premises without evidence MUST be marked as `assumption` and confirmed by human.

## 14. Agent Responsibilities

Agents define role perspective; Skills define execution method. Same Skill loaded by different agents → output reflects each agent's perspective.

| Agent | Core Responsibility |
|-------|-------------------|
| SA | Business requirement design; query business rules, historical requirements; review business consistency of solution and test designs |
| SE | System/solution design; query architecture specs, interface contracts; review cross-module consistency of all designs |
| MDE | Module implementation design; query module history, code structure, call chains; review implementation feasibility |
| DEV | Review implementation design for codeability; generate implementation plan; execute code delivery and local verification; use backend/frontend/fullstack skills as needed |
| TSE | Test design; query historical defects, test specs, regression scope; review testability |
| CIE | On-demand only; triggered when deployment, config, pipeline, environment, or release risks are detected |

## 15. Knowledge Base Access

**MCP tool + query Skill**: MCP connects to private knowledge bases and returns structured results. `knowledge-query` Skill handles query strategy, evidence filtering, citation standards, and evidence insufficiency judgment. No "knowledge base Agent" is created.

Query triggering: by specific agents at specific stages, not pre-loaded by `feature-assess`. Results are saved as evidence snapshots only when adopted into artifacts.

Knowledge base update: layered sedimentation. Task workspace preserves full process assets. Only verified stable knowledge is written back to the knowledge base, with human approval.

## 16. Skill Minimum Integration Contract

Skills that participate in workflow orchestration must declare:
- Callable entry (skill name)
- Required inputs/parameters
- Primary artifact paths or types
- Script-verifiable completion criteria (required files, sections, JSON schema, index registration, or state preconditions)

This contract serves workflow integration only; it does NOT replace the skill's own capability documentation. Skills outside the workflow chain are not required to declare it.

## 17. High-Risk Skill Human Confirmation Gate

High-risk skills (approve, implement, revise approved artifacts) MUST have built-in human confirmation gates, regardless of invocation method:
- Whether called explicitly by user or guided by workflow, the skill must display a confirmation summary and wait for explicit human confirmation before taking effect.
- Without confirmation records, the skill MUST NOT write approval files, advance state, or execute code modifications.
- Scripts/hooks perform deterministic verification of state changes, approval records, and code modification entry conditions.

## 18. Code Repository Binding

Design phases may proceed without repo binding. Implementation phase requires binding one or more repos via `links/repos.json`:

```json
{
  "repos": [
    {
      "repoPath": "/path/to/project-a",
      "role": "primary-implementation-repo",
      "branch": "feature/FEAT-20260629-001"
    }
  ]
}
```

Optional lightweight pointer file in repo: `<repo>/.devsphere/current-task.json` (not committed to git by default).

## 19. Implementation Plan & Code Delivery

### Implementation Plan
- Generated by DEV agent after design approval.
- Must include: repos, expected module/file changes, step sequence, test/verify commands, rollback strategy, risk points, CIE needs.
- Normal tasks: plan generation → `implementation_planned`.
- High-risk or `strict-human-loop`: requires `implementation-plan-approval.json` before `implementation_planned`.

### Code Delivery
- First code change from `implementation_planned`: MUST display implementation summary (target repos, expected scope, verification commands, key risks) and wait for explicit human confirmation.
- After confirmation: status → `implementing`.
- Subsequent fixes and test additions while `implementing`: no repeated startup confirmation.
- Before declaring code complete: MUST generate diff summary (file list, change types, alignment with plan, notable scope deviations).
- Significant scope deviation: prompt human confirmation; write to implementation log.
- Code complete: status → `verification_ready`.

## 20. Verification & Test Handoff

`feature-verify` requires `status=verification_ready`. It runs local verification and generates the test handoff package.

Results:
- Pass + handoff generated → `completed`.
- Failed but fixable → back to `implementing`.
- Failed and unrecoverable → `blocked`.

Only `feature-verify` may set `status=completed`, and must satisfy:
- Local verification passed, or failed items explicitly accepted as risk.
- Test handoff package generated with: verification results, commands executed, untested items + reasons, change summary, impact scope, regression suggestions, known risks, environment/data prep suggestions, optional CI/CIE guidance.

## 21. Formal Artifacts vs Process Files

Process files all reside in task workspace. When needed for code review or PR, the workflow exports stable artifacts:
- Integrated design summary (from `integrated-design.md`)
- Implementation plan
- Test handoff package
- Key decision summary

The complete `.devsphere` process directory should NOT be committed to business code repos.

## 22. MVP Delivery Checklist

- [ ] Plugin manifest installable.
- [ ] Feature task workspace creatable.
- [ ] `state.json` readable/writable.
- [ ] `evidence-registry.json` generatable and updatable.
- [ ] Agent query results saveable as evidence process artifacts.
- [ ] Review matrix generatable and updatable.
- [ ] AI review-revision loop executable.
- [ ] Approval records generatable.
- [ ] Workflow/Skill/Hook prevents unapproved tasks from entering code implementation via plugin flow.
- [ ] Implementation plan generatable.
- [ ] Code delivery phase can read repo binding.
- [ ] Test handoff package generatable.

## 23. Out of Scope (MVP)

- Complete bugfix workflow.
- Complete refactor/performance optimization workflows.
- Self-built multi-agent scheduling engine.
- Full CI/CD or deployment automation.
- Standalone knowledge base service.
- Complex subagent parallel scheduling and agent-team orchestration.
- LSP, monitor, status line enhancements.
- `commands/` directory (MVP uses skills only).
- `final-handoff.md` (integrated-design summary chapter serves this purpose).
