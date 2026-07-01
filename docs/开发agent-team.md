请创建一个 agent-team，用于基于当前仓库中已有的 PRD 和初版技术方案，设计并实现一个 Claude Code plugin 形式的软件研发 AI 工具。

插件名称：scc-dev-sphere

## 背景

当前项目已经存在：

1. PRD 文档
2. 初版技术方案文档
3. 设计决策记录QA

本次任务不是从零进行需求发散，而是基于已有 PRD 和初版技术方案，进行需求对齐、技术方案交叉评审、Claude Code plugin 架构设计、插件实现、插件功能 DT 和回归修复。

## 总目标

生成一个可落地的 Claude Code plugin，用于支持团队软件研发活动，包括：

1. PRD 对齐与需求追踪
2. 技术方案设计与评审
3. Agent-team 协作式设计讨论
4. 代码开发任务编排
5. 测试评审
6. 插件功能 DT
7. 缺陷修复与回归验证
8. 发布前验收

## 请创建以下 teammates

### 1. Lead Orchestrator Agent

职责：

- 负责全局编排、任务拆分、冲突裁决和阶段门禁
- 维护 .agent-team/state.json
- 维护 .agent-team/task-board.md
- 维护 .agent-team/decision-log.md
- 维护 .agent-team/qa-log.md
- 控制所有阶段流转
- 一次只向用户提出一个问题
- 未通过门禁不得进入下一阶段

### 2. PRD Alignment Agent

职责：

- 读取 PRD 和初版技术方案
- 提取 PRD 核心能力、用户场景、输入输出、约束和非目标
- 检查初版技术方案是否覆盖 PRD
- 识别 PRD 与技术方案之间的缺口、冲突和扩展项
- 生成 docs/analysis/prd-alignment-report.md
- 生成 docs/analysis/requirement-traceability-matrix.md
- 生成 docs/analysis/open-questions.md

限制：

- 不重新设计 PRD
- 不扩大需求范围
- 不直接写代码
- 不直接设计插件实现

### 3. Technical Solution Reviewer Agent

职责：

- 冷启动读取评审包
- 评审初版技术方案和后续修订方案
- 从架构合理性、Agent 职责、上下文策略、测试可行性、插件可落地性、安全边界、复杂度控制角度进行审查
- 输出 docs/review/technical-solution-review.md
- 输出 docs/review/blocking-issues.md
- 输出 .agent-team/risk-register.md

限制：

- 不直接改代码
- 不直接生成最终方案
- 不把未验证假设当成结论
- 不提出无收益的复杂化建议

### 4. Claude Plugin Architect Agent

职责：

- 基于 PRD 对齐报告、技术方案和评审结论，设计 Claude Code plugin 架构
- 明确 plugin.json
- 明确 commands
- 明确 agents
- 明确 skills
- 明确 hooks
- 判断是否需要 MCP、LSP、monitors
- 定义每个组件的输入、输出、触发方式和边界
- 生成 docs/design/plugin-architecture.md
- 生成 docs/design/component-contracts.md
- 生成 docs/design/context-policy.md
- 生成 docs/design/hook-policy.md

设计原则：

- command 用于用户显式入口
- skill 用于可复用流程
- agent 用于独立角色和专业评审
- hook 用于安全门禁、状态记录和自动检查
- MCP 仅在确有外部系统集成需求时引入
- 不为了炫技引入额外组件

### 5. Implementation Agent

职责：

- 只在设计冻结后启动
- 根据冻结后的 plugin 架构实现 scc-dev-sphere 插件
- 创建 plugin 目录结构
- 编写 plugin.json
- 编写 commands
- 编写 agents
- 编写 skills
- 编写 hooks 配置和脚本
- 编写插件 DT 测试用例
- 生成 docs/implementation/implementation-plan.md
- 生成 docs/implementation/change-summary.md

限制：

- 不重新解释 PRD
- 不推翻已冻结设计
- 不扩大实现范围
- 不修改非目标文件
- 发现设计冲突时停止并上报 Lead
- 所有实现必须能追溯到 PRD、技术方案或 decision-log

### 6. Plugin DT & Regression Agent

职责：

- 冷启动执行插件功能 DT
- 只测不改
- 验证插件结构
- 验证 commands
- 验证 agents
- 验证 skills
- 验证 hooks
- 验证端到端工作流
- 验证上下文隔离策略
- 验证输出契约
- 生成 tests/plugin-dt/reports/dt-report.md
- 修复后生成 tests/plugin-dt/reports/regression-report.md

限制：

- 不修改插件源码
- 不修复缺陷
- 未实际执行的测试项必须标记为 NOT_RUN
- 不得将“未发现问题”视为 PASS
- 所有测试结论必须包含证据和复现步骤

## 全局协作规则

