# scc-dev-sphere

`scc-dev-sphere` 是一个 Claude Code Plugin，用 Skill 指导从需求澄清、协作式设计、总体批准到实现和验证的 Feature 工作流。

它不实现独立 Agent Runtime。顶层 Workflow 只治理稳定大阶段；Feature Design 的专业方法由主会话中的一个 Skill 承担，确定性 Node.js 脚本只负责适合机器判断的文件、hash、Lint、Review 与批准合同。

## 运行要求

- Claude Code `2.1.172` 或更高版本。Knowledge Query 依赖该版本支持的嵌套 Subagent；不提供旧版本 fallback。
- Node.js，用于运行 `scripts/*.js` 合同脚本。

## Feature 生命周期

```text
initialized
→ clarified
→ designing
→ design_ready
→ approved_for_implementation
→ implementation_planned
→ implementing
→ verification_ready
→ completed
```

顶层 `state.json` 保存这些稳定状态和外层要求的 `requiredDesignTypes`，不保存设计活动内部游标。

`designing` 内部由 `feature-design` 在主会话完成当前一个设计活动：

```text
恢复工作空间与专业上下文
→ 核心语义分析与用户确认
→ Draft / Lint
→ isolated Checklist Review
→ Baseline
```

业务、方案、实现和测试设计共享同一过程，但各自只负责当前专业设计。外层 Workflow 按 Requirement → Business → Solution → Implementation → Test 的固定顺序派发设计活动，并在正式进入每一阶段前校验上游 Baseline；`requiredDesignTypes` 只声明当前任务需要交付的 Baseline 集合，不保存阶段游标。

## Skill-first Feature Design

`skills/feature-design/SKILL.md` 是通用设计方法的唯一事实源：

- 先调查项目事实，再询问用户；
- 用 design tree 组织决策依赖，用 frontier 表示当前已解锁问题；
- 高影响、模糊、高风险问题单独深入，真正独立的问题可批量讨论；
- 每个重要问题提供当前理解、推荐、理由、替代方案和代价；
- 按复杂度组织设计段落，并逐段取得用户确认；
- 已确认设计发生变化前必须说明原因与影响并重新确认；
- 设计收敛后才生成 Draft。

设计类型差异按需加载：

```text
skills/feature-design/references/
├── design-guides/
│   ├── business-design.md
│   ├── solution-design.md
│   ├── implementation-design.md
│   └── test-design.md
├── specs/
│   ├── business-design.md
│   ├── solution-design.md
│   ├── implementation-design.md
│   └── test-design.md
└── review-checklists/
```

Design Guide 保存专业边界、原则、分析透镜、高价值矛盾、风险缩放、Checklist 导航和收敛标准。Spec 定义各 Design Draft 的内容合同并按专业需要组织固定与条件内容；Checklist 自身定义适用条件、评审规则和具体检查项。

## Draft、Review 与 Baseline

每个设计活动的正式路径如下：

```text
work/<design-slug>/draft.md
→ deterministic lint
→ one isolated Reviewer per applicable Checklist
→ reviews/<design-slug>/summary.json
→ human design approval
→ artifacts/<design-slug>.md
→ state sync
```

- Lint 只检查 frontmatter、固定章节与标题层级、适用的确定性声明、占位符和明显格式，不判断专业质量。
- 所有 Reviewer 接收同一个冻结 Draft 和 hash；每个 Reviewer 只读 Draft、自己的 Checklist 和评审所需的相关正式材料。
- Reviewer 只返回有实际影响的 `blocking`、`advisory`、`risk`；没有问题直接通过。
- 语义修改改变 hash 并使当前活动全部适用 Review 失效；纯空白/注释格式变化可以在重新 Lint 后刷新 Review hash。
- `publish` 原样复制最终批准 Draft，Artifact 内容必须与 Draft 完全一致。
- Baseline 后显式重开会保留历史版本并递增正式版本。

每份 Baseline 发布后返回 Workflow，由 Workflow 根据外层 `requiredDesignTypes` 判断保持 `designing` 或进入 `design_ready`。总体批准读取当前要求的 Baseline 集合，不依赖综合设计正文或 Review Matrix。

## Knowledge、Evidence 与 Decision

Knowledge Query 按独立主题创建 Query Subagent；Query 可为生效配置中的每个数据源创建嵌套只读 Subagent。查询返回候选知识、来源、冲突和 gap，不询问用户、不写 Evidence、不做设计决定。

主会话只登记实际支持或改变设计的结果：一条 Evidence 对应一个主题，可包含多个带 `S1/S2/...` 局部标记的来源，也可包含用户来源和冲突信息。

每阶段一份轻量 Decision 文档，只记录实质取舍：背景、用户补充、候选方案、推荐、最终决定、理由、影响与 Evidence 引用。Decision 不含 pending 状态、`askMode`、固定分类或固定选项数量，也不参与 Draft/Artifact 门禁。

## 工作区

```text
.devsphere/tasks/feature/<task-id>/
├── state.json
├── inputs/
├── work/
├── evidence/
├── decisions/
├── quality-gates/
├── reviews/
├── approvals/
├── artifacts/
├── implementation/
├── verification/
└── links/
```

Work 是恢复所需的临时材料，不是下游合同。下游只消费 `artifacts/` 中已 Baseline 的正式文件。

## 主要命令

```bash
# 顶层路由与状态
node scripts/devsphere-workflow.js <workspace-root>
node scripts/workflows/feature-workflow.js set-task-status <workspace-root> <status>

# 设计活动识别与恢复
node scripts/devsphere-design.js inspect-workspace <task-path> [design-type]
node scripts/devsphere-design.js init-design <task-path> <design-type>
node scripts/devsphere-design.js inspect-design <task-path> <design-type>

# Draft、Review、Baseline
node scripts/devsphere-design.js lint <task-path> <design-type>
node scripts/devsphere-design.js record-review <task-path> <design-type> '<summary-json>'
node scripts/devsphere-design.js approve-current-design <task-path> <design-type> '<approval-json>'
node scripts/devsphere-design.js publish <task-path> <design-type>
node scripts/devsphere-design.js reopen <task-path> <design-type>
node scripts/workflows/feature-workflow.js sync-design-status <workspace-root>

# 总体就绪与批准
node scripts/devsphere-design.js design-ready <task-path>
node scripts/devsphere-approval.js validate-design-ready <task-path>
node scripts/devsphere-approval.js approve-design <task-path> '<approval-json>'
```

## Hooks

Hooks 只保留顶层实现/总体批准入口、Evidence 写入和知识源配置的确定性保护。需求澄清由主会话 Skill 与独立 Reviewer 完成，不再维护程序化 Checklist。设计内部不再通过 Hook 阻塞 Decision、维护 Review Matrix 或同步阶段状态。

## 验证

```bash
node --test scripts/test/*.test.js
claude plugin validate --strict .
git diff --check
git status --short --untracked-files=all
```

合同测试覆盖顶层 Workflow、工作空间事实驱动的设计活动识别、恢复不确定性、Spec/Lint、Draft hash、Reviewer 隔离、完整复评、原样发布、状态同步、Evidence/Decision、Knowledge 多源汇总，以及旧控制路径不再进入插件表面。

## License

MIT
