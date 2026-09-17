# 设计任务整任务归档与激活 Design Task Archive / Activate

- **状态：** 已确认
- **日期：** 2026-09-17
- **范围：** `scripts/devsphere-archive.js`（重构 `run`、新增 `list-versions`/`list-archived`/`activate`）、`scripts/devsphere-cli.js`（`archive` 域动作扩展）、`skills/design-archive/SKILL.md`（重构）、`skills/design-active/SKILL.md`（新增）、`scripts/test/design-archive-skill-contract.test.js`（重构 + 新增用例）、`README.md`（技能表更新）
- **不在范围：** workflow 自动集成（不侵入状态机）；归档清单 manifest；归档目录清理/删除能力；非 `feature` 任务类型；版本层重命名/合并

## 1. 背景与目标

现有 `design-archive` Skill 仅将任务 `artifacts/` 下的基线设计文档**复制**到版本分层归档目录，任务工作区保留不动。随着任务累积，`.devsphere/tasks/feature/` 不断膨胀，已完成任务无法释放；且归档后无法再对历史设计做变更后重新归档。

本设计将归档语义从"复制基线文档"升级为"**整任务目录迁移**"：任务完成归档后从工作区移除，需要设计变更时通过新增的 `design-active` Skill 将指定版本层的任务整体激活回工作区，形成可逆闭环：

```
工作区 ──归档(v1.2.0)──▶ archive/v1.2.0/<task-id>/
       ◀──激活────────── archive/v1.2.0/<task-id>/
工作区(设计变更后) ──归档(v1.3.0)──▶ archive/v1.3.0/<task-id>/
```

核心目标：**归档 = 整任务目录原子迁移到 `{归档根目录}/{版本}/{任务ID}/` 并从工作区移除；激活 = 从指定版本层整任务迁移回工作区并设为当前任务。两者互为逆操作，版本层作为不可变快照只追加不覆盖。**

## 2. 已确认决策

| 决策点 | 结论 |
|---|---|
| 迁移语义 | **移动（move）而非复制**：归档后 `.devsphere/tasks/feature/<task-id>/` 删除，任务从 `list-tasks` 消失 |
| 归档范围 | 整个 `<task-id>/` 目录原样迁移（`state.json`、`inputs/`、`work/`、`artifacts/`、`approvals/`、`evidence/`、`implementation/`、`verification/`、`links/` 全部包含），不排除任何子目录 |
| 基线校验 | 保留现状前置校验：`artifacts/` 顶层无 `.md` 基线文档时拒绝归档（未完成设计发布的任务不可归档） |
| 重复归档 | 同一 `{version}/{task-id}` 已存在 → **报错拒绝**，要求换版本号；版本层为不可变快照，只追加不覆盖（`mode: created/updated` 字段随之删除） |
| 当前任务引用 | 归档的任务是当前激活任务时，删除 `.devsphere/current-task.json`（回到"无当前任务"态） |
| 激活选择交互 | 两级单选：先 `list-versions` 列版本层单选，再 `list-archived` 列该层任务单选；用户可有意激活旧版本做设计变更 |
| 激活冲突 | 工作区已存在同 ID 任务 → 报错拒绝终止（提示先完成或归档现有任务），不合并不覆盖 |
| 激活后状态 | 激活即写 `current-task.json` 设为当前任务（结构与 `create-feature-task` 一致）；摘要提示已发布设计需走 `design-reopen` 回到草稿再变更 |
| 迁移实现 | 优先 `fs.renameSync`（同盘原子）；捕获 `EXDEV`（归档根跨盘/外部路径）降级为 copyTree + 删除源 |
| 空版本层清理 | 激活迁出后版本层目录变空则删除该空目录，保持归档区整洁 |
| 调用方式 | 两个 Skill 均 `disable-model-invocation: true`，仅用户在主会话显式调用，不集成 workflow |
| 安全校验 | 保留并扩展：`version`/`task-id` 路径安全段校验、整任务树 symlink 预扫描（失败无副作用） |

