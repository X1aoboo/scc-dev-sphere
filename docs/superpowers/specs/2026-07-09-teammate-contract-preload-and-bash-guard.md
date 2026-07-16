# Teammate 契约预加载 + Bash 绕过守卫 设计

- **状态:** 已通过设计评审
- **日期:** 2026-07-09
- **关联:** 原 spec `2026-07-09-design-stage-decision-loop-design.md`、Plan C `2026-07-09-decision-format-fix.md`、Plan D `2026-07-09-design-loop-teammate-protocol-fix.md`
- **定位:** Plan C/D 落地后实跑暴露两个回归——(1) `businessDesign` 门禁阶段所有决策被 SA 自决、用户未被问;(2) decisions 文件被写成自创 schema、守卫未拦住。经 debug 日志逐行实证,定位为**两个独立根因**:teammate 契约丢失(Plan C 把契约移出 agent 系统提示词)+ Bash 绕过(teammate 被 Write 守卫拒后改用 Bash 写文件)。本 spec 修补两者。

---

## 1. 实证根因(debug 日志 `7eb62232`)

### 1.1 RC1 — teammate 契约丢失(Plan C 回归)

Plan C(`2026-07-09-decision-format-fix`)为消除"散弹式修改",把 teammate 协议从 `agents/{sa,se,mde,tse}.md` 内联改为 `references/teammate-*.md` 链接。

**查证(claude-code-guide + 实证):** subagent/teammate 启动时只注入 `agents/<role>.md` 系统提示词正文 + 环境信息 + CLAUDE.md + frontmatter `skills:` 预加载项。**系统提示词里的 markdown 链接被视为纯文本,不会自动 Read。** 实证:失败 session 中 teammate 对 `teammate-design-protocol.md` 的 Read 次数 = 0;`grep "scope 模式\|devsphere-decisions.js\|type=gated\|绝不" agents/sa.md` = 0(全是链接,0 内联契约)。

**后果:** SA teammate 根本不知道 scope/draft 模式、`type=gated` 决策、CLI 脚本、"绝不编答案"硬契约。它把 scope 当通用业务分析,写出 `needsConfirmation:false` 的自决式 decisions(无 `type:gated`)。`countGatedPending` 返回 0 → resolver 跳过 `ask_decisions` → **用户从未被问**(投诉1)。

### 1.2 RC2 — Bash 绕过(守卫功能缺口)

debug 日志逐行还原:
- **13:38:27** — 守卫 `check-decisions-format` **正常触发并 deny** teammate 的 Write(理由:JSON 解析失败)。证明:守卫逻辑正确;**teammate 确实触发 lead 的 plugin hook**(继承无问题)。
- **13:39:14** — 被 deny 后,teammate 下一个动作是 `tool=Bash`(非 Write);坏文件随即落盘。

**结论:** 守卫 matcher 是 `Write|Edit`,**不匹配 Bash**。teammate 被 Write 拒后改用 Bash(`cat > decisions/x.json << EOF` 等)写文件,绕过守卫。**这是守卫的功能缺口**(用户直觉"守卫实现有误"成立)——只堵 Write/Edit,漏了 Bash 这条等价写文件途径。

### 1.3 连带:状态同步失效(F4)

task 停在 `assessed`、阶段全 `not_started` 但产物已落盘。同因:`PostToolUse:Write → sync-artifact` 也只匹配 Write 工具;若 teammate 用 Bash 写产物,sync 不触发 → 阶段状态不推进。

---

## 2. 设计查证结论(官方机制)

| 事实 | 来源 |
|---|---|
| agent frontmatter `skills:` 字段:所列 skill 的**完整 SKILL.md 在派发时强制注入** teammate 上下文 | claude-code-guide(sub-agents.md) |
| markdown 链接在系统提示词中**不自动 Read** | 同上 + 实证 |
| `--dangerously-skip-permissions` **不绕过** PreToolUse hooks(hooks 正常触发) | 用户确认 + 实证(13:38:27 守卫触发) |
| teammate(独立 session)**会触发** lead 的 `--plugin-dir` plugin hooks | 实证(13:38:27 teammate 的 Write 触发了守卫) |
| PreToolUse `Bash` matcher 可拦截 Bash 命令(`tool_input.command`) | hooks.md |
| `devsphere-decisions.js` CLI 走 Node `fs.writeFileSync`,**不触发** Write hook;argv 是 `taskPath + slug`,**不含 `decisions/` 字符串** | 代码实证 |

**保留 agent-teams teammate 保活模型**(用户硬约束:设计 agent 跨用户交互间隙保活,subagent 不支持)。SA 仍是 decisions 写者(有设计上下文;lead 不碰设计内容——否决"lead 转写"方案 Y,因 lead 缺设计上下文会引入理解偏差)。

---

## 3. Part E1:teammate 契约预加载(治 RC1)

