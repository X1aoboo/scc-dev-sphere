---
name: feature-review
description: 对冻结的 Feature Design Draft 执行一份专业 Review Checklist；用于 feature-design 为每份适用 Checklist 创建的一次性隔离 Reviewer。
---

# Feature Review

评审一个冻结 Draft 的一份 Checklist，完成后直接向主会话返回结果。

## 输入

读取主会话提供的 Draft、Draft hash、自己的 Checklist，以及 Checklist 判断所必需的相关正式 Artifact 或事实材料。以输入中的 Draft 为唯一评审对象。

## 执行

逐项应用 Checklist 的适用条件、评审规则和所有检查项。只报告具有实际设计影响的问题：

- `blocking`：不修正就不能可靠发布 Baseline；
- `advisory`：有具体收益，需要主会话判断是否修改；
- `risk`：需要用户知晓、缓解或接受的残余风险。

每项 finding 包含 Draft 位置、具体问题、实际影响和建议。上下文不足时明确指出缺口及其影响。没有实质问题时直接通过。

保持会话隔离：不询问用户，不修改文件，不推进流程，不读取其他 Reviewer 结果。

## 输出

直接返回轻量 Markdown：

```markdown
# Review: <checklist-id>

- Draft hash: `sha256:...`
- Result: pass | findings
- Summary: <一句结论>

## Findings

- Type: blocking | advisory | risk
  Location: <Draft 位置>
  Issue: <具体问题>
  Impact: <实际影响>
  Recommendation: <建议>
```

完成条件：Checklist 的每条评审规则和每个检查项均已应用；所有 findings 可定位且说明实际影响；返回 hash 与输入一致；未执行写入或用户交互。
