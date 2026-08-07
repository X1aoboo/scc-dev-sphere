# Stop Guard Format Tolerance Design

## 问题背景

Design Reviewer subagent 的 stop guard（`devsphere-guard.js` 的 `checkDesignReviewerStop`）通过严格正则匹配 reviewer 返回消息中的 `Design type:` 字段和 `# Design Review Failure` 标题来判断是否允许 stop。

弱模型（如 minimax）在实际返回时可能添加 markdown 强调语法（`**Design type**:`）或使用全角标点（`Design type：`），导致正则匹配失败，stop guard 始终 block，reviewer 陷入死循环。

## 目标

对 stop guard 依赖的所有文本格式做预防性兼容处理，覆盖：
- markdown 强调语法变体（`**`、`__`、`*`、`_`）
- 标点/空格变体（全角冒号 `：`、全角空格 `U+3000`、大小写）

## 方案：先归一化再匹配

在 `checkDesignReviewerStop` 内部对 `last_assistant_message` 做轻量预处理，清洗掉格式噪音后再用现有正则匹配。

### 组件 1：normalizeReviewerMessage 函数

在 `devsphere-guard.js` 中新增模块级辅助函数：

```js
function normalizeReviewerMessage(message) {
  return message
    // 剥离 markdown 强调语法：**bold**, __bold__, *italic*, _italic_
    .replace(/([*_]{1,2})(.+?)\1/g, '$2')
    // 全角冒号 → 半角冒号
    .replace(/：/g, ':')
    // 全角空格（U+3000）→ 半角空格
    .replace(/　/g, ' ');
}
```

在 `checkDesignReviewerStop` 中替换原始赋值：

```js
const message = normalizeReviewerMessage(input.last_assistant_message || '');
```

**设计要点：**
- markdown 剥离用 `\1` 反向引用保证成对匹配，不会误删散落的单个 `*`（如列表项）
- 归一化只做确定性字符替换，不做语义猜测
- 函数只作用于 stop guard 消息解析，不影响 reviewer agent 实际输出
- 需加入 `module.exports` 以便测试引用

### 组件 2：正则适配

归一化后消息已无 markdown 语法和全角字符，正则只需加 `i` flag 做大小写不敏感匹配：

**Failure 检测（第 154 行）：**

```js
// 修改前
if (/^# Design Review Failure\b/m.test(message)) return null;

// 修改后
if (/^# Design Review Failure\b/im.test(message)) return null;
```

**Design type 解析（第 161 行）：**

```js
// 修改前
const match = message.match(/Design type:\s*(\S+)/);

// 修改后
const match = message.match(/Design type:\s*(\S+)/i);
```

正则结构完全不变。`DESIGN_TYPE_KEYS.includes(target)` 检查不需要改 — 拼写变体不在本次范围内。

### 组件 3：测试覆盖

**normalizeReviewerMessage 单元测试：**
- `**Design type**: businessDesign` → `Design type: businessDesign`
- `*Design type*: businessDesign` → `Design type: businessDesign`
- `__Design type__: businessDesign` → `Design type: businessDesign`
- `Design type： businessDesign`（全角冒号）→ `Design type: businessDesign`
- 全角空格变体 → 半角空格
- 列表项 `- *item*` 中单个 `*` 不被误删

**checkDesignReviewerStop 集成测试：**
- 成功路径：`**Design type**: businessDesign` 能正确解析并通过校验
- 失败路径：`# **Design Review Failure**` 归一化后匹配 Failure 标题，正确放行
- 大小写变体：`design type: businessDesign` 能正确解析
- 兜底不变：无法解析 design type 时仍 block 并返回原有 reason

## 改动范围

| 文件 | 改动 |
|------|------|
| `scripts/devsphere-guard.js` | 新增 `normalizeReviewerMessage`；修改 `checkDesignReviewerStop` 消息预处理 + 两处正则加 `i` flag；加入 exports |
| `scripts/test/` 下 guard 相关测试 | 新增 normalize 和 stop guard 兼容性测试用例 |
