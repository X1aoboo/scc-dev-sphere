---
name: feature-plan-implementation
description: 设计批准后生成开发执行计划。DEV Agent 产出 implementation-plan.md，包含 repo 绑定、文件变更清单、实现步骤顺序、测试命令和风险控制。
---

# Feature Plan Implementation — 生成实现计划

生成开发执行计划，桥接设计和代码实现。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-plan-implementation`
- **入参:** 已批准的设计产物、代码仓访问
- **输出:** `implementation/implementation-plan.md`、`links/repos.json` 中的 repo 绑定
- **完成标准:** 实现计划已生成，状态已推进

## 执行

1. 加载 DEV Agent。
2. 如果尚未绑定 repo，询问用户指定目标代码仓库。写入 `links/repos.json`。
3. DEV Agent 查询代码仓中的模块结构、已有模式、测试命令。
4. 生成 `implementation/implementation-plan.md`，包含：
   - 关联仓库
   - 预计修改的模块/文件
   - 实现步骤顺序
   - 测试和验证命令
   - 回滚/恢复策略
   - 风险点和控制措施
   - 是否需要 CIE 参与

5. 将代码仓证据保存到 `evidence/repository/`。

## 人工确认（高风险或 Strict 模式）

如果 `workflowMode === 'strict-human-loop'` 或任务风险较高：
1. 展示实现计划供人工评审。
2. 等待人工确认。
3. 生成 `approvals/implementation-plan-approval.json`。

## 状态更新

- 普通任务：`status = 'implementation_planned'`
- 高风险/strict：仅在 `implementation-plan-approval.json` 生成后