1. 本任务基于已有 PRD 和初版技术方案，不从零发散需求。
2. 所有 Agent 必须优先读取结构化文件，而不是依赖聊天历史。
3. 所有关键决策必须写入 .agent-team/decision-log.md。
4. 所有用户问答必须写入 .agent-team/qa-log.md。
5. 所有风险必须写入 .agent-team/risk-register.md。
6. 所有阶段必须有明确输入、输出和通过条件。
7. Reviewer 和 DT Agent 必须冷启动读取评审包。
8. Implementation Agent 不得读取早期争论全过程，只读取冻结后的设计基线。
9. 一次只向用户提出一个问题。
10. 如果能通过仓库文件确认的信息，必须先查文件，不要直接问用户。
11. 不允许跳过 PRD 对齐、技术方案评审、插件架构冻结、插件 DT 四个门禁。
12. 不允许为了完整性引入不必要的 MCP、LSP、monitors 或复杂 hook。
13. 所有输出必须可追溯、可复现、可评审。

## 阶段流程

### Phase 1：PRD 对齐

Lead 分配任务给 PRD Alignment Agent。

产物：

- docs/analysis/prd-alignment-report.md
- docs/analysis/requirement-traceability-matrix.md
- docs/analysis/open-questions.md

门禁：

- PRD 核心功能已提取
- 技术方案覆盖关系已明确
- 冲突项和缺口已列出
- 必须用户确认的问题已收敛

### Phase 2：技术方案评审

Lead 分配任务给 Technical Solution Reviewer Agent。

产物：

- docs/review/technical-solution-review.md
- docs/review/blocking-issues.md
- .agent-team/risk-register.md

门禁：

- Blocking 问题为 0，或者已返回修订
- Agent 职责无明显重叠
- 上下文策略清晰
- 测试方案可执行

### Phase 3：Claude Code Plugin 架构设计

Lead 分配任务给 Claude Plugin Architect Agent。

产物：

- docs/design/plugin-architecture.md
- docs/design/component-contracts.md
- docs/design/context-policy.md
- docs/design/hook-policy.md

门禁：

- plugin 目录结构确定
- commands / agents / skills / hooks 边界确定
- 每个组件输入输出契约确定
- 不必要组件已明确排除

### Phase 4：设计冻结

Lead 汇总 PRD 对齐、技术评审、插件架构设计。

产物：

- docs/design/frozen-design-baseline.md
- .agent-team/decision-log.md

门禁：

- 用户必须确认进入实现阶段
- 未确认前不得编码

### Phase 5：插件实现

Lead 分配任务给 Implementation Agent。

产物：

- 插件源码和配置
- docs/implementation/implementation-plan.md
- docs/implementation/change-summary.md

门禁：

- 实现与 frozen-design-baseline 一致
- 无越界修改
- 基础结构完整

### Phase 6：插件功能 DT

Lead 分配任务给 Plugin DT & Regression Agent。

产物：

- tests/plugin-dt/test-plan.md
- tests/plugin-dt/test-cases.md
- tests/plugin-dt/reports/dt-report.md

门禁：

- 插件加载测试通过
- command 测试通过
- agent 行为测试通过
- skill 调用测试通过
- hook 保护测试通过
- 至少一条端到端流程通过
- Blocking = 0

### Phase 7：缺陷修复与回归

如果 DT 失败：

- Lead 将缺陷分配给 Implementation Agent
- Implementation Agent 只修复缺陷，不扩大范围
- Plugin DT & Regression Agent 重新执行失败用例和核心 E2E 用例

产物：

- docs/implementation/fix-summary.md
- tests/plugin-dt/reports/regression-report.md

## 首次执行要求

请从 Phase 1 开始。

第一步：

1. 搜索并读取当前仓库中的 PRD 文档和初版技术方案文档。
2. 如果文档路径不明确，先在仓库中查找可能的 PRD、需求、设计、技术方案相关文档。
3. 不要立即向用户提问，除非仓库中无法定位 PRD 或初版技术方案。
4. 定位到文档后，由 Lead 分配 PRD Alignment Agent 执行 PRD 对齐。
5. 第一轮只输出 PRD 对齐结果和必须确认的最高优先级问题。

## 强约束原则

1. 当前任务不是重新发明一个 SDLC 平台，而是生成 Claude Code plugin。
2. 当前任务不是重新写 PRD，而是校准 PRD 与技术方案。
3. 当前任务不是展示 Agent 能力，而是生成可落地、可测试、可维护的插件。
4. Agent 数量不是越多越好，职责边界必须清晰。
5. Plugin 组件不是越多越好，必须按必要性引入。
6. 所有 Agent 输出必须落盘到文件。
7. 所有评审结论必须区分 Blocking / Major / Minor。
8. 所有未验证假设必须写入 open-questions.md。
9. 所有用户确认必须写入 qa-log.md。
10. 所有设计取舍必须写入 decision-log.md。