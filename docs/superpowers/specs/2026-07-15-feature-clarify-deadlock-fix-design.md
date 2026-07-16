# feature-clarify 死锁修复与流程完善设计

日期：2026-07-15
状态：待评审

## 问题总览

需求澄清 skill 优化后存在 7 个问题，其中 2 个 P0 直接导致流程无法正确完成：

| # | 严重度 | 问题 | 根因 |
|---|--------|------|------|
| 1 | P0 | 最终确认与评审互相等待（死锁） | 7.8.8 初始 fail → 评审要求全部 pass → 阶段8才能 confirm-final |
| 2 | P0 | requirement.md 模板伪造"已确认"表象 | §11 模板预含确认文字 + checkComplete 仅做子串匹配 |
| 3 | P1 | 阶段5完成条件提前要求用户确认 | 完成判断原则含"用户已确认需求汇总"，实际在阶段8 |
| 4 | P1 | 评审轮次无存储/退出/接受机制 | reviewVersion 无持久化字段，达到上限无"waived"状态 |
| 5 | P1 | 最终确认后返工不使确认失效 | 无过期检测，旧确认可覆盖新需求 |
| 6 | P1 | Hook 不能保证角色边界 | CLI 豁免使主会话也能调 update-checklist |
| 7 | P1 | 测试与实现不一致 | 实现删除了 MUST NOT reuse/teammate，测试仍断言 |

## 设计原则

- 确认状态由 checklist 单一来源承载，requirement.md 不维护确认章节
- checklist 通过 `reserved` 字段区分主会话独占项和评审子 Agent 可更新项
- `evidence` 字段仅由评审子 Agent 写入，主会话不碰
- 确认时间由 checklist 文件 mtime 隐式承载

---

## 1. checklist 数据模型变更

### 1.1 item 新增 `reserved` 字段

```json
{
  "id": "7.8.8",
  "check": "用户已完成最终确认",
  "result": "fail",
  "reserved": true,
  "evidence": "",
  "note": ""
}
```

- `reserved`（boolean，可选，默认 false）：标记该项为主会话独占，评审子 Agent **不可更新**
- `update-checklist` CLI 硬拒绝更新 `reserved: true` 的项

### 1.2 `result` 枚举扩展

```
pass | fail | waived
```

- `waived`：评审轮次耗尽后，用户明确接受风险，不阻塞 `checkComplete`
- 仅主会话可设置 `waived`（通过新 CLI 命令 `waive-item`）

### 1.3 顶层新增 `reviewVersion`

```json
{
  "categories": [...],
  "reviewVersion": 0,
  "exitCriteria": {...}
}
```

- 评审子 Agent 每完成一轮通过 `update-checklist`（`incrementReviewVersion: true`）自动递增
- 主会话不直接修改此字段

---

## 2. Issue #1 (P0) — 解除死锁

### 变更点

| 文件 | 变更 |
|------|------|
| `requirement-checklist.json:94` | 7.8.8 加 `"reserved": true` |
| `reviewer-prompt.md:7` | 评审规则增加：跳过 `reserved: true` 的项 |
| `SKILL.md:148` | "全部 pass" → "所有非 reserved 项 pass" |
| `feature-clarify.js checkComplete` | `waived` 视为通过，`fail` 阻塞 |

### 流程

```
阶段7 → 评审子 Agent 检查 7.1–7.7 和 7.8.1–7.8.7（跳过 7.8.8）
     → 非 reserved 项全部 pass → 进入阶段8
阶段8 → 用户 confirm_gate → confirm-final 设 7.8.8 = pass → 完成
```

---

## 3. Issue #2 (P0) — 模板不再伪造确认

### 变更点

| 文件 | 变更 |
|------|------|
| `requirement.md:91-95` | 删除 §11 最终确认章节 |
| `feature-clarify.js checkComplete:72-81` | 删除 `content.includes('最终确认')` 检查 |
| `feature-clarify.js confirmFinal` | 仅改 result，不写 evidence/note/report |
| `feature-clarify.js updateChecklist` | 拒绝更新 `reserved: true` 的 item |

### confirm-final 行为

```
输入: 无（仅 taskPath）
操作: 将 checklist 7.8.8.result = "pass"
输出: { confirmed: true }
不写入 evidence、note，不修改 requirement.md
```

