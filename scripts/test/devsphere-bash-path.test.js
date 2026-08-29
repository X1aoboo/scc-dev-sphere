'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const setupScript = path.join(root, 'scripts', 'setup-devsphere-bash-path.sh');
const skipWithoutBash = process.platform === 'win32';

function runBash(args, options = {}) {
  return spawnSync('bash', args, {
    encoding: 'utf8',
    env: options.env || process.env,
  });
}

test('sourcing the setup script prepends bin exactly once', { skip: skipWithoutBash }, () => {
  const result = runBash([
    '-c',
    'source "$1"; source "$1"; command -v devsphere; printf "%s" "$PATH"',
    'bash',
    setupScript,
  ], { env: { ...process.env, PATH: '/usr/bin:/bin' } });
  assert.strictEqual(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.strictEqual(lines[0], path.join(root, 'bin', 'devsphere'));
  assert.strictEqual(lines[1].split(':').filter(entry => entry === path.join(root, 'bin')).length, 1);
});

test('a bare devsphere hook command runs after PATH setup', { skip: skipWithoutBash }, () => {
  const input = JSON.stringify({ tool_input: { file_path: '/project/evidence/knowledge/EV-001.json' } });
  const result = runBash([
    '-c',
    'source "$1"; printf "%s" "$2" | devsphere guard evidence-write',
    'bash',
    setupScript,
    input,
  ]);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('registered PreToolUse commands execute from a plugin path containing spaces', { skip: skipWithoutBash }, t => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devsphere hook path '));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const pluginLink = path.join(fixtureRoot, 'plugin root');
  fs.symlinkSync(root, pluginLink, 'dir');
  const hooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const command = hooks.PreToolUse[0].hooks[0].command
    .replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginLink);
  const input = JSON.stringify({ tool_input: { file_path: '/project/evidence/knowledge/EV-001.json' } });
  const result = spawnSync(command, { encoding: 'utf8', shell: true, input });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('env-file mode supports a plugin path containing spaces and is idempotent when loaded', { skip: skipWithoutBash }, t => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devsphere plugin path '));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const scriptsDir = path.join(fixtureRoot, 'scripts');
  const binDir = path.join(fixtureRoot, 'bin');
  fs.mkdirSync(scriptsDir);
  fs.mkdirSync(binDir);
  const fixtureScript = path.join(scriptsDir, 'setup-devsphere-bash-path.sh');
  const fixtureBin = path.join(binDir, 'devsphere');
  fs.copyFileSync(setupScript, fixtureScript);
  fs.copyFileSync(path.join(root, 'bin', 'devsphere'), fixtureBin);
  fs.chmodSync(fixtureScript, 0o755);
  fs.chmodSync(fixtureBin, 0o755);
  const envFile = path.join(fixtureRoot, 'session.env');

  let result = runBash([fixtureScript, '--env-file', envFile]);
  assert.strictEqual(result.status, 0, result.stderr);
  result = runBash([
    '-c',
    'source "$1"; source "$1"; command -v devsphere; printf "%s" "$PATH"',
    'bash',
    envFile,
  ], { env: { ...process.env, PATH: '/usr/bin:/bin' } });
  assert.strictEqual(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  const realBinDir = fs.realpathSync(binDir);
  assert.strictEqual(lines[0], path.join(realBinDir, 'devsphere'));
  assert.strictEqual(lines[1].split(':').filter(entry => entry === realBinDir).length, 1);
});

test('direct execution without an env file fails with actionable guidance', { skip: skipWithoutBash }, () => {
  const result = runBash([setupScript]);
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /cannot modify its parent process/);
  assert.match(result.stderr, /source/);
  assert.match(result.stderr, /--env-file/);
});
