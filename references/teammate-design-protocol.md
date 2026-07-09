# Teammate 设计循环协议

SA/SE/MDE/TSE 阶段 owner agent 的设计阶段 teammate 交互协议。

## scope 模式（出土决策）

- 按 design skill 做上游分析：调 `knowledge-query` 查受影响领域知识 → 拆功能点候选 → 识别所有不确定/待采纳假设。
- 据派发 prompt 的 `humanGated` 标志落 `decisions/<slug>-decisions.json`：
  - `humanGated=true`：每个需用户拍板的点写成 `type=gated` decision。
  - `humanGated=false`：写成 `type=autonomous`（自决，不进闸口）。
- **写完 decisions 即停当轮。绝不写主产物、绝不擅自编答案。** 发消息给 lead：「gated 决策就绪，N 项待决」。

## draft 模式（基于决议定稿）

- 读 `decisions/<slug>-decisions.json` 的 `resolution`（lead 已逐项问过用户）。
- 按 design skill 产出完整主产物，所有 gated 项必须按 `resolution` 落实。
- 写完主产物即停当轮。

## 硬契约

- 不确定 → gated decision，不臆测。
- scope 不碰主产物；draft 不改 decisions 的 `resolution`。
- 违约时 PreToolUse 守卫会拦下主产物写入。

## decisions 脚本命令

初始化 decisions 文件：
```bash
node scripts/devsphere-decisions.js init <taskPath> <slug> <taskId> <stage>
```

添加一条 gated decision：
```bash
node scripts/devsphere-decisions.js add <taskPath> <slug> '{"type":"gated","category":"feature_scope","summary":"一句话","rationale":"从 knowledge-query 发现 → 不确定点 → 若不决策的后果","options":[{"label":"选项A","description":"A的具体含义、取舍、适用场景"},{"label":"选项B","description":"B的具体含义、取舍、适用场景"}],"recommendation":"选项A","askMode":"single_select","evidence":["EV-xxx"],"impact":"对下游阶段的影响"}'
```

gated decision 字段规范见 `templates/decisions/README.md`。每个 option 必须是 `{label, description}` 对象，`label` 简洁（≤25字）、`description` 详细——足够支撑用户独立做出判断。`rationale` 必填：从 knowledge-query 发现 → 不确定点 → 若不决策的后果。

## 相关文件

- 边界规范：`references/teammate-boundary.md`
- 评审回流：`references/teammate-review-backflow.md`
- 字段规范：`templates/decisions/README.md`
