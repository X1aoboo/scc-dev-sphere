#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const state = require('./devsphere-state');
const workspace = require('./devsphere-workspace');
const workflow = require('./devsphere-workflow');
const featureWorkflow = require('./workflows/feature-workflow');
const design = require('./devsphere-design');
const approval = require('./devsphere-approval');
const knowledge = require('./knowledge-query');
const guard = require('./devsphere-guard');
const config = require('./devsphere-config');

const HELP = `Usage: devsphere <domain> <action> [options]

Domains:
  workspace  create-feature-task
  workflow   resolve-next-action | set-task-status | sync-design-status |
             validate-design-entry | complete-external-test-design
  design     inspect-workspace | init-design | inspect-design | lint | validate-review |
             review-context | record-review | refresh-format-review | approve-current-design |
             publish | reopen | design-ready
  approval   validate-design-ready | approve-design
  config     read | set
  knowledge  read-config | show-config | update-config | upsert-source |
             remove-source | reset-config | register-evidence-record | read-evidence
  state      read-state | read-current-task | get-task-path
  guard      evidence-write | evidence-shell | knowledge-config-write |
             knowledge-config-shell | internal-resource-access |
             design-managed-write | design-managed-shell | design-reviewer-stop

Common options:
  --workspace-root <path>  Project root (fallback: DEVSPHERE_PROJECT_ROOT, cwd)
  --task-path <path>       Feature task workspace
  --design-type <type>     Design type
  --input-file <path|->    JSON object file, or - for stdin
  --help                   Show help
`;

function parseOptions(tokens) {
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected positional argument: ${token}`);
    const name = token.slice(2);
    if (!name) throw new Error('Invalid empty option');
    if (Object.prototype.hasOwnProperty.call(options, name)) throw new Error(`Duplicate option: --${name}`);
    if (name === 'help') {
      options.help = true;
      continue;
    }
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
    options[name] = value;
    index += 1;
  }
  return options;
}

function requireAllowedOptions(options, allowed) {
  const allowedSet = new Set([...allowed, 'workspace-root', 'help']);
  const unknown = Object.keys(options).filter(name => !allowedSet.has(name));
  if (unknown.length) throw new Error(`Unknown option: --${unknown[0]}`);
}

function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== 'string' || !value) throw new Error(`Missing required option: --${name}`);
  return value;
}

function resolveWorkspaceRoot(options, io) {
  const raw = options['workspace-root'] || io.env.DEVSPHERE_PROJECT_ROOT || io.cwd;
  const resolved = path.resolve(raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Workspace root is not a directory: ${resolved}`);
  }
  return resolved;
}

function resolvePathOption(options, name, io) {
  const raw = requireOption(options, name);
  return path.resolve(resolveWorkspaceRoot(options, io), raw);
}

function readStructuredInput(options, io) {
  const inputFile = requireOption(options, 'input-file');
  let raw;
  if (inputFile === '-') raw = io.stdin === undefined ? fs.readFileSync(0, 'utf8') : io.stdin;
  else raw = fs.readFileSync(path.resolve(io.cwd, inputFile), 'utf8');
  if (!raw.trim()) throw new Error('Structured input is empty');
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid structured input JSON: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Structured input must be a JSON object');
  }
  return value;
}

function readHookInput(io) {
  const raw = io.stdin === undefined ? fs.readFileSync(0, 'utf8') : io.stdin;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch (error) {
    return null;
  }
}

function dispatchWorkspace(action, options, io) {
  if (action !== 'create-feature-task') throw new Error(`Unknown workspace action: ${action}`);
  requireAllowedOptions(options, ['task-id']);
  const taskPath = workspace.createFeatureTask(
    resolveWorkspaceRoot(options, io),
    requireOption(options, 'task-id'),
  );
  return { taskPath };
}

