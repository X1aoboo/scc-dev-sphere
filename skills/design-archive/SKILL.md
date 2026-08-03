---
name: design-archive
description: 将指定任务 artifacts 目录下的基线设计稿（设计文档 + 配套资产）归档到带版本分层的归档目录；版本由用户提供，同一版本重复归档更新该层。禁止模型自动调用，仅用户在主会话显式调用。
disable-model-invocation: true
---

# Design Archive — 设计归档

把指定任务的基线设计稿从 `.devsphere/tasks/feature/<task-id>/artifacts/` 归档到 `{归档根目录}/{版本}/{任务ID}/`，按软件版本分层，供发布留档与追溯。

## 集成契约

- **入口:** `/scc-dev-sphere:design-archive`
- **入参:** 任务（列表单选）、版本号（必填、自由格式）、归档根目录（默认取配置，可修改并持久化）
- **输出:** `{归档根目录}/{版本}/{任务ID}/` 下的设计文档与配套资产；新建（created）或更新（updated）
- **完成标准:** 基线设计稿已归档到目标分层目录，向用户展示归档路径与内容清单

## 执行步骤

1. 枚举任务列表供用户选择：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" archive list-tasks --workspace-root "<workspaceRoot>"`，把结果以单选列表呈现给用户。列表为空时，提示先执行 `feature-init` 并终止。
2. 收集版本号：以自然语言向用户提问，版本为必填、自由格式（如 `1.2.0` 或团队自定义格式）。
3. 读取并确认归档根目录：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" config read --workspace-root "<workspaceRoot>"`，向用户展示当前 `archive.root`；用户需要修改时，执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" config set --workspace-root "<workspaceRoot>" --key archive.root --value "<new-root>"` 持久化后采用新值。
4. 执行归档：`"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" archive run --workspace-root "<workspaceRoot>" --task-id "<task-id>" --version "<version>" --archive-root "<resolved-root>"`，解析脚本输出的 JSON。脚本报错（任务不存在、版本缺失、无基线文档等）时透传错误并终止。
5. 展示归档摘要：新建/更新模式、归档路径、复制的设计文档与配套资产清单；更新时如实说明已覆盖既有文件、源中已不存在的旧文件保留不删除。

## 规则

- **仅用户显式调用**：不得被模型自动触发；只在用户在主会话输入 `/scc-dev-sphere:design-archive` 时执行。
- **版本必填且用户提供**：分层使用用户给出的软件版本；不读取、不使用设计稿 frontmatter 的 baseline version。
- **只读源**：不得修改 `artifacts/`；归档是纯复制。
- **确定性执行**：任务枚举、校验、目录检测、复制与覆盖全部由 `devsphere` CLI 完成；Skill 不自行拼接路径或执行复制。
- **非法输入拦截**：任务不存在等错误由脚本拦截，Skill 透传并终止。
- **更新不删除**：目标层已有文件时覆盖源集内文件，但不得删除目标层内其他文件。

## 完成

归档分层目录已写入指定版本，向用户呈现归档路径与内容清单后完成。
