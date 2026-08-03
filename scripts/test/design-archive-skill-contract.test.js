'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  readConfig,
  setConfig,
  configPath,
  DEFAULT_ARCHIVE_ROOT,
} = require('../devsphere-config');
const { HELP, main } = require('../devsphere-cli');

function capture(argv) {
  let stdout = '';
  let stderr = '';
  const exitCode = main(argv, {
    cwd: path.join(__dirname, '..', '..'),
    env: {},
    stdin: undefined,
    stdout: { write: value => { stdout += value; } },
    stderr: { write: value => { stderr += value; } },
  });
  return { exitCode, stdout, stderr };
}

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ds-archive-'));
}

test('config read creates default config.json when missing', () => {
  const root = makeWorkspace();
  const config = readConfig(root);
  assert.deepStrictEqual(config, { archive: { root: DEFAULT_ARCHIVE_ROOT } });
  const written = JSON.parse(fs.readFileSync(configPath(root), 'utf8'));
  assert.deepStrictEqual(written, { archive: { root: DEFAULT_ARCHIVE_ROOT } });
});

test('config read fills missing archive.root and persists, keeping other keys', () => {
  const root = makeWorkspace();
  fs.mkdirSync(path.join(root, '.devsphere', 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.devsphere', 'config', 'config.json'),
    JSON.stringify({ other: 1 }),
    'utf8',
  );
  const config = readConfig(root);
  assert.strictEqual(config.other, 1);
  assert.strictEqual(config.archive.root, DEFAULT_ARCHIVE_ROOT);
  const written = JSON.parse(fs.readFileSync(configPath(root), 'utf8'));
  assert.strictEqual(written.archive.root, DEFAULT_ARCHIVE_ROOT);
  assert.strictEqual(written.other, 1);
});

test('config read keeps existing archive.root unchanged', () => {
  const root = makeWorkspace();
  fs.mkdirSync(path.join(root, '.devsphere', 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.devsphere', 'config', 'config.json'),
    JSON.stringify({ archive: { root: '/team/archive' } }),
    'utf8',
  );
  assert.strictEqual(readConfig(root).archive.root, '/team/archive');
});

test('config set writes nested key and persists', () => {
  const root = makeWorkspace();
  const config = setConfig(root, 'archive.root', '/data/archive');
  assert.strictEqual(config.archive.root, '/data/archive');
  const written = JSON.parse(fs.readFileSync(configPath(root), 'utf8'));
  assert.strictEqual(written.archive.root, '/data/archive');
});

test('config CLI read and set work end to end', () => {
  const root = makeWorkspace();
  const read = capture(['config', 'read', '--workspace-root', root]);
  assert.strictEqual(read.exitCode, 0, read.stderr);
  assert.strictEqual(JSON.parse(read.stdout).archive.root, DEFAULT_ARCHIVE_ROOT);
  const set = capture(['config', 'set', '--workspace-root', root, '--key', 'archive.root', '--value', '/x/archive']);
  assert.strictEqual(set.exitCode, 0, set.stderr);
  assert.strictEqual(JSON.parse(set.stdout).archive.root, '/x/archive');
});

test('HELP exposes config domain', () => {
  assert.match(HELP, /config\s+read \| set/);
});
