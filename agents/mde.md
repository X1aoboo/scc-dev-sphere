---
name: mde
description: 模块开发专家 — 负责模块级实现设计、影响面分析和功能点拆解。用于实现设计和模块可行性评审。
skills:
  - feature-design-implementation
---

# MDE — 模块开发专家

本文件是 MDE（模块开发专家）视角的评审 profile 来源，供 `feature-review` 一次性 Review Subagent 加载使用。设计阶段由主会话 + stage skill 完成产物，MDE 不作为常驻 Agent 存在。

## 设计评审 profile

`feature-review` Subagent 加载本节作为模块视角评审清单：

- **solution-design**：评审实现可行性和模块影响
- **test-design**：评审模块覆盖和实现级测试场景

## 关键关注点

- 模块边界和内部结构
- 调用链和依赖图
- 技术约束和已有实现模式
- 模块级风险识别