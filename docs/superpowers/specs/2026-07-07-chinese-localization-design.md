# scc-dev-sphere 中文化设计 Spec

## 1. 概述

将 scc-dev-sphere 插件的 Agent 定义（6个）和 Skill 工作流文档（17个）从英文改为中文，面向中国开发者提升易用性。脚本层（7个 JS 文件）和模板层（8个文件）保持英文。

## 2. 范围边界

| 组件 | 中文化 | 保持英文 |
|------|--------|---------|
| Agent 定义 (6个) | 角色名(展示标题)、description、核心职责、知识查询指引、设计原则 | `name:` frontmatter 字段 |
| Skill SKILL.md (17个) | 标题、description、集成契约、执行步骤、引导语、约束条件 | `name:` frontmatter、`--target`/`--mode` 等参数名、Skill名引用 |
| 脚本 (7个) | 不修改 | 全部保持英文 |
| 模板 (8个) | 不修改（已部分中文） | 全部保持现状 |

## 3. 中文化原则

1. **`name:` 字段不动** — YAML frontmatter 中的 `name:` 是 Claude Code 识别 Skill/Agent 的机器标识符，保持 `feature-init`、`sa` 等英文
2. **`description:` 中文化** — 这是 Claude Code 自动匹配触发的描述字段，用中文提升匹配准确度
3. **标题和正文全中文化** — Agent 角色说明、Skill 执行步骤、约束条件等面向开发者的内容
4. **技术标识符保留英文** — `state.json`、`nextAction`、`blocking`、`workflowMode`、`review-matrix.json` 等插件内部概念保持原样；Skill 名引用（如 `feature-design-business`）保持英文
5. **入口路径不变** — `/scc-dev-sphere:workflow` 等斜杠命令不变
6. **角色缩写保留大写** — SA、SE、MDE、DEV、TSE、CIE 作为展示名保持大写，中文角色名作为补充说明

## 4. Agent 中文化

### 通用模板

每个 Agent 文件按以下结构改造：

```markdown
---
name: <英文标识符，不变>
description: <中文角色描述>
---

# <英文缩写> — <中文角色名>

<中文角色定位说明>

## 核心职责

<中文化的职责列表，Skill名称引用保持英文>

## 知识查询指引

<中文指引>

## 设计原则 / 关键规则 / 触发条件

<中文说明>

## 产物责任

<中文化>
```

### 6个 Agent 中文角色名

| Agent | 英文缩写 | 中文角色名 | description 要点 |
|-------|---------|-----------|-----------------|
| sa.md | SA | 业务分析师 | 需求业务分析、业务规则梳理、边界定义、术语一致性 |
| se.md | SE | 系统架构师 | 系统方案设计、架构一致性、接口契约、跨模块评审 |
| mde.md | MDE | 模块开发专家 | 模块实现设计、影响面分析、功能点拆解、代码仓查询 |
| dev.md | DEV | 开发工程师 | 实现计划、代码落地、本地验证、开发风险反馈 |
| tse.md | TSE | 测试工程师 | 测试策略、验收标准、回归风险、可测性评审 |
| cie.md | CIE | 构建部署工程师 | 按需触发：部署/配置/流水线/环境风险 |

## 5. Skill 中文化

### 通用模板

每个 SKILL.md 文件按以下结构改造：

```markdown
---
name: <英文标识符，不变>
description: <中文触发描述>
---

# <英文Skill名> — <中文标题>

<中文定位说明>

## 集成契约
- **入口:** `/scc-dev-sphere:<skill-name> [参数]`
- **入参:** <中文说明>
- **输出:** <中文说明>
- **完成标准:** <中文说明>

## 执行步骤 / 参数 / 前置检查 / 人工闸口
<全部中文，但技术参数名保持英文>
```

### 17个 Skill 中文标题

| Skill | 中文标题 | description 要点 |
|-------|---------|-----------------|
| workflow | 主编排入口 | 读取任务状态、计算下一步动作、引导执行 |
| status | 状态查看 | 只读：展示任务摘要、待确认事项、下一步建议 |
| feature-init | 创建需求任务 | 创建工作区、初始化状态文件 |
| feature-assess | 复杂度评估 | 风险分析、工作流模式推荐 |
| feature-design | 设计编排 | 按状态推进下一个设计阶段 |
| feature-design-business | 业务设计 | SA 产出 business-design.md |
| feature-design-solution | 方案设计 | SE 产出 solution-design.md |
| feature-design-implementation | 实现设计 | MDE 产出 implementation-design.md |
| feature-design-test | 测试设计 | TSE 产出 test-design.md |
| feature-review | 交叉评审 | AI 评审修订闭环，输出阻塞/建议/风险 |
| feature-approve | 最终批准 | 人工闸口，生成设计批准记录 |
| feature-plan-implementation | 实现计划 | DEV 产出开发执行计划 |
| feature-implement | 代码落地 | 人工闸口，执行代码变更 |
| feature-verify | 验证与转测 | 本地验证，生成转测包 |
| knowledge-query | 知识查询 | MCP 查询策略、证据保存 |
| backend-development | 后端开发 | 后端 API/服务/数据层开发上下文 |
| frontend-development | 前端开发 | 前端页面/组件/交互开发上下文 |
| fullstack-change-planning | 全栈变更规划 | 前后端联动协调 |

## 6. 实施要点

### 6.1 Agent 改造要点

- 6个文件，结构高度一致
- `name:` 保持 `sa, se, mde, dev, tse, cie`
- 正文中角色名用「SA — 业务分析师」格式
- 引用 Skill 名时保持英文（如 `feature-design-business`）
- 引用脚本路径保持英文（如 `scripts/devsphere-state.js`）

### 6.2 Skill 改造要点

- 17个文件，分三类：
  - **主编排类**（workflow, status）：引导语展示文本中文化
  - **阶段执行类**（10个 feature-*）：集成契约 + 执行步骤全中文化
  - **专项上下文类**（4个：knowledge-query, backend/frontend/fullstack）：指引中文化
- 参数引用保持英文：`$ARGUMENTS`、`--target`、`--mode revise`
- 文件路径保持英文：`artifacts/business-design.md`、`reviews/review-matrix.json`

### 6.3 不修改的文件

- `scripts/` 下所有 7 个 JS 文件
- `templates/` 下所有 8 个模板文件
- `hooks/hooks.json`
- `.claude-plugin/plugin.json`
- `.mcp.json`

## 7. 验收标准

- [ ] 6个 Agent 文件 `description:` 和正文全部中文化
- [ ] 17个 Skill 文件 `description:` 和正文全部中文化
- [ ] 所有 `name:` frontmatter 保持英文不变
- [ ] Skill 名引用、参数名、文件路径保持英文
- [ ] 所有文件 YAML frontmatter 仍然有效
- [ ] 斜杠命令入口 `/scc-dev-sphere:*` 仍然可正常触发
- [ ] 脚本文件未被修改
