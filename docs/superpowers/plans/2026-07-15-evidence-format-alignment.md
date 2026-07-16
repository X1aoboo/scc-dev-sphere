# Evidence 快照格式对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 evidence 快照和 registry 的 sourceType/query 溯源字段，快照内容区分摘要与全文，对齐历史设计。

**Architecture:** 1 个 task，3 个文件。核心改动在 `registerEvidence()` 函数（+2 参数、快照模板、registry 字段），文档同步更新调用语法。

**Tech Stack:** Node.js 内置模块。

## Global Constraints

- evidence 存储路径不变（`evidence/knowledge/EV-*.md`）
- hooks 保护范围不变
- 4 步查询流程不变
- stdin 传内容方式不变
- sourceType 必须枚举校验：`skill | local | repo | mcp | web | user`

---

### Task 1: registerEvidence 格式对齐 + 文档同步

**Files:**
- Modify: `scripts/knowledge-query.js:242-270`（registerEvidence 函数）, `scripts/knowledge-query.js:308`（usage）, `scripts/knowledge-query.js:344-346`（CLI case）
- Modify: `skills/knowledge-query/SKILL.md:67`（步骤2）, `skills/knowledge-query/SKILL.md:78`（步骤3）
- Modify: `skills/knowledge-query/subagent-prompt.md:23`（调用语法）

**Interfaces:**
- Consumes: 无
- Produces: `registerEvidence(workspaceRoot, description, sourceType, query)` — 4 参数，sourceType 枚举校验

- [ ] **Step 1: 重写 registerEvidence 函数**

Edit `scripts/knowledge-query.js`，替换整个函数：

```
old: function registerEvidence(workspaceRoot, description) {
  if (!workspaceRoot || !description) {
    throw new Error('Usage: echo "<content>" | register-evidence <workspaceRoot> <description>');
  }

  const { nextId } = nextEvId(workspaceRoot);
  const safeDesc = sanitizeDescription(description);
  const snapshotName = `${nextId}-${safeDesc}.md`;
  const snapshotPath = path.join(getEvidenceDir(workspaceRoot), snapshotName);

  // Read content from stdin
  const content = fs.readFileSync(0, 'utf-8');
  const snapshotContent = `# ${nextId}: ${description}\n\n**Registered:** ${new Date().toISOString()}\n\n${content}`;

  ensureDir(getEvidenceDir(workspaceRoot));
  fs.writeFileSync(snapshotPath, snapshotContent, 'utf-8');

  // Update registry
  const registry = readRegistry(workspaceRoot);
  registry.evidences.push({
    id: nextId,
    description: description,
    file: path.relative(workspaceRoot, snapshotPath),
    registeredAt: new Date().toISOString()
  });
  writeJSON(getRegistryPath(workspaceRoot), registry);

  return { evId: nextId, snapshotPath };
}

new: function registerEvidence(workspaceRoot, description, sourceType, query) {
  const VALID_SOURCE_TYPES = ['skill', 'local', 'repo', 'mcp', 'web', 'user'];
  if (!workspaceRoot || !description || !sourceType) {
    throw new Error('Usage: echo "<summary>" | register-evidence <workspaceRoot> <description> <sourceType> <query>');
  }
  if (!VALID_SOURCE_TYPES.includes(sourceType)) {
    throw new Error(`Invalid sourceType: ${sourceType}. Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`);
  }

  const { nextId } = nextEvId(workspaceRoot);
  const safeDesc = sanitizeDescription(description);
  const snapshotName = `${nextId}-${safeDesc}.md`;
  const snapshotPath = path.join(getEvidenceDir(workspaceRoot), snapshotName);
  const timestamp = new Date().toISOString();

  // Read content summary from stdin
  const summary = fs.readFileSync(0, 'utf-8').trim();
  const snapshotContent = `# ${nextId}: ${description}

- **Source:** ${sourceType}
- **Query:** ${query || '-'}
- **Retrieved:** ${timestamp}
- **Content Summary:**
${summary}`;

  ensureDir(getEvidenceDir(workspaceRoot));
  fs.writeFileSync(snapshotPath, snapshotContent, 'utf-8');

  // Update registry
  const registry = readRegistry(workspaceRoot);
  registry.evidences.push({
    id: nextId,
    description: description,
    sourceType: sourceType,
    query: query || '',
    file: path.relative(workspaceRoot, snapshotPath),
    retrievedAt: timestamp
  });
  writeJSON(getRegistryPath(workspaceRoot), registry);

  return { evId: nextId, snapshotPath };
}
```

- [ ] **Step 2: 更新 CLI usage**

Edit `scripts/knowledge-query.js` usage 行：

```
old:     console.error('  register-evidence <workspaceRoot> <description>  (content from stdin)');

