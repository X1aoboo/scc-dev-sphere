# 外部测试设计 Skill 阶段集成

- **状态：** 已确认
- **日期：** 2026-07-23
- **范围：** `config/test-design.json`（新增）、`scripts/devsphere-test-design-config.js`（新增）、`scripts/devsphere-guard.js`、`scripts/devsphere-design.js`、`scripts/devsphere-workspace.js`、`scripts/devsphere-approval.js`、`scripts/workflows/feature-workflow.js`、`skills/workflow/SKILL.md`、新增测试
- **不在范围：** 外部测试设计 Skill 的实现、复制、安装和版本维护；历史任务迁移

## 1. 背景与目标

测试团队独立维护用于生成测试设计和测试用例的 Skill。当前团队标准要求默认使用该 Skill，但插件仍需保留现有 `feature-design` 内建 Test Design 能力，供项目显式选择。

本插件增加一个与 `feature-design` 解耦的外部测试设计动作：

- 默认 external：Business、Solution、Implementation Design 完成后，调用独立安装的外部 Skill；
- 可选 builtin：继续由 `feature-design` 生成 `testDesign`；
- 两种测试设计严格互斥；
- 外部 Skill 是一次性动作，不设置“进行中”状态；workflow 保留调用前的一次用户确认，Skill 执行过程中不再发起交互；
- 插件只负责调用时机、输入上下文、完成状态和总体批准准入；
- 插件不读取、解析、校验、登记或执行外部 Skill 生成的测试设计和测试用例。

## 2. 已确认决策

| 决策点 | 结论 |
|---|---|
| 默认模式 | `external`，符合当前团队标准 |
| 项目覆盖 | 项目可通过 `.devsphere/config/test-design.json` 显式选择 `builtin` 或替换外部 Skill ID |
| 模式生效时机 | 仅在新任务初始化时读取并固化；任务生命周期内不切换 |
| 历史任务 | 不迁移、不兼容、不推断 |
| 互斥关系 | external 省略 builtin `testDesign`；builtin 不调用外部 Skill |
| 外部 Skill 归属 | 独立安装并由测试团队维护；本插件不归档副本 |
| 调用位置 | `feature-design` 完成、状态进入 `design_ready` 之后，总体批准之前 |
| 调用方式 | workflow 按现有 `run_skill` 合同询问一次是否继续；确认后在主会话内联调用，无 Agent，Skill 内部无交互 |
| 状态模型 | 成功调用后从 `design_ready` 单向进入 `external_test_design_ready`；无 `external_test_designing` |
| 完成判定 | Skill 正常结束后调用确定性完成命令；失败或中断保持 `design_ready` |
| 完成事实 | 仅记录 `skillId` 和 `completedAt`，不维护 receipt 文件、输入 hash 或输出 manifest |
| 输出位置 | 固定写入当前任务的 `artifacts/test-design/`；插件不约束该目录内的文件名和结构 |
| 总体批准 | builtin 从 `design_ready` 批准；external 仅从 `external_test_design_ready` 批准 |
| 产物消费 | 插件不消费外部测试产物；`feature-verify` 行为不变 |

## 3. 生命周期与职责边界

### 3.1 builtin

```text
designing
  ├─ Business Design
  ├─ Solution Design
  ├─ Implementation Design
  └─ Test Design（feature-design）
      → design_ready
      → feature-approve
      → approved_for_implementation
```

`requiredDesignTypes` 保持现有四类：

```json
[
  "businessDesign",
  "solutionDesign",
  "implementationDesign",
  "testDesign"
]
```

### 3.2 external

```text
designing
  ├─ Business Design
  ├─ Solution Design
  └─ Implementation Design
      → design_ready
      → 调用外部测试设计 Skill
      → external_test_design_ready
      → feature-approve
      → approved_for_implementation
```

`requiredDesignTypes` 只包含三类前置设计：

```json
[
  "businessDesign",
  "solutionDesign",
  "implementationDesign"
]
```

external 模式下：

- `feature-design` 不会收到 `testDesign`；
- `artifacts/test-design.md` 不是必需 Artifact；
- 外部 Skill 的全部输出固定写入 `artifacts/test-design/`；
- 外部测试设计不是 Feature Design Type，不进入 `DESIGN_SEQUENCE`、Design Lint、Checklist Review 或单项 Design Approval；
- 外部 Skill 正常结束是阶段完成事实，不代表插件对其产物质量做出判断。

