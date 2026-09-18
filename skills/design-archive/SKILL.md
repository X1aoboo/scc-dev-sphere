---
name: design-archive
description: 将指定设计任务的完整目录从设计工作空间迁移（移动）到带版本分层的归档目录，任务从工作区移除；版本由用户提供，同一版本重复归档拒绝。禁止模型自动调用，仅用户在主会话显式调用。
disable-model-invocation: true
---

# Design Archive — 设计归档

把指定任务的完整目录从 `.devsphere/tasks/feature/<task-id>/` 迁移到 `{归档根目录}/{版本}/{任务ID}/`，按软件版本分层，供发布留档与追溯。归档后任务从工作区移除；后续需要设计变更时，使用 `design-active` 将任务激活回工作区。

## 集成契约

- **入口:** `/scc-dev-sphere:design-archive`
- **入参:** 任务（列表单选）、版本号（必填、自由格式）、归档根目录（默认取配置，可修改并持久化）
- **输出:** `{归档根目录}/{版本}/{任务ID}/` 下的完整任务目录；任务从工作区移除
- **完成标准:** 任务目录已迁移到目标分层目录，向用户展示归档路径与任务树概要

## 执行步骤

1. 枚举任务列表供用户选择：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" archive list-tasks --workspace-root "<workspaceRoot>"`，把结果以单选列表呈现给用户。列表为空时，提示先执行 `feature-init` 并终止。
2. 收集版本号：以自然语言向用户提问，版本为必填、自由格式（如 `1.2.0` 或团队自定义格式）。
3. 读取并确认归档根目录：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" config read --workspace-root "<workspaceRoot>"`，向用户展示当前 `archive.root`；用户需要修改时，执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" config set --workspace-root "<workspaceRoot>" --key archive.root --value "<new-root>"` 持久化后采用新值。
4. 执行归档：`"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" archive run --workspace-root "<workspaceRoot>" --task-id "<task-id>" --version "<version>" --archive-root "<resolved-root>"`，解析脚本输出的 JSON。脚本报错（任务不存在、版本缺失、无基线文档、同版本重复归档等）时透传错误并终止。
5. 展示归档摘要：归档路径、迁移的任务树概要（`movedTree` 顶层条目清单）；说明任务已从工作区移除；如被归档任务是当前激活任务，说明当前任务引用已清理。提示后续设计变更使用 `design-active` 激活。

## 规则

- **仅用户显式调用**：不得被模型自动触发；只在用户在主会话输入 `/scc-dev-sphere:design-archive` 时执行。
- **版本必填且用户提供**：分层使用用户给出的软件版本；不读取、不使用设计稿 frontmatter 的 baseline version。
- **迁移即移除源**：归档是移动而非复制，任务目录整体迁出工作区；迁移过程不修改任务内容。
- **同版本重复归档拒绝**：目标层已存在该任务时脚本报错终止，不做覆盖；换版本号重新归档。
- **基线校验前置**：`artifacts/` 顶层无 `.md` 基线文档的任务（未完成设计发布）拒绝归档。
- **当前任务清理**：被归档任务是当前激活任务时，脚本自动清除当前任务引用。
- **确定性执行**：任务枚举、校验、目录检测、迁移与引用清理全部由 `devsphere` CLI 完成；Skill 不自行拼接路径或执行迁移。
- **非法输入拦截**：任务不存在、路径穿越、源含符号链接等错误由脚本拦截，Skill 透传并终止。

## 完成

归档分层目录已写入指定版本且任务已从工作区移除，向用户呈现归档路径与任务树概要后完成。
