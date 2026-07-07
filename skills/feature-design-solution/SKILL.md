---
name: feature-design-solution
description: 方案设计阶段。SE Agent 产出 solution-design.md，定义架构方案、组件交互、接口契约、数据流和技术选型。按需查询架构规范和接口契约。
---

# Feature Design — 方案设计

执行方案设计阶段。SE Agent 产出 `artifacts/solution-design.md`。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-design-solution [--mode revise]`
- **入参:** 业务设计（`artifacts/business-design.md`）、架构规范查询
- **输出:** `artifacts/solution-design.md`、evidence 快照
- **完成标准:** `solution-design.md` 已写入且模板章节完整，阶段状态更新为 `drafted`

## 执行

1. 读取 `artifacts/business-design.md` 获取业务上下文，读取方案设计模板 `templates/artifacts/solution-design.md`。
3. 使用 `knowledge-query` skill 查询知识库中的：
   - 存量架构规范和标准
   - 接口契约和 API 文档
   - 跨模块依赖和兼容性约束
4. 按模板生成 `artifacts/solution-design.md`。
5. 保存 evidence 快照，更新 `evidence/evidence-registry.json`。
6. 标记无证据前提为 `assumption`。

## 修订模式（`--mode revise`）

如果 `solutionDesign` 已 `human_approved`，修订需要：
1. 在 `decisions/solution-design-decisions.md` 中记录修订原因。
2. 记录对下游阶段（implementationDesign、testDesign）的影响。
3. 修订后重置受影响阶段状态。
4. 标记需要重新评审。

## 约束

- 只修改 `artifacts/solution-design.md` 和 `decisions/solution-design-decisions.md`。
- 不修改其他阶段的产物。
- 接口契约和系统边界声明必须可追溯到 evidence 或 decision record。
