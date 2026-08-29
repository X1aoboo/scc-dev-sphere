# Design Reopen 优化：独立 Skill 入口 + Stop hook 死锁修复

- **状态:** 待评审
- **日期:** 2026-08-07

## 1. 背景与问题

### 1.1 入口隐蔽

当前设计重开（Design Reopen）没有独立的 Skill 入口。用户必须通过 `/scc-dev-sphere:feature-design <语义说明要 reopen 的 Design>` 间接触发。`feature-design` 在步骤5 publish 时检测到"已有不同 Baseline"才会向用户确认重开，再调用底层 `devsphere design reopen`。

这导致：

- 用户不知道有"重开"这个能力，也不清楚如何触发
- `workflow` 不会主动选择重开已发布的 Baseline，用户必须了解这个隐性路径
- 入口深埋在 `feature-design` 的 publish 逻辑中，发现性极差

### 1.2 Stop hook 死锁

`scripts/devsphere-guard.js` 中的 `checkDesignReviewerStop` 是一个 SubagentStop hook，在 `design-reviewer` 子代理完成工作准备返回时触发。其当前逻辑（第 150-163 行）：

```javascript
function checkDesignReviewerStop(input) {
  if (!isDesignReviewer(input)) return null;
  if (/^# Design Review Failure\b/m.test(input.last_assistant_message || '')) return null;
  const workspaceRoot = input.cwd;
  const taskPath = workspaceRoot && getTaskPath(workspaceRoot);
  if (!taskPath) return { decision: 'block', reason: '...' };
  const candidates = DESIGN_TYPE_KEYS.filter(
    designType => readDraftRef(taskPath, designType) && !readArtifactRef(taskPath, designType)
  );
  if (candidates.length !== 1) {
    return { decision: 'block', reason: `...expected one active Design Draft, found ${candidates.length}.` };
  }
  const result = validatePersistedReview(taskPath, candidates[0], { allowBlocked: true });
  return result.valid ? null : { decision: 'block', reason: `...${result.reason}.` };
}
```

当工作空间中有多个设计同时处于"有 Draft 无 Baseline"状态时（如用户 reopen 了 solutionDesign，同时 implementationDesign 也未基线），`candidates.length` 为 2，hook 永久 block reviewer 返回，造成死锁。reviewer 无法修改自己的 designType 或 taskPath，只能反复尝试同一个 CLI 命令，一直被拦截。

该 hook 的原始设计假设是：`feature-design` 每次只处理一个设计活动，正常流程中"有 Draft 无 Baseline"的设计恰好只有当前正在进行的这一个。reopen 场景打破了这个假设。

## 2. 设计目标

1. 新增 `/scc-dev-sphere:design-reopen` Skill，作为重开已基线设计的显式快捷入口
2. 修复 `checkDesignReviewerStop`，使其在多个未基线 Draft 共存时不再死锁
3. 不修改 `reopenDesign` 函数本身（已有测试覆盖）
4. 不修改 `hooks/hooks.json`（触发时机不变）

## 3. `design-reopen` Skill

### 3.1 定位

用户显式调用的快捷入口。选择已基线的设计 → 确认 → 执行 reopen → 自动转入 `feature-design` 继续修订到发布。

### 3.2 Frontmatter

```yaml
name: design-reopen
description: 重开指定任务中已基线的设计。选择已发布 Baseline 的设计类型，确认后旧 Baseline 归档、新 Draft 版本提升，自动转入 feature-design 继续修订到发布。禁止模型自动调用，仅用户在主会话显式调用。
disable-model-invocation: true
```

### 3.3 入口与入参

- **入口:** `/scc-dev-sphere:design-reopen`
- **入参:** 无调用上下文参数；taskPath 由 CLI 从 `.devsphere/current-task.json` 主动获取
- **输出:** 旧 Baseline 已归档，新 Draft 已生成，`feature-design` 已接管后续流程
- **完成标准:** `feature-design` 返回"当前 Design Baseline 已获用户批准并发布"

### 3.4 执行步骤

