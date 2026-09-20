# 人工设计变更 Design Manual Change Skill

- **状态：** 已确认
- **日期：** 2026-09-20
- **范围：** `scripts/devsphere-design.js`（`reopenDesign` 增加 protect 模式、新增 `recordManualReview`）、`scripts/devsphere-cli.js`（`design reopen --mode`、`design record-manual-review`）、`skills/design-manual-change/SKILL.md`（新增）、`scripts/test/design-manual-change-contract.test.js`（新增）、`README.md`（技能表）
- **不在范围：** 下游设计基线的级联失效（与正常 reopen→review→publish 路径行为一致，不额外处理）；未发布设计的首次人工发布；归档任务的变更（先 `design-active` 激活）；`approve`/`publish`/`designReady` 等现有校验代码的改动（零改动）

## 1. 背景与目标

设计基线发布后若发现问题，现有正规路径是 `design-reopen` → lint → **隔离 AI Reviewer** → 人工批准 → publish。对于用户已亲自检视、亲自修复的场景，AI 语义评审是重复劳动；但用户直接手改 draft 会导致 `draft.hash ≠ artifact.hash`，`inspectDesign` 进入 `needs_user_confirmation`，下游设计入场（`validateDesignEntry`）与总体验收（`designReady`）全部失败关闭。

本设计新增用户可调用的 `design-manual-change` Skill：人工直接修改 draft、**跳过隔离 AI Reviewer**（默认人工已检视完成）、保留确定性 lint，随后同步补记评审与审批，使整条哈希链（lint → review → approval → publish → designReady → 下游入场）一致性校验全部通过。

```
已发布基线 ── reopen(历史快照+版本升级) ──▶ draft
                          ┌───────────────┴────────────────┐
                    draft 与基线一致                  draft 已被人工修改
                    （完整回迁后用户改）              （保护已改 draft）
                          └───────────────┬────────────────┘
                                          ▼
                        用户人工修改/检视 draft ──▶ lint（保留，AI 辅助修复受保真约束）
                                          ▼
                            补记人工检视评审（record-manual-review）
                                          ▼
                                  人工批准（approve-current-design）
                                          ▼
                                  publish（新基线+新哈希）
                                          ▼
                        下游入场 / 总体验收 一致性校验天然通过
```

## 2. 已确认决策

| 决策点 | 结论 |
|---|---|
| 质检跳过边界 | 跳过**隔离 AI Reviewer**（语义/专业评审）；**保留确定性 lint**（frontmatter/结构/占位符/格式机械校验）。publish 硬门槛 `lint.draftHash === draft.hash` 不动 |
| 编辑时序 | **双分支支持**，分流依据 `design inspect-design` 的 `recovery` 状态：`baseline_complete`（draft 与基线一致）→ `standard`（reopen 后暂停，用户编辑 draft，确认后继续）；`needs_user_confirmation`（draft 与基线不一致，即已有人工修改）→ `protect`（保护已改 draft 不被覆盖） |
| 适用范围 | **仅存在已发布基线的设计**（`artifact` 存在，涵盖上述两种 recovery）；未发布设计的首次发布不支持（正常流程覆盖，无校验断裂痛点） |
| 实现方案 | 新增 `design record-manual-review` 补记评审 + `design reopen --mode protect`；`approveCurrentDesign`/`publish`/`designReady`/`validateDesignEntry` **零改动**（review 记录形状与现有 schema 完全兼容） |
| lint 失败处置 | AI **辅助修复**，受**内容保真约束**：仅机械性修正（frontmatter、固定结构标题、格式、以用户已写内容为基础的占位符最小补全）；**禁止裁剪/删除/概括/改写用户设计变更内容**；无法保真修复时停止并交回用户；修复 diff 必须经用户确认后重跑 lint |
| Skill 与 draft 内容 | Skill 不得主动修改 draft；唯二例外：① CLI 版本号 +1（用户修改前、frontmatter 单字段）② lint 辅助修复（受保真约束 + diff 确认环） |
| 变更原因 | 必填，写入审计记录 |
| 人工批准 | `approve-current-design` 前必须向用户呈现变更摘要并获明确确认（Human-in-loop 不变） |
| 审计区分 | review 记录 `reviewer: 'human'`、`manual: true`、`reason`；approval summary 带 `manual-design-change:` 前缀——与 AI 评审记录可明确区分 |
| 调用方式 | `disable-model-invocation: true`，仅用户在主会话显式调用 |
| 任务状态 | reopen 后 `sync-design-status` 回落 `designing`；publish 后再次 sync 回升（`design_ready`） |