## 3. 组件与职责

```
用户 ─► /scc-dev-sphere:design-archive (Skill)
             │  编排：枚举任务 → 收集版本 → 读取/持久化配置 → 调用脚本
             ▼
        bin/devsphere archive run ──► {archive_root}/{version}/{task_id}/
             （工作区任务目录移除，current-task 清理）

用户 ─► /scc-dev-sphere:design-active (Skill)
             │  编排：确认归档根 → 列版本单选 → 列任务单选 → 调用脚本
             ▼
        bin/devsphere archive activate ──► .devsphere/tasks/feature/<task-id>/
             （设为当前任务，空版本层清理）
```

### 3.1 `scripts/devsphere-archive.js`（确定性执行，重构）

`archive` 域从 2 个动作扩展为 5 个：

| 动作 | 选项 | 语义 |
|---|---|---|
| `list-tasks` | `--workspace-root` | 不变：枚举工作区任务，返回 `[{ taskId, status }]` |
| `run` | `--task-id --version --archive-root` | **重构**：整任务目录迁移（见 4.1） |
| `list-versions` | `--workspace-root --archive-root` | 新增：列归档根目录下的版本层目录名 |
| `list-archived` | `--workspace-root --version --archive-root` | 新增：列该版本层下的已归档任务，读其 `state.json` 返回 `[{ taskId, status }]` |
| `activate` | `--task-id --version --archive-root` | 新增：整任务迁回工作区并设为当前任务（见 4.2） |

### 3.2 `skills/design-archive/SKILL.md`（重构）

frontmatter 保持 `disable-model-invocation: true`。执行步骤保持 5 步骨架：

1. `archive list-tasks` 枚举任务单选（空列表提示先 `feature-init` 并终止）；
2. 自然语言收集版本号（必填、自由格式）；
3. `config read` 展示 `archive.root`，用户修改时 `config set` 持久化；
4. `archive run --task-id --version --archive-root` 执行迁移；
5. 渲染摘要：目标路径、迁移的任务目录树概要、任务已从工作区移除、当前任务引用已清理（如适用）。

规则变更：删除"只读源/纯复制"与"更新不删除"，改为"迁移即移除源"、"同版本重复归档拒绝"、"归档当前任务时清理引用"。

### 3.3 `skills/design-active/SKILL.md`（新增）

frontmatter：

```yaml
---
name: design-active
description: 将归档目录中指定版本层的完整设计任务迁移回设计工作空间并设为当前任务，用于设计变更；先选版本再选任务。禁止模型自动调用，仅用户在主会话显式调用。
disable-model-invocation: true
---
```

执行步骤：

1. `config read` 确认归档根目录（读即补全默认；用户修改时 `config set` 持久化后采用新值）；
2. `archive list-versions` 列版本层，用户单选；无版本层时提示归档区为空并终止；
3. `archive list-archived --version <v>` 列该层任务（含状态），用户单选；
4. `archive activate --task-id --version --archive-root` 执行迁移；
5. 渲染摘要：迁回路径、已设为当前任务；**若任务设计状态为已发布，提示使用 `design-reopen` 回到草稿状态后再做设计变更**。

规则：仅用户显式调用；确定性执行（路径操作全部委托 CLI，Skill 不自行拼接路径或执行迁移）；非法输入（版本层不存在、任务不存在、工作区冲突等）由脚本拦截，Skill 透传错误并终止。

## 4. 归档/激活契约

### 4.1 `archive run`（迁移归档）

1. **校验（全部在写操作之前，失败无副作用）：**
   - `version` 必填、`assertSafeSegment`（拒绝空、`.`、`..`、路径分隔符、NUL）；
   - `task-id` `assertSafeSegment`；
   - 任务目录 `.devsphere/tasks/feature/<task-id>/` 存在；
   - `artifacts/` 存在且顶层含 `.md` 基线文档（现状校验保留，未完成设计发布的任务不可归档）；
   - 整个任务树 `assertNoSymlinks` 预扫描（范围从源集扩展到整任务目录）；
   - **新增：目标 `{archive_root}/{version}/{task-id}/` 已存在 → 报错 `Task already archived at this version` 并终止**（含空目录：目标存在即拒绝，版本层不可变）。
