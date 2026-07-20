# Artifact Contract

Feature Design 支持下列独立 Baseline Artifact 类型：

| Design Type | Prefix | Path |
|---|---|---|
| businessDesign | `BD` | `artifacts/business-design.md` |
| solutionDesign | `SD` | `artifacts/solution-design.md` |
| implementationDesign | `IMPL` | `artifacts/implementation-design.md` |
| testDesign | `TD` | `artifacts/test-design.md` |

每份 Draft/Artifact frontmatter 只包含：

```yaml
---
artifactId: "<PREFIX>-<TASK_ID>"
version: "1.0.0"
---
```

`version` 表示正式 Baseline 版本。评审轮次内的语义修订只改变 Draft hash；Baseline 后显式重开才递增正式版本。外层 Workflow 通过 `state.requiredDesignTypes` 声明当前 Feature 需要哪些设计类型，该集合不表达顺序。

`scripts/devsphere-design.js publish` 在当前 Lint、完整 Checklist Review 和人工设计批准都绑定同一 Draft hash 后，将 Draft 原样复制成 Artifact。发布后两者的字节与 hash 必须一致，并触发顶层状态同步。

状态、owner、依赖、Evidence/Decision 引用和内容 hash 不手填进 frontmatter：

- 当前设计活动从 Work、Draft 和 Artifact 事实推导；
- 设计类型之间没有固定顺序或强制上游组合；
- Draft/content hash 由脚本计算；
- Evidence/Decision 引用属于正文；
- 相关活动只读正式 Artifact，不把 Work 当作合同。

总体设计就绪由外层 Workflow 根据 `requiredDesignTypes` 和每份 Artifact 的人工批准判断；不存在复制正文的综合 Artifact。
