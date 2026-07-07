---
name: feature-design-implementation
description: 实现设计阶段。MDE Agent 产出 implementation-design.md，包含模块结构、调用链、代码模式和技术细节。按需查询代码仓获取存量实现上下文。
---

# Feature Design — 实现设计

执行实现设计阶段。MDE Agent 产出 `artifacts/implementation-design.md`。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-design-implementation [--mode revise]`
- **入参:** 方案设计（`artifacts/solution-design.md`）、代码仓查询
- **输出:** `artifacts/implementation-design.md`、repository evidence 快照
- **完成标准:** `implementation-design.md` 已写入

## 执行

1. 读取 `artifacts/solution-design.md`，读取实现设计模板 `templates/artifacts/implementation-design.md`。
3. 按需查询代码仓中的：
   - 受影响的模块结构和现有实现
   - 关键调用链和依赖图
   - 已有实现模式和技术规范
4. 按模板生成 `artifacts/implementation-design.md`。
5. 保存 repository evidence（路径、符号、调用关系——不复制大段源码）。
6. 标记无证据前提为 `assumption`。

## 修订模式（`--mode revise`）

如果 `implementationDesign` 已 `human_approved`，修订需要：
1. 在 `decisions/implementation-design-decisions.md` 中记录修订原因。
2. 记录对下游阶段（testDesign）和已实现代码的影响。
3. 修订后重置受影响阶段状态。
4. 标记需要重新评审。

## 约束

- 只修改 `artifacts/implementation-design.md` 和 `decisions/implementation-design-decisions.md`。
- 模块变更声明必须可追溯到 evidence ID 或 decision record。
- 代码仓影响分析必须基于实际查询结果，不能凭空推测。
