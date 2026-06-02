#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const settings = require('../src/i18n/settings.json');

const SUPPORTED_LANGS = Array.isArray(settings?.supportedLangs) && settings.supportedLangs.length
  ? settings.supportedLangs
  : ['en'];
const NAMESPACES = Array.isArray(settings?.namespaces) && settings.namespaces.length
  ? settings.namespaces
  : ['common'];
const BASE_LANGUAGE = settings?.fallbackLng || 'en';

const localesDir = path.join(__dirname, '..', 'src', 'locales');

const readJson = (language, namespace) => {
  const filePath = path.join(localesDir, language, `${namespace}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(normalized);
  } catch (error) {
    return {};
  }
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const collectLeafPaths = (obj, prefix = '') => {
  if (!isPlainObject(obj)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(obj).flatMap(([key, value]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      const children = collectLeafPaths(value, nextPath);
      return children.length ? children : [nextPath];
    }
    return [nextPath];
  });
};

const getValue = (obj, pathExpression) => {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(obj, pathExpression)) {
    return obj[pathExpression];
  }
  return pathExpression.split('.').reduce((acc, segment) => {
    if (acc === undefined || acc === null) {
      return undefined;
    }
    return acc[segment];
  }, obj);
};

const missing = [];

for (const namespace of NAMESPACES) {
  const baseJson = readJson(BASE_LANGUAGE, namespace);
  const keys = collectLeafPaths(baseJson);
  for (const language of SUPPORTED_LANGS) {
    if (language === BASE_LANGUAGE) continue;
    const targetJson = readJson(language, namespace);
    const missingKeys = keys.filter((key) => typeof getValue(targetJson, key) === 'undefined');
    if (missingKeys.length) {
      missing.push({ language, namespace, keys: missingKeys });
    }
  }
}

if (missing.length) {
  console.error('❌ Locale verification failed. Missing keys detected:\n');
  missing.forEach(({ language, namespace, keys }) => {
    console.error(`- ${language}/${namespace}:`);
    keys.forEach((key) => console.error(`    • ${key}`));
  });
  process.exit(1);
}

console.log('✅ All locale files contain the required keys.');
