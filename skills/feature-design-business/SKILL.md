---
name: feature-design-business
description: 业务设计阶段。SA Agent 分析需求，定义业务规则、范围边界、术语和异常流程。按需查询知识库获取存量业务上下文。
---

# Feature Design — 业务设计

执行业务设计阶段。SA Agent 分析需求并产出 `artifacts/business-design.md`。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-design-business [--mode revise]`
- **入参:** 需求输入（来自 `inputs/requirement.md`）、知识库查询
- **输出:** `artifacts/business-design.md`、evidence 快照（在 `evidence/knowledge/`）
- **完成标准:** `business-design.md` 已写入且模板章节完整

## 执行

1. 读取 `inputs/requirement.md` 和业务设计模板 `templates/artifacts/business-design.md`。
3. 使用 `knowledge-query` skill 查询知识库中的：
   - 受影响领域的存量业务规则
   - 历史需求设计
   - 当前系统行为文档
4. 按模板生成 `artifacts/business-design.md`。
5. 将所有实际使用的知识库结果保存为 evidence（`evidence/knowledge/EV-xxx-*.md`）。
6. 更新 `evidence/evidence-registry.json` 添加新条目。
7. 在 design 文档中将无证据前提标记为 `assumption`。

## 修订模式（`--mode revise`）

如果 `businessDesign` 已 `human_approved`，修订需要：
1. 在 `decisions/business-design-decisions.md` 中记录修订原因。
2. 记录对下游阶段（solutionDesign、implementationDesign、testDesign）的影响。
3. 修订后，将受影响的下游阶段状态重置为 `drafted`。
4. 标记需要重新评审。

## 约束

- 只修改 `artifacts/business-design.md` 和 `decisions/business-design-decisions.md`。
- 不修改其他阶段的产物。
- 所有关于存量业务行为的结论必须引用 evidence ID。
