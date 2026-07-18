#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJSON, writeJSON, readState, writeState } = require('./devsphere-state');
const { listGatedPending, readDecisions } = require('./devsphere-decisions');
const {
  readMatrix, writeMatrix, getRevisionItems, applyReviewResults, getPendingHumanDecisions,
  ensureIssuesList, nextIssueId, recomputeCounts,
} = require('./devsphere-review-matrix');

const STAGE_SLUG = {
  businessDesign: 'business-design',
  solutionDesign: 'solution-design',
  implementationDesign: 'implementation-design',
  testDesign: 'test-design',
  integratedDesign: 'integrated-design',
};

const DESIGN_STAGE_ORDER = ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign', 'integratedDesign'];

function currentStage(taskPath) {
  const state = readState(taskPath);
  if (!state || !state.stages) return { stage: null, complete: false };
  for (const stage of DESIGN_STAGE_ORDER) {
    const sd = state.stages[stage];
    if (!sd || !sd.baseline) return { stage, complete: false };
  }
  return { stage: null, complete: true };
}

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
  const idPrefix = { 'business-design': 'BD', 'solution-design': 'SD', 'implementation-design': 'ID', 'test-design': 'TD', 'integrated-design': 'INT' }[STAGE_SLUG[stage]] || 'X';
  // 占位骨架：不带 frontmatter，避免 readDraftRef 误判为有效 draft。
  // design activity 会用真实 artifactId/version 覆盖此文件。
  return `<!-- placeholder draft; artifactId: ${idPrefix}-${taskId}; run design activity to produce a real draft -->\n\n# 待填充 Draft\n`;
}

