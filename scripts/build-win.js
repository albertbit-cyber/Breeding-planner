const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const nodeCmd = process.execPath;
const npmCli = process.env.npm_execpath || path.join(rootDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
const electronBuilderCli = path.join(rootDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');

const pkg = require(path.join(rootDir, 'package.json'));
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
const buildTag = timestamp;
const buildIncrement = Number(BigInt(timestamp) % 60000n);
const buildVersion = `${pkg.version}.${buildIncrement}`;

const env = { ...process.env, BUILD_TAG: buildTag };

function runOrThrow(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: rootDir,
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

function runNpmScript(scriptName) {
  runOrThrow(nodeCmd, [npmCli, 'run', scriptName]);
}

function runElectronBuilder(args) {
  if (!fs.existsSync(electronBuilderCli)) {
    throw new Error('electron-builder CLI not found. Ensure dependencies are installed.');
  }
  runOrThrow(nodeCmd, [electronBuilderCli, ...args]);
}

console.log(`Building Windows installer with buildVersion=${buildVersion} and tag=${buildTag}`);
cleanDist();
runNpmScript('build');
runElectronBuilder(['--win', 'nsis']);