2. **迁移：** `fs.mkdirSync(path.dirname(destination), { recursive: true })`（保证 `{archive_root}/{version}/` 存在）后优先 `fs.renameSync(taskPath, destination)`；抛 `EXDEV` 时降级 `copyTree(taskPath, destination)` + `fs.rmSync(taskPath, { recursive: true })`。
3. **当前任务清理：** `readCurrentTask(workspaceRoot)` 的 `activeTaskId` 等于被归档任务 → 删除 `.devsphere/current-task.json`。
4. **输出：** `{ taskId, version, archiveRoot, destination, movedTree }`；`movedTree` 为任务目录顶层条目清单（目录/文件名），供 Skill 渲染摘要。

### 4.2 `archive activate`（迁移激活）

1. **校验（全部在写操作之前，失败无副作用）：**
   - `version`、`task-id` `assertSafeSegment`；
   - 版本层 `{archive_root}/{version}/` 存在；
   - 归档任务目录 `{archive_root}/{version}/{task-id}/` 存在；
   - **工作区 `.devsphere/tasks/feature/<task-id>/` 不存在**（存在即报错拒绝，提示先完成或归档现有任务）；
   - 归档树 `assertNoSymlinks` 预扫描。
2. **迁移：** `fs.mkdirSync(tasksFeatureDir, { recursive: true })`（保证 `.devsphere/tasks/feature/` 存在）后优先 `renameSync`；`EXDEV` 降级 copyTree + rmSync。
3. **设为当前任务：** `writeCurrentTask(workspaceRoot, { activeTaskId, activeTaskType: 'feature', workspaceRoot, taskPath: '.devsphere/tasks/feature/<task-id>' })`（与 `create-feature-task` 结构一致）。
4. **空版本层清理：** 迁出后 `{archive_root}/{version}/` 为空目录则 `fs.rmdirSync` 删除（若归档根随之变空不删除归档根本身）。
5. **输出：** `{ taskId, version, taskPath, destination(=taskPath), activated: true }`。

### 4.3 版本层快照语义

- 版本层一旦写入即不可变快照：重复归档同版本拒绝，不做覆盖；
- 同一任务在不同版本层各留一份完整快照（归档 → 激活 → 变更 → 新版本再归档 的自然结果）；
- 激活把快照移回工作区，该版本层若因此变空则消失，其他版本层的同任务快照不受影响。

## 5. 数据流与错误处理

### 5.1 数据流

```
归档：用户 ─► /design-archive
 1. archive list-tasks ──► 列表单选
 2. 收集版本号（必填）
 3. config read / config set ──► archive.root 确认
 4. archive run --task-id --version --archive-root
      │  校验 → 整任务迁移 → current-task 清理
      └─► { taskId, version, archiveRoot, destination, movedTree }
 5. 摘要：路径 + 任务树概要 + 工作区移除说明

激活：用户 ─► /design-active
 1. config read / config set ──► archive.root 确认
 2. archive list-versions ──► 版本单选
 3. archive list-archived --version ──► 任务单选
 4. archive activate --task-id --version --archive-root
      │  校验 → 整任务迁移 → 设当前任务 → 空版本层清理
      └─► { taskId, version, taskPath, activated: true }
 5. 摘要：迁回路径 + 已设当前任务 + design-reopen 提示（如已发布）
```

### 5.2 错误处理

