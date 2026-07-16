# Skill 脚本路径解析修复 — 设计文档

**日期:** 2026-07-07
**状态:** approved

## 1. 问题

`/scc-dev-sphere:workflow` 查询项目目录下的 `.devsphere/` 工作空间目录时存在 bug：resolver 脚本在插件根目录而非用户项目目录中执行，导致找不到 `.devsphere/`，误报「未找到活跃任务」。

### 1.1 根因

3 个 skill 文件中的脚本调用使用 `.` 作为 workspace root 参数：

| 文件 | 调用 |
|------|------|
| `skills/workflow/SKILL.md` | `node .../devsphere-workflow.js .` |
| `skills/feature-init/SKILL.md` | `node .../devsphere-workspace.js create-feature-task . <id> ...` |
| `skills/status/SKILL.md` | `node .../devsphere-workflow.js .` |

`.` 被 shell 解析为 CWD，而 skill 执行时 CWD 可能是插件目录而非用户项目目录，导致 `.devsphere/` 查找失败。

### 1.2 历史

此问题曾被多次尝试修复：
- `8772edd` — 在脚本中实现 `findWorkspaceRoot()` 自动向上查找 `.devsphere/`，但被 `ad57c50` revert
- `66b1dfc`（当前版本）— 改为统一跑 resolver 判定任务状态，但仍用 `.` 传参，问题未根本解决

## 2. 方案

使用 Claude Code 内置变量替代 `.` 和手动路径推算：

- **`${CLAUDE_PROJECT_DIR}`** — 项目根目录绝对路径（启动 `claude` 的目录），替代 `.` 作为 workspace root
- **`${CLAUDE_SKILL_DIR}`** — 当前 SKILL.md 所在目录，替代「从 Base directory 推算插件根目录」的指令

两者均在 SKILL.md 渲染前完成字符串替换，不依赖 LLM 理解或 shell CWD。需要 Claude Code >= 2.1.196（当前版本 2.1.202，满足要求）。

## 3. 改动

### 3.1 `skills/workflow/SKILL.md`

**步骤4 脚本调用：**

```bash
# 之前
node <插件根目录>/scripts/devsphere-workflow.js .

# 之后
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-workflow.js ${CLAUDE_PROJECT_DIR}
```

**相关描述文字调整：**
- 删除「从会话上下文中的 Base directory 信息推算出插件根目录（本 skill 位于 skills/workflow/，向上两级即为插件根目录），拼接出脚本绝对路径后执行」→ 替换为简洁说明
- resolver 说明中「在 CWD 中查找」→「在项目根目录中查找」

### 3.2 `skills/feature-init/SKILL.md`

**步骤3 脚本调用：**

```bash
# 之前
node <插件根目录>/scripts/devsphere-workspace.js create-feature-task . <task-id> auto-design

# 之后
node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-workspace.js create-feature-task ${CLAUDE_PROJECT_DIR} <task-id> auto-design
```

**相关描述文字调整：**
- 删除插件根目录推算说明
- 删除「`.` 即当前工作目录（你启动 claude 时的 CWD）」的描述
- 替换为 `${CLAUDE_PROJECT_DIR}` 的简要说明

### 3.3 `skills/status/SKILL.md`

**步骤4 脚本调用：**

```
# 之前
运行 `node <插件根目录>/scripts/devsphere-workflow.js .` 获取下一步建议。

# 之后
运行 `node ${CLAUDE_SKILL_DIR}/../../scripts/devsphere-workflow.js ${CLAUDE_PROJECT_DIR}` 获取下一步建议。
```

### 3.4 不改动的部分

- `hooks/hooks.json` — hooks 在插件目录内执行，`${CLAUDE_PLUGIN_ROOT}/..` 的使用场景与 skill 不同，保持不变
- JS 脚本（`devsphere-workflow.js`、`devsphere-state.js` 等）— 接受 workspaceRoot 参数的设计正确，`args[0] || process.cwd()` 回退保留

## 4. 涉及文件

| 文件 | 改动类型 |
|------|---------|
| `skills/workflow/SKILL.md` | 修改脚本调用 + 描述文字 |
| `skills/feature-init/SKILL.md` | 修改脚本调用 + 描述文字 |
| `skills/status/SKILL.md` | 修改脚本调用 |

## 5. 不受影响的行为

- 所有脚本的逻辑和接口不变
- `list`、`switch`、`human_confirm`、`blocked`、`completed` 等功能不变
- `.devsphere/` 目录结构和状态文件格式不变
- 插件安装方式不受限（全局/项目级均正常工作）
