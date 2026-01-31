#!/usr/bin/env node

/**
 * i18n Translation Validation Script
 * 
 * Validates all translation files against the English (en) reference file.
 * Checks for:
 * - Missing keys
 * - Extra keys (not in reference)
 * - Empty string values
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '../locales');
const REFERENCE_LANG = 'en';

/**
 * Recursively extract all keys from a nested object
 * @param {object} obj - The object to extract keys from
 * @param {string} prefix - Current key prefix for nested objects
 * @returns {string[]} Array of dot-notation keys
 */
function extractKeys(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...extractKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

/**
 * Get value from nested object using dot notation
 * @param {object} obj - The object to get value from
 * @param {string} key - Dot-notation key
 * @returns {any} The value at the key path
 */
function getNestedValue(obj, key) {
  return key.split('.').reduce((current, part) => current?.[part], obj);
}

/**
 * Load all translation files from locales directory
 * @returns {Map<string, object>} Map of language code to translation object
 */
function loadTranslations() {
  const translations = new Map();
  const dirs = fs.readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const lang of dirs) {
    const filePath = path.join(LOCALES_DIR, lang, 'translation.json');
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        translations.set(lang, JSON.parse(content));
      } catch (e) {
        console.error(`Error loading ${lang}: ${e.message}`);
      }
    }
  }
  return translations;
}

/**
 * Validate a single language against the reference
 * @param {string} lang - Language code
 * @param {object} translation - Translation object
 * @param {string[]} refKeys - Reference keys
 * @param {object} refTranslation - Reference translation object
 * @returns {{missing: string[], extra: string[], empty: string[]}}
 */
function validateLanguage(lang, translation, refKeys, refTranslation) {
  const langKeys = extractKeys(translation);
  const langKeySet = new Set(langKeys);
  const refKeySet = new Set(refKeys);

  const missing = refKeys.filter(key => !langKeySet.has(key));
  const extra = langKeys.filter(key => !refKeySet.has(key));
  const empty = langKeys.filter(key => {
    const value = getNestedValue(translation, key);
    return typeof value === 'string' && value.trim() === '';
  });

  return { missing, extra, empty };
}

function main() {
  console.log('i18n Translation Validation');
  console.log('===========================\n');

  const translations = loadTranslations();
  
  if (!translations.has(REFERENCE_LANG)) {
    console.error(`Reference language '${REFERENCE_LANG}' not found!`);
    process.exit(1);
  }

  const refTranslation = translations.get(REFERENCE_LANG);
  const refKeys = extractKeys(refTranslation);
  
  console.log(`Reference: ${REFERENCE_LANG} (${refKeys.length} keys)\n`);
  console.log(`Languages: ${Array.from(translations.keys()).join(', ')}\n`);

  let hasErrors = false;

  for (const [lang, translation] of translations) {
    if (lang === REFERENCE_LANG) continue;

    const { missing, extra, empty } = validateLanguage(lang, translation, refKeys, refTranslation);
    const langKeys = extractKeys(translation);
    
    console.log(`[${lang}] ${langKeys.length} keys`);
    
    if (missing.length > 0) {
      hasErrors = true;
      console.log(`  Missing (${missing.length}):`);
      missing.forEach(key => console.log(`    - ${key}`));
    }
    
    if (extra.length > 0) {
      hasErrors = true;
      console.log(`  Extra (${extra.length}):`);
      extra.forEach(key => console.log(`    + ${key}`));
    }
    
    if (empty.length > 0) {
      hasErrors = true;
      console.log(`  Empty values (${empty.length}):`);
      empty.forEach(key => console.log(`    ! ${key}`));
    }
    
    if (missing.length === 0 && extra.length === 0 && empty.length === 0) {
      console.log('  All keys validated successfully!');
    }
    
    console.log('');
  }

  if (hasErrors) {
    console.log('Validation FAILED - fix the issues above.');
    process.exit(1);
  } else {
    console.log('All languages validated successfully!');
    process.exit(0);
  }
}

main();
