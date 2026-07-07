# feature-init 交互拆分 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 feature-init 步骤1的一次性两问拆为两轮独立交互，每轮只问一个问题。

**Architecture:** 修改 `skills/feature-init/SKILL.md` 的「执行步骤」部分，将原步骤1拆为两个独立步骤（需求描述 → 任务ID），原步骤2~5依次后移一位（步骤3~6）。

**Tech Stack:** Markdown 文件修改，无代码依赖。

## Global Constraints

- 每轮交互最多只问一个问题
- 保持自然语言交互（开放式输入场景，不使用 AskUserQuestion 选项卡）
- 第二问（任务ID）为可选，用户回复「不用」/「自动」即跳过
- 所有步骤编号保持连续，不跳号

---

## 文件结构

```
skills/feature-init/SKILL.md  (修改) — 步骤1拆为步骤1+步骤2，后序步骤重编号
```

---

### Task 1: 拆分步骤1为两轮独立交互

**Files:**
- Modify: `skills/feature-init/SKILL.md:19-67`

**Interfaces:**
- Consumes: 无（独立入口 skill，不依赖其他任务产物）
- Produces: feature-init 步骤1+2 的新交互流程

- [ ] **Step 1: 读取当前文件确认内容**

```bash
head -67 skills/feature-init/SKILL.md
```

- [ ] **Step 2: 替换步骤1内容 — 拆为分步收集**

将原文：

```
### 步骤1：收集输入

直接在对话中以自然语言向用户提问。此场景为开放式输入（需求描述），不适合使用选项卡式交互。

需要收集的信息：
1. 需求的简要描述（1-3 句话）
2. 可选，指定任务 ID（不指定则自动生成 `FEAT-YYYYMMDD-NNN`）

将需求描述保存到 `inputs/requirement.md`。
```

替换为：

```
### 步骤1：收集需求描述

直接在对话中以自然语言向用户提问。此场景为开放式输入，不适合使用选项卡式交互。

**每次只问一个问题。** 首先提问：

> 请用 1-3 句话简要描述你的需求（需要开发的功能或需要调整的存量功能）。

用户回复后，将需求描述暂时保存，进入步骤2。

### 步骤2：收集任务 ID（可选）

以自然语言向用户提问：

> 是否需要指定任务 ID？不指定则自动生成为 `FEAT-YYYYMMDD-NNN` 格式。

- 用户指定具体 ID → 使用该 ID
- 用户回复「不用」/「自动」/「不需要」/「不指定」等 → 自动生成
- 用户直接在步骤1的回复中同时给出了任务 ID → 跳过本步骤，使用用户指定的 ID
```

使用 Edit 工具：

```
old_string: "### 步骤1：收集输入\n\n直接在对话中以自然语言向用户提问。此场景为开放式输入（需求描述），不适合使用选项卡式交互。\n\n需要收集的信息：\n1. 需求的简要描述（1-3 句话）\n2. 可选，指定任务 ID（不指定则自动生成 `FEAT-YYYYMMDD-NNN`）\n\n将需求描述保存到 `inputs/requirement.md`。"
new_string: "### 步骤1：收集需求描述\n\n直接在对话中以自然语言向用户提问。此场景为开放式输入，不适合使用选项卡式交互。\n\n**每次只问一个问题。** 首先提问：\n\n> 请用 1-3 句话简要描述你的需求（需要开发的功能或需要调整的存量功能）。\n\n用户回复后，将需求描述暂时保存，进入步骤2。\n\n### 步骤2：收集任务 ID（可选）\n\n以自然语言向用户提问：\n\n> 是否需要指定任务 ID？不指定则自动生成为 `FEAT-YYYYMMDD-NNN` 格式。\n\n- 用户指定具体 ID → 使用该 ID\n- 用户回复「不用」/「自动」/「不需要」/「不指定」等 → 自动生成\n- 用户直接在步骤1的回复中同时给出了任务 ID → 跳过本步骤，使用用户指定的 ID"
```

- [ ] **Step 3: 重编号后续步骤**

原步骤2 → 步骤3，原步骤3 → 步骤4，原步骤4 → 步骤5，原步骤5 → 步骤6。

```bash
sed -i '' 's/### 步骤2：创建任务工作区/### 步骤3：创建任务工作区/' skills/feature-init/SKILL.md
sed -i '' 's/### 步骤3：创建初始文件/### 步骤4：创建初始文件/' skills/feature-init/SKILL.md
sed -i '' 's/### 步骤4：确认创建/### 步骤5：确认创建/' skills/feature-init/SKILL.md
sed -i '' 's/### 步骤5：提示下一步/### 步骤6：提示下一步/' skills/feature-init/SKILL.md
```

- [ ] **Step 4: 验证修改**

确认步骤结构正确：

```bash
grep "^### 步骤" skills/feature-init/SKILL.md
```

预期输出：
```
### 步骤1：收集需求描述
### 步骤2：收集任务 ID（可选）
### 步骤3：创建任务工作区
### 步骤4：创建初始文件
### 步骤5：确认创建
### 步骤6：提示下一步
```

确认无「需要收集的信息」残留：
```bash
grep "需要收集的信息" skills/feature-init/SKILL.md || echo "PASS: 已移除"
```

- [ ] **Step 5: 提交**

```bash
git add skills/feature-init/SKILL.md
git commit -m "feat: feature-init 步骤1拆分为两轮独立交互，每次只问一个问题"
```