## 4. 配置合同

### 4.1 插件默认配置

新增 `config/test-design.json`：

```json
{
  "mode": "external",
  "externalSkillId": "ai-test-designer"
}
```

### 4.2 项目覆盖配置

项目可创建 `.devsphere/config/test-design.json`。项目文件存在时，它是完整的有效配置，不与插件默认配置合并。

选择 builtin：

```json
{
  "mode": "builtin"
}
```

替换外部 Skill：

```json
{
  "mode": "external",
  "externalSkillId": "another-test-designer"
}
```

### 4.3 读取与校验

新增边界明确的 `scripts/devsphere-test-design-config.js`，不扩展为通用配置框架：

```javascript
function readEffectiveTestDesignConfig(workspaceRoot) {
  // 项目配置存在时读取项目配置，否则读取插件默认配置。
  // 返回经过严格校验的 { mode, externalSkillId? }。
}
```

校验规则：

- `mode` 只能是 `external` 或 `builtin`；
- `external` 必须具有非空字符串 `externalSkillId`；
- `builtin` 不允许携带 `externalSkillId`；
- JSON 非法、字段缺失或存在不支持的值时，`feature-init` 失败；
- 不允许非法 external 配置静默降级为 builtin。

配置只在创建新任务时读取。任务创建后，resolver、状态同步、完成命令和批准门均只读取任务 `state.json`。

## 5. 新任务初始化与互斥不变式

`createFeatureTask(workspaceRoot, taskId)` 读取有效配置，并把结果传给 `initState`。

external 新任务：

```json
{
  "requiredDesignTypes": [
    "businessDesign",
    "solutionDesign",
    "implementationDesign"
  ],
  "externalTestDesign": {
    "skillId": "ai-test-designer"
  },
  "status": "initialized"
}
```

初始化同时创建固定输出根目录 `artifacts/test-design/`。builtin 新任务不创建该目录。

builtin 新任务：

```json
{
  "requiredDesignTypes": [
    "businessDesign",
    "solutionDesign",
    "implementationDesign",
    "testDesign"
  ],
  "status": "initialized"
}
```

新任务必须满足严格互斥：

```text
externalTestDesign 存在  <=>  requiredDesignTypes 不包含 testDesign
externalTestDesign 不存在 <=> requiredDesignTypes 包含 testDesign
```

不为改造前创建、缺少新合同的任务提供兼容或迁移逻辑。

## 6. 状态机

`scripts/devsphere-guard.js` 的状态表增加 `external_test_design_ready`，并导出 `TRANSITIONS` 供 workflow 的确定性命令复用：

```javascript
const TRANSITIONS = {
  // ...
  designing: ['design_ready', 'blocked'],
  design_ready: ['external_test_design_ready', 'approved_for_implementation', 'designing'],
  external_test_design_ready: ['approved_for_implementation', 'designing'],
  approved_for_implementation: ['implementation_planned', 'designing'],
  // ...
};
```

该表是两种模式的合法迁移并集。专用命令和批准门负责模式约束：

- builtin 不允许进入 `external_test_design_ready`；
- external 不允许从 `design_ready` 直接批准；
- `complete-external-test-design` 是进入 `external_test_design_ready` 的唯一业务命令；
- generic `set-task-status` 不允许调用者绕过上述约束。

不新增 `external_test_designing`、`test_ready` 或状态回环。

## 7. 设计状态同步与中断恢复

`syncDesignState` 不感知 external/builtin 配置，继续只根据 `state.requiredDesignTypes` 判断 Design Baseline 是否齐全：

```text
designing + designReady(valid)   → design_ready
designing + designReady(invalid) → designing
```

将 `external_test_design_ready` 加入设计失效回退集合。如果已批准的 Design Baseline 失效：

- 状态回到 `designing`；
- 删除 `state.externalTestDesign.completedAt`；
- 设计重新完成并进入 `design_ready` 后，再次调用外部 Skill；
- 不保存外部 Skill 的历史运行记录。

为修复最后一份 Design Baseline 发布后、状态同步前会话中断的恢复缺口，resolver 在 `designing` 且已无待执行 Design Type 时返回显式动作：

```json
{
  "kind": "sync_design_status",
  "reason": "All required Design Baselines exist. Synchronize the persisted design status."
}
```

workflow 收到后执行现有 `sync-design-status` 命令，然后立即重新运行 resolver。

