# Feature Clarify Checklist 脚本与模板 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `requirement-checklist.json` 模板、`feature-clarify.js` 脚本（init/check-complete/read-checklist），更新 SKILL.md 阶段0/7a/完成判断原则。

**Architecture:** 2 个新文件 + 1 个修改。遵循现有脚本模式：`#!/usr/bin/env node`、`'use strict'`、`require()`/`module.exports` 双用。

**Tech Stack:** Node.js（无依赖）、JSON

## Global Constraints

- 脚本必须 CLI 调用（`node script.js <command> <args>`）和 `require()` 双用
- 遵循现有代码风格（`devsphere-state.js`）
- skill-contracts 测试必须通过
- 全量测试套件必须通过

---

### Task 1: 创建 `skills/feature-clarify/requirement-checklist.json`

**Files:**
- Create: `skills/feature-clarify/requirement-checklist.json`

- [ ] **Step 1: 写入 checklist JSON 模板**

```json
{
  "categories": [
    {
      "id": "7.1",
      "name": "目标与用户",
      "items": [
        {"id": "7.1.1", "check": "已说明本需求要解决的核心问题", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.1.2", "check": "已说明需求完成后希望产生的业务结果", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.1.3", "check": "已明确主要用户或参与角色", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.1.4", "check": "已说明用户当前的工作方式或主要痛点", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.1.5", "check": "功能需求能够关联到用户目标，而不是单纯堆叠功能名词", "result": "fail", "evidence": "", "note": ""}
      ]
    },
    {
      "id": "7.2",
      "name": "场景完整性",
      "items": [
        {"id": "7.2.1", "check": "至少存在一条端到端核心使用场景", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.2.2", "check": "核心场景包含参与者、触发条件、主流程和成功结果", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.2.3", "check": "能够说明用户从发起操作到获得结果的完整过程", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.2.4", "check": "已识别会显著影响结果的主要异常场景", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.2.5", "check": "核心场景不存在明显流程断点", "result": "fail", "evidence": "", "note": ""}
      ]
    },
    {
      "id": "7.3",
      "name": "功能与规则",
      "items": [
        {"id": "7.3.1", "check": "核心功能均使用明确、单义的行为描述", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.3.2", "check": "每项核心功能说明了系统需要产生的结果", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.3.3", "check": "关键业务规则已明确", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.3.4", "check": "功能需求之间不存在明显矛盾", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.3.5", "check": "未将具体技术实现方案写成需求", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.3.6", "check": "未遗漏用户回答中确认的重要约束", "result": "fail", "evidence": "", "note": ""}
      ]
    },
    {
      "id": "7.4",
      "name": "范围与边界",
      "items": [
        {"id": "7.4.1", "check": "已明确本次需求包含的核心范围", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.4.2", "check": "已明确容易产生误解的非目标", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.4.3", "check": "本次范围与业务目标一致", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.4.4", "check": "未混入没有用户价值或场景支撑的扩展功能", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.4.5", "check": "不属于本阶段的设计问题已合理延后，而非强行确定", "result": "fail", "evidence": "", "note": ""}
      ]
    },
    {
      "id": "7.5",
      "name": "约束与依赖",
      "items": [
        {"id": "7.5.1", "check": "已识别影响需求实现的业务约束", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.5.2", "check": "已识别已确认的平台、兼容性、安全或合规约束", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.5.3", "check": "已识别关键外部系统和服务依赖", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.5.4", "check": "外部依赖不可用时的影响已经说明", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.5.5", "check": "约束描述的是必须满足的条件，而不是具体实现方式", "result": "fail", "evidence": "", "note": ""}
      ]
    },
    {
      "id": "7.6",
      "name": "验收性",
      "items": [
        {"id": "7.6.1", "check": "每项核心能力至少有一条对应的验收标准", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.6.2", "check": "验收标准可以通过操作和观察判断通过或失败", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.6.3", "check": "验收标准覆盖核心主流程", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.6.4", "check": "验收标准覆盖关键异常流程", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.6.5", "check": "未使用"友好、灵活、快速、完善"等无法验证的表述", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.6.6", "check": "性能、容量或时效要求如有必要，已经给出可验证标准", "result": "fail", "evidence": "", "note": ""}
      ]
    },
    {
      "id": "7.7",
      "name": "模糊点与一致性",
      "items": [
        {"id": "7.7.1", "check": "不存在未解决的核心需求模糊点", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.7.2", "check": "ambiguity-backlog.json 中不存在仍为 open 的高影响事项", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.7.3", "check": "所有标记为 resolved 的核心模糊点均已反映到 requirement.md", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.7.4", "check": "用户前后表达不存在未处理的冲突", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.7.5", "check": "Agent 推断均已获得用户确认，或未作为正式需求事实", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.7.6", "check": "延后设计的问题均已明确需求约束", "result": "fail", "evidence": "", "note": ""}
      ]
    },
    {
      "id": "7.8",
      "name": "文档质量",
      "items": [
        {"id": "7.8.1", "check": "原始需求完整保留", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.8.2", "check": "文档结构符合本规范", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.8.3", "check": "核心场景、功能需求和验收标准具有稳定编号", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.8.4", "check": "同一概念在全文中使用一致名称", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.8.5", "check": "没有大段复制澄清会话", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.8.6", "check": "没有与需求无关的知识调研内容", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.8.7", "check": "没有"待定、可能、视情况、后续再看"等无处理说明的模糊表达", "result": "fail", "evidence": "", "note": ""},
        {"id": "7.8.8", "check": "用户已完成最终确认", "result": "fail", "evidence": "", "note": ""}
      ]
    }
  ],
  "exitCriteria": {
    "pass": [
      "业务目标、目标用户和核心场景已经明确",
      "核心功能、业务边界和验收标准能够支撑后续设计",
      "不存在未解决的高影响需求模糊点",
      "延后到设计阶段的问题已经明确需求约束",
      "requirement.md 与 ambiguity-backlog.json 不存在结论冲突",
      "用户已经确认需求汇总"
    ],
    "fail": [
      "仅填写了固定章节，但无法描述完整用户场景",
      "核心功能只有名称，没有明确行为和结果",
      "验收标准仍是主观描述",
      "将关键业务问题标记为"设计阶段决定"",
      "ambiguity 已标记解决，但需求文档中没有对应结论",
      "Agent 根据自身推断确定了关键需求，但用户尚未确认"
    ]
  }
}
```