## 3. 组件与契约

### 3.1 `design reopen --mode <standard|protect>`（扩展现有动作）

`standard`（默认）：现有行为不变。`protect`（新增，服务已有人工修改分支）：

| 步骤 | standard | protect |
|---|---|---|
| 历史快照：基线 → `artifacts/history/<slug>/<版本>/`（文档+资产） | ✅ | ✅ 不变 |
| draft 资产目录 | 删除后由基线资产覆盖 | **不动**（用户可能连资产一起改了） |
| draft 内容 | ← 基线内容 + `bumpMajorVersion` | **当前 draft 原地 `bumpMajorVersion`**（不回迁、不覆盖） |
| 删除基线文档/资产、approval、review 状态、lint 状态 | ✅ | ✅ 不变 |

前置校验：`protect` 要求 draft 存在（不存在报错提示改用 standard）；`bumpMajorVersion` 作用于当前 draft 的 frontmatter version（格式被改坏时报错拦截）。CLI 选项：`reopen` 允许选项增加 `mode`，取值仅 `standard|protect`，非法值报错。

### 3.2 `design record-manual-review --task-path --design-type --input-file`（新增动作）

入参 JSON：`{ "reason": "<变更原因>" }`（必填非空字符串）。

前置校验（全部先于任何写入，失败无副作用）：

1. draft 存在；lint 通过且绑定当前 draft（`currentLintStatus`：`lint.status === 'pass' && lint.draftHash === draft.hash`）；
2. 无既有 review 状态（`review.json`/`review.md` 均不存在；存在则报错"review state already exists; reopen first"，防止覆盖 AI 评审记录）；
3. 存在 `artifacts/history/<slug>/`（standard/protect 两种 reopen 均会创建历史快照；从未发布过基线的设计没有该目录 → 拒绝，落实 §2 "仅已发布基线" 的脚本级拦截）；
4. `reason` 非空。

写入两个文件（与现有 review schema 完全兼容，`validate-review`/`approve-current-design`/`publish` 现有校验零改动通过）：

- `work/<slug>/review.md`（人工检视报告）：设计类型与版本、变更原因、"人工已检视完成，豁免隔离 AI Reviewer"声明、时间戳、draft 哈希；
- `work/<slug>/review.json`：
  - `schemaVersion: 3`、`status: 'pass'`
  - `reviewer: 'human'`、`manual: true`、`reason`
  - `findingSummary: { blocking: 0, advisory: 0, risk: 0, total: 0 }`
  - `checklists` = 当前 Review Policy 的全部 `required` + `conditional` 项（人工检视声明覆盖）、`notApplicable: []`（满足 `reviewDispositionIssue` 校验）
  - 四重绑定：`reviewKey: '<designType>:<semanticHash>'`、`policyHash`（当前 Policy 哈希）、`draftHash`、`semanticHash`
  - `reportHash = sha256(review.md)`

返回写入的 summary JSON。

### 3.3 `skills/design-manual-change/SKILL.md`（新增）

frontmatter：`name: design-manual-change`、中文描述、`disable-model-invocation: true`。

执行步骤：

1. **定位目标**：`state get-task-path` 取当前任务 → 对四种设计类型逐一 `design inspect-design` → 过滤出 `artifact` 存在的（即 `recovery` 为 `baseline_complete` 或 `needs_user_confirmation`）→ 用户单选一个；无可选时提示"无已发布基线的设计"并终止；
2. **分流**：`recovery === 'baseline_complete'` → `design reopen --mode standard` 后**暂停**，提示用户直接编辑 `work/<slug>/draft.md`（及配套资产），等待用户确认改完；`recovery === 'needs_user_confirmation'` → 识别为已有人工修改，`design reopen --mode protect`（保护已改内容）；
3. reopen 后 `workflow sync-design-status`（任务状态回落）；
4. **收集变更原因**（必填，自然语言提问）；
5. `design lint`：失败时辅助修复，受内容保真约束（见 §2）；修复后向用户展示改动 diff，确认后重跑至通过；
6. `design validate-draft`（现有完成门槛）；
7. `design record-manual-review --input-file {"reason": ...}`；
8. **人工批准**：向用户呈现变更摘要（原因、新旧版本、lint 结果），明确确认后执行 `design approve-current-design --input-file {"approvedBy": "human", "summary": "manual-design-change: <原因>"}`；用户不确认则终止，不写 approval；
9. `design publish` → `workflow sync-design-status`；
10. 摘要：新基线版本/路径/哈希、历史快照位置、`reviewer: 'human'` 审计标记、下游一致性已恢复。

