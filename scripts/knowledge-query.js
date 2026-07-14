#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SKILL_DEFAULT_CONFIG = path.join(REPO_ROOT, 'skills', 'knowledge-query', 'knowledge-sources.json');

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

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// --- Config paths ---

function getWorkspaceConfigPath(workspaceRoot) {
  return path.join(workspaceRoot, 'config', 'knowledge-sources.json');
}

// --- Config operations ---

// 两层 fallback: workspace config > skill default
function getEffectiveConfig(workspaceRoot) {
  const defaultCfg = readJSON(SKILL_DEFAULT_CONFIG);
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
      effective._source[`sources.${src}`] = 'skill-default';
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
    effective._source['priority'] = 'skill-default';
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
    throw new Error('Usage: update-config <workspaceRoot> <key> <value>');
  }
  const wsPath = getWorkspaceConfigPath(workspaceRoot);
  let wsCfg = readJSON(wsPath);
  if (!wsCfg) {
    // Clone from default config
    wsCfg = JSON.parse(JSON.stringify(readJSON(SKILL_DEFAULT_CONFIG)));
  }
  setNested(wsCfg, key, value);
  writeJSON(wsPath, wsCfg);
  return { updated: true, key, value, file: wsPath };
}

function addConfigItem(workspaceRoot, field, item) {
  if (!workspaceRoot || !field || item === undefined) {
    throw new Error('Usage: add-config-item <workspaceRoot> <field> <item>');
  }
  const wsPath = getWorkspaceConfigPath(workspaceRoot);
  let wsCfg = readJSON(wsPath);
  if (!wsCfg) {
    wsCfg = JSON.parse(JSON.stringify(readJSON(SKILL_DEFAULT_CONFIG)));
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
    throw new Error('Usage: remove-config-item <workspaceRoot> <field> <item>');
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

function getRegistryPath(workspaceRoot) {
  return path.join(workspaceRoot, 'evidence', 'evidence-registry.json');
}

function getEvidenceDir(workspaceRoot) {
  return path.join(workspaceRoot, 'evidence', 'knowledge');
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

// --- Evidence operations ---

function nextEvId(workspaceRoot) {
  const registry = readRegistry(workspaceRoot);
  const maxId = registry.evidences.reduce((max, ev) => {
    const num = parseInt((ev.id || '').replace('EV-', ''), 10);
    return num > max ? num : max;
  }, 0);
  const nextNum = maxId + 1;
  const nextId = 'EV-' + String(nextNum).padStart(3, '0');
  return { nextId };
}

function sanitizeDescription(desc) {
  return desc.replace(/[^a-zA-Z0-9一-鿿_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'evidence';
}

function registerEvidence(workspaceRoot, description) {
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

function readEvidence(workspaceRoot, evId) {
  if (!workspaceRoot || !evId) {
    throw new Error('Usage: read-evidence <workspaceRoot> <evId>');
  }
  const registry = readRegistry(workspaceRoot);
  const entry = registry.evidences.find(ev => ev.id === evId);
  if (!entry) {
    throw new Error('Evidence not found: ' + evId);
  }
  const snapshotPath = path.join(workspaceRoot, entry.file);
  if (!fs.existsSync(snapshotPath)) {
    throw new Error('Snapshot file not found: ' + snapshotPath);
  }
  return fs.readFileSync(snapshotPath, 'utf-8');
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const workspaceRoot = args[1];

  if (!command) {
    console.error('Usage: knowledge-query.js <command> <workspaceRoot> [args...]');
    console.error('');
    console.error('Configuration commands:');
    console.error('  read-config <workspaceRoot>');
    console.error('  show-config <workspaceRoot>');
    console.error('  update-config <workspaceRoot> <key> <value>');
    console.error('  add-config-item <workspaceRoot> <field> <item>');
    console.error('  remove-config-item <workspaceRoot> <field> <item>');
    console.error('  reset-config <workspaceRoot>');
    console.error('');
    console.error('Evidence commands:');
    console.error('  next-ev-id <workspaceRoot>');
    console.error('  register-evidence <workspaceRoot> <description>  (content from stdin)');
    console.error('  read-evidence <workspaceRoot> <evId>');
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
      case 'next-ev-id':
        result = nextEvId(workspaceRoot);
        console.log(JSON.stringify(result));
        break;
      case 'register-evidence':
        result = registerEvidence(workspaceRoot, args[2]);
        console.log(JSON.stringify(result));
        break;
      case 'read-evidence':
        result = readEvidence(workspaceRoot, args[2]);
        console.log(result);
        break;
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
  ensureDir,
  getEffectiveConfig,
  readConfig,
  showConfig,
  updateConfig,
  addConfigItem,
  removeConfigItem,
  resetConfig,
  nextEvId,
  registerEvidence,
  readEvidence,
};
