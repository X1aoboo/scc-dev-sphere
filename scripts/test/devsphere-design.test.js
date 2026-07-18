'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeTask } = require('./helpers');

test('createFeatureTask 创建 work/ 目录', () => {
  const { taskPath } = makeTask();
  assert.ok(fs.existsSync(path.join(taskPath, 'work')));
});