function initStage(taskPath, stage) {
  if (!STAGE_SLUG[stage]) throw new Error(`Unknown stage: ${stage}`);
  const dir = stageDir(taskPath, stage);
  fs.mkdirSync(dir, { recursive: true });

  if (stage === 'integratedDesign') {
    const dp = path.join(dir, 'draft.md');
    if (!fs.existsSync(dp)) fs.writeFileSync(dp, defaultDraftFrontmatter(taskPath, stage), 'utf-8');
    return { dir };
  }

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

const VALID_GATE_STATUS = ['pass', 'warn', 'fail'];

function readGate(taskPath, stage) {
  return readJSON(gatePath(taskPath, stage));
}

function recordGate(taskPath, stage, status, checks) {
  if (!VALID_GATE_STATUS.includes(status)) {
    throw new Error(`gate status must be pass|warn|fail, got: ${status}`);
  }
  const draftRef = readDraftRef(taskPath, stage);
  if (!draftRef) throw new Error(`No valid draft for stage ${stage}`);
  const result = {
    draftRef,
    templateChecks: (checks && checks.templateChecks) || [],
    qualityChecks: (checks && checks.qualityChecks) || [],
    status,
    recordedAt: new Date().toISOString(),
  };
  writeJSON(gatePath(taskPath, stage), result);
  return result;
}

// gate 通过判定：存在、绑定当前 draft hash、status 为 pass|warn。
function gateAcceptable(gate, draftRef) {
  if (!gate || !gate.draftRef) return false;
  return gate.draftRef.hash === draftRef.hash && (gate.status === 'pass' || gate.status === 'warn');
}

// review 状态判定：返回 {complete, hasOpenRevision}。
function reviewAcceptable(matrix, slug, draftRef) {
  if (!matrix || !matrix.artifacts || !matrix.artifacts[slug]) return { complete: false, hasOpenRevision: false };
  const entry = matrix.artifacts[slug];
  const reviewedAtHash = entry.draftRef && entry.draftRef.hash;
  const revisionItems = getRevisionItems(matrix, slug);
  return {
    complete: reviewedAtHash === draftRef.hash && entry.status === 'reviewed' && revisionItems.length === 0,
    hasOpenRevision: reviewedAtHash === draftRef.hash && revisionItems.length > 0,
  };
}

// 确定性 Router：读取 stage work 状态，返回 milestone + nextAction。
// 优先级：blocked > ask_decision > gate-fail revise > gate-missing > review-revision revise > review-missing > baseline > stage_complete。
function inspect(taskPath, stage) {
  const slug = STAGE_SLUG[stage];
  if (!slug) return { stage, nextAction: { kind: 'blocked', reason: `Unknown stage: ${stage}` } };

  if (stage === 'integratedDesign') {
    const draftRef = readDraftRef(taskPath, stage);
    if (!draftRef) return { stage, milestone: 'not_started', nextAction: { kind: 'run_stage', activity: 'assemble' } };
    const gate = readGate(taskPath, stage);
    if (gate && gate.draftRef && gate.draftRef.hash === draftRef.hash && gate.status === 'fail') {
      return { stage, milestone: 'drafted', draftRef, gate, nextAction: { kind: 'run_stage', activity: 'revise', reason: 'gate fail' } };
    }
    if (!gateAcceptable(gate, draftRef)) {
      return { stage, milestone: 'drafted', draftRef, nextAction: { kind: 'run_gate' } };
    }
    const matrix = readMatrix(taskPath);
    const rev = reviewAcceptable(matrix, slug, draftRef);
    if (rev.hasOpenRevision) {
      return { stage, milestone: 'validated', draftRef, gate, nextAction: { kind: 'run_stage', activity: 'revise', reason: 'open review items' } };
    }
    if (!rev.complete) {
      return { stage, milestone: 'validated', draftRef, gate, nextAction: { kind: 'run_review' } };
    }
    // Pending advisory/risk decisions gate baseline — spec requires a human decision
    // before baseline. `getPendingHumanDecisions` is filtered to this artifact's slug,
    // so pending items raised against other artifacts don't block this baseline.
    const pendingHuman = getPendingHumanDecisions(matrix, slug);
    if (pendingHuman.length > 0) {
      return { stage, milestone: 'reviewed', draftRef, gate, nextAction: { kind: 'ask_review', stage, slug, issues: pendingHuman } };
    }
    const state = readState(taskPath) || {};
    const baseline = state.stages && state.stages[stage] && state.stages[stage].baseline;
    if (!baseline || baseline.hash !== draftRef.hash) {
      return { stage, milestone: 'reviewed', draftRef, gate, nextAction: { kind: 'baseline' } };
    }
    return { stage, milestone: 'baselined', draftRef, gate, baseline, nextAction: { kind: 'complete' } };
  }

  const pp = progressPath(taskPath, stage);
  const prog = fs.existsSync(pp) ? readJSON(pp) : null;

  // 无 work → analyze
  if (!prog) return { stage, milestone: 'not_started', nextAction: { kind: 'run_stage', activity: 'analyze' } };

  if (!prog.ready || !prog.ready.analysis) {
    return { stage, milestone: 'analysis_ready', nextAction: { kind: 'run_stage', activity: 'analyze' } };
  }
  if (!prog.ready.discovery) {
    return { stage, milestone: 'discovery_ready', nextAction: { kind: 'run_stage', activity: 'discover' } };
  }

  // discovery ready：先看 pending gated decision
  const pendingGated = listGatedPending(taskPath, slug);
  if (pendingGated.length > 0) {
    return { stage, milestone: 'discovery_ready', pendingGated, nextAction: { kind: 'ask_decision', decisions: pendingGated } };
  }

  const draftRef = readDraftRef(taskPath, stage);
  if (!draftRef) {
    return { stage, milestone: 'discovery_ready', nextAction: { kind: 'run_stage', activity: 'design' } };
  }

  const gate = readGate(taskPath, stage);
  // gate fail（且绑定当前 hash）→ revise
  if (gate && gate.draftRef && gate.draftRef.hash === draftRef.hash && gate.status === 'fail') {
    return { stage, milestone: 'drafted', draftRef, gate, nextAction: { kind: 'run_stage', activity: 'revise', reason: 'gate fail' } };
  }
  if (!gateAcceptable(gate, draftRef)) {
    return { stage, milestone: 'drafted', draftRef, nextAction: { kind: 'run_gate' } };
  }

  const matrix = readMatrix(taskPath);
  const rev = reviewAcceptable(matrix, slug, draftRef);
  if (rev.hasOpenRevision) {
    return { stage, milestone: 'validated', draftRef, gate, nextAction: { kind: 'run_stage', activity: 'revise', reason: 'open review items' } };
  }
  if (!rev.complete) {
    return { stage, milestone: 'validated', draftRef, gate, nextAction: { kind: 'run_review' } };
  }

  // Pending advisory/risk decisions gate baseline — spec requires a human decision
  // before baseline. Same logic as the integratedDesign branch above.
  const pendingHuman = getPendingHumanDecisions(matrix, slug);
  if (pendingHuman.length > 0) {
    return { stage, milestone: 'reviewed', draftRef, gate, nextAction: { kind: 'ask_review', stage, slug, issues: pendingHuman } };
  }

  // review 通过且无 open revision → baseline
  const state = readState(taskPath) || {};
  const baseline = state.stages && state.stages[stage] && state.stages[stage].baseline;
  if (!baseline || baseline.hash !== draftRef.hash) {
    return { stage, milestone: 'reviewed', draftRef, gate, nextAction: { kind: 'baseline' } };
  }
  return { stage, milestone: 'baselined', draftRef, gate, baseline, nextAction: { kind: 'stage_complete' } };
}

function requirementHash(taskPath) {
  const reqPath = path.join(taskPath, 'inputs', 'requirement.md');
  if (!fs.existsSync(reqPath)) return null;
  return sha256File(reqPath);
}

function publish(taskPath, stage) {
  const slug = STAGE_SLUG[stage];
  if (!slug) throw new Error(`Unknown stage: ${stage}`);
  const draftRef = readDraftRef(taskPath, stage);
  if (!draftRef) throw new Error(`No valid draft for stage ${stage}`);

  const gate = readGate(taskPath, stage);
  if (!gateAcceptable(gate, draftRef)) {
    throw new Error(`gate 不通过或 hash 不匹配当前 draft（stage=${stage}）`);
  }

  const matrix = readMatrix(taskPath);
  const rev = reviewAcceptable(matrix, slug, draftRef);
  if (!rev.complete || rev.hasOpenRevision) {
    throw new Error(`review 未完成或存在 open revision（stage=${stage}）`);
  }

  const dp = draftPath(taskPath, stage);
  const ap = artifactPath(taskPath, stage);
  fs.mkdirSync(path.dirname(ap), { recursive: true });
  fs.copyFileSync(dp, ap);
  if (sha256File(ap) !== draftRef.hash) {
    throw new Error('artifact hash 与 draft hash 不一致（复制异常）');
  }

  const state = readState(taskPath);
  if (!state) throw new Error('state.json 不存在');
  state.stages = state.stages || {};
  state.stages[stage] = state.stages[stage] || {};
  const baseline = {
    version: draftRef.version,
    hash: draftRef.hash,
    inputVersions: {},
    approvedAt: new Date().toISOString(),
  };
  const reqHash = requirementHash(taskPath);
  if (reqHash) baseline.inputVersions.requirement = reqHash;
  state.stages[stage].baseline = baseline;
  state.stages[stage].artifact = `artifacts/${slug}.md`;
  writeState(taskPath, state);

  return { artifactPath: ap, hash: draftRef.hash, baseline };
}

function recordReview(taskPath, stage, snapshots) {
  const slug = STAGE_SLUG[stage];
  if (!slug) throw new Error(`Unknown stage: ${stage}`);
  const draftRef = readDraftRef(taskPath, stage);
  if (!draftRef) throw new Error(`No valid draft for stage ${stage}`);
  const result = applyReviewResults(taskPath, slug, draftRef.version, snapshots);
  const matrix = readMatrix(taskPath);
  if (!matrix || !matrix.artifacts || !matrix.artifacts[slug]) {
    throw new Error(`Matrix entry missing for ${slug}`);
  }
  matrix.artifacts[slug].draftRef = draftRef;
  matrix.artifacts[slug].status = 'reviewed';
  matrix.artifacts[slug].reviewedVersion = draftRef.version;
  writeMatrix(taskPath, matrix);
  return result;
}

const REOPEN_SCOPE = {
  businessDesign: ['businessDesign', 'solutionDesign', 'implementationDesign', 'testDesign'],
  solutionDesign: ['solutionDesign', 'implementationDesign', 'testDesign'],
  implementationDesign: ['implementationDesign', 'testDesign'],
  testDesign: ['testDesign'],
};

// bump draft frontmatter version minor+1, patch=0; write back; return new version string.
function bumpVersionMinor(draftFilePath) {
  let raw = fs.readFileSync(draftFilePath, 'utf-8');
  const m = raw.match(/^version:\s*"?(\d+)\.(\d+)\.(\d+)"?/m);
  if (!m) throw new Error(`无法从 ${draftFilePath} 读取 version`);
  const major = parseInt(m[1], 10);
  const minor = parseInt(m[2], 10) + 1;
  const newVer = `${major}.${minor}.0`;
  raw = raw.replace(/^version:\s*"?[0-9.]+"?/m, `version: "${newVer}"`);
  fs.writeFileSync(draftFilePath, raw, 'utf-8');
  return newVer;
}

// design_change 重开：bump 版本、清 baseline、重置 progress，并在目标 stage 的 matrix entry
// 写入一条 design-change blocking（绑定新 draft hash）。仅目标 stage 写 blocking；
// 其余 scope stage 仅版本/状态重置，由各自后续 review 流程处理。
function reopen(taskPath, stage, decisionId) {
  const slug = STAGE_SLUG[stage];
  if (!slug) throw new Error(`Unknown stage: ${stage}`);
  const scope = REOPEN_SCOPE[stage];
  if (!scope) throw new Error(`Stage not reopenable: ${stage}`);

  // 校验 design_change decision 已批准
  const decisionsFile = readDecisions(taskPath, slug);
  if (!decisionsFile) throw new Error(`decisions 文件未初始化: ${slug}`);
  const decision = (decisionsFile.decisions || []).find(d => d.id === decisionId);
  if (!decision) throw new Error(`decision 未找到: ${decisionId}`);
  if (decision.type !== 'design_change') throw new Error(`decision 非 design_change: ${decisionId}`);
  if (decision.status !== 'decided' || !(decision.resolution && decision.resolution.chosen === 'apply')) {
    throw new Error(`design_change 未批准(需 status=decided, resolution.chosen=apply): ${decisionId}`);
  }

  const newVersions = {};
  for (const s of scope) {
    const dp = draftPath(taskPath, s);
    if (!fs.existsSync(dp)) throw new Error(`draft 不存在: ${s}`);
    newVersions[s] = bumpVersionMinor(dp);
    // 清 baseline
    const state = readState(taskPath);
    if (state.stages && state.stages[s]) delete state.stages[s].baseline;
    writeState(taskPath, state);
    // 重置 progress（integratedDesign 无 progress，跳过）
    if (s !== 'integratedDesign') {
      writeJSON(progressPath(taskPath, s), { step: 'analyze', ready: { analysis: false, discovery: false } });
    }
  }

  // 目标阶段写 design-change blocking
  const matrix = readMatrix(taskPath);
  if (!matrix || !matrix.artifacts || !matrix.artifacts[slug]) {
    throw new Error(`matrix entry 缺失: ${slug}`);
  }
  const entry = matrix.artifacts[slug];
  const draftRef = readDraftRef(taskPath, stage);
  entry.draftRef = draftRef;
  entry.status = 'pending';
  const list = ensureIssuesList(entry);
  const maxRound = list.reduce((mx, i) => Math.max(mx, i.round || 1), 0);
  list.push({
    id: nextIssueId(entry, 'blocking'),
    type: 'blocking',
    reviewerAgent: 'design-change',
    status: 'open',
    round: maxRound + 1,
    humanDecision: 'pending',
    closureEvidence: '',
    source: `${slug}@${newVersions[stage]}:design-change:${decisionId}`,
    note: decision.summary,
  });
  recomputeCounts(entry);
  writeMatrix(taskPath, matrix);

  return { reopenedStages: scope, newVersions };
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
      case 'record-gate': {
        const [taskPath, stage, status, checksJson] = args;
        let checks;
        try { checks = JSON.parse(checksJson); } catch (e) { throw new Error(`Invalid checks JSON: ${e.message}`); }
        process.stdout.write(JSON.stringify(recordGate(taskPath, stage, status, checks)));
        break;
      }
      case 'inspect': {
        const [taskPath, stage] = args;
        process.stdout.write(JSON.stringify(inspect(taskPath, stage), null, 2));
        break;
      }
      case 'publish': {
        const [taskPath, stage] = args;
        process.stdout.write(JSON.stringify(publish(taskPath, stage)));
        break;
      }
      case 'current-stage': {
        const [taskPath] = args;
        process.stdout.write(JSON.stringify(currentStage(taskPath)));
        break;
      }
      case 'record-review': {
        const [taskPath, stage, snapshotsJson] = args;
        let snapshots;
        try { snapshots = JSON.parse(snapshotsJson); } catch (e) { throw new Error(`Invalid snapshots JSON: ${e.message}`); }
        process.stdout.write(JSON.stringify(recordReview(taskPath, stage, snapshots)));
        break;
      }
      case 'reopen': {
        const [taskPath, stage, decisionId] = args;
        process.stdout.write(JSON.stringify(reopen(taskPath, stage, decisionId)));
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
  STAGE_SLUG, DESIGN_STAGE_ORDER, stageDir, progressPath, draftPath, artifactPath, gatePath,
  sha256File, parseDraftFrontmatter, readDraftRef, initStage, markReady,
  VALID_GATE_STATUS, readGate, recordGate,
  gateAcceptable, reviewAcceptable, inspect,
  requirementHash, publish, currentStage,
  recordReview,
  REOPEN_SCOPE, bumpVersionMinor, reopen,
};
