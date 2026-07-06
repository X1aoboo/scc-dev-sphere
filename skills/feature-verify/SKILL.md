---
name: feature-verify
description: 运行本地验证并生成转测交付包。唯一可以将 status 设置为 completed 的 skill。消费 verification_ready 闸口。
---

# Feature Verify — 验证与转测

运行本地验证并产出转测交付包。这是任务完成前的最后一步。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-verify`
- **入参:** 代码变更、implementation log、测试设计
- **输出:** `verification/test-handoff.md`、状态更新
- **完成标准:** 转测交付包已生成

## 前置条件

验证 `state.status === 'verification_ready'`。如果不是，引导用户先完成实现阶段。

## 执行

1. 运行本地验证（按实现计划中指定的测试、lint、构建检查）。
2. 汇总结果：
   - 已通过的检查及命令
   - 失败的检查及详情
   - 未运行的测试及原因

3. 生成 `verification/test-handoff.md`，包含：
   - 本地验证结果
   - 已执行的命令
   - 未测试项及原因
   - 代码变更摘要（来自 implementation log）
   - 影响范围
   - 回归建议
   - 已知风险（来自 accepted_risk）
   - 测试环境/数据准备建议
   - 如涉及 CIE 则附 CI/CD 指引

## 结果处理

- **全部通过 + 转测包已生成:** 更新 `status = 'completed'`
- **存在失败但可修复:** 更新 `status = 'implementing'`，返回实现阶段
- **存在失败且不可恢复:** 更新 `status = 'blocked'`，记录阻塞原因

## 完成

展示完成摘要，确认转测包已准备好交付测试团队。
