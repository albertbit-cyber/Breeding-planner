#!/usr/bin/env node
/**
 * Launches Electron after stripping ELECTRON_RUN_AS_NODE so the app can boot.
 */
const { spawn } = require('child_process');
const path = require('path');

const electronBin = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron',
);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

if (!env.ELECTRON_START_URL) {
  env.ELECTRON_START_URL = 'http://localhost:5173';
}
if (!env.NODE_ENV) {
  env.NODE_ENV = 'development';
}

let command = electronBin;
let args = ['.'];
const options = {
  stdio: 'inherit',
  env,
};

if (process.platform === 'win32') {
  options.shell = true;
  command = `"${electronBin}" .`;
  args = [];
}

const child = spawn(command, args, options);

child.on('close', (code, signal) => {
  if (code === null) {
    console.error('Electron exited with signal', signal);
    process.exit(1);
  }
  process.exit(code);
});
