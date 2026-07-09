const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const nodeCmd = process.execPath;
const npmCli = process.env.npm_execpath || path.join(rootDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
const electronBuilderCli = path.join(rootDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');

const pkg = require(path.join(rootDir, 'package.json'));
const env = { ...process.env };

function runOrThrow(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: options.cwd || rootDir,
    env: { ...env, ...options.env },
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function cleanDist() {
  const distDir = path.join(rootDir, 'dist');
  fs.rmSync(distDir, { recursive: true, force: true });
}

function runElectronBuilder(args) {
  if (!fs.existsSync(electronBuilderCli)) {
    throw new Error('electron-builder CLI not found. Ensure dependencies are installed.');
  }
  runOrThrow(nodeCmd, [electronBuilderCli, ...args]);
}

// The desktop app's actual source lives in breeding-app-breeder/ (root's own
// src/ was removed in the "consolidate to single source of truth" cleanup).
// electron-builder and electron/main.js still expect a root-level build/
// directory, so build breeding-app-breeder and copy its output there.
function buildBreederAppForElectron() {
  const breederDir = path.join(rootDir, 'breeding-app-breeder');
  const breederBuildDir = path.join(breederDir, 'build');
  const rootBuildDir = path.join(rootDir, 'build');

  runOrThrow(nodeCmd, [npmCli, 'run', 'build'], {
    env: { ...env, ELECTRON_BUILD: 'true' },
    cwd: breederDir,
  });

  fs.rmSync(rootBuildDir, { recursive: true, force: true });
  fs.cpSync(breederBuildDir, rootBuildDir, { recursive: true });
}

console.log(`Building Windows NSIS installer for version=${pkg.version}`);
cleanDist();
buildBreederAppForElectron();
runElectronBuilder(['--win', 'nsis', '--x64']);
