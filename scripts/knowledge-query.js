#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { getTaskPath } = require('./devsphere-state');

const REPO_ROOT = path.join(__dirname, '..');
const DEFAULT_CONFIG = path.join(REPO_ROOT, 'config', 'knowledge-sources.json');

// --- Core I/O ---

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// --- Config paths ---

function getWorkspaceConfigPath(workspaceRoot) {
  return path.join(workspaceRoot, '.devsphere', 'config', 'knowledge-sources.json');
}

// --- Config operations ---

// 两层 fallback: workspace config > plugin default
function getEffectiveConfig(workspaceRoot) {
  const defaultCfg = readJSON(DEFAULT_CONFIG);
  const workspaceCfg = readJSON(getWorkspaceConfigPath(workspaceRoot));

  const effective = {
    sources: {},
    priority: [],
    _source: {}  // 标注每个字段的来源
  };

  // Merge sources: workspace overrides default per-source
  const sources = ['mcp', 'skill', 'local', 'repo', 'web'];
  for (const src of sources) {
    const wsSrc = workspaceCfg && workspaceCfg.sources ? workspaceCfg.sources[src] : undefined;
    const defSrc = defaultCfg && defaultCfg.sources ? defaultCfg.sources[src] : undefined;
    if (wsSrc !== undefined) {
      effective.sources[src] = wsSrc;
      effective._source[`sources.${src}`] = 'workspace';
    } else if (defSrc !== undefined) {
      effective.sources[src] = defSrc;
      effective._source[`sources.${src}`] = 'plugin-default';
    }
  }

  // priority: workspace overrides default
  const wsPriority = workspaceCfg && workspaceCfg.priority;
  const defPriority = defaultCfg && defaultCfg.priority;
  if (wsPriority && Array.isArray(wsPriority)) {
    effective.priority = wsPriority;
    effective._source['priority'] = 'workspace';
  } else if (defPriority && Array.isArray(defPriority)) {
    effective.priority = defPriority;
    effective._source['priority'] = 'plugin-default';
  }

  return effective;
}

function readConfig(workspaceRoot) {
  return getEffectiveConfig(workspaceRoot);
}

function showConfig(workspaceRoot) {
  const cfg = getEffectiveConfig(workspaceRoot);
  const lines = ['当前生效数据源配置：', ''];

  lines.push('优先级: ' + cfg.priority.join(' → ') + '');
  lines.push('  来源: ' + cfg._source['priority']);
  lines.push('');

  for (const [name, src] of Object.entries(cfg.sources)) {
    const status = src && src.enabled ? '启用' : '禁用';
    const detail = src ? JSON.stringify(Object.assign({}, src, { enabled: undefined })) : '{}';
    const source = cfg._source[`sources.${name}`] || '-';
    lines.push(`${name}: ${status}  来源: ${source}`);
    if (src) {
      const names = src.names || src.dirs || src.paths;
      if (names && names.length) {
        lines.push(`  ${names.join(', ')}`);
      }
    }
  }

  return lines.join('\n');
}

// dot-notation key → nested set
function setNested(obj, key, value) {
  const parts = key.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  // Parse value: try boolean, number, string
  let parsed = value;
  if (value === 'true') parsed = true;
  else if (value === 'false') parsed = false;
  else if (!isNaN(Number(value)) && value !== '') parsed = Number(value);
  current[parts[parts.length - 1]] = parsed;
  return obj;
}

function updateConfig(workspaceRoot, key, value) {
  if (!workspaceRoot || !key || value === undefined) {
    throw new Error('Usage: update-config <key> <value>');
  }
  const wsPath = getWorkspaceConfigPath(workspaceRoot);
  let wsCfg = readJSON(wsPath);
  if (!wsCfg) {
    // Clone from default config
    wsCfg = JSON.parse(JSON.stringify(readJSON(DEFAULT_CONFIG)));
  }
  setNested(wsCfg, key, value);
  writeJSON(wsPath, wsCfg);
  return { updated: true, key, value, file: wsPath };
}

function addConfigItem(workspaceRoot, field, item) {
  if (!workspaceRoot || !field || item === undefined) {
    throw new Error('Usage: add-config-item <field> <item>');
  }
  const wsPath = getWorkspaceConfigPath(workspaceRoot);
  let wsCfg = readJSON(wsPath);
  if (!wsCfg) {
    wsCfg = JSON.parse(JSON.stringify(readJSON(DEFAULT_CONFIG)));
  }
  const parts = field.split('.');
  let current = wsCfg;
  for (const part of parts) {
    if (!current[part]) {
      current[part] = [];
    }
    current = current[part];
  }
  // current is now the array
  const arr = parts.reduce((obj, p) => obj[p], wsCfg);
  if (!Array.isArray(arr)) {
    throw new Error(`Field ${field} is not an array`);
  }
  if (!arr.includes(item)) {
    arr.push(item);
  }
  writeJSON(wsPath, wsCfg);
  return { added: true, field, item, file: wsPath };
}

