# Artifact Registry Contract

## 1. 目的

定义设计产物 (artifact) 的最小元数据契约和未来 registry 结构，让评审矩阵、审批和（未来的）registry/hash 脚本能按**稳定标识**引用产物，而不是脆弱的文件路径。

本契约遵循 YAGNI：模板中只保留**当前已有消费者**的最小字段；其余字段留待出现消费者脚本时再加。

## 2. 当前 frontmatter schema（P0 最小集）

所有 `templates/artifacts/*.md` 顶部包含且仅包含两个字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `artifactId` | string | 产物唯一标识，命名 `<TYPE>-<taskId>` |
| `version` | string | semver，每次评审修订递增（如 `0.1.0` → `0.2.0`） |

命名前缀：

| artifactType | 前缀 | 模板文件 |
|--------------|------|---------|
| business-design | `BD` | business-design.md |
| solution-design | `SD` | solution-design.md |
| implementation-design | `IMPL` | implementation-design.md |
| test-design | `TD` | test-design.md |
| integrated-design | `IG` | integrated-design.md |

示例（business-design.md）：

```yaml
---
artifactId: "BD-{{TASK_ID}}"
version: "0.1.0"
---
```

## 3. 设计原则：frontmatter 不复制 state.json

以下字段**不放入** frontmatter，避免双写与漂移：

- `status` —— 唯一事实源是 `state.json`（见 CLAUDE.md）。复制到 frontmatter 必然产生同步 bug。
- `ownerAgent` —— 由 stage→agent 映射确定（`scripts/workflows/feature-workflow.js` `getDesignAgent`）。
- `artifactType` —— 由文件名确定。
- `taskId` —— 已在 `state.json` 和正文标题中。
- `dependsOn` —— 设计阶段顺序已固化在 resolver 与 `feature-design` skill 中。
- `evidenceRefs` / `decisionRefs` / `assumptionRefs` / `riskRefs` —— 属于正文相应章节，正文是事实源。

## 4. 未来扩展字段（待消费者出现再加）

当 registry / hash / approval 脚本需要时按需增加。**不在当前模板预置**，避免无人消费的投机性结构：

- `contentHash` —— 内容指纹，由脚本计算（绝不在 frontmatter 手填）。
- `dependsOn` —— 仅当依赖图需要脱离固定 stage 顺序时。
- `*Refs`（evidence/decision/assumption/risk）—— 仅当正文引用不足以满足追溯脚本时。

增加任何字段的原则：**先有消费者脚本，再加字段。**

## 5. Registry 结构（未来脚本输出示例）

未来 `scripts/devsphere-artifact.js`（**P0 不实现**）扫描任务目录下所有 artifact frontmatter，产出 registry。

**位置：** `<task-path>/artifacts/artifact-registry.json`

```json
{
  "taskId": "feat-123",
  "artifacts": {
    "BD-feat-123": {
      "artifactId": "BD-feat-123",
      "path": "artifacts/business-design.md",
      "version": "0.2.0",
      "contentHash": "sha256:...",
      "updatedAt": "2026-07-08T10:00:00Z"
    },
    "SD-feat-123": {
      "artifactId": "SD-feat-123",
      "path": "artifacts/solution-design.md",
      "version": "0.1.0",
      "contentHash": "sha256:...",
      "updatedAt": "2026-07-08T11:00:00Z"
    }
  }
}
```

## 6. 消费者

| 消费者 | 使用字段 | 状态 |
|--------|---------|------|
| 评审矩阵 issue 引用（review-matrix） | `artifactId`, `version` | P0-AST-004 引入 |
| 审批记录锁定（approval） | `artifactId`, `contentHash`（未来） | 当前按路径 + hash 校验 |
| registry 脚本 | `artifactId`, `version`, `contentHash` | 未来，P0 不实现 |