- resolver 保持只读；
- 不通过 `reason` 字符串推断动作；
- 不再用 `show_status` 表示需要执行的状态同步。

## 8. Resolver

### 8.1 `designing`

仍按 `state.requiredDesignTypes` 选择下一项 Design Type：

- builtin 最后派发 `testDesign`；
- external 最后派发 `implementationDesign`；
- 没有待执行 Design Type 时返回 `sync_design_status`。

### 8.2 `design_ready`

builtin 任务直接派发 `feature-approve`。

external 任务派发独立 Skill：

```javascript
return makeAction(
  'run_skill',
  state,
  'external-test-design',
  null,
  state.externalTestDesign.skillId,
  [],
  'All required Design Baselines are ready. Run the configured external test-design Skill.',
  [
    'inputs/requirement.md',
    'artifacts/business-design.md',
    'artifacts/solution-design.md',
    'artifacts/implementation-design.md'
  ],
  [],
  { taskPath, outputDir: 'artifacts/test-design/' }
);
```

调用 instruction 由 workflow 使用既有无 Agent 分支构造，至少包含：

- `taskId`；
- `taskPath`；
- 四份输入文件的完整任务相对路径；
- 全部输出必须写入 `taskPath/artifacts/test-design/`；
- workflow 已获得本次启动确认，Skill 执行过程中不得再次发起人工交互；
- 正常完成后返回主会话。

插件固定外部测试产物的输出根目录，但不规定其中测试设计和测试用例的文件名、格式或子目录，也不把目录内容加入 `expectedArtifacts`。

### 8.3 `external_test_design_ready`

派发 `feature-approve`，其 required facts 包含三份 Design Artifact 和 `state.externalTestDesign.completedAt`。

## 9. 外部 Skill 完成命令

新增：

```bash
node scripts/workflows/feature-workflow.js complete-external-test-design <workspaceRoot>
```

命令行为：

1. 解析当前活跃任务；
2. 要求 `state.status === 'design_ready'`；
3. 要求 `state.externalTestDesign.skillId` 为非空字符串；
4. 要求 `requiredDesignTypes` 不包含 `testDesign`；
5. 调用 `designReady(taskPath)` 防御性确认三份 Design Baseline 仍然有效；
6. 确认 Requirement、Business、Solution、Implementation Design 四份输入文件存在；
7. 写入 `state.externalTestDesign.completedAt`；
8. 将状态推进到 `external_test_design_ready`；
9. 返回更新后的状态。

命令不读取或验证外部 Skill 的输出文件。

workflow 只在外部 Skill 正常结束后调用该命令。Skill 不可用、报错或执行中断时：

- 不调用完成命令；
- 状态保持 `design_ready`；
- 下次 workflow 可以重新派发；
- 外部 Skill 自身负责使其文件生成行为可安全重试。

## 10. 总体批准门

`validateDesignReady`、`approveDesign` 和 `checkApproveEntry` 根据任务事实执行互斥准入。

### 10.1 builtin

必须满足：

- `state.externalTestDesign` 不存在；
- `state.status === 'design_ready'`；
- `requiredDesignTypes` 包含 `testDesign`；
- 四类 Design Baseline 均有效且具有匹配当前 hash 的人工批准。

总体批准记录保留四类 Design Artifact，不包含 `externalTestDesign`。

### 10.2 external

必须满足：

- `state.externalTestDesign.skillId` 存在；
- `state.externalTestDesign.completedAt` 存在；
- `state.status === 'external_test_design_ready'`；
- `requiredDesignTypes` 不包含 `testDesign`；
- BD、SD、Implementation Design Baseline 均有效且具有匹配当前 hash 的人工批准。

总体批准记录包含三类 Design Artifact，并增加：

```json
{
  "externalTestDesign": {
    "skillId": "ai-test-designer",
    "completedAt": "2026-07-23T00:00:00.000Z"
  }
}
```

总体批准记录不得同时包含 builtin `testDesign` Artifact 和 `externalTestDesign`。

批准成功后，两种模式均进入 `approved_for_implementation`，后续实现规划、实现和验证流程不变。

## 11. workflow Skill 接线

`skills/workflow/SKILL.md` 增加两项行为。

### 11.1 `sync_design_status`