1. **定位当前任务**：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" state get-task-path --workspace-root "<workspaceRoot>"` 获取 `taskPath`。无活跃任务时提示"未找到活跃任务，请先使用 `/scc-dev-sphere:feature-init` 创建"并终止。

2. **枚举可重开的设计**：执行 `"${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design inspect-workspace --task-path "<taskPath>"`，筛选出"已有 Baseline"的设计类型，以单选列表呈现给用户。列表为空时提示"当前没有已发布的 Design Baseline 可重开"并终止。

3. **收集变更说明**：以自然语言向用户提问"请说明本次重开的原因和预期变更内容"。变更说明必填——reopen 是设计变更决策，不可无理由执行。

4. **确认重开**：向用户展示目标设计类型、当前版本号、变更说明，通过 `AskUserQuestion`（`confirm_gate` 模式）明确请求确认。用户拒绝时终止，不执行任何修改。

5. **执行 reopen**：
   ```bash
   "${CLAUDE_PLUGIN_ROOT}/bin/devsphere" design reopen --task-path "<taskPath>" --design-type <designType>
   ```
   解析返回的 JSON，向用户展示归档路径和新 Draft 版本。脚本报错（任务不存在、无 Baseline 等）时透传错误并终止。

6. **转入 feature-design**：直接执行 `/scc-dev-sphere:feature-design`，调用上下文中传入：
   - `taskPath`
   - `designType`（刚 reopen 的）
   - 变更说明（作为设计目标的一部分）

   `feature-design` 步骤1 `inspect-workspace` 会看到"Draft 存在、Baseline 不存在"，识别为恢复进行中的设计。步骤2 `feature-design-analysis` 使用传入的变更说明作为本次设计修订的输入。

### 3.5 规则

- **仅用户显式调用**：不得被模型自动触发；只在用户在主会话输入 `/scc-dev-sphere:design-reopen` 时执行。
- **只重开有 Baseline 的设计**：无 Baseline 的设计不需要 reopen，直接用 `feature-design` 恢复。
- **变更说明必填**：重开是设计变更决策，不可无理由执行。
- **确定性执行**：reopen 操作全部由 `devsphere` CLI 完成；Skill 不自行拼接路径或执行文件操作。
- **下游影响不自动处理**：Skill 只重开用户选定的那一个设计。下游设计的重开由用户在 `feature-design` 完成后自行判断（与当前用户指南一致）。

## 4. Stop hook 修复

### 4.1 修复逻辑

reviewer 的返回消息（`last_assistant_message`）中固定包含 `- Design type: <designType>` 行（定义在 `agents/design-reviewer.md` 步骤4 的返回格式中）。从其中解析目标 `designType`，精确校验这一个设计的 review 有效性。

修改后的 `checkDesignReviewerStop`：

```javascript
function checkDesignReviewerStop(input) {
  if (!isDesignReviewer(input)) return null;
  const message = input.last_assistant_message || '';

  // 失败返回，照旧放行
  if (/^# Design Review Failure\b/m.test(message)) return null;

  const workspaceRoot = input.cwd;
  const taskPath = workspaceRoot && getTaskPath(workspaceRoot);
  if (!taskPath) return { decision: 'block', reason: 'Design Reviewer cannot stop: no active Feature task was found.' };

  // 从返回消息解析目标 designType
  const match = message.match(/Design type:\s*(\S+)/);
  const target = match && match[1];

  if (target && DESIGN_TYPE_KEYS.includes(target)) {
    // 精确校验 reviewer 实际评审的那个设计
    const result = validatePersistedReview(taskPath, target, { allowBlocked: true });
    return result.valid ? null : { decision: 'block', reason: `Design Reviewer cannot stop: ${result.reason}.` };
  }

  // 解析不到合法 designType → block 并提示格式问题
  return { decision: 'block', reason: 'Design Reviewer cannot stop: could not identify the reviewed design type from the return message.' };
}
```

### 4.2 删除的代码

原有的"扫描 `DESIGN_TYPE_KEYS`、过滤候选、检查 `candidates.length !== 1`"整段逻辑被替换。`readDraftRef` 和 `readArtifactRef` 不再被此函数使用。需检查 guard 中其他函数是否仍引用它们，若不需要则从 import 中移除。

