---
name: knowledge-config
description: 查询和维护项目知识源配置。用于查看当前生效的 Skill、Local、Repo、MCP 或 Web 来源，修改已有来源的启用状态、目标或 description，或新增知识源。
---

# Knowledge Config

通过确定性 CLI 维护项目的 `.devsphere/config/knowledge-sources.json`。使用命令完成修改，让脚本在项目配置不存在时基于插件默认配置创建完整项目配置。

## 查询当前配置

运行：

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/knowledge-query.js" show-config "${CLAUDE_PROJECT_DIR}"
```

需要检查精确字段、确认已有目标或验证修改结果时运行：

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/knowledge-query.js" read-config "${CLAUDE_PROJECT_DIR}"
```

直接展示生效来源、启用状态、目标和 description，并说明当前使用插件默认配置还是项目配置。

## 修改已有配置

先用 `read-config` 确认来源存在，再按修改类型执行。

修改来源类型的启用状态：

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/knowledge-query.js" update-config "${CLAUDE_PROJECT_DIR}" sources.<type>.enabled <true|false>
```

修改已有来源的 description：

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/knowledge-query.js" upsert-source "${CLAUDE_PROJECT_DIR}" <type> "<target>" "<description>"
```

修改 Web description：

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/knowledge-query.js" upsert-source "${CLAUDE_PROJECT_DIR}" web "<description>"
```

`type + target` 是来源身份。修改目标时，先新增新目标；新增成功后再删除旧目标：

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/knowledge-query.js" remove-source "${CLAUDE_PROJECT_DIR}" <type> "<old-target>"
```

每次修改后运行 `read-config`，确认目标、description 和实际 `enabled` 与请求一致。

## 新增知识源

从用户输入取得来源类型、目标和非空 description。缺少其中任何一项时，只补问缺少的信息；Web 只需要 description。

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/knowledge-query.js" upsert-source "${CLAUDE_PROJECT_DIR}" <type> "<target>" "<description>"
```

类型与目标对应关系：

| type | target |
|---|---|
| `skill` | Skill 名称 |
| `local` | 本地知识目录 |
| `repo` | 仓库路径 |
| `mcp` | MCP 查询能力名称 |
| `web` | 无目标，使用类型级 description |

description 要具体说明该来源能够回答的知识范围，使 `knowledge-query` 可以据此进行语义路由。新增命令成功后运行 `read-config`；只有新来源出现在生效配置中且 `enabled=true` 时才算完成。

## 边界

配置变更只通过 `knowledge-query.js` 执行。保持插件默认配置不变；项目级修改写入 `.devsphere/config/knowledge-sources.json`。用户只要求查询时保持只读。
