const packageJson = require('../package.json');

describe('build public path configuration', () => {
  it('uses a relative homepage so the built app works in any subfolder', () => {
    expect(packageJson.homepage).toBe('.');
  });
});