new:     console.error('  register-evidence <workspaceRoot> <description> <sourceType> <query>  (content from stdin)');
```

- [ ] **Step 3: 更新 CLI case 调用**

Edit `scripts/knowledge-query.js` CLI case：

```
old:         result = registerEvidence(workspaceRoot, args[2]);

new:         result = registerEvidence(workspaceRoot, args[2], args[3], args[4]);
```

- [ ] **Step 4: 烟雾测试**

```bash
echo "## 关键发现\n\n- 审批需要三级权限\n- 超时 30 分钟自动驳回" | node scripts/knowledge-query.js register-evidence /tmp/test-ws "审批流程规则" skill "审批 权限"
```

Expected: 返回 `{"evId":"EV-001","snapshotPath":"..."}`，快照文件内容匹配新格式。

```bash
cat /tmp/test-ws/evidence/knowledge/EV-001-*.md
```

Expected:
```
# EV-001: 审批流程规则

- **Source:** skill
- **Query:** 审批 权限
- **Retrieved:** 2026-07-15T...
- **Content Summary:**
## 关键发现

- 审批需要三级权限
- 超时 30 分钟自动驳回
```

```bash
# 非法 sourceType 报错
echo "test" | node scripts/knowledge-query.js register-evidence /tmp/test-ws "test" invalid "q"
```

Expected: 报错 `Invalid sourceType: invalid. Must be one of: skill, local, repo, mcp, web, user`，exit 1。

- [ ] **Step 5: 更新 SKILL.md 步骤2 引用**

```
old: 查到后通过 `echo "<查询结果>" | node scripts/knowledge-query.js register-evidence <workspaceRoot> "<描述>"` 写入 evidence

new: 查到后通过 `echo "<Content Summary>" | node scripts/knowledge-query.js register-evidence <workspaceRoot> "<描述>" <sourceType> "<query>"` 写入 evidence
```

- [ ] **Step 6: 更新 SKILL.md 步骤3 引用**

```
old: 用户答复后通过 `echo "<知识详情>" | node scripts/knowledge-query.js register-evidence <workspaceRoot> "<描述>"` 写入 evidence，跳步骤4

new: 用户答复后通过 `echo "<知识详情>" | node scripts/knowledge-query.js register-evidence <workspaceRoot> "<描述>" user "用户提供"` 写入 evidence，跳步骤4
```

- [ ] **Step 7: 更新 subagent-prompt.md**

```
old: 2. 通过 stdin 传入脚本：`echo "<Markdown 内容>" | node scripts/knowledge-query.js register-evidence <workspaceRoot> "<主题描述>"`
3. 脚本会自动分配 EV 编号、写入快照、更新 registry，返回 `{ evId, snapshotPath }`

new: 2. 通过 stdin 传入脚本：`echo "<Content Summary>" | node scripts/knowledge-query.js register-evidence <workspaceRoot> "<主题描述>" <sourceType> "<query>"`
   - sourceType: 按实际查询来源填写（skill / local / repo / mcp / web）；若来自用户反馈（步骤3），填 `user`
   - query: 填写实际使用的查询关键词；步骤3 用户反馈场景填 `"用户提供"`
3. 脚本会自动分配 EV 编号、写入快照、更新 registry，返回 `{ evId, snapshotPath }`
```

- [ ] **Step 8: 确认无意外变更 + 清理测试产物**

```bash
git diff --stat
rm -rf /tmp/test-ws/evidence
```

Expected: 仅 3 个文件变更。

- [ ] **Step 9: Commit**

```bash
git add scripts/knowledge-query.js skills/knowledge-query/SKILL.md skills/knowledge-query/subagent-prompt.md
git commit -m "feat(evidence): align snapshot format with historical design

- Add sourceType and query fields to EV-*.md and registry
- Rename Registered→Retrieved, registeredAt→retrievedAt
- Distinguish Content Summary from raw content
- Validate sourceType enum (skill|local|repo|mcp|web|user)
- Update subagent prompt and SKILL.md with new calling syntax"
```

---

### 自审

| 检查项 | 结果 |
|--------|------|
| Spec 覆盖 | 快照模板 §2、registry §3、接口 §4、SKILL.md §5、subagent §6 — 全部对应 |
| 占位符扫描 | 无 TBD/TODO |
| 类型一致性 | sourceType 枚举 `skill\|local\|repo\|mcp\|web\|user` 在代码、文档、spec 中一致 |