### 3.1 三个预加载 skill(命名带 teammate)

把现有 `references/teammate-*.md` 内容转为 skill,用 frontmatter `skills:` 强制注入:

| Skill 路径 | 内容 | 预加载 agent(frontmatter `skills:`) |
|---|---|---|
| `skills/devsphere-teammate-design-protocol/SKILL.md` | scope/draft 模式 + 硬契约 + **verbatim `devsphere-decisions.js init/add` 命令** + 「humanGated 阶段每个不确定点必须 `add` 写成 `type=gated, status=pending`;**`needsConfirmation:false` 自决是违约**」+ canonical schema 提醒 + 完成消息格式 | sa/se/mde/tse |
| `skills/devsphere-teammate-boundary/SKILL.md` | 不调 AskUserQuestion + askMode 语义 + gated/blocking 回流通路 | 全部 6 个 |
| `skills/devsphere-teammate-review-backflow/SKILL.md` | blocking→revise→owner 回流 + 决策创作权在 owner | 全部 6 个 |

### 3.2 agent frontmatter 改动

- `agents/{sa,se,mde,tse}.md` frontmatter 加:`skills: [devsphere-teammate-design-protocol, devsphere-teammate-boundary, devsphere-teammate-review-backflow]`
- `agents/{cie,dev}.md` frontmatter 加:`skills: [devsphere-teammate-boundary, devsphere-teammate-review-backflow]`
- 移除各 agent 文件里的 `## teammate 交互协议` 链接段(由 frontmatter 预加载取代)。
- skill **不设** `disable-model-invocation`(否则无法预加载)。

### 3.3 清理

删除 `references/teammate-design-protocol.md`、`teammate-boundary.md`、`teammate-review-backflow.md`(内容迁入 skill,不再被链接)。

### 3.4 design-protocol skill 关键内容(治本)

scope 模式段明确写死:
- humanGated=true 时,**每个**不确定/待采纳点必须用 `devsphere-decisions.js add` 写成 `type=gated`(含 `options` 2-4、`recommendation`、`askMode`、`rationale`、`evidence`、`impact`)。
- **绝不**写成 `needsConfirmation:false` / `type=autonomous` 自决(humanGated 阶段这是违约)。
- decisions 文件**只能**经 CLI 增删改(init/add/resolve);**禁止**用 Write/Edit/Bash 直接写(守卫会拦)。
- 写完 decisions 即停,发完成消息给 lead(格式 + 「此消息是 lead 推进的唯一触发」)。

---

## 4. Part E2:Bash 绕过守卫(治 RC2 + F4)

### 4.1 规则

新增 PreToolUse `Bash` matcher 守卫 `check-decisions-bash`:

```
command = tool_input.command
若 command 匹配 /(decisions|artifacts)\//  且  command 不含 "devsphere-decisions.js"  →  deny
否则放行
```

**为什么是 `decisions/` 和 `artifacts/`(带斜杠路径段):**
- 拦 Bash 直接写 design-critical 文件:`cat/echo/printf/tee/heredoc/重定向/node -e fs` 写 `decisions/` 或 `artifacts/` 路径 → deny。
- **CLI 天然免疫:** `node devsphere-decisions.js init/add/resolve <taskPath> <slug>` 的 argv 是 taskPath+slug,**不含 `decisions/`**,且命令含 `devsphere-decisions.js` → 双重放行。
- 脚本名 `devsphere-decisions.js`(无斜杠)不会被 `decisions/` 误伤。
- 带斜杠避开脚本名;`artifacts/` 同理覆盖主产物(强制走 Write 工具 → 触发 `check-decisions-resolved` 守卫 + `sync-artifact`,治 F4)。

### 4.2 守卫栈(SA 写 decisions/artifacts 的确定性)

| 途径 | 守卫 | 结果 |
|---|---|---|
| Write/Edit 写 `decisions/**` | D2 `check-decisions-format` 内容校验 | 非 canonical → deny |
| Write/Edit 写主产物(`artifacts/*.md`) | `check-decisions-resolved`(gated pending>0 时 deny) | 未 resolved → deny |
| Bash 写 `decisions/` 或 `artifacts/` | **新 `check-decisions-bash`** | deny(堵绕过) |
| Bash `node devsphere-decisions.js add ...`(CLI) | 不含 `decisions/` + 含脚本名 | ✅ canonical 落盘 |
| Bash `node devsphere-decisions.js` 写后 | PostToolUse 不触发(fs),但 TeammateIdle 磁盘校验兜底 | 非法 → exit 2 |

### 4.3 残留风险(可接受)

唯一漏网:`cd .../decisions && cat > x.json`(cd 后相对路径,命令行无 `decisions/`)。但 F1 skill 教 SA 用 CLI(正常不会这么干);且下游 `countGatedPending`/主产物守卫会暴露不一致。完全堵死需"lead 转写"(方案 Y,已否决)。当前规则已把绕过面收到极小。