- [ ] **Step 2: 验证 JSON 格式有效**

```bash
node -e "JSON.parse(require('fs').readFileSync('skills/feature-clarify/requirement-checklist.json','utf8')); console.log('PASS')"
```

- [ ] **Step 3: 提交**

```bash
git add skills/feature-clarify/requirement-checklist.json
git commit -m "feat(feature-clarify): add requirement checklist JSON template"
```

---

### Task 2: 创建 `scripts/feature-clarify.js`

**Files:**
- Create: `scripts/feature-clarify.js`
- Create: `scripts/test/feature-clarify.test.js`

**Interfaces:**
- Produces: `init(taskPath)`, `checkComplete(taskPath)`, `readChecklist(taskPath)` — 均可 `require()` 使用
- CLI: `node feature-clarify.js init <taskPath>` | `check-complete <taskPath>` | `read-checklist <taskPath>`

- [ ] **Step 1: 写测试文件**

```javascript
#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { init, checkComplete, readChecklist } = require('../feature-clarify');

test('init creates reviews/ dir and copies checklist template', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-001');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');

  init(taskPath);

  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  assert.ok(fs.existsSync(checklistPath), 'checklist JSON exists');
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  assert.ok(Array.isArray(checklist.categories), 'has categories array');
  assert.ok(checklist.categories.length > 0, 'categories non-empty');

  const backlogPath = path.join(taskPath, 'inputs', 'ambiguity-backlog.json');
  assert.ok(fs.existsSync(backlogPath), 'backlog exists');
  const backlog = JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
  assert.ok(Array.isArray(backlog.ambiguities), 'has ambiguities array');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('init is idempotent', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-002');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');

  init(taskPath);
  const first = JSON.parse(fs.readFileSync(path.join(taskPath, 'reviews', 'requirement-checklist.json'), 'utf8'));
  init(taskPath);
  const second = JSON.parse(fs.readFileSync(path.join(taskPath, 'reviews', 'requirement-checklist.json'), 'utf8'));
  assert.deepStrictEqual(first, second, 'second init is no-op');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('init throws on missing taskPath', () => {
  assert.throws(() => init('/nonexistent/path'), /taskPath/);
});

test('checkComplete returns false when all items fail', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-003');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# 原始需求\n\n## 11. 最终确认\n以上内容已经过用户确认。- **确认时间**：2026-07-14 10:00');
  init(taskPath);

  const result = checkComplete(taskPath);
  assert.strictEqual(result.complete, false);
  assert.ok(result.failures.length > 0, 'has failure details');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('checkComplete returns true when all items pass and confirmed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-004');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# 原始需求\n\n## 11. 最终确认\n以上内容已经过用户确认。- **确认时间**：2026-07-14 10:00');

  init(taskPath);
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = JSON.parse(fs.readFileSync(checklistPath, 'utf8'));
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      item.result = 'pass';
      item.evidence = 'test';
    }
  }
  fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));

  const result = checkComplete(taskPath);
  assert.strictEqual(result.complete, true, `expected complete=true, failures: ${JSON.stringify(result.failures)}`);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('readChecklist returns counts', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const taskPath = path.join(tmp, 'tasks', 'feature', 'TEST-005');
  fs.mkdirSync(path.join(taskPath, 'inputs'), { recursive: true });
  fs.writeFileSync(path.join(taskPath, 'inputs', 'requirement.md'), '# test');
  init(taskPath);

  const result = readChecklist(taskPath);
  assert.ok(result.total > 0, 'has total');
  assert.strictEqual(result.passed, 0, 'all fail by default');
  assert.strictEqual(result.failed, result.total, 'failed equals total');
  assert.ok(Array.isArray(result.categories), 'has categories array');

  fs.rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
node scripts/test/feature-clarify.test.js 2>&1 | head -5
```
Expected: FAIL — module not found.