收到该 action 后执行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js sync-design-status ${CLAUDE_PROJECT_DIR}
```

随后立即重新运行 resolver。

### 11.2 外部测试设计完成

当且仅当：

- resolver 在 `design_ready` 派发了 `state.externalTestDesign.skillId`；
- 用户通过现有 `run_skill` 启动确认选择继续；
- Skill 在主会话正常结束；

执行：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/workflows/feature-workflow.js complete-external-test-design ${CLAUDE_PROJECT_DIR}
```

随后重新运行 resolver，下一动作应为 `feature-approve`。

不通过 Shell 调用 Skill，不要求外部 Skill修改 `state.json`，也不要求外部 Skill了解本插件的状态机。

## 12. 测试要求

新增聚焦测试，并更新受状态合同影响的现有测试。

### 12.1 配置

- 无项目覆盖时读取插件默认 external；
- 项目 builtin 覆盖；
- 项目 external Skill ID 覆盖；
- 非法 JSON、非法 mode、external 缺少 Skill ID、builtin 携带 Skill ID均失败；
- 项目配置是完整覆盖，不与默认配置合并。

### 12.2 初始化与互斥

- external 新任务排除 `testDesign` 并固化 Skill ID；
- builtin 新任务保留四类 Design Type 且不写 external 字段；
- 新任务状态满足互斥不变式；
- 修改项目配置不改变已创建任务。

### 12.3 resolver 与恢复

- builtin 依次派发 BD、SD、Implementation、Test Design；
- external 只派发前三类；
- `designing` 且 Baseline 已齐全时返回 `sync_design_status`；
- workflow 执行同步后重新 resolve；
- external `design_ready` 派发配置的外部 Skill，`agents` 和 `expectedArtifacts` 为空；
- external action 的 `args.outputDir` 固定为 `artifacts/test-design/`；
- builtin `design_ready` 直接派发 `feature-approve`；
- `external_test_design_ready` 派发 `feature-approve`。

### 12.4 状态与完成命令

- `design_ready → external_test_design_ready` 合法；
- `external_test_design_ready → approved_for_implementation` 和 `→ designing` 合法；
- builtin 调用完成命令失败；
- external 在非 `design_ready` 状态调用完成命令失败；
- 前置 Design Baseline 无效时完成命令失败；
- 正常完成只记录 `completedAt` 并推进状态，不读取外部产物；
- external 设计失效回退 `designing` 时清除 `completedAt`。

### 12.5 批准门

- builtin 从 `design_ready` 批准成功；
- external 从 `design_ready` 批准失败；
- external 从 `external_test_design_ready` 批准成功；
- external 批准记录包含 `skillId` 和 `completedAt`；
- builtin 批准记录包含 `testDesign` Artifact 且不包含 external 字段；
- 任一批准记录都不能同时包含两类测试设计事实。

### 12.6 完整验证

```bash
node --test scripts/test/*.test.js
claude plugin validate --strict .
git diff --check
```

自动化验证只证明静态合同、状态迁移和确定性脚本行为。独立安装 Skill 的真实可发现性、主会话调用和文件生成仍需在启用 external 的真实 Claude Code 会话中验收。

## 13. 不变式

- external 与 builtin 测试设计严格互斥；
- external 是插件默认，项目可显式覆盖为 builtin；
- 模式只在新任务初始化时读取一次；
- `feature-design` 不执行 external 测试设计；
- external Skill 不属于本插件源码和版本维护范围；
- external Skill 只在 `design_ready` 后以一次性动作调用；调用前保留 workflow 启动确认，Skill 内部无交互；失败或中断不推进状态并允许重新派发；
- 不存在 external 测试设计“进行中”状态；
- 插件不解析、校验、登记或执行 external 测试产物；
- external 测试产物统一写入当前任务的 `artifacts/test-design/`；
- `feature-implement`、`feature-verify` 和实现后状态链不变；
- resolver 保持只读，确定性命令负责状态变更；
- 不支持历史任务迁移和任务生命周期内模式切换。

## 14. 不做

- 不把测试团队 Skill 复制进 `skills/`；
- 不负责安装、升级或检查外部 Skill 版本；
- 不实现测试设计或测试用例生成算法；
- 不维护 receipt 文件、输入 hash、输出 manifest 或外部执行历史；
- 不规定 `artifacts/test-design/` 内部的文件名、格式和子目录结构；
- 不为外部测试阶段新增 Agent、Hook、Review、Lint 或人工交互；
- 不让 `feature-verify` 执行外部 Skill 生成的测试用例；
- 不迁移或兼容改造前创建的历史任务。