规则（SKILL.md `## 规则`）：

- **仅用户显式调用**；
- **内容保真**：不得主动修改 draft 及配套资产；唯二例外见 §2；lint 辅助修复禁止裁剪/删除/概括/改写用户变更内容，无法保真修复时交回用户；修复 diff 须经用户确认；
- **批准前确认**：approval 记录写入前必须获用户明确确认；
- **确定性执行**：reopen/评审补记/批准/发布/状态同步全部委托 CLI，Skill 不自行拼接路径或写状态文件；
- **非法输入拦截**：无基线、lint 未过、已有 review 状态等由脚本拦截，Skill 透传并终止。

### 3.4 README

技能表设计通用能力行增加 `design-manual-change` 链接。

## 4. 数据流与错误处理

### 4.1 哈希链

```
用户改 draft ──▶ lint.json.draftHash = H(new draft)
            ──▶ review.json.draftHash/semanticHash/reviewKey/policyHash = 绑定 new draft + 当前 Policy
            ──▶ approval.draftHash = H(new draft)（approve-current-design 现有逻辑）
            ──▶ publish 校验 artifact.hash === draft.hash 后复制为新基线
            ──▶ designReady / validateDesignEntry 校验 approval.draftHash === artifact.hash ✅
```

每一步复用现有校验函数，无新增旁路。

### 4.2 错误处理

| 场景 | 行为 |
|---|---|
| 无已发布基线的设计（从未发布） | Skill 入口过滤 + 脚本级拦截（`record-manual-review` 要求 `artifacts/history/<slug>/` 存在） |
| protect 模式下 draft 不存在 | CLI 报错提示改用 standard |
| draft version frontmatter 被改坏 | `bumpMajorVersion` 报错拦截 |
| lint 失败 | AI 辅助机械性修复（保真约束）+ diff 确认环；无法保真修复交回用户；不绕过 lint |
| record-manual-review 时已有 review 状态 | 报错 "reopen first"，防止覆盖 AI 评审记录 |
| reason 缺失/为空 | CLI 拒绝 |
| 用户拒绝批准 | 流程终止于批准前，无 approval 记录 |
| reopen 无有效基线 | CLI 报错（现有行为） |

## 5. 测试

新增 `scripts/test/design-manual-change-contract.test.js`（node:test，沿用临时 workspace 约定）：

| 测试组 | 断言 |
|---|---|
| reopen protect | 已改 draft 内容逐字保留（仅 version +1）；draft 资产不被覆盖；历史快照取自基线原内容；基线/approval/review/lint 状态清除；draft 不存在时报错 |
| reopen standard 回归 | 默认 mode 行为与现状完全一致 |
| `--mode` 非法值 | CLI 拒绝 |
| record-manual-review 写入 | 前置 lint 绑定通过后写入 review.md + review.json；`validate-review` 通过；`approve-current-design` 成功；`publish` 成功产出新基线；`designReady` 有效（**全链路 e2e**） |
| record-manual-review 拒绝 | reason 缺失 / lint 未过或未绑定 / 已有 review 状态，三种均报错且无写入 |
| 审计区分 | review.json 含 `reviewer: 'human'`、`manual: true`、reason；approval summary 含 `manual-design-change:` 前缀 |
| SKILL.md 合同 | frontmatter `name`、`disable-model-invocation: true`；执行步骤数与关键 CLI 短语（`reopen`、`lint`、`record-manual-review`、`approve-current-design`、`publish`）；分流逻辑（recovery 状态）；内容保真与批准前确认规则存在 |
| 下游一致性 | 手动变更 + publish 后 `workflow validate-design-entry`（下游入场）通过 |

## 6. 边界与后续

- **不做**：下游基线级联失效（上游变更后下游基线语义过期）——与正常 reopen 路径行为一致；如需级联，另立设计；
- **不做**：未发布设计的首次人工发布；归档任务（先 `design-active`）；
- **已知行为**：`checklists` 标记为人工检视声明覆盖（`reviewer: 'human'` 承担审计语义），不逐项记录人工检查过程；
- **已知行为**：lint 辅助修复的"保真"由 Skill 规则 + diff 确认环保障（Human-in-loop），无机械校验。
