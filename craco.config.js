const html5QrcodePattern = /html5-qrcode/;

function adjustSourceMapLoader(rules) {
  if (!Array.isArray(rules)) return;
  rules.forEach(rule => {
    if (!rule || typeof rule !== 'object') return;

    if (rule.loader && rule.loader.includes('source-map-loader')) {
      if (Array.isArray(rule.exclude)) {
        rule.exclude.push(html5QrcodePattern);
      } else if (rule.exclude) {
        rule.exclude = [rule.exclude, html5QrcodePattern];
      } else {
        rule.exclude = [html5QrcodePattern];
      }
    }

    if (Array.isArray(rule.oneOf)) {
      adjustSourceMapLoader(rule.oneOf);
    }
    if (Array.isArray(rule.rules)) {
      adjustSourceMapLoader(rule.rules);
    }
  });
}

module.exports = {
  webpack: {
    configure: (config) => {
      adjustSourceMapLoader(config.module?.rules);
      return config;
    },
  },
};
