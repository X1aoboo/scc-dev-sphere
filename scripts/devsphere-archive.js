#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { readConfig, DEFAULT_ARCHIVE_ROOT } = require('./devsphere-config');

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

// Rejects values that could escape a single path segment: empty/whitespace-only,
// '.' / '..', or anything carrying a path separator or NUL byte. Free-format
// values (e.g. '1.2.0', 'v2-beta', 'FEAT-个人博客系统') remain valid.
function assertSafeSegment(value, label) {
  const unsafe = typeof value !== 'string'
    || !value.trim()
    || value === '.'
    || value === '..'
    || /[\/\\]/.test(value)
    || value.includes('\u0000');
  if (unsafe) {
    throw new Error(`Invalid ${label} (must be a single path-safe segment): ${value}`);
  }
}

function taskPathFor(workspaceRoot, taskId) {
  assertSafeSegment(taskId, 'taskId');
  return path.join(workspaceRoot, '.devsphere', 'tasks', 'feature', taskId);
}

function listTasks(workspaceRoot) {
  const tasksDir = path.join(workspaceRoot, '.devsphere', 'tasks', 'feature');
  if (!fs.existsSync(tasksDir)) return [];
  return fs.readdirSync(tasksDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const state = readJSON(path.join(tasksDir, entry.name, 'state.json'));
      return { taskId: entry.name, status: state ? state.status : null };
    })
    .sort((a, b) => a.taskId.localeCompare(b.taskId));
}

function resolveArchiveRoot(workspaceRoot, explicit) {
  let value;
  if (typeof explicit === 'string' && explicit.trim()) {
    value = explicit;
  } else {
    const config = readConfig(workspaceRoot);
    const root = config.archive && config.archive.root;
    value = typeof root === 'string' && root.trim() ? root : DEFAULT_ARCHIVE_ROOT;
  }
  return path.resolve(workspaceRoot, value);
}

function copyTree(src, dest) {
  const stat = fs.lstatSync(src);
  if (stat.isSymbolicLink()) {
    throw new Error(`Archive source cannot contain symbolic links: ${src}`);
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      copyTree(path.join(src, entry.name), path.join(dest, entry.name));
    }
  } else if (stat.isFile()) {
    fs.copyFileSync(src, dest);
  }
}

// Recursively walks src with lstatSync and throws on any symbolic link. Used to
// pre-scan the whole source set before the destination layer is created, so a
// deep symlink is rejected with no side effects.
function assertNoSymlinksInSource(src) {
  const stat = fs.lstatSync(src);
  if (stat.isSymbolicLink()) {
    throw new Error(`Archive source cannot contain symbolic links: ${src}`);
  }
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      assertNoSymlinksInSource(path.join(src, entry.name));
    }
  }
}

function runArchive(workspaceRoot, taskId, version, explicitArchiveRoot) {
  if (typeof version !== 'string' || !version.trim()) {
    throw new Error('Version is required');
  }
  assertSafeSegment(version, 'version');
  const taskPath = taskPathFor(workspaceRoot, taskId);
  if (!fs.existsSync(taskPath)) throw new Error(`Task not found: ${taskId}`);
  const artifactsDir = path.join(taskPath, 'artifacts');
  if (!fs.existsSync(artifactsDir)) {
    throw new Error(`No baseline design docs to archive (missing artifacts dir)`);
  }

  const docs = [];
  const assets = [];
  for (const entry of fs.readdirSync(artifactsDir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Archive source cannot contain symbolic links: ${entry.name}`);
    }
    if (entry.isFile() && entry.name.endsWith('.md')) docs.push(entry.name);
    else if (entry.isDirectory() && entry.name.endsWith('-assets')) assets.push(entry.name);
  }
  if (docs.length === 0) {
    throw new Error('No baseline design docs to archive (no *.md in artifacts)');
  }

  // Pre-scan the whole source set before creating the destination layer so any
  // symlink (even nested inside a *-assets tree) fails with no side effects.
  for (const doc of docs) assertNoSymlinksInSource(path.join(artifactsDir, doc));
  for (const asset of assets) assertNoSymlinksInSource(path.join(artifactsDir, asset));

  const archiveRoot = resolveArchiveRoot(workspaceRoot, explicitArchiveRoot);
  const destination = path.join(archiveRoot, version, taskId);
  const hasFiles = fs.existsSync(destination) && fs.readdirSync(destination).length > 0;
  const mode = hasFiles ? 'updated' : 'created';
  fs.mkdirSync(destination, { recursive: true });

  for (const doc of docs) copyTree(path.join(artifactsDir, doc), path.join(destination, doc));
  for (const asset of assets) copyTree(path.join(artifactsDir, asset), path.join(destination, asset));

  return {
    taskId,
    version,
    archiveRoot,
    destination,
    mode,
    docs,
    assets,
  };
}

module.exports = { taskPathFor, listTasks, runArchive };
