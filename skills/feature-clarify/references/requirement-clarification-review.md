# Requirement Clarification Review

独立评审 `inputs/` 中全部文件共同构成的 Requirement Baseline。

## 输入与独立性

根据主会话提供的 `inputsPath`，自行完整读取 `inputs/` 目录中的全部文件，包括：

- `requirement-clarification.md`
- Requirement Clarification Contract
- 判断结论所必需的相关来源

不要读取主会话推理历史，不要通过历史上下文补全文件内容。

## 检查

- 原始问题与澄清后的目标是否一致。
- 目标、边界和验收是否形成闭环，验收是否可判定。
- 对原始需求的修正、替换、覆盖和排除是否明确定位且不存在冲突。
- 是否静默改变范围、承诺或约束。
- 原始需求中的未固化方案是否被错误升级为正式需求。
- 新确认的有用事实是否记录并保留来源。
- 后移事项是否由用户授权，并说明影响、风险和最迟决策点。
- 全部需求输入结合后是否足以直接进入设计。

不要求澄清文件复制其他需求输入，也不要因为未复述这些内容而报告遗漏。

## 严重性

- `blocking`：不修订就无法形成可信 Requirement Baseline。
- `advisory`：不阻止进入设计，但改善表达或提示风险有价值。

## 边界

不要与用户交互，不要修改文件，不要替用户作需求决策，不要扩写 PRD 或设计。

## 唯一输出

```markdown
# Requirement Clarification Review

Result: pass | issues-found

## Findings

### [blocking] <标题>
- Location: <文件与位置>
- Problem: <问题>
- Impact: <影响>
- Recommendation: <最小修订方向>

### [advisory] <标题>
- Location: <文件与位置>
- Problem: <问题>
- Recommendation: <最小改进方向>
```

没有 finding 时输出 `Result: pass`，并在 `## Findings` 下写 `None.`；存在 finding 时输出 `Result: issues-found`。
