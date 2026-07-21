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

const SOURCE_SPECS = {
  mcp: { collection: 'tools', target: 'name' },
  skill: { collection: 'names', target: 'name' },
  local: { collection: 'dirs', target: 'dir' },
  repo: { collection: 'paths', target: 'path' },
};

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeConfig(rawConfig, source) {
  const rawSources = rawConfig && rawConfig.sources && typeof rawConfig.sources === 'object'
    ? rawConfig.sources
    : {};
  const sources = {};

  for (const [type, spec] of Object.entries(SOURCE_SPECS)) {
    const raw = rawSources[type] && typeof rawSources[type] === 'object' ? rawSources[type] : {};
    const entries = raw.enabled === true && Array.isArray(raw[spec.collection])
      ? raw[spec.collection].filter(item => item && typeof item === 'object'
        && nonEmptyString(item[spec.target]) && nonEmptyString(item.description))
        .map(item => ({
          [spec.target]: item[spec.target].trim(),
          description: item.description.trim(),
        }))
      : [];
    sources[type] = {
      enabled: raw.enabled === true && entries.length > 0,
      [spec.collection]: entries,
    };
  }

  const rawWeb = rawSources.web && typeof rawSources.web === 'object' ? rawSources.web : {};
  const webEnabled = rawWeb.enabled === true && nonEmptyString(rawWeb.description);
  sources.web = {
    enabled: webEnabled,
    description: webEnabled ? rawWeb.description.trim() : '',
  };

  return { sources, _source: source };
}

// 项目配置存在时是唯一配置；不存在时使用插件默认配置。
function getEffectiveConfig(workspaceRoot) {
  const workspacePath = getWorkspaceConfigPath(workspaceRoot);
  if (fs.existsSync(workspacePath)) {
    return normalizeConfig(readJSON(workspacePath), 'workspace');
  }
  return normalizeConfig(readJSON(DEFAULT_CONFIG), 'plugin-default');
}

function readConfig(workspaceRoot) {
  return getEffectiveConfig(workspaceRoot);
}

function showConfig(workspaceRoot) {
  const cfg = getEffectiveConfig(workspaceRoot);
  const lines = [`当前生效数据源配置（${cfg._source}）：`, ''];

  for (const [name, src] of Object.entries(cfg.sources)) {
    const status = src && src.enabled ? '启用' : '禁用';
    lines.push(`${name}: ${status}`);
    if (name === 'web' && src.description) {
      lines.push(`  ${src.description}`);
      continue;
    }
    const spec = SOURCE_SPECS[name];
    for (const item of spec ? src[spec.collection] : []) {
      lines.push(`  ${item[spec.target]} — ${item.description}`);
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
  if (key === 'priority' || key.startsWith('priority.')) {
    throw new Error('priority is not part of the knowledge source configuration');
  }
  const wsPath = getWorkspaceConfigPath(workspaceRoot);
  let wsCfg = readJSON(wsPath);
  if (!fs.existsSync(wsPath)) wsCfg = JSON.parse(JSON.stringify(readJSON(DEFAULT_CONFIG)));
  if (!wsCfg || typeof wsCfg !== 'object') wsCfg = { sources: {} };
  delete wsCfg.priority;
  setNested(wsCfg, key, value);
  writeJSON(wsPath, wsCfg);
  return { updated: true, key, value, file: wsPath };
}

function upsertSource(workspaceRoot, type, target, description) {
  if (!workspaceRoot || !type) {
    throw new Error('Usage: upsert-source <type> <target> <description> | upsert-source web <description>');
  }
  if (type === 'web' && description === undefined) {
    description = target;
    target = null;
  }
  if (!nonEmptyString(description)) throw new Error('Source description is required');
  const wsPath = getWorkspaceConfigPath(workspaceRoot);
  let wsCfg = readJSON(wsPath);
  if (!fs.existsSync(wsPath)) wsCfg = JSON.parse(JSON.stringify(readJSON(DEFAULT_CONFIG)));
  if (!wsCfg || typeof wsCfg !== 'object') wsCfg = { sources: {} };
  delete wsCfg.priority;
  if (!wsCfg.sources || typeof wsCfg.sources !== 'object') wsCfg.sources = {};

  if (type === 'web') {
    wsCfg.sources.web = { enabled: true, description: description.trim() };
    writeJSON(wsPath, wsCfg);
    return { upserted: true, type, description: description.trim(), file: wsPath };
  }

  const spec = SOURCE_SPECS[type];
  if (!spec) throw new Error(`Unsupported source type: ${type}`);
  if (!nonEmptyString(target)) throw new Error('Source target is required');
  const raw = wsCfg.sources[type] && typeof wsCfg.sources[type] === 'object' ? wsCfg.sources[type] : {};
  const entries = Array.isArray(raw[spec.collection])
    ? raw[spec.collection].filter(item => item && typeof item === 'object')
    : [];
  const normalizedTarget = target.trim();
  const existing = entries.find(item => item[spec.target] === normalizedTarget);
  if (existing) existing.description = description.trim();
  else entries.push({ [spec.target]: normalizedTarget, description: description.trim() });
  wsCfg.sources[type] = { enabled: true, [spec.collection]: entries };
  writeJSON(wsPath, wsCfg);
  return { upserted: true, type, target: normalizedTarget, description: description.trim(), file: wsPath };
}

function removeSource(workspaceRoot, type, target) {
  if (!workspaceRoot || !type) throw new Error('Usage: remove-source <type> <target> | remove-source web');
  const wsPath = getWorkspaceConfigPath(workspaceRoot);
  if (!fs.existsSync(wsPath)) throw new Error('No workspace config to remove from');
  const wsCfg = readJSON(wsPath);
  if (!wsCfg || !wsCfg.sources || typeof wsCfg.sources !== 'object') {
    throw new Error('Workspace config has no sources');
  }
  delete wsCfg.priority;

  if (type === 'web') {
    const removed = Boolean(wsCfg.sources.web);
    wsCfg.sources.web = { enabled: false };
    writeJSON(wsPath, wsCfg);
    return { removed, type, file: wsPath };
  }

  const spec = SOURCE_SPECS[type];
  if (!spec) throw new Error(`Unsupported source type: ${type}`);
  if (!nonEmptyString(target)) throw new Error('Source target is required');
  const raw = wsCfg.sources[type] && typeof wsCfg.sources[type] === 'object' ? wsCfg.sources[type] : {};
  const entries = Array.isArray(raw[spec.collection]) ? raw[spec.collection] : [];
  const filtered = entries.filter(item => !item || typeof item !== 'object' || item[spec.target] !== target.trim());
  const removed = filtered.length !== entries.length;
  wsCfg.sources[type] = { ...raw, [spec.collection]: filtered };
  writeJSON(wsPath, wsCfg);
  return { removed, type, target: target.trim(), file: wsPath };
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
      permissionDecisionReason: `${target} 禁止直接 Write/Edit。数据源配置须通过 knowledge-query.js CLI（update-config / upsert-source / remove-source / reset-config）修改。`,
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
    console.error('  upsert-source <type> <target> <description>');
    console.error('  upsert-source web <description>');
    console.error('  remove-source <type> <target>');
    console.error('  remove-source web');
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
      case 'upsert-source':
        result = upsertSource(workspaceRoot, args[2], args[3], args[4]);
        console.log(JSON.stringify(result));
        break;
      case 'remove-source':
        result = removeSource(workspaceRoot, args[2], args[3]);
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
  normalizeConfig,
  upsertSource,
  removeSource,
  resetConfig,
  registerEvidenceRecord,
  readEvidence,
  readRegistry,
  guardWrite,
  guardBash,
};
