# Handoff：Feature Design Skill-first 重构

## 权威上下文

- 唯一权威规格：[Feature Design Skill-first 重构设计规格](../design-refactor/06-skill-first-feature-design-refactor.md)。
- 规格已在 2026-07-20 根据实际 Skill 使用模型修订：业务、方案、实现和测试设计是独立 Design Types，不是 `feature-design` 内部的固定顺序阶段。
- `feature-design` 固定“如何完成当前一次专业设计”；外层 Workflow 通过 `state.requiredDesignTypes` 定义当前 Feature 需要哪些设计活动。

## 当前实现

- `skills/feature-design/SKILL.md` 使用五个线性 Task 强化固定过程：恢复与加载、核心设计、Draft、Review、Baseline 与状态同步。
- 调查事实、design tree/frontier、专业推荐与挑战、用户回答后重算、动态分段和逐段确认保留在主 Skill。
- 专业差异位于 `references/design-guides/`；四份 Specs 保持独立；Review Checklists 使用中文的适用条件、评审规则和具体检查项。
- `stage-contracts.json` 和 `references/stages/` 已删除。
- `scripts/devsphere-design.js` 从固定 Stage 顺序改为独立 Design Type：从 Work/Draft/Artifact 推断当前活动，歧义时要求用户确认，Baseline 后同步顶层状态。
- Review 每轮只创建一个隔离 `design-reviewer`，在内部串行执行适用 Checklist、按需查询知识并维护 `work/<design-slug>/review.json`；主会话只处理 findings 和设计修订。临时摘要在 Baseline 发布后删除，Lint 实时计算且不持久化；plan JSON、allowedReads 计划、disposition 状态机和跨阶段 Review Matrix 均不保留。
- 外层总体批准绑定 `requiredDesignTypes` 对应的当前 Baseline 集合。

## 验证

- `node --test scripts/test/*.test.js`：52 passed。
- `claude plugin validate --strict .`：passed。
- `git diff --check`：passed。
- `skill-creator` 的 `quick_validate.py` 已尝试运行，但当前两个可用 Python 运行时都缺少 `PyYAML`；未为此安装新依赖。Claude Plugin 严格校验已覆盖 frontmatter 与插件结构。

## 剩余验收

- 完成隔离前向测试，检查真实首轮是否先调查与分析，再给出推荐、风险挑战和一个最高价值问题。
- 最终仍需要在真实 Claude Code 主会话中完成一次完整设计活动，主观验收连续协作体验；自动合同测试不能替代该验收。
