---
name: design-active
description: 将归档目录中指定版本层的完整设计任务迁移回设计工作空间并设为当前任务，用于设计变更；先选版本层再选任务。禁止模型自动调用，仅用户在主会话显式调用。
disable-model-invocation: true
---

# Design Active — 设计激活

把归档目录 `{归档根目录}/{版本}/{任务ID}/` 中的完整任务目录迁移回 `.devsphere/tasks/feature/<task-id>/` 并设为当前激活任务，与 `design-archive` 互为逆操作。激活后任务回到设计工作空间，可继续做设计变更，完成后可再次归档到新版本层。

## 集成契约

- **入口:** `/scc-dev-sphere:design-active`
- **入参:** 归档根目录（默认取配置，可修改并持久化）、版本层（列表单选）、任务（列表单选）
- **输出:** 工作区 `.devsphere/tasks/feature/<task-id>/` 下的完整任务目录；任务设为当前激活任务；空版本层自动清理
- **完成标准:** 任务已迁回工作区并设为当前任务，向用户展示迁回路径与后续设计变更提示

## 执行步骤

1. 读取并确认归档根目录：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" config read --workspace-root "<workspaceRoot>"`，向用户展示当前 `archive.root`；用户需要修改时，执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" config set --workspace-root "<workspaceRoot>" --key archive.root --value "<new-root>"` 持久化后采用新值。
2. 枚举版本层供用户选择：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" archive list-versions --workspace-root "<workspaceRoot>" --archive-root "<resolved-root>"`，把结果以单选列表呈现给用户。列表为空时，提示归档区为空、无任务可激活并终止。
3. 枚举该版本层下的任务供用户选择：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" archive list-archived --workspace-root "<workspaceRoot>" --version "<version>" --archive-root "<resolved-root>"`，把结果（含任务状态）以单选列表呈现给用户。列表为空时提示该版本层无任务并终止。
4. 执行激活：`"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" archive activate --workspace-root "<workspaceRoot>" --task-id "<task-id>" --version "<version>" --archive-root "<resolved-root>"`，解析脚本输出的 JSON。脚本报错（版本层不存在、任务不存在、工作区已存在同 ID 任务等）时透传错误并终止。
5. 展示激活摘要：迁回路径、已设为当前激活任务、空版本层已清理（如适用）。若任务的设计处于已发布状态，提示先执行 `design-reopen` 回到草稿状态再做设计变更。激活会将当前激活任务切换为本任务；原当前任务仍保留在工作区，如需继续处理可重新指定。

## 规则

- **仅用户显式调用**：不得被模型自动触发；只在用户在主会话输入 `/scc-dev-sphere:design-active` 时执行。
- **两级选择**：先选版本层、再选该层任务；不默认取最新版本，用户可有意识激活旧版本快照做设计变更。
- **激活即设为当前任务**：迁移完成后任务即成为当前激活任务，可直接进入设计流程。
- **工作区冲突拒绝**：工作区已存在同 ID 任务时脚本报错终止（先完成或归档现有任务），不合并不覆盖。
- **确定性执行**：版本层枚举、任务枚举、校验、迁移、当前任务写入全部由 `devsphere` CLI 完成；Skill 不自行拼接路径或执行迁移。
- **非法输入拦截**：路径穿越、归档树含符号链接等错误由脚本拦截，Skill 透传并终止。

## 完成

任务已迁回工作区并设为当前任务，向用户呈现迁回路径与设计变更提示后完成。
