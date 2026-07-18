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

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

const WORK_TEMPLATES = {
  'analysis.md': 'design-work/analysis.md',
  'discovery.md': 'design-work/discovery.md',
  'design.md': 'design-work/design.md',
};

function defaultDraftFrontmatter(taskPath, stage) {
  const state = readState(taskPath) || {};
  const taskId = state.taskId || 'UNKNOWN';
  const idPrefix = { 'business-design': 'BD', 'solution-design': 'SD', 'implementation-design': 'ID', 'test-design': 'TD' }[STAGE_SLUG[stage]] || 'X';
  return `---\nartifactId: "${idPrefix}-${taskId}"\nversion: "0.1.0"\n---\n\n# 待填充 Draft\n`;
}

function initStage(taskPath, stage) {
  if (!STAGE_SLUG[stage]) throw new Error(`Unknown stage: ${stage}`);
  const dir = stageDir(taskPath, stage);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, rel] of Object.entries(WORK_TEMPLATES)) {
    const dest = path.join(dir, name);
    if (!fs.existsSync(dest)) {
      const tpl = path.join(TEMPLATES_DIR, rel);
      const body = fs.existsSync(tpl) ? fs.readFileSync(tpl, 'utf-8') : `# ${name}\n`;
      fs.writeFileSync(dest, body.replace(/\{\{STAGE\}\}/g, STAGE_SLUG[stage]), 'utf-8');
    }
  }
  const dp = path.join(dir, 'draft.md');
  if (!fs.existsSync(dp)) fs.writeFileSync(dp, defaultDraftFrontmatter(taskPath, stage), 'utf-8');
  const pp = progressPath(taskPath, stage);
  if (!fs.existsSync(pp)) {
    writeJSON(pp, { step: 'analyze', ready: { analysis: false, discovery: false } });
  }
  return { dir, progress: pp };
}

function markReady(taskPath, stage, which) {
  if (which !== 'analysis' && which !== 'discovery') {
    throw new Error(`which must be analysis|discovery, got: ${which}`);
  }
  const pp = progressPath(taskPath, stage);
  const prog = readJSON(pp) || { step: 'analyze', ready: { analysis: false, discovery: false } };
  prog.ready = prog.ready || { analysis: false, discovery: false };
  prog.ready[which] = true;
  if (which === 'analysis' && prog.step === 'analyze') prog.step = 'discover';
  writeJSON(pp, prog);
  return prog;
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  try {
    switch (command) {
      case 'init-stage': {
        const [taskPath, stage] = args;
        process.stdout.write(JSON.stringify(initStage(taskPath, stage)));
        break;
      }
      case 'mark-ready': {
        const [taskPath, stage, which] = args;
        process.stdout.write(JSON.stringify(markReady(taskPath, stage, which)));
        break;
      }
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        process.exit(1);
    }
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  STAGE_SLUG, stageDir, progressPath, draftPath, artifactPath, gatePath,
  sha256File, parseDraftFrontmatter, readDraftRef, initStage, markReady,
};
