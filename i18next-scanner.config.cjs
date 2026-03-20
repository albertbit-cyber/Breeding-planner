const path = require('path');

const LOCALES = ['en', 'es', 'fr', 'it', 'de', 'nl', 'pl', 'pt', 'cs', 'he'];
const NAMESPACES = ['common', 'animals', 'advisor', 'auth', 'electron'];

module.exports = {
  input: ['src/**/*.{js,jsx,ts,tsx}'],
  output: 'src/locales/$LOCALE/$NAMESPACE.json',
  options: {
    debug: false,
    removeUnusedKeys: false,
    sort: true,
    lngs: LOCALES,
    ns: NAMESPACES,
    defaultLng: 'en',
    defaultNs: 'common',
    fallbackLng: 'en',
    resource: {
      loadPath: path.resolve(__dirname, 'src/locales/{{lng}}/{{ns}}.json'),
      savePath: path.resolve(__dirname, 'src/locales/{{lng}}/{{ns}}.json'),
      jsonSpace: 2,
    },
    keySeparator: '.',
    nsSeparator: ':',
    pluralSeparator: '_',
    contextSeparator: '_',
  },
  transform(file, enc, done) {
    const parser = this.parser;
    const content = file.contents.toString('utf8');
    if (!content.length) {
      done();
      return;
    }

    parser.parseFuncFromString(content, { list: ['t', 'i18n.t'] }, (key, options) => {
      parser.set(key, options);
    });

    parser.parseTransFromString(content, (key, options) => {
      parser.set(key, options);
    });

    done();
  },
};