- [ ] **Step 3: 写实现**

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..', 'skills', 'feature-clarify');
const CHECKLIST_TEMPLATE = path.join(SKILL_DIR, 'requirement-checklist.json');

function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// --- init ---

function init(taskPath) {
  if (!fs.existsSync(taskPath)) throw new Error(`taskPath does not exist: ${taskPath}`);

  const reviewsDir = path.join(taskPath, 'reviews');
  const checklistPath = path.join(reviewsDir, 'requirement-checklist.json');
  const backlogPath = path.join(taskPath, 'inputs', 'ambiguity-backlog.json');

  // Copy checklist template (idempotent: skip if exists)
  ensureDir(reviewsDir);
  if (!fs.existsSync(checklistPath)) {
    fs.copyFileSync(CHECKLIST_TEMPLATE, checklistPath);
  }

  // Init ambiguity backlog (idempotent: skip if exists)
  const inputsDir = path.join(taskPath, 'inputs');
  ensureDir(inputsDir);
  if (!fs.existsSync(backlogPath)) {
    fs.writeFileSync(backlogPath, JSON.stringify({ ambiguities: [] }, null, 2));
  }
}

// --- checkComplete ---

function checkComplete(taskPath) {
  const failures = [];

  // 1. Checklist all pass
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = readJSON(checklistPath);
  if (!checklist) {
    return { complete: false, failures: ['requirement-checklist.json not found'] };
  }
  for (const cat of checklist.categories) {
    for (const item of cat.items) {
      if (item.result !== 'pass') {
        failures.push(`${item.id}: ${item.note || item.check}`);
      }
    }
  }

  // 2. Backlog no open core ambiguities
  const backlogPath = path.join(taskPath, 'inputs', 'ambiguity-backlog.json');
  const backlog = readJSON(backlogPath);
  if (backlog) {
    for (const amb of backlog.ambiguities || []) {
      if (amb.status === 'open') {
        failures.push(`Open ambiguity: ${amb.id} - ${amb.issue}`);
      }
    }
  }

  // 3. requirement.md has final confirmation
  const reqPath = path.join(taskPath, 'inputs', 'requirement.md');
  if (!fs.existsSync(reqPath)) {
    failures.push('requirement.md not found');
  } else {
    const content = fs.readFileSync(reqPath, 'utf8');
    if (!content.includes('最终确认')) {
      failures.push('requirement.md missing final confirmation');
    }
  }

  return { complete: failures.length === 0, failures };
}

// --- readChecklist ---