| 错误场景 | 行为 |
|---|---|
| 工作空间无任务（归档） | `list-tasks` 空 → Skill 终止，提示先 `feature-init` |
| 归档区无版本层（激活） | `list-versions` 空 → Skill 终止，提示归档区为空 |
| 版本层不存在 / 层内无该任务（激活） | `list-archived`/`activate` 报错，非 0 退出 |
| `artifacts/` 无基线文档 | 拒绝归档，不建层 |
| 同版本重复归档 | 报 `Task already archived at this version`，无副作用 |
| 工作区已存在同 ID 任务（激活） | 报错拒绝，提示先完成或归档现有任务 |
| 被归档任务是当前任务 | 归档后删除 `current-task.json`（正常路径，非错误） |
| 非法 `version`/`task-id`（路径穿越等） | `assertSafeSegment` 拒绝，任何写入前失败 |
| 源/归档树含符号链接 | 预扫描拒绝，无副作用 |
| 归档根不可写 / 跨设备 | 不可写报错；跨设备走 EXDEV 降级路径 |
| `config.json` 损坏 / 不可写 | `config read/set` 报错，操作不执行 |

### 5.3 不变式

- 迁移完整性：归档/激活全程任务目录要么在源、要么在目标，不产生部分副本（同盘 rename 原子；跨盘降级为复制后删源，任何校验失败都发生在写之前）。
- 版本层不可变：同 `{version}/{task-id}` 至多写入一次。
- 失败无副作用：所有校验（路径安全、存在性、冲突、symlink）先于任何写操作。
- 确定性：Skill 不执行任何路径拼接或文件操作，全部委托 `devsphere` CLI。

## 6. 测试

重构 `scripts/test/design-archive-skill-contract.test.js` 并新增用例（node:test，沿用临时 workspace 约定）：

| 测试组 | 断言 |
|---|---|
| SKILL.md 合同（design-archive） | frontmatter `name`、中文描述、`disable-model-invocation: true`；执行步骤 5 步、编排走 `archive list-tasks`/`config read`/`config set`/`archive run` |
| SKILL.md 合同（design-active） | frontmatter `name: design-active`、`disable-model-invocation: true`；含两级选择流程（`list-versions` + `list-archived`）、`archive activate`、design-reopen 提示 |
| `run` 迁移语义 | 目标层含完整任务树（`state.json`、`work/`、`inputs/`、`artifacts/` 等）；**源任务目录已删除**；`current-task.json` 在归档当前任务后被清除、归档非当前任务时保留 |
| `run` 重复拒绝 | 同 `{version}/{task-id}` 二次归档报 `already archived`，无副作用（目标层内容不变） |
| `run` 校验保留 | `artifacts/` 无 `.md` 拒绝；路径穿越 version/task-id 拒绝且不建层；整任务树（含 `work/` 深层）symlink 拒绝且无副作用；中文任务 ID 正常迁移 |
| `list-versions` | 返回归档根下版本层目录名；空归档根返回空列表 |
| `list-archived` | 返回指定版本层任务及状态（读归档内 `state.json`）；层不存在报错 |
| `activate` 迁移 | 任务树完整回到 `.devsphere/tasks/feature/`；归档层内已移除；`current-task.json` 指向该任务（结构与 `create-feature-task` 一致）；空版本层被清理 |
| `activate` 冲突 | 工作区存在同 ID 任务 → 报错，无副作用 |
| 往返闭环 | 归档(v1) → 激活 → 修改任务文件 → 归档(v2)：v1 已被激活消费（层清理），v2 完整；再激活 v2 内容为变更后版本 |
| CLI 端到端 | `list-versions`、`list-archived`、`activate` 走 `main()` 捕获 stdout/exitCode 验证 |

## 7. 边界与后续

- **不做**：workflow 状态机集成（归档/激活不自动触发）；归档清单/索引；归档区手动清理工具；非 `feature` 任务类型；激活时对 `state.json` 状态字段的自动改写（保留归档时原状，由后续设计流程自行推进）。
- **已知行为**：跨盘降级路径（copyTree + rmSync）非原子，进程中断可能留下部分副本 —— 与现状复制语义风险一致，接受。
- **README**：设计通用能力表更新 `design-archive` 描述（整任务迁移）、新增 `design-active` 行。
