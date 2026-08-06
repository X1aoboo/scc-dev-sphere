# Feature Design Reopen 适配设计

- **状态:** 待评审
- **日期:** 2026-08-07
- **关联:** `2026-08-07-design-reopen-optimization-design.md`（design-reopen Skill 新增）

## 1. 背景

新增 `design-reopen` Skill 后，`feature-design` 步骤5 中残留的内联 reopen 逻辑变得冗余且不合理。到发布环节时不应存在不同的 Baseline——重开应在进入 `feature-design` 之前通过 `/scc-dev-sphere:design-reopen` 完成。

同时，`design-reopen` 步骤6 对 `feature-design` 如何识别设计类型的描述在有多个 reopen 设计时不准确，需要修正。

## 2. 修改范围

仅文案修改，不涉及 CLI 或逻辑变更。

### 2.1 `feature-design` 步骤5：删除内联 reopen 分支

**当前**（步骤5 第 150-154 行）：

```markdown
`publish` 将获批 Draft 原样复制为 Baseline，不在发布时改写内容。已有不同 Baseline 时，先向用户确认重开，再运行：

"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design reopen --task-path "<taskPath>" --design-type <designType>
```

**替换为**：

```markdown
`publish` 将获批 Draft 原样复制为 Baseline，不在发布时改写内容。命令失败时检查 JSON 和 Draft/Lint/Review hash；错误信息提示存在不同 Baseline 时，告知用户使用 `/scc-dev-sphere:design-reopen` 重开此设计。
```

删除原因：

1. 到步骤5 发布环节，工作空间中不应存在不同的 Baseline
2. CLI 的 `publish` 在检测到不同 Baseline 时已抛错，是正确的错误行为
3. 重开应由 `design-reopen` Skill 统一入口执行，`feature-design` 不应兜底

### 2.2 `design-reopen` 步骤6：修正恢复识别描述

**当前**：

```markdown
`feature-design` 步骤1 `inspect-workspace` 会看到"Draft 存在、Baseline 不存在"，识别为恢复进行中的设计；步骤2 使用变更说明作为本次设计修订的输入。
```

**替换为**：

```markdown
调用上下文传入的 designType 确定当前设计类型（`feature-design` 步骤1 已有"调用上下文明确指定的设计目标可以确定当前类型"的判断规则）；步骤2 使用变更说明作为本次设计修订的输入。
```

修正原因：存在多个 reopen 设计时，`inspect-workspace` 返回 `needs_user_confirmation` 而非自动推断。实际依赖的是调用上下文显式传入的 designType，不是 inspect-workspace 的推断。

### 2.3 不修改的部分

- **步骤1**：第三条判断"调用上下文明确指定的设计目标可以确定当前类型"已覆盖 `design-reopen` 传入 designType 的场景
- **步骤2**：变更说明作为调用上下文的一部分，自然被 `feature-design-analysis` 使用
- **步骤3、4**：不涉及 reopen 场景

## 3. 影响面

| 文件 | 改动 |
|---|---|
| `skills/feature-design/SKILL.md` | 步骤5：删除内联 reopen 分支，替换为错误指引 |
| `skills/design-reopen/SKILL.md` | 步骤6：修正恢复识别描述 |

不修改：CLI 代码、hooks、测试。