function readChecklist(taskPath) {
  const checklistPath = path.join(taskPath, 'reviews', 'requirement-checklist.json');
  const checklist = readJSON(checklistPath);
  if (!checklist) return null;

  let total = 0, passed = 0;
  const categories = checklist.categories.map(cat => {
    let catPassed = 0;
    const items = cat.items.map(item => {
      total++;
      if (item.result === 'pass') { passed++; catPassed++; }
      return { ...item };
    });
    return { id: cat.id, name: cat.name, passed: catPassed, total: cat.items.length, items };
  });

  return { passed, failed: total - passed, total, categories };
}

// --- CLI ---

if (require.main === module) {
  const [,, cmd, ...args] = process.argv;
  const taskPath = args[0];
  if (!taskPath) { console.error('Usage: feature-clarify.js <command> <taskPath>'); process.exit(1); }

  switch (cmd) {
    case 'init':
      init(taskPath);
      console.log(JSON.stringify({ init: true, taskPath }));
      break;
    case 'check-complete':
      console.log(JSON.stringify(checkComplete(taskPath)));
      break;
    case 'read-checklist':
      console.log(JSON.stringify(readChecklist(taskPath)));
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

module.exports = { init, checkComplete, readChecklist };
```

- [ ] **Step 4: 运行测试验证通过**

```bash
node scripts/test/feature-clarify.test.js
```
Expected: all pass.

- [ ] **Step 5: 验证 CLI 三命令**

```bash
TMP=$(mktemp -d) && mkdir -p "$TMP/tasks/feature/TEST-CLI/inputs" && echo "# test" > "$TMP/tasks/feature/TEST-CLI/inputs/requirement.md" && node scripts/feature-clarify.js init "$TMP/tasks/feature/TEST-CLI" && node scripts/feature-clarify.js read-checklist "$TMP/tasks/feature/TEST-CLI" && node scripts/feature-clarify.js check-complete "$TMP/tasks/feature/TEST-CLI" && rm -rf "$TMP" && echo "CLI PASS"
```
Expected: `CLI PASS`.

- [ ] **Step 6: 提交**

```bash
git add scripts/feature-clarify.js scripts/test/feature-clarify.test.js
git commit -m "feat(feature-clarify): add script with init/check-complete/read-checklist commands"
```

---

### Task 3: 修改 `skills/feature-clarify/SKILL.md`

**Files:**
- Modify: `skills/feature-clarify/SKILL.md` — 阶段0、阶段7a、完成判断原则

- [ ] **Step 1: 应用三处 Edit**

**Edit 1 — 阶段0 增加脚本调用：**

Old: 阶段0 的 `inputs/ambiguity-backlog.json` — 存在则恢复，缺失则初始化为 `{"ambiguities": []}`

Replace the 阶段0 section with:

```markdown
## 阶段0：前置检查与恢复

`state.status !== 'initialized'` 时停止。执行初始化并读取上下文：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/feature-clarify.js init <taskPath>
```

随后读取 `inputs/requirement.md`、`evidence/evidence-registry.json`、`evidence/knowledge/EV-*.md` 恢复已确认事实和证据。
```

**Edit 2 — 阶段7a 删除动态初始化：**

Replace the entire 7a subsection (the JSON code block and surrounding text) with a one-liner referencing the template already placed:

Old: `基于 checklist.md 的检查项，初始化 reviews/clarify-checklist.json。所有项初始 result: "fail"。` + JSON code block

New: `reviews/requirement-checklist.json` 已在阶段0由脚本放置，评审子 Agent 直接读取并更新。

**Edit 3 — 完成判断原则替换：**

Replace the entire 完成判断原则 section with:

```markdown
## 完成判断原则

阶段8 前必须满足：

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/feature-clarify.js check-complete <taskPath>
# 返回 { complete: true }
```

即：checklist 全部 pass、backlog 无 open 项、requirement.md 有最终确认标记。此外还需用户确认需求汇总符合真实意图。任一条件不满足则继续澄清。
```

- [ ] **Step 2: 运行全部测试**

```bash
node scripts/test/skill-contracts.test.js && node scripts/test/feature-clarify.test.js
```
Expected: all pass.

- [ ] **Step 3: 提交**

```bash
git add skills/feature-clarify/SKILL.md
git commit -m "refactor(feature-clarify): use init script, remove dynamic checklist init, simplify completion criteria"
```
