---
name: feature-design
description: 设计阶段薄编排器。在主会话运行:按阶段顺序派发 owner agent(脚本生成派发 prompt)、代问 gated decision、派评审、人工批准。依赖 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1。
---

# Feature Design — 设计阶段薄编排器

你在主会话运行(agents=[])。按阶段顺序驱动设计,核心动作由确定性脚本支撑,你不自由发挥派发词。

## 阶段顺序

businessDesign → solutionDesign → implementationDesign → testDesign →(全完成)integrated-design。

## 循环(对每个未完成阶段)

1. **选阶段**:找第一个未 `human_approved` 的设计阶段 `<stage>`,记其 owner agent `<role>`(sa/se/mde/tse)、design skill `<skill>`(完整名)、slug。
2. **算 humanGated**:`humanGated = (workflowMode==='strict-human-loop') || (workflowMode==='collaborative-design' && humanGateStages.includes(<stage>))`。
3. **派发 owner**(轮1):
   ```bash
   node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-dispatch.js build design <role> <stage> <taskPath> <skill> <humanGated> <workflowMode>
   ```
   把 stdout **原样**作为 Agent tool 的 prompt 派发 `<role>` teammate(后台)。**从 Agent 返回捕获 agentId**,记 per-stage。等 agent 自动推送的完成消息。
4. **分支**:
   - humanGated=true:agent 报「N 项 gated decision 待代问」→ 读 `<taskPath>/decisions/<slug>-decisions.json` 的 gated pending → 逐项 AskUserQuestion(见 references/interaction-guidelines.md decision_loop)→ `node devsphere-decisions.js resolve <taskPath> <slug> <id> '<resolution json>'` 回写 → 全 resolved 后 `SendMessage`(to=agentId,message=决议+续稿指令,**summary** 必填)唤醒 → 等 draft 完成消息。
   - humanGated=false:agent 不停(记 autonomous 直接续稿)→ 等 draft 完成消息。
5. **sync**:`node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js sync-stage-status ${CLAUDE_PROJECT_DIR}`。
6. **评审循环**:对 `<stage>` 的评审者矩阵(+ ciCdRisk=true 含 CIE)——每人:
   ```bash
   node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-dispatch.js build review <reviewer-role> <stage> <taskPath> scc-dev-sphere:feature-review <taskPath>/artifacts/<slug>.md
   ```
   并行派发(各 background,capture agentId)。等评审完成。
   - blocking>0:把 blocking 回流 owner → 用 `build design ...` 重新派发 ownerId(revise)→ owner 对需用户决策的 blocking 补 gated decision(humanGated 时)→ 回 step4 代问 → 续稿 → 重新评审。循环至 blocking=0。
   - blocking=0:`sync-stage-status`(→ ai_review_passed)。
7. **人工批准**:humanGated 阶段 AskUserQuestion(confirm_gate)请用户批准 → `node ... feature-workflow.js set-stage-status <taskPath> <stage> human_approved`。非 humanGated 阶段跳过。
8. 回 step1(下一阶段)。

## 完成判断

全 4 阶段 human_approved → 进入 integrated-design(既有逻辑)。

## 约束

- **不自行写派发词**——一律 `devsphere-dispatch.js build` 生成。
- **不直接写设计产物**——产物由 teammate 写;你只写 resolution(代问后经 CLI)。
- **SendMessage 的 message 为字符串时必带 summary**。
- 同一 stage 续稿用 SendMessage 恢复 agentId,不重新 Agent 派发(保活)。
