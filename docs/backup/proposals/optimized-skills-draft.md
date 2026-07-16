# 优化后的 Skill 定义草案

> 本文件是草案，不覆盖 `skills/*/SKILL.md`。

## 1. 通用 Skill 骨架

```markdown
---
name: <skill-name>
description: <一句话说明入口和责任>
---

# <Skill Title>

## 集成契约
- 入口：
- 执行 Agent：
- 入参：
- 输出：
- 完成标准：

## 前置条件
## 允许写入范围
## 禁止事项
## 执行步骤
## 必须执行的专业动作
## Evidence / Decision / Assumption 规则
## 图示规则
## 质量门禁
## 失败处理
## 修订模式
## 状态流转
## 下游交接契约
```

## 2. `feature-design-business` 草案重点

```markdown
## 必须执行的专业动作
1. 解析需求，建立 REQ/BR/AC 候选。
2. 识别干系人、用户角色、In Scope / Out of Scope。
3. 查询业务 evidence，并保存被采用结果。
4. 一次只问一个问题，Q&A 落盘。
5. 建模正常流、异常流、替代流和状态模型。
6. 输出业务规则清单、决策表、术语、输入输出数据。
7. 建立需求追溯矩阵。
8. 标记 assumption 和 open question。
9. 运行 `design-template-check` 与 `design-quality-gate`。

## 下游交接契约
- business goals
- BR/REQ/AC matrix
- scope boundary
- current-state evidence
- assumptions/open questions
```

## 3. `feature-design-solution` 草案重点

```markdown
## 必须执行的专业动作
1. 解析 business-design，建立需求到架构映射。
2. 生成 C4 Context / Container / Component 视图。
3. 生成 4+1 视图覆盖矩阵。
4. 设计系统边界、模块边界、接口契约、数据模型、数据流。
5. 设计兼容、迁移、回滚、质量属性场景。
6. 执行轻量 ATAM：备选方案、敏感点、trade-off、风险。
7. 涉及安全边界时执行 STRIDE。
8. 写入 DEC 和 RISK。
9. 对 implementation/test 输出交接契约。
```

## 4. `feature-design-implementation` 草案重点

```markdown
## 必须执行的专业动作
1. 查询 repo evidence：模块、路径、符号、调用链。
2. 设计模块职责、文件影响、类/接口/函数。
3. 设计 DTO/Entity/配置对象影响。
4. 生成 sequence/data-flow/stateDiagram。
5. 覆盖错误处理、并发事务、幂等、日志指标、测试钩子。
6. 设计回滚和实现风险。
7. 对 DEV 和 TSE 输出交接契约。
```

## 5. `feature-design-test` 草案重点

```markdown
## 必须执行的专业动作
1. 读取 business/solution/implementation。
2. 建立 BR/API/MOD/RISK -> TEST 追溯矩阵。
3. 按测试金字塔设计 unit/contract/integration/e2e/manual。
4. 设计异常、边界、权限、安全、性能、兼容测试。
5. 定义测试数据、环境、Mock/Stub。
6. 标记不可测项和 residual risk。
7. 输出转测准入标准。
```

## 6. `feature-review` 草案重点

```markdown
## Issue 类型
- blocking：必须修复。
- advisory：需要人工决定 apply/no_change/convert_to_blocking。
- risk_candidate：需要人工决定 accepted_risk/mitigated/rejected。

## Issue 必填字段
- issueId
- artifactId
- artifactVersion
- reviewerAgent
- type
- status
- location
- summary
- expectedFix or humanDecision
- round
- closureEvidence
```

## 7. 新增 `design-quality-gate` 草案

```markdown
## 集成契约
- 入口：`/scc-dev-sphere:design-quality-gate --target <artifact-type>`
- 输出：`quality-gates/QG-*.json`
- 完成标准：每个检查项有 pass/warn/fail/requires_human 和恢复路径。

## 禁止事项
- 不修改设计正文。
- 不关闭 review issue。
- 不接受风险。
- 不直接推进 design_ready。
```

## 8. 新增 `design-template-check` 草案

```markdown
## 检查项
- frontmatter
- 必填章节
- 占位符残留
- 空表格
- Mermaid code block
- evidence/decision/assumption/risk/requirement/test ID 格式
- 下游交接契约
```

## 9. 新增 `design-integration-check` 草案

```markdown
## 目标
生成或校验 `artifacts/integrated-design.md`，检查 business -> solution -> implementation -> test 的一致性。

## 禁止事项
integrated-design 不引入新事实，只汇总已评审产物和已确认决策。
```

