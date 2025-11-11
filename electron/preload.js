const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('breedingPlanner', {
  version: appVersion(),
});

function appVersion() {
  try {
    // Lazy load to avoid requiring during unit tests
    const pkg = require('../package.json');
    return pkg.version;
  } catch (err) {
    return 'dev';
  }
}
