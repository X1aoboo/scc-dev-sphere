---
name: feature-design-test
description: 测试设计阶段。TSE Agent 产出 test-design.md，包含测试策略、用例、数据、环境和回归范围。按需查询测试规范、历史缺陷和回归范围。
---

# Feature Design — 测试设计

执行测试设计阶段。TSE Agent 产出 `artifacts/test-design.md`。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-design-test [--mode revise]`
- **入参:** 方案设计、实现设计、测试规范查询
- **输出:** `artifacts/test-design.md`、evidence 快照
- **完成标准:** `test-design.md` 已写入，阶段状态更新为 `drafted`

## 执行

1. 加载 TSE Agent。
2. 读取方案设计和实现设计获取测试上下文，读取测试设计模板 `templates/artifacts/test-design.md`。
3. 使用 `knowledge-query` skill 查询：
   - 历史缺陷记录和回归范围
   - 测试规范和验收标准
   - 已有测试资产和覆盖率缺口
4. 按模板生成 `artifacts/test-design.md`。
5. 保存 evidence 快照，更新 `evidence/evidence-registry.json`。
6. 标记无证据前提为 `assumption`。
7. 更新 `state.json` → `stages.testDesign.status = 'drafted'`。

## 修订模式（`--mode revise`）

如果 `testDesign` 已 `human_approved`，修订需要：
1. 在 `decisions/test-design-decisions.md` 中记录修订原因。
2. 记录对验证和转测交付的影响。
3. 标记需要重新评审。

## 约束

- 只修改 `artifacts/test-design.md` 和 `decisions/test-design-decisions.md`。
- 验收标准必须基于可验证的业务规则。
- 回归范围建议必须引用 evidence ID 或决策记录。
