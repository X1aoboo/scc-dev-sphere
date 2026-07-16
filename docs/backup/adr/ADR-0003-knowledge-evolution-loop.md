# ADR-0003: 将隐性知识萃取作为知识库持续更新机制

## 状态

Accepted

## 背景

当前 MVP 有 `knowledge-query` 和 evidence snapshot 约定，但没有把需求澄清和设计过程中发现的隐性知识沉淀回知识库。团队知识如果只停留在聊天中，会在后续任务中重复追问、重复推断，且无法审计来源。

## 决策

建立知识演进闭环：

1. 需求澄清一次只问一个问题。
2. Q&A 落盘。
3. Agent 从 Q&A、design、decision 中识别 knowledge candidates。
4. 候选经过去重、冲突检查、置信度标记。
5. 人工 owner 审批后进入 `docs/knowledge`。
6. 后续任务引用知识时仍保存 evidence snapshot。
7. 知识有 owner、status、reviewAfter 和 deprecated 机制。

## 替代方案

### 方案 A：任务结束后自动总结入库

优点：自动化程度高。

缺点：容易把假设、临时决策和错误推断写入长期知识库。

### 方案 B：只保存 evidence，不更新主知识库

优点：风险低。

缺点：知识无法复用，长期仍依赖人工记忆。

### 方案 C：外部知识库统一维护

优点：更接近企业知识治理。

缺点：V1 依赖外部系统和权限，落地慢。

## 取舍

选择 repo-local knowledge candidates + 人工审批，是轻量且可审计的折中。它不直接替代企业知识库，但能先在插件范围内形成知识演进机制。

## 后果

正面：

- 隐性知识可沉淀。
- 后续任务可复用。
- 知识来源可追溯。
- 冲突和过期可管理。

负面：

- 需要人工审批。
- 需要维护 knowledge index。
- 如果候选过多，可能增加流程噪音。

## 执行要求

- 未审批候选不得进入主知识库。
- 入库知识必须有 sourceRefs 和 owner。
- 被 artifact 使用的知识必须保存 evidence snapshot。
- 过期或冲突知识不能作为设计依据。