### 4.4 实现

`scripts/devsphere-guard.js` 新增 `checkDecisionsBashFromStdin(stdinJson)`:
- 读 `tool_input.command`;非字符串 → 放行。
- `/(decisions|artifacts)\//.test(command) && !command.includes('devsphere-decisions.js')` → 返回 deny(reason:「design 文件(decisions/artifacts)禁止用 Bash 直接写;decisions 用 `devsphere-decisions.js` CLI,artifacts 用 Write 工具」)。
- 否则放行(null)。

`hooks/hooks.json` 新增 PreToolUse 条目:`matcher: "Bash"` → `check-decisions-bash`。

---

## 5. Part E3:派发 prompt 兜底(F2)

`skills/feature-design/SKILL.md` 的 `dispatch_agent (scope/draft)` 派发行,派发 prompt 内嵌关键规则 + verbatim CLI(兜底:万一 `skills:` 预加载对 agent-teams 不生效,派发 prompt 仍送达):

```
派发 prompt 含：
- mode（scope/draft）、stage、humanGated
- 一行硬规则：「decisions 只能用 devsphere-decisions.js CLI 改（init/add/resolve）；
   禁止 Write/Edit/Bash 直接写 decisions/ 和 artifacts/（守卫拦）。humanGated 阶段
   每个不确定点 add 写成 type=gated、绝不自决。完整契约见预加载的
   devsphere-teammate-design-protocol skill。」
- verbatim `add` 命令模板
```

三层防线:F1 skill 预加载(完整契约)+ F2 派发 prompt(关键规则)+ 守卫 deny(违约兜底)。

---

## 6. Part E4:状态同步核查(F4)

E2 的 Bash 守卫强制 artifacts 走 Write 工具 → `PostToolUse:Write → sync-artifact` 触发 → 阶段状态正确推进(治 F4 主因)。实施时核查:
- `assessed → designing` 迁移:确认 feature-workflow.js 在进入设计时是否置 `designing`(若 task 全程留 `assessed` 由 feature-design 内部驱动 stage status,记录该设计)。
- `sync-stage-status` 在 artifact 经 Write 落盘后是否正确置 `drafted`(gated pending=0 时)。

---

## 7. 影响面汇总

| 文件 | 改动 | 类别 |
|---|---|---|
| `skills/devsphere-teammate-design-protocol/SKILL.md` | **新建**(scope/draft 契约 + CLI + needsConfirmation 违约规则) | E1,内容 |
| `skills/devsphere-teammate-boundary/SKILL.md` | **新建**(边界规范) | E1,内容 |
| `skills/devsphere-teammate-review-backflow/SKILL.md` | **新建**(评审回流) | E1,内容 |
| `agents/{sa,se,mde,tse}.md` | frontmatter 加 `skills:`;移除链接段 | E1,内容 |
| `agents/{cie,dev}.md` | frontmatter 加 `skills:`(2 个) | E1,内容 |
| `references/teammate-*.md`(3 个) | **删除**(内容迁入 skill) | E1,清理 |
| `scripts/devsphere-guard.js` | 新增 `checkDecisionsBashFromStdin` + CLI `check-decisions-bash` | E2,可 TDD |
| `scripts/test/devsphere-guard-decisions.test.js` | Bash 守卫测试(拦 cat/echo/heredoc/node-e,放行 CLI) | E2,测试 |
| `hooks/hooks.json` | 新增 PreToolUse `Bash` → `check-decisions-bash` | E2 |
| `skills/feature-design/SKILL.md` | scope/draft 派发 prompt 内嵌契约+CLI(E3) | E3,内容 |
| `CLAUDE.md` | 更新:teammate 契约预加载 + Bash 守卫说明 | 文档 |
| `docs/superpowers/specs/2026-07-09-design-stage-decision-loop-design.md` | §4.4 补 Bash 守卫 + skill 预加载 | 文档 |

---

## 8. 验证项

- E1 skill 预加载对 agent-teams teammate 是否生效:派发 SA 后检查其是否按契约产出 `type=gated` 决策(实跑场景验证)。
- E2 Bash 守卫:单测覆盖各绕过命令 + CLI 放行;实跑确认 teammate 被 Write 拒后无法改用 Bash。
- E4 状态同步:实跑确认 artifact 经 Write 落盘后 stage 推进到 `drafted`。

---

## 9. 计划拆分

- **Plan E2(脚本守卫,可 TDD,先发):** `checkDecisionsBashFromStdin` + CLI + hooks.json `Bash` matcher + 测试。确定性、`node:test` 覆盖。
- **Plan E1(skill/agent 内容层,后发):** 3 个 teammate skill + 6 个 agent frontmatter + 删 references + feature-design 派发 prompt + 文档。依赖 E2 守卫契约;靠实跑场景验证。
