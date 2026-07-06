---
name: knowledge-query
description: 通过 MCP 工具查询私域知识库。负责查询策略、证据筛选、引用规范和证据不足判断。
---

# Knowledge Query — 知识库查询

通过 MCP 工具查询私域知识库并管理证据收集。本 skill 被所有 Agent（SA、SE、MDE、DEV、TSE）在各阶段使用。

## 集成契约

- **入口:** `/scc-dev-sphere:knowledge-query`
- **入参:** 调用 Agent 的查询意图
- **输出:** 结构化搜索结果，evidence 快照保存到 `evidence/knowledge/`
- **完成标准:** 查询结果已返回，evidence 快照已保存（如结果被设计采纳）

## 执行

### 步骤1：理解查询意图

调用 Agent 需明确：
- 要查找什么（业务规则、架构规范、代码模式、测试标准等）
- 为什么需要（支撑哪个产物/决策）
- 要求的置信度

### 步骤2：执行 MCP 查询

使用可用的 MCP 知识库工具搜索。如果初次结果不足，尝试多种查询方式。

### 步骤3：评估结果

对每个结果评估：
- 与查询意图的相关性
- 来源可靠性和时效性
- 是否足够还是需要补充查询

### 步骤4：保存证据

对于将被用于设计产物的结果：
1. 分配 evidence ID（EV-xxx）
2. 保存快照到 `evidence/knowledge/EV-xxx-<描述性名称>.md`
3. 更新 `evidence/evidence-registry.json` 添加新条目

### 步骤5：标记证据缺口

如果无法找到预期信息：
- 在 evidence registry 中记录缺口（`confidence: "low"` 或 `status: "not_found"`）
- 报告给调用 Agent，以便其标记 assumption 或提请人工澄清