function dispatchWorkflow(action, options, io) {
  const workspaceRoot = resolveWorkspaceRoot(options, io);
  if (action === 'resolve-next-action') {
    requireAllowedOptions(options, []);
    return workflow.routeWorkflow(workspaceRoot);
  }
  if (action === 'set-task-status') {
    requireAllowedOptions(options, ['status']);
    return featureWorkflow.setTaskStatus(workspaceRoot, requireOption(options, 'status'));
  }
  if (action === 'sync-design-status') {
    requireAllowedOptions(options, []);
    const taskPath = state.getTaskPath(workspaceRoot);
    if (!taskPath) throw new Error('No active task');
    return design.syncDesignState(taskPath);
  }
  if (action === 'validate-design-entry') {
    requireAllowedOptions(options, ['design-type']);
    const taskPath = state.getTaskPath(workspaceRoot);
    if (!taskPath) throw new Error('No active task');
    return featureWorkflow.validateDesignEntry(taskPath, requireOption(options, 'design-type'));
  }
  if (action === 'complete-external-test-design') {
    requireAllowedOptions(options, []);
    return featureWorkflow.completeExternalTestDesign(workspaceRoot);
  }
  throw new Error(`Unknown workflow action: ${action}`);
}

function dispatchDesign(action, options, io) {
  const taskOnly = ['task-path'];
  const taskAndType = ['task-path', 'design-type'];
  if (action === 'design-ready') {
    requireAllowedOptions(options, taskOnly);
    return design.designReady(resolvePathOption(options, 'task-path', io));
  }
  if (action === 'inspect-workspace') {
    requireAllowedOptions(options, taskAndType);
    return design.inspectWorkspace(
      resolvePathOption(options, 'task-path', io),
      options['design-type'],
    );
  }
  requireAllowedOptions(options, [
    ...taskAndType,
    ...(['record-review', 'approve-current-design'].includes(action) ? ['input-file'] : []),
  ]);
  const taskPath = resolvePathOption(options, 'task-path', io);
  const designType = requireOption(options, 'design-type');
  switch (action) {
    case 'init-design': return design.initDesign(taskPath, designType);
    case 'inspect-design': return design.inspectDesign(taskPath, designType);
    case 'lint': return design.lintDraft(taskPath, designType);
    case 'validate-review': {
      const result = design.validateReview(taskPath, designType);
      return { value: result, exitCode: result.valid ? 0 : 1 };
    }
    case 'review-context': return design.reviewContext(taskPath, designType);
    case 'record-review': return design.recordReview(taskPath, designType, readStructuredInput(options, io));
    case 'refresh-format-review': return design.refreshFormattingReview(taskPath, designType);
    case 'approve-current-design': return design.approveCurrentDesign(taskPath, designType, readStructuredInput(options, io));
    case 'publish': return design.publish(taskPath, designType);
    case 'reopen': return design.reopenDesign(taskPath, designType);
    default: throw new Error(`Unknown design action: ${action}`);
  }
}

function dispatchApproval(action, options, io) {
  const withInput = action === 'approve-design' ? ['input-file'] : [];
  requireAllowedOptions(options, ['task-path', ...withInput]);
  const taskPath = resolvePathOption(options, 'task-path', io);
  if (action === 'validate-design-ready') {
    const result = approval.validateDesignReady(taskPath);
    return { value: result, exitCode: result.valid ? 0 : 1 };
  }
  if (action === 'approve-design') return approval.approveDesign(taskPath, readStructuredInput(options, io));
  throw new Error(`Unknown approval action: ${action}`);
}

function dispatchConfig(action, options, io) {
  const workspaceRoot = resolveWorkspaceRoot(options, io);
  if (action === 'read') {
    requireAllowedOptions(options, []);
    return config.readConfig(workspaceRoot);
  }
  if (action === 'set') {
    requireAllowedOptions(options, ['key', 'value']);
    return config.setConfig(
      workspaceRoot,
      requireOption(options, 'key'),
      requireOption(options, 'value'),
    );
  }
  throw new Error(`Unknown config action: ${action}`);
}

