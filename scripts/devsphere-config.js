#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ARCHIVE_ROOT = '.devsphere/archive';

const DEFAULTS = {
  archive: { root: DEFAULT_ARCHIVE_ROOT },
};

// --- Core I/O ---

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = isPlainObject(base[key]) && isPlainObject(override[key])
      ? deepMerge(base[key], override[key])
      : override[key];
  }
  return out;
}

// --- Config path ---

function configPath(workspaceRoot) {
  return path.join(workspaceRoot, '.devsphere', 'config', 'config.json');
}

// --- Config operations ---

function readConfig(workspaceRoot) {
  const file = configPath(workspaceRoot);
  const current = readJSON(file) || {};
  const merged = deepMerge(DEFAULTS, current);
  if (JSON.stringify(merged) !== JSON.stringify(current)) writeJSON(file, merged);
  // Return an independent copy so callers (e.g. setConfig) can mutate the
  // result without corrupting the shared DEFAULTS constant. deepMerge uses a
  // shallow spread, so merged.archive would otherwise alias DEFAULTS.archive.
  return JSON.parse(JSON.stringify(merged));
}

const FORBIDDEN_KEY_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function setConfig(workspaceRoot, key, value) {
  const parts = String(key).split('.');
  if (parts.some(part => !part.trim())) {
    throw new Error(`Invalid config key: ${key}`);
  }
  if (parts.some(part => FORBIDDEN_KEY_SEGMENTS.has(part))) {
    throw new Error(`Invalid config key: ${key}`);
  }
  const config = readConfig(workspaceRoot);
  let node = config;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!isPlainObject(node[parts[i]])) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
  writeJSON(configPath(workspaceRoot), config);
  return config;
}

module.exports = {
  DEFAULT_ARCHIVE_ROOT,
  configPath,
  readConfig,
  setConfig,
};
