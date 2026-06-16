#!/usr/bin/env node
/**
 * Launches Electron after stripping ELECTRON_RUN_AS_NODE so the app can boot.
 */
const { spawn } = require('child_process');
const electronBin = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

if (!env.ELECTRON_START_URL) {
  env.ELECTRON_START_URL = 'http://localhost:5173';
}
if (!env.NODE_ENV) {
  env.NODE_ENV = 'development';
}

const options = {
  stdio: 'inherit',
  env,
};

const child = spawn(electronBin, ['.'], options);

child.on('error', (error) => {
  console.error('Failed to start Electron', error);
  process.exit(1);
});

child.on('close', (code, signal) => {
  if (code === null) {
    console.error('Electron exited with signal', signal);
    process.exit(1);
  }
  process.exit(code);
});
