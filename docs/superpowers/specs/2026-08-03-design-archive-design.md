# 设计归档 Design Archive Skill

- **状态：** 已确认
- **日期：** 2026-08-03
- **范围：** `skills/design-archive/SKILL.md`（新增）、`scripts/devsphere-archive.js`（新增）、`scripts/devsphere-config.js`（新增）、`scripts/devsphere-cli.js`（新增 `archive`/`config` 域）、`.gitignore`（新增 `.devsphere/`）、`scripts/test/design-archive-skill-contract.test.js`（新增）
- **不在范围：** workflow 自动集成（不侵入 `workflow`/`feature-verify` 状态机）；归档清单 manifest；归档目录清理/删除能力；非 `feature` 任务类型的归档

## 1. 背景与目标

Feature 交付完成后，任务工作区中的基线设计稿位于 `.devsphere/tasks/feature/<task-id>/artifacts/`。团队需要在软件版本维度留存这些基线设计稿（业务/方案/实现/测试设计文档及其配套资产），用于发布留档、追溯和跨版本对比。

本插件新增一个用户可调用的 `design-archive` Skill：将指定任务的基线设计稿归档到带版本分层的归档目录，支持版本重复归档时更新该版本分层。

核心目标：**把指定任务的基线设计稿完整、可追溯地归档到 `{归档根目录}/{版本}/{任务}/` 分层结构下；同一版本重复归档时更新该层内容。**

## 2. 已确认决策

| 决策点 | 结论 |
|---|---|
| 版本来源 | 用户提供，自由格式（`x.x.x` 或团队自定义格式），每个团队不一致；不与设计稿 frontmatter 的 baseline version 混用 |
| 归档根目录 | 持久化在 `.devsphere/config/config.json` 的 `archive.root`；默认值 `.devsphere/archive` |
| config 读取语义 | 读即补全：文件不存在或缺 `archive.root` 时写入默认配置并持久化 |
| 任务选择 | 枚举现有任务列表，用户单选；脚本侧复验，非法任务 ID 拦截 |
| task_name | 任务 ID（`.devsphere/tasks/feature/<task-id>/` 目录名） |
| 复制范围 | `artifacts/` 顶层全部 `*.md` 基线设计文档 + 顶层 `*-assets/` 配套资产目录 |
| 更新语义 | 目标层已有文件 → 覆盖源集、原地更新；不删除目标层内其他文件 |
| 调用方式 | 独立用户可调用 `/scc-dev-sphere:design-archive`；**禁止模型自动调用**（`disable-model-invocation: true`），仅用户在主会话显式调用；不集成 workflow |
| manifest | 不写归档清单 |
| git 跟踪 | `.devsphere/` 加入 `.gitignore`，任务/配置/归档数据区不随仓库提交 |

## 3. 组件与职责

```
用户 ─► /scc-dev-sphere:design-archive (Skill)
             │  编排：枚举任务 → 收集版本 → 读取/持久化配置 → 调用脚本
             ▼
        bin/devsphere  (archive list-tasks / run、config read / set)
             │  确定性：任务复验、源集枚举、目标层检测、复制/覆盖
             ▼
        {archive_root}/{version}/{task_id}/  (归档输出)
```

### 3.1 `skills/design-archive/SKILL.md`（主会话编排）

frontmatter 约束：

```yaml
---
name: design-archive
description: <中文描述>
disable-model-invocation: true
---
```

`disable-model-invocation: true` 使模型不得自动触发本 Skill，仅用户在主会话显式调用 `/scc-dev-sphere:design-archive` 时执行（区别于 `design-draft` 等可被模型调用的 Skill）。

职责：
- 调用 `devsphere archive list-tasks` 枚举现有任务，以列表形式呈现供用户单选；
- 收集版本号（必填，自由格式）；
- 调用 `devsphere config read` 获取当前 `archive.root`（读即补全默认），向用户确认；用户修改时调用 `devsphere config set` 持久化；
- 调用 `devsphere archive run --task-id <id> --version <v> --archive-root <resolved>`；
- 将脚本结构化结果渲染为人类可读摘要（新建/更新、目标路径、复制的文档与资产清单）。

不包含任何复制、路径解析、校验逻辑 —— 全部委托脚本。

### 3.2 `scripts/devsphere-archive.js`（确定性执行）

挂 CLI `archive` 域，两个动作：

- `archive list-tasks`：枚举 `<workspaceRoot>/.devsphere/tasks/feature/*`，返回 `[{ taskId, status }]`（status 读取 `state.json`）；无任务返回空列表。
- `archive run --task-id <id> --version <v> [--archive-root <path>]`：
  1. 解析归档根目录（按序：`--archive-root` 显式值 → `config.json` 的 `archive.root` → 默认 `.devsphere/archive`）；
  2. 复验任务目录 `.devsphere/tasks/feature/<task-id>/` 存在；
  3. 枚举 `artifacts/` 顶层全部 `*.md` 与 `*-assets/` 目录组成源集；
  4. 检测目标层 `{archive_root}/{version}/{task_id}/` 状态：不存在或存在但无文件 → `created`；已有文件 → `updated`；
  5. 字节原样复制（文档 + 资产目录），`updated` 时覆盖源集内文件，不删除目标层其他文件；
  6. 输出 `{ taskId, version, archiveRoot, destination, mode, docs[], assets[] }`。

### 3.3 `scripts/devsphere-config.js`（通用配置读写）

挂 CLI `config` 域，两个动作，操作 `.devsphere/config/config.json`：

