#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJSON, writeJSON, readState, writeState } = require('./devsphere-state');

const STAGE_SLUG = {
  businessDesign: 'business-design',
  solutionDesign: 'solution-design',
  implementationDesign: 'implementation-design',
  testDesign: 'test-design',
};

function stageDir(taskPath, stage) {
  return path.join(taskPath, 'work', STAGE_SLUG[stage] || stage);
}

function progressPath(taskPath, stage) {
  return path.join(stageDir(taskPath, stage), 'progress.json');
}

function draftPath(taskPath, stage) {
  return path.join(stageDir(taskPath, stage), 'draft.md');
}

function artifactPath(taskPath, stage) {
  return path.join(taskPath, 'artifacts', `${STAGE_SLUG[stage]}.md`);
}

function gatePath(taskPath, stage) {
  return path.join(taskPath, 'quality-gates', `${STAGE_SLUG[stage]}.json`);
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
}

// 解析 draft/artifact frontmatter 中的 artifactId 与 version。缺失返回 null。
function parseDraftFrontmatter(filePath) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf-8'); } catch (e) { return null; }
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = m[1];
  const idMatch = fm.match(/^artifactId:\s*"?([^"\n]+)"?/m);
  const verMatch = fm.match(/^version:\s*"?([^"\n]+)"?/m);
  if (!idMatch || !verMatch) return null;
  return { artifactId: idMatch[1].trim(), version: verMatch[1].trim() };
}

// 读取当前 draft 引用：{artifactId, version, hash}；draft 不存在或 frontmatter 不全 → null
function readDraftRef(taskPath, stage) {
  const dp = draftPath(taskPath, stage);
  if (!fs.existsSync(dp)) return null;
  const fm = parseDraftFrontmatter(dp);
  if (!fm) return null;
  return { artifactId: fm.artifactId, version: fm.version, hash: sha256File(dp) };
}

module.exports = {
  STAGE_SLUG, stageDir, progressPath, draftPath, artifactPath, gatePath,
  sha256File, parseDraftFrontmatter, readDraftRef,
};
