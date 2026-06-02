#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs/promises');
const pngToIcoModule = require('png-to-ico');
const pngToIco = typeof pngToIcoModule === 'function' ? pngToIcoModule : pngToIcoModule?.default;
if (typeof pngToIco !== 'function') {
  throw new Error('Unable to load png-to-ico converter');
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const iconDir = path.join(projectRoot, 'public', 'app-icons');
  const sources = [
    'icon_16x16.png',
    'icon_32x32.png',
    'icon_128x128.png',
    'icon_256x256.png',
  ].map((name) => path.join(iconDir, name));
  const destinationDir = path.join(projectRoot, 'buildResources');
  const destination = path.join(destinationDir, 'icon.ico');
  await fs.mkdir(destinationDir, { recursive: true });
  const buffer = await pngToIco(sources);
  await fs.writeFile(destination, buffer);
  console.log(`Icon generated at ${destination}`);
}

main().catch((error) => {
  console.error('Failed to generate ICO', error);
  process.exit(1);
});
