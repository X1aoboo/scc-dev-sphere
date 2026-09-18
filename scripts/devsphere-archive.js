#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { readConfig, DEFAULT_ARCHIVE_ROOT } = require('./devsphere-config');
const { readCurrentTask, writeCurrentTask } = require('./devsphere-state');

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

function listVersions(workspaceRoot, explicitArchiveRoot) {
  const archiveRoot = resolveArchiveRoot(workspaceRoot, explicitArchiveRoot);
  if (!fs.existsSync(archiveRoot)) return [];
  return fs.readdirSync(archiveRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function listArchived(workspaceRoot, version, explicitArchiveRoot) {
  assertSafeSegment(version, 'version');
  const archiveRoot = resolveArchiveRoot(workspaceRoot, explicitArchiveRoot);
  const versionDir = path.join(archiveRoot, version);
  if (!fs.existsSync(versionDir)) throw new Error(`Version layer not found: ${version}`);
  return fs.readdirSync(versionDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const state = readJSON(path.join(versionDir, entry.name, 'state.json'));
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

function moveTree(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    try {
      copyTree(src, dest);
    } catch (copyError) {
      fs.rmSync(dest, { recursive: true, force: true });
      throw copyError;
    }
    fs.rmSync(src, { recursive: true });
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
  const hasBaselineDocs = fs.readdirSync(artifactsDir, { withFileTypes: true })
    .some(entry => entry.isFile() && entry.name.endsWith('.md'));
  if (!hasBaselineDocs) {
    throw new Error('No baseline design docs to archive (no *.md in artifacts)');
  }

  // Pre-scan the whole task tree before any write so any symlink (even deep
  // inside work/ or evidence/) fails with no side effects.
  assertNoSymlinksInSource(taskPath);

  const archiveRoot = resolveArchiveRoot(workspaceRoot, explicitArchiveRoot);
  const destination = path.join(archiveRoot, version, taskId);
  if (fs.existsSync(destination)) {
    throw new Error(`Task already archived at this version: ${version}/${taskId}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  moveTree(taskPath, destination);

  const current = readCurrentTask(workspaceRoot);
  if (current && current.activeTaskId === taskId) {
    fs.rmSync(path.join(workspaceRoot, '.devsphere', 'current-task.json'));
  }

  return {
    taskId,
    version,
    archiveRoot,
    destination,
    // Top-level entries of the archived task directory (not a recursive manifest).
    movedTree: fs.readdirSync(destination).sort(),
  };
}

function activateTask(workspaceRoot, taskId, version, explicitArchiveRoot) {
  assertSafeSegment(taskId, 'taskId');
  assertSafeSegment(version, 'version');
  const tasksDir = path.join(workspaceRoot, '.devsphere', 'tasks', 'feature');
  const taskPath = path.join(tasksDir, taskId);
  if (fs.existsSync(taskPath)) {
    throw new Error(`Task already exists in workspace: ${taskId} (complete or archive it first)`);
  }
  const archiveRoot = resolveArchiveRoot(workspaceRoot, explicitArchiveRoot);
  const versionDir = path.join(archiveRoot, version);
  if (!fs.existsSync(versionDir)) throw new Error(`Version layer not found: ${version}`);
  const archivedPath = path.join(versionDir, taskId);
  if (!fs.existsSync(archivedPath)) {
    throw new Error(`Archived task not found: ${version}/${taskId}`);
  }
  const archivedState = readJSON(path.join(archivedPath, 'state.json'));
  if (!archivedState) {
    throw new Error(`Not a whole-task archive (missing state.json, legacy copy-mode layer): ${version}/${taskId}`);
  }
  assertNoSymlinksInSource(archivedPath);

  fs.mkdirSync(tasksDir, { recursive: true });
  moveTree(archivedPath, taskPath);

  writeCurrentTask(workspaceRoot, {
    activeTaskId: taskId,
    activeTaskType: 'feature',
    workspaceRoot: workspaceRoot,
    taskPath: `.devsphere/tasks/feature/${taskId}`,
  });

  if (fs.existsSync(versionDir) && fs.readdirSync(versionDir).length === 0) {
    fs.rmdirSync(versionDir);
  }

  return { taskId, version, taskPath, destination: taskPath, activated: true };
}

module.exports = { taskPathFor, listTasks, listVersions, listArchived, runArchive, moveTree, activateTask };