function dispatchKnowledge(action, options, io) {
  const workspaceRoot = resolveWorkspaceRoot(options, io);
  const actionOptions = {
    'read-config': [],
    'show-config': [],
    'update-config': ['key', 'value'],
    'upsert-source': ['type', 'target', 'description'],
    'remove-source': ['type', 'target'],
    'reset-config': [],
    'register-evidence-record': ['input-file'],
    'read-evidence': ['evidence-id'],
  };
  if (!Object.prototype.hasOwnProperty.call(actionOptions, action)) {
    throw new Error(`Unknown knowledge action: ${action}`);
  }
  requireAllowedOptions(options, actionOptions[action]);
  switch (action) {
    case 'read-config': return knowledge.readConfig(workspaceRoot);
    case 'show-config': return knowledge.showConfig(workspaceRoot);
    case 'update-config': return knowledge.updateConfig(workspaceRoot, requireOption(options, 'key'), requireOption(options, 'value'));
    case 'upsert-source': return knowledge.upsertSource(
      workspaceRoot,
      requireOption(options, 'type'),
      options.target,
      requireOption(options, 'description'),
    );
    case 'remove-source': return knowledge.removeSource(workspaceRoot, requireOption(options, 'type'), options.target);
    case 'reset-config': return knowledge.resetConfig(workspaceRoot);
    case 'register-evidence-record': return knowledge.registerEvidenceRecord(workspaceRoot, readStructuredInput(options, io));
    case 'read-evidence': return knowledge.readEvidence(workspaceRoot, requireOption(options, 'evidence-id'));
    default: throw new Error(`Unknown knowledge action: ${action}`);
  }
}

function dispatchState(action, options, io) {
  if (action === 'read-state') {
    requireAllowedOptions(options, ['task-path']);
    return state.readState(resolvePathOption(options, 'task-path', io));
  }
  const workspaceRoot = resolveWorkspaceRoot(options, io);
  requireAllowedOptions(options, []);
  if (action === 'read-current-task') return state.readCurrentTask(workspaceRoot);
  if (action === 'get-task-path') return { taskPath: state.getTaskPath(workspaceRoot) };
  throw new Error(`Unknown state action: ${action}`);
}

function dispatchGuard(action, options, io) {
  requireAllowedOptions(options, []);
  const input = readHookInput(io);
  switch (action) {
    case 'evidence-write': return guard.checkEvidenceWritesFromStdin(input);
    case 'evidence-shell': return guard.checkEvidenceBashFromStdin(input);
    case 'knowledge-config-write': return knowledge.guardWrite(input);
    case 'knowledge-config-shell': return knowledge.guardBash(input);
    case 'internal-resource-access': return guard.checkInternalResourceAccess(input);
    case 'design-managed-write': return guard.checkDesignManagedWrite(input);
    case 'design-managed-shell': return guard.checkDesignManagedShell(input);
    case 'design-reviewer-stop': return guard.checkDesignReviewerStop(input);
    default: throw new Error(`Unknown guard action: ${action}`);
  }
}

function dispatch(domain, action, options, io) {
  switch (domain) {
    case 'workspace': return dispatchWorkspace(action, options, io);
    case 'workflow': return dispatchWorkflow(action, options, io);
    case 'design': return dispatchDesign(action, options, io);
    case 'approval': return dispatchApproval(action, options, io);
    case 'config': return dispatchConfig(action, options, io);
    case 'knowledge': return dispatchKnowledge(action, options, io);
    case 'state': return dispatchState(action, options, io);
    case 'guard': return dispatchGuard(action, options, io);
    default: throw new Error(`Unknown domain: ${domain}`);
  }
}

function writeResult(stdout, value) {
  if (typeof value === 'string') stdout.write(value.endsWith('\n') ? value : `${value}\n`);
  else stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main(argv = process.argv.slice(2), overrides = {}) {
  const io = {
    stdin: overrides.stdin,
    stdout: overrides.stdout || process.stdout,
    stderr: overrides.stderr || process.stderr,
    env: overrides.env || process.env,
    cwd: overrides.cwd || process.cwd(),
  };
  try {
    if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
      io.stdout.write(HELP);
      return 0;
    }
    const [domain, action, ...tokens] = argv;
    if (!action) throw new Error(`Missing action for domain: ${domain}`);
    const options = parseOptions(tokens);
    if (options.help) {
      io.stdout.write(HELP);
      return 0;
    }
    const dispatched = dispatch(domain, action, options, io);
    const wrapped = dispatched && Object.prototype.hasOwnProperty.call(dispatched, 'exitCode')
      && Object.prototype.hasOwnProperty.call(dispatched, 'value');
    const value = wrapped ? dispatched.value : dispatched;
    if (value !== null && value !== undefined) writeResult(io.stdout, value);
    return wrapped ? dispatched.exitCode : 0;
  } catch (error) {
    io.stderr.write(`Error: ${error.message}\n`);
    return argv[0] === 'guard' ? 2 : 1;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = {
  HELP,
  dispatch,
  main,
  parseOptions,
  readHookInput,
  readStructuredInput,
  resolveWorkspaceRoot,
};