---

## 4. Issue #3 (P1) — 阶段5完成条件修正

### 变更点

| 文件 | 变更 |
|------|------|
| `SKILL.md:123-130` | 删除"用户已确认需求汇总" |
| `SKILL.md:123-130` | 改为"需求信息足够生成结构化需求文档（覆盖业务目标、核心场景、功能范围、验收标准）" |

阶段5仅定义"可生成需求文档"的入口条件，用户确认职责完全属于阶段8。

---

## 5. Issue #4 (P1) — 评审轮次可执行

### 5.1 reviewVersion 持久化

- 存储在 `reviews/requirement-checklist.json` 顶层 `reviewVersion` 字段
- `update-checklist` 支持可选参数 `incrementReviewVersion: true`
- 评审子 Agent 在完成本轮全部 item 更新后，附带 `incrementReviewVersion: true`

### 5.2 waived 状态 + waive-item CLI

```
node scripts/feature-clarify.js waive-item <taskPath> '<json-payload>'
```

payload 格式：
```json
{"items": [{"id": "7.3.2", "reason": "低风险，后续设计可覆盖"}]}
```

约束：
- 仅当 `checklist.reviewVersion >= state.designRevisionLimit` 时允许
- 仅主会话调用
- 将 item.result 设为 `"waived"`，note 记录 `"用户接受风险: {reason}"`

### 5.3 checkComplete 适配

- `pass` → 通过
- `waived` → 通过（不阻塞）
- `fail` → 阻塞

### 5.4 SKILL.md 阶段7b 变更

```
达到上限仍有 fail → 列出剩余 fail 项 → 用户裁决（waive 或继续）→ waive 后关闭循环
```

---

## 6. Issue #5 (P1) — 返工使确认失效

### 新增 CLI 命令

```
node scripts/feature-clarify.js check-stale-confirmation <taskPath>
```

逻辑：
```
checklist 7.8.8.result === 'pass'
  && requirement.md mtime > checklist mtime
  → 重置 7.8.8.result = 'fail'，返回 { stale: true }
否则 → 返回 { stale: false }
```

### 调用时机

- 阶段7 入口（进入评审前）
- 阶段8 check-complete 失败后返回阶段7 时

### 效果

requirement.md 被修改 → 确认自动过期 → 阶段8 重新要求用户确认 → 形成闭环。

---

## 7. Issue #6 (P1) — Hook 能力声明修正

### 变更点

| 文件 | 变更 |
|------|------|
| `reviewer-prompt.md` | 删除"只有评审子 Agent 可以更新"表述 |
| `SKILL.md` | 不声称角色边界 |
| `devsphere-guard.js` hook reason | 改写为："禁止直接 Write/Edit checklist；checklist 变更须通过 feature-clarify.js CLI" |

### Hook 实际保证的能力

- ✅ 禁止直接 Write/Edit `requirement-checklist.json`
- ✅ Bash 操作 checklist 必须通过 `feature-clarify.js update-checklist` 或 `confirm-final`
- ❌ ~~只有评审子 Agent 能更新 checklist~~（CLI 豁免使此约束不可强制执行）

---

## 8. Issue #7 (P1) — 测试对齐

### 变更点

| 文件 | 变更 |
|------|------|
| `skill-contracts.test.js:17-18` | 删除 `MUST NOT reuse agent IDs` 和 `MUST NOT use teammate` 断言 |

当前设计通过"每次均为新的 Task"已机制上保证不重用/不 teammate，不需要额外文本约束。

---

## 影响范围汇总

```
skills/feature-clarify/
  SKILL.md                     ← P1, P3, P4, P6
  reviewer-prompt.md            ← P1, P6
  requirement-checklist.json   ← P1, P4
  requirement.md               ← P2

scripts/
  feature-clarify.js            ← P1, P2, P4, P5
  test/skill-contracts.test.js  ← P7
  devsphere-guard.js            ← P6
```

---

## 不在范围内

- 不在 checklist 中引入除 `reserved`/`waived`/`reviewVersion` 外的其他字段
- 不修改 hooks.json 的 hook 注册
- 不改变阶段0–4、阶段6 的流程
