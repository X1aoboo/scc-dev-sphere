#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'dispatch', 'teammate-dispatch.md');
const VALID_KINDS = ['design', 'review'];

function slugify(stage) {
  return String(stage).replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
}

// 渲染 {{#block}}...{{/block}} / {{^block}}...{{/block}} 条件段。
// keep: true → 保留 # 段、删除 ^ 段;false → 删除 # 段、保留 ^ 段。
function renderConditional(tpl, name, keep) {
  const re = new RegExp(`\\{\\{#${name}\\}\\}([\\s\\S]*?)\\{\\{/${name}\\}\\}`, 'g');
  const reNot = new RegExp(`\\{\\{\\^${name}\\}\\}([\\s\\S]*?)\\{\\{/${name}\\}\\}`, 'g');
  return tpl
    .replace(re, keep ? '$1' : '')
    .replace(reNot, keep ? '' : '$1');
}

function renderDispatch(input) {
  const { kind, role, stage, taskPath, skill } = input;
  if (!VALID_KINDS.includes(kind)) throw new Error(`Invalid kind: ${kind} (expected design|review)`);
  const humanGated = input.humanGated === true || input.humanGated === 'true';
  const mode = input.mode || '';
  const artifactPath = input.artifactPath || '';
  const slug = slugify(stage);

  let tpl = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  // kind 条件
  tpl = renderConditional(tpl, 'design', kind === 'design');
  tpl = renderConditional(tpl, 'review', kind === 'review');
  // gated 条件(仅 design 段内出现;review 段无)
  tpl = renderConditional(tpl, 'gated', humanGated);

  // 占位符替换
  const vars = { role, stage, taskPath, skill, humanGated: String(humanGated), mode, artifactPath, slug };
  tpl = tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return tpl.trim() + '\n';
}

function main() {
  const [, , cmd, ...args] = process.argv;
  if (cmd !== 'build') { process.stderr.write(`Unknown command: ${cmd}\n`); process.exit(1); }
  const [kind, role, stage, taskPath, skill, ...rest] = args;
  if (!kind || !role || !stage || !taskPath || !skill) {
    process.stderr.write('Usage: build <kind> <role> <stage> <taskPath> <skill> [humanGated mode | artifactPath]\n');
    process.exit(1);
  }
  // kind-sensitive positional parsing:
  //   review: <skill> <artifactPath>           → rest[0] = artifactPath
  //   design: <skill> <humanGated> <mode>      → rest[0..1] = humanGated, mode
  let humanGated, mode, artifactPath;
  if (kind === 'review') {
    artifactPath = rest[0];
  } else {
    [humanGated, mode] = rest;
  }
  try {
    process.stdout.write(renderDispatch({ kind, role, stage, taskPath, skill, humanGated, mode, artifactPath }));
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { renderDispatch, slugify, renderConditional, VALID_KINDS };
