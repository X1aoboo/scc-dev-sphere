---
name: knowledge-query
description: 按独立知识主题执行多来源只读查询。用于设计或澄清主会话需要候选知识、来源、冲突和 gap 时；查询不写 Evidence、不做设计决定。
---

# Knowledge Query

配置操作仍通过 `scripts/knowledge-query.js` 管理；查询期间配置只读。

主会话把每个独立知识主题派发给一个新的 Knowledge Query Subagent，并注入 `subagent-prompt.md`。多个互不依赖的主题可以并行；不要把不同问题塞进一个查询。

Query Subagent 读取生效配置，为每个可用数据源创建嵌套、只读的数据源 Subagent，并无损汇总：

- 候选知识及支持来源；
- 重复结论的多来源支持；
- 独有结论；
- 冲突结论；
- 未解决 gap。

Query Subagent 不询问用户、不写 Evidence、不做设计决定。主会话结合完整设计上下文判断哪些候选知识被采用；只有实际支持或改变设计的内容才通过 `register-evidence-record` 登记为一条多来源 Evidence。用户补充可作为 `user` source 加入同一模型。

完成标准：每个主题返回候选、来源、冲突和 gap；没有来源越界；查询侧没有写入 Evidence。
