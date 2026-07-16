# Feature Clarify Checklist 脚本与模板设计

- **状态:** 已确认
- **日期:** 2026-07-14
- **范围:** 新增 `scripts/feature-clarify.js`、`skills/feature-clarify/requirement-checklist.json`；修改 `skills/feature-clarify/SKILL.md`

## 1. 变更

### 1.1 新增 `skills/feature-clarify/requirement-checklist.json`

基于 `checklist.md` 的 8 类检查项 + 出口判定规则生成静态 JSON 模板。所有项初始 `result: "fail"`。作为模板被阶段0复制到任务工作区，自身不被运行时修改。

### 1.2 新增 `scripts/feature-clarify.js`

三个命令：

- `init <taskPath>` — 复制 checklist 模板到 `reviews/requirement-checklist.json`；初始化 `ambiguity-backlog.json`
- `check-complete <taskPath>` — 返回 `{complete, failures}`：checklist 全部 pass + backlog 无 open + requirement.md 有最终确认
- `read-checklist <taskPath>` — 返回 `{passed, failed, total, categories}`

### 1.3 修改 `skills/feature-clarify/SKILL.md`

- 阶段0：调用 `feature-clarify.js init` 替代手动初始化
- 阶段7a：删除动态初始化 JSON 的步骤（模板已由阶段0放置）
- 完成判断原则：改为引用 `check-complete` 脚本 + 用户确认

## 2. 不变式

- 状态推进唯一入口不变
- knowledge-query 规则不变
- designRevisionLimit 复用不变
- 阶段5、阶段8 结构不变