### 4.3 边界情况

| 情况 | 行为 |
|---|---|
| reviewer 返回成功，包含合法 designType，review 有效 | 放行 |
| reviewer 返回成功，包含合法 designType，review 无效 | block，提示具体原因 |
| reviewer 返回失败（`# Design Review Failure`） | 放行（同现有逻辑） |
| reviewer 返回消息缺少 `Design type:` 行 | block，提示格式问题 |
| `taskPath` 无法解析 | block（同现有逻辑） |

### 4.4 不变的部分

- hook 的触发时机不变（`SubagentStop`，matcher `design-reviewer`）
- 失败检测逻辑不变（`# Design Review Failure` 放行）
- `validatePersistedReview` 调用和参数不变（`{ allowBlocked: true }`）
- `hooks/hooks.json` 不需要修改

## 5. 测试与验收

### 5.1 Stop hook 单元测试

| 用例 | 场景 | 期望 |
|---|---|---|
| `stop: 返回消息含合法 designType，review 有效 → 放行` | 2 个未基线 Draft，reviewer 评的是 solutionDesign，其 review 有效 | `null`（不 block） |
| `stop: 返回消息含合法 designType，review 无效 → block` | reviewer 评 solutionDesign 但 review 未绑定 Draft hash | block + 具体 reason |
| `stop: 多个未基线 Draft，只校验目标设计的 review` | solutionDesign review 有效、implementationDesign review 无效，消息中 designType 为 solutionDesign | `null`（放行，不受另一个影响） |
| `stop: 返回消息缺 Design type 行 → block` | reviewer 返回消息格式不符 | block + 格式提示 |
| `stop: 失败返回照旧放行` | `# Design Review Failure` + 含 designType | `null` |
| `stop: 无活跃任务 → block` | 无 current-task.json | block |

### 5.2 `design-reopen` Skill 契约测试

参考 `scripts/test/design-archive-skill-contract.test.js` 的模式：

| 用例 | 场景 | 期望 |
|---|---|---|
| `reopen: 有 Baseline 的设计可重开` | businessDesign 已基线，执行 `reopenDesign` | 旧 Baseline 归档到 history，新 Draft 版本 bump，Baseline 文件已删，review/lint/approval 已清除 |
| `reopen: 无 Baseline 的设计不可重开` | 对无 Baseline 的设计调用 reopen | 抛错 |
| `reopen: reopen 后 inspect-workspace 识别为恢复中` | reopen 后运行 `inspectDesign` | `draft` 存在、`artifact` 不存在 |

### 5.3 不需要新增的测试

- `reopenDesign` 函数本身已有测试覆盖（`scripts/test/feature-design-skill-first.test.js`）
- `feature-design` 恢复路径已有测试覆盖
- 不需要 E2E 测试 `design-reopen` 到 `feature-design` 的完整链路——两者各自的契约已覆盖

## 6. 影响面汇总

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `skills/design-reopen/SKILL.md` | **新建** | 快捷入口 Skill |
| `scripts/devsphere-guard.js` | **修改** | `checkDesignReviewerStop` 改为解析 designType |
| `scripts/test/*` | **修改/新增** | Stop hook 用例 + Skill 契约用例 |
| `docs/guides/scc-dev-sphere-user-guide.md` | **修改** | 更新 reopen 使用说明，提及独立入口 |
| `README.md` | **修改** | Skill 列表补充 `design-reopen` |

不修改：`hooks/hooks.json`、`scripts/devsphere-design.js`（`reopenDesign` 不变）、`scripts/devsphere-cli.js`（`reopen` 命令已存在）。

## 7. 未覆盖（YAGNI）

- **并发 reopen 限制**：不限制同时存在多个未基线 Draft。Stop hook 修复后多候选场景已不再死锁。
- **自动下游重开**：不自动检测和批量重开下游设计。用户自行判断，与当前用户指南一致。
- **reopen 次数限制**：不限制同一设计的重开次数。`reopenDesign` 每次 bump 主版本并归档旧 Baseline，历史可追溯。
