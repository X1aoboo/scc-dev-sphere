---
name: feature-assess
description: 评估需求复杂度和风险，推荐工作流模式。不预加载完整知识上下文——只识别后续需要重点关注的方向。
---

# Feature Assess — 复杂度与风险评估

分析需求输入，判断复杂度，识别风险因素，推荐工作流模式（`auto-design`、`collaborative-design` 或 `strict-human-loop`）。

## 集成契约

- **入口:** `/scc-dev-sphere:feature-assess`
- **入参:** 来自 `inputs/requirement.md` 的已澄清需求、当前 state
- **输出:** 评估结果写入 state，工作流模式经用户确认
- **完成标准:** `workflowMode` 在 `state.json` 中已确认，状态推进到 `assessed`

## 执行步骤

### 步骤1：读取输入

从活跃任务工作区的 `inputs/requirement.md` 读取需求。读取当前 `state.json`。

如果 `state.status !== 'clarified'`，**MUST NOT assess**。停止评估，不写入任何评估结果，并路由用户回 `/scc-dev-sphere:feature-clarify`。需求澄清的完整性由 `feature-clarify` 的完成判断原则与用户最终确认把关，本步骤只校验状态。

### 步骤2：执行风险评估

按以下硬触发条件评估需求：

1. **跨系统或跨模块影响？** — 变更是否涉及多个系统或模块？
2. **数据迁移或数据模型变更？** — 是否有 schema 变更、数据迁移？
3. **权限、安全或审计变更？** — 认证、权限或审计追踪是否受影响？
4. **对外接口或兼容性变更？** — API、协议或契约是否变化？
5. **性能、容量或稳定性影响？** — SLA、吞吐量或可靠性是否有要求？
6. **核心业务链路？** — 是否涉及关键收入或用户路径？
7. **不可逆操作？** — 是否存在破坏性或无法回滚的变更？
8. **部署、配置或环境影响？** — 部署或配置方式是否变化？
9. **需求不完整或存在歧义？** — 需求输入是否存在明显缺口？

**CI/CD 与环境风险评估（布尔结果）：** 若命中以下任一触发，记 `ciCdRisk=true`，否则 `false`：部署流程变更、配置/环境变量变更、CI/CD 流水线修改、数据库迁移/数据模型变更、发布策略/环境影响、基础设施/平台变更。此值在步骤4/5 后由 workflow 经 `set-task-status` 写入 `state.ciCdRisk`，用于设计评审阶段触发 CIE。

### 步骤3：推荐模式

- **0-1 个风险触发:** 推荐 `auto-design`
- **2-3 个风险触发:** 推荐 `collaborative-design`
- **4+ 个风险触发:** 默认推荐 `strict-human-loop`

### 步骤4：展示评估结果并获取模式确认

展示评估结果：

```
## 复杂度与风险评估

**需求:** {摘要}

**命中的风险触发条件:**
{逐条列出触发条件及解释}

**推荐模式:** {推荐模式}
- auto-design: AI 自动推进设计阶段，编码前人工最终审批
- collaborative-design: 部分阶段人工确认，其余 AI 推进
- strict-human-loop: 每个阶段都需要人工确认

**CI/CD 与环境风险 (ciCdRisk):** {true/false}
```

然后使用 **AskUserQuestion 工具**（遵循 `references/interaction-guidelines.md` 中的 `single_select` 模式）获取模式选择：

- `header`: "工作流模式"
- `question`: "请选择工作流模式："
- `options`:
  - 将推荐模式排在首位，label 后标注 `(Recommended)`，description 解释该模式含义
  - 其余模式按风险等级从低到高排列
- `multiSelect`: false

用户可通过 Other 选项自行指定其他模式。

### 步骤5：处理模式选择结果

如果用户选择 `collaborative-design`，使用 **AskUserQuestion**（遵循 `multi_select` 模式）追问阶段门禁：

- `header`: "阶段门禁"
- `question`: "哪些设计阶段需要人工门禁确认？可多选："
- `options`: 四个设计阶段各为一个选项，description 说明该阶段产出内容
- `multiSelect`: true

用户可通过 Other 输入自定义阶段。

如果高风险任务被降级（如 `strict-human-loop` 降为 `auto-design`），记录决策：
- 写入 `decisions/business-design-decisions.json`：
  ```markdown
  ## D-001 工作流模式降级
  - **原始建议:** strict-human-loop
  - **选择模式:** {selected}
  - **降级原因:** {用户提供的理由}
  - **已接受风险:** {被接受的触发条件列表}
  - **决策时间:** {timestamp}
  - **状态:** accepted
  ```

### 步骤6：记录决策并确认

展示确认信息：

```
✅ 评估完成

**推荐模式:** {推荐模式}
**命中的风险:** {count} 个
```
建议使用 `/scc-dev-sphere:workflow` 进入下一步。
