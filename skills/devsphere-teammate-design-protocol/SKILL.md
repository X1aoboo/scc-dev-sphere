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