function removeConfigItem(workspaceRoot, field, item) {
  if (!workspaceRoot || !field || item === undefined) {
    throw new Error('Usage: remove-config-item <field> <item>');
  }
  const wsPath = getWorkspaceConfigPath(workspaceRoot);
  let wsCfg = readJSON(wsPath);
  if (!wsCfg) {
    throw new Error('No workspace config to remove from');
  }
  const arr = field.split('.').reduce((obj, p) => obj[p], wsCfg);
  if (!Array.isArray(arr)) {
    throw new Error(`Field ${field} is not an array`);
  }
  const idx = arr.indexOf(item);
  if (idx !== -1) {
    arr.splice(idx, 1);
  }
  writeJSON(wsPath, wsCfg);
  return { removed: idx !== -1, field, item, file: wsPath };
}

function resetConfig(workspaceRoot) {
  const wsPath = getWorkspaceConfigPath(workspaceRoot);
  if (fs.existsSync(wsPath)) {
    fs.unlinkSync(wsPath);
    return { reset: true, deleted: wsPath };
  }
  return { reset: false, reason: 'No workspace config to delete' };
}

// --- Evidence paths ---
// evidence 是任务级数据：路径基于从 current-task.json 解析出的活跃任务目录，
// 而非 workspaceRoot。config 操作仍基于 workspaceRoot（workspace 级配置）。

function resolveTaskRoot(workspaceRoot) {
  const taskPath = getTaskPath(workspaceRoot);
  if (!taskPath) {
    throw new Error('无活跃任务：无法定位 evidence 目录。请先通过 feature-init 创建任务。');
  }
  return taskPath;
}

function getRegistryPath(workspaceRoot) {
  return path.join(resolveTaskRoot(workspaceRoot), 'evidence', 'evidence-registry.json');
}

function readRegistry(workspaceRoot) {
  const registryPath = getRegistryPath(workspaceRoot);
  let registry = readJSON(registryPath);
  if (!registry) {
    registry = { evidences: [] };
    writeJSON(registryPath, registry);
  }
  if (!registry.evidences) {
    registry.evidences = [];
  }
  return registry;
}

// Merge read-only source-agent results. Equal claims retain all supporting
// sources; disagreeing claims remain explicit conflicts for the main session.
function mergeCandidateResults(results) {
  const byKey = new Map();
  const gaps = [];
  for (const result of results || []) {
    const source = result.source;
    for (const claim of result.claims || []) {
      if (!byKey.has(claim.key)) byKey.set(claim.key, []);
      let variant = byKey.get(claim.key).find(item => item.text === claim.text);
      if (!variant) {
        variant = { key: claim.key, text: claim.text, sources: [] };
        byKey.get(claim.key).push(variant);
      }
      variant.sources.push(source);
    }
    for (const gap of result.gaps || []) if (!gaps.includes(gap)) gaps.push(gap);
  }
  const candidates = [];
  const conflicts = [];
  for (const [key, variants] of byKey.entries()) {
    candidates.push(variants[0]);
    if (variants.length > 1) conflicts.push({ key, variants });
  }
  return { candidates, conflicts, gaps };
}

