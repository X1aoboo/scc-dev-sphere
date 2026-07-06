---
name: feature-design
description: 设计编排入口。读取 state.json，只推进当前允许推进的下一个设计阶段。不会自动覆盖已人工批准的阶段产物，除非使用 --mode revise。
---

# Feature Design — 设计编排

编排设计阶段的推进。本 skill 读取当前状态，精确推进一个设计阶段——按顺序处理下一个未开始或未完成的阶段。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-design [--mode revise]`
- **入参:** 当前 state.json
- **输出:** 推进下一个设计阶段（业务 → 方案 → 实现 → 测试 → 集成）
- **完成标准:** 下一阶段设计产物已生成或修订

## 执行

1. 读取 `state.json` 判断哪些阶段已完成、下一个阶段是什么。
2. 根据 `feature-workflow.js` resolver 的输出委派给对应阶段 skill。
3. `--mode revise`：使用指定阶段 skill 的修订模式。
4. 完成后建议：「使用 `/scc-dev-sphere:workflow` 检查是否需要评审。」

## 关键规则

- 绝不覆盖已 `human_approved` 的阶段，除非使用 `--mode revise`。
- 每次调用只推进一个阶段。
- 全部 4 个阶段达到 `ai_review_passed`（或按模式要求达到 `human_approved`）后，生成/刷新 `integrated-design.md`。