- `config read`：保证返回完整配置。文件不存在 → 创建目录并写入默认配置 `{"archive":{"root":".devsphere/archive"}}`；文件存在但缺 `archive.root`（或 `archive` 命名空间）→ 合并默认值并持久化回写；已有 key → 原样返回。
- `config set --key <nested.path> --value <v>`：按嵌套 key 写入并持久化，目录不存在自动创建；仅改动指定 key，不影响其他命名空间。

`config.json` 是插件通用配置，按域名命名空间组织，`archive` 为第一个域。

### 3.4 `scripts/test/design-archive-skill-contract.test.js`

node:test 合同测试，临时 workspace 起 `.devsphere/` 结构，覆盖第 6 节列出的断言。

## 4. 归档契约

### 4.1 复制源

- 路径：`<taskPath>/artifacts/`（任务基线设计稿所在目录）。
- 源集 = 顶层全部 `*.md` 文件 + 顶层全部 `*-assets/` 目录。
- 规则与具体设计类型解耦：任务只发布了部分设计（如 external 测试设计模式）或未来新增设计类型均自动覆盖。
- 字节原样复制，保留文档对 `${slug}-assets/...` 的相对引用可解析。
- 源集含符号链接时拒绝（与 design publish 资产校验一致）。

### 4.2 目标结构

```
{archive_root}/{version}/{task_id}/
    business-design.md
    solution-design.md
    implementation-design.md
    test-design.md
    business-design-assets/...
    ...
```

（文档清单以任务实际发布的基线设计为准，不强制四份齐全；上方为典型完整形态。）

- `{version}`：用户提供、自由格式，必填。
- `{task_id}`：任务目录名。
- `{archive_root}`：来自 `config.json` 的 `archive.root`，默认 `.devsphere/archive`，用户可覆盖并持久化。

### 4.3 更新语义

| 目标层 `{version}/{task_id}/` 状态 | 行为 | mode |
|---|---|---|
| 不存在 | 创建目录并完整复制 | `created` |
| 存在但无文件（空目录） | 视为新建，完整复制 | `created` |
| 存在且已有文件 | 原地覆盖源集内文件（文档 + 资产），不删除目标层内其他文件 | `updated` |

同一 `{version}/{task_id}` 重复归档为覆盖更新，结果确定（幂等）。

## 5. 数据流与错误处理

### 5.1 数据流

```
用户 ─► /design-archive
 1. archive list-tasks ──► [taskId+status] ──► 列表单选
 2. 收集版本号（必填）
 3. config read（读即补全默认并持久化）──► archive.root
      → 向用户确认；用户修改时 config set archive.root 持久化
 4. archive run --task-id <id> --version <v> --archive-root <resolved>
      │  复验任务 → 枚举源集 → 检测目标层 → 复制/覆盖
      └─► { taskId, version, archiveRoot, destination, mode, docs[], assets[] }
 5. Skill 渲染摘要（新建/更新、路径、文档与资产清单）
```

### 5.2 错误处理

| 错误场景 | 行为 |
|---|---|
| 工作空间无任务 | `list-tasks` 空 → Skill 终止，提示先 `feature-init` |
| 非法/不存在任务 ID | `archive run` 复验失败 → 非 0 退出，无副作用 |
| 缺 `--version` | 必填校验失败 |
| `artifacts/` 无基线文档（顶层无 `.md`） | 报"没有可归档的基线设计稿"，不建空层 |
| `config.json` 损坏 / 不可写 | `config read/set` 报错，归档不执行 |
| 归档根目录不可写 / 路径非法 | 报错退出 |
| 源资产含符号链接 | 拒绝 |

### 5.3 不变式

- 只读源：`artifacts/` 在归档过程中不被修改。
- 幂等目标：同一 `{version}/{task_id}` 重复归档 = 覆盖更新。
- 失败无副作用：任何校验失败都发生在写操作之前。

## 6. 测试

新增 `scripts/test/design-archive-skill-contract.test.js`（node:test）：

| 测试组 | 断言 |
|---|---|
| SKILL.md 合同 | frontmatter `name: design-archive`、中文描述、非 fork、含 Process/Rules/集成契约；**含 `disable-model-invocation: true`**，禁止模型自动调用 |
| config read 自愈 | 无文件 → 创建默认 `config.json`；有文件缺 `archive.root` → 补充并持久化；已有 key → 原样返回 |
| config set | 写入嵌套 key 并持久化，目录不存在自动创建 |
| list-tasks 枚举 | 返回 `.devsphere/tasks/feature/*` 的 taskId+status；空 workspace → 空列表 |
| archive run 新建 | 目标层不存在 → `created`，复制全部 `.md` + `*-assets/`，字节一致 |
| archive run 更新 | 目标层已有文件 → `updated`，覆盖源集内容，不删除目标层内其他文件 |
| 空目录目标层 | 视为 `created` |
| 错误分支 | 非法 task-id → 非 0 退出且无副作用；缺 version → 报错；`artifacts/` 无 `.md` → 报错不建空层 |

沿用项目测试约定（直读 SKILL.md、临时 workspace 起任务目录），不引入新依赖。

## 7. 边界与后续

- **不做**：workflow 自动归档提示；归档清单/索引；归档清理或删除；非 `feature` 任务类型。
- **已知行为**：若某设计文档在源中已不存在（任务侧移除），旧副本会在更新后保留（保守策略，不删未验证文件），完成摘要如实说明。