function registerEvidenceRecord(workspaceRoot, input) {
  if (!input || typeof input.topic !== 'string' || !input.topic.trim()) throw new Error('Evidence topic is required');
  if (typeof input.summary !== 'string' || !input.summary.trim()) throw new Error('Evidence summary is required');
  if (!Array.isArray(input.sources) || input.sources.length === 0) throw new Error('Evidence requires at least one source');
  const allowedSourceTypes = new Set(['mcp', 'skill', 'local', 'repo', 'web', 'user']);
  input.sources.forEach((source, index) => {
    for (const field of ['type', 'reference', 'summary']) {
      if (!source || typeof source[field] !== 'string' || !source[field].trim()) {
        throw new Error(`Evidence source ${index + 1} requires non-empty ${field}`);
      }
    }
    if (!allowedSourceTypes.has(source.type)) throw new Error(`Unsupported Evidence source type: ${source.type}`);
    const marker = `S${index + 1}`;
    if (!input.summary.includes(`[${marker}]`)) throw new Error(`Evidence summary must reference [${marker}]`);
  });
  const taskRoot = resolveTaskRoot(workspaceRoot);
  const registry = readRegistry(workspaceRoot);
  const max = registry.evidences.reduce((value, item) => {
    const match = String(item.id || '').match(/^EV-(\d+)$/);
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  const id = `EV-${String(max + 1).padStart(3, '0')}`;
  const record = {
    id,
    topic: input.topic,
    summary: input.summary,
    sources: input.sources.map((source, index) => ({
      marker: `S${index + 1}`,
      type: source.type,
      reference: source.reference,
      summary: source.summary,
    })),
    conflicts: input.conflicts || [],
    gaps: input.gaps || [],
    recordedAt: new Date().toISOString(),
  };
  const recordPath = path.join(taskRoot, 'evidence', 'knowledge', `${id}.json`);
  writeJSON(recordPath, record);
  registry.evidences.push({ id, topic: record.topic, file: path.relative(taskRoot, recordPath) });
  writeJSON(getRegistryPath(workspaceRoot), registry);
  return record;
}

function readEvidence(workspaceRoot, evId) {
  if (!workspaceRoot || !evId) {
    throw new Error('Usage: read-evidence <evId>');
  }
  const registry = readRegistry(workspaceRoot);
  const entry = registry.evidences.find(ev => ev.id === evId);
  if (!entry) {
    throw new Error('Evidence not found: ' + evId);
  }
  const snapshotPath = path.join(resolveTaskRoot(workspaceRoot), entry.file);
  if (!fs.existsSync(snapshotPath)) {
    throw new Error('Snapshot file not found: ' + snapshotPath);
  }
  return fs.readFileSync(snapshotPath, 'utf-8');
}

// --- Guard helpers ---

function knowledgeSourcesPath(filePath) {
  const norm = (filePath || '').replace(/\\/g, '/');
  if (/(?:^|\/)knowledge-sources\.json$/.test(norm)) return 'knowledge-sources.json';
  return null;
}

function guardWrite(stdinJson) {
  const filePath = stdinJson && stdinJson.tool_input && stdinJson.tool_input.file_path;
  const target = knowledgeSourcesPath(filePath);
  if (!target) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${target} 禁止直接 Write/Edit。数据源配置须通过 knowledge-query.js CLI（update-config / add-config-item / remove-config-item / reset-config）修改。`,
    },
  };
}

function guardBash(stdinJson) {
  const ti = stdinJson && stdinJson.tool_input;
  if (!ti || typeof ti.command !== 'string') return null;
  const command = ti.command;
  const targetsConfig = /knowledge-sources\.json/.test(command);
  if (!targetsConfig) return null;
  const isCLI = command.includes('knowledge-query.js');
  if (isCLI) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'knowledge-sources.json 禁止通过 Bash 直接操作；数据源配置须通过 knowledge-query.js CLI 修改。',
    },
  };
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const workspaceRoot = args[1] || process.cwd();

  if (!command) {
    console.error('Usage: knowledge-query.js <command> <workspaceRoot> [args...]');
    console.error('');
    console.error('Configuration commands:');
    console.error('  read-config');
    console.error('  show-config');
    console.error('  update-config <key> <value>');
    console.error('  add-config-item <field> <item>');
    console.error('  remove-config-item <field> <item>');
    console.error('  reset-config');
    console.error('');
    console.error('Evidence commands (main session only):');
    console.error('  register-evidence-record  (JSON from stdin)');
    console.error('  read-evidence <evId>');
    process.exit(0);
  }

  try {
    let result;
    switch (command) {
      case 'read-config':
        result = readConfig(workspaceRoot);
        console.log(JSON.stringify(result, null, 2));
        break;
      case 'show-config':
        result = showConfig(workspaceRoot);
        console.log(result);
        break;
      case 'update-config':
        result = updateConfig(workspaceRoot, args[2], args[3]);
        console.log(JSON.stringify(result));
        break;
      case 'add-config-item':
        result = addConfigItem(workspaceRoot, args[2], args[3]);
        console.log(JSON.stringify(result));
        break;
      case 'remove-config-item':
        result = removeConfigItem(workspaceRoot, args[2], args[3]);
        console.log(JSON.stringify(result));
        break;
      case 'reset-config':
        result = resetConfig(workspaceRoot);
        console.log(JSON.stringify(result));
        break;
      case 'register-evidence-record': {
        const input = JSON.parse(fs.readFileSync(0, 'utf8'));
        result = registerEvidenceRecord(workspaceRoot, input);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'merge-results':
        result = mergeCandidateResults(JSON.parse(fs.readFileSync(0, 'utf8')));
        console.log(JSON.stringify(result, null, 2));
        break;
      case 'read-evidence':
        result = readEvidence(workspaceRoot, args[2]);
        console.log(result);
        break;
      case 'guard-write': {
        let stdinJson = null;
        try { stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8')); }
        catch (e) { process.exit(0); }
        const decision = guardWrite(stdinJson);
        if (decision) process.stdout.write(JSON.stringify(decision));
        process.exit(0);
        break;
      }
      case 'guard-bash': {
        let stdinJson = null;
        try { stdinJson = JSON.parse(fs.readFileSync(0, 'utf-8')); }
        catch (e) { process.exit(0); }
        const decision = guardBash(stdinJson);
        if (decision) process.stdout.write(JSON.stringify(decision));
        process.exit(0);
        break;
      }
      default:
        console.error('Unknown command: ' + command);
        process.exit(1);
    }
  } catch (e) {
    console.error('Error: ' + e.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  readJSON,
  writeJSON,
  getEffectiveConfig,
  readConfig,
  showConfig,
  updateConfig,
  addConfigItem,
  removeConfigItem,
  resetConfig,
  registerEvidenceRecord,
  readEvidence,
  readRegistry,
  mergeCandidateResults,
  guardWrite,
  guardBash,
};
