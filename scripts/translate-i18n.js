#!/usr/bin/env node

/**
 * i18n Auto-Translation Script
 * 
 * Translates missing keys from English (en) to other languages using Gemini API.
 * Usage: npm run translate (reads GEMINI_API_KEY from .env)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '../locales');
const REFERENCE_LANG = 'en';
const TARGET_LANGS = ['ko', 'de', 'fr', 'es'];
const BATCH_SIZE = 10;

const LANG_NAMES = {
  ko: 'Korean',
  de: 'German',
  fr: 'French',
  es: 'Spanish'
};

/**
 * Recursively extract all keys from a nested object
 * (Reused from validate-i18n.js)
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
 * (Reused from validate-i18n.js)
 */
function getNestedValue(obj, key) {
  return key.split('.').reduce((current, part) => current?.[part], obj);
}

/**
 * Set value in nested object using dot notation
 */
function setNestedValue(obj, key, value) {
  const parts = key.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Load all translation files from locales directory
 * (Reused from validate-i18n.js)
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
 * Save translation file with pretty formatting
 */
function saveTranslation(lang, translation) {
  const filePath = path.join(LOCALES_DIR, lang, 'translation.json');
  fs.writeFileSync(filePath, JSON.stringify(translation, null, 2) + '\n', 'utf8');
}

/**
 * Extract {{variable}} patterns from a string
 */
function extractInterpolations(str) {
  const matches = str.match(/\{\{[^}]+\}\}/g);
  return matches ? matches.sort() : [];
}

/**
 * Verify interpolation patterns are preserved
 */
function verifyInterpolations(original, translated) {
  const origPatterns = extractInterpolations(original);
  const transPatterns = extractInterpolations(translated);
  
  if (origPatterns.length !== transPatterns.length) return false;
  return origPatterns.every((p, i) => p === transPatterns[i]);
}

/**
 * Call Gemini API for translation
 */
async function translateWithGemini(apiKey, texts, targetLang) {
  const langName = LANG_NAMES[targetLang] || targetLang;
  
  const systemPrompt = `You are a professional translator. Translate the following JSON key-value pairs from English to ${langName}.

CRITICAL RULES:
1. Preserve ALL {{variable}} placeholders EXACTLY as-is (do not translate variable names)
2. Maintain the same JSON structure
3. Only translate the string values, not the keys
4. Keep the tone consistent with a professional software application

Return ONLY valid JSON, no explanations or markdown.`;

  const userPrompt = JSON.stringify(texts, null, 2);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${systemPrompt}\n\nTranslate this:\n${userPrompt}`
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          topP: 0.8
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) {
    throw new Error('Empty response from Gemini API');
  }

  let cleanText = text.trim();
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.slice(7);
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.slice(3);
  }
  if (cleanText.endsWith('```')) {
    cleanText = cleanText.slice(0, -3);
  }
  cleanText = cleanText.trim();

  try {
    return JSON.parse(cleanText);
  } catch (e) {
    throw new Error(`Failed to parse Gemini response: ${e.message}\nResponse: ${cleanText}`);
  }
}

/**
 * Find missing keys for a language compared to reference
 */
function findMissingKeys(refKeys, translation) {
  const langKeys = new Set(extractKeys(translation));
  return refKeys.filter(key => !langKeys.has(key));
}

/**
 * Split array into batches
 */
function batchArray(arr, size) {
  const batches = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
}

async function main() {
  console.log('i18n Auto-Translation');
  console.log('=====================\n');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY environment variable is required.');
    console.error('Usage: GEMINI_API_KEY=your_key npm run translate');
    process.exit(1);
  }

  const translations = loadTranslations();
  
  if (!translations.has(REFERENCE_LANG)) {
    console.error(`Reference language '${REFERENCE_LANG}' not found!`);
    process.exit(1);
  }

  const refTranslation = translations.get(REFERENCE_LANG);
  const refKeys = extractKeys(refTranslation);
  
  console.log(`Reference: ${REFERENCE_LANG} (${refKeys.length} keys)`);
  console.log(`Target languages: ${TARGET_LANGS.join(', ')}\n`);

  const missingByLang = new Map();
  let totalMissing = 0;

  for (const lang of TARGET_LANGS) {
    if (!translations.has(lang)) {
      console.error(`Warning: Language '${lang}' not found, skipping.`);
      continue;
    }
    
    const missing = findMissingKeys(refKeys, translations.get(lang));
    if (missing.length > 0) {
      missingByLang.set(lang, missing);
      totalMissing += missing.length;
      console.log(`[${lang}] ${missing.length} missing keys`);
    } else {
      console.log(`[${lang}] Up to date`);
    }
  }

  if (totalMissing === 0) {
    console.log('\nNo missing keys found. All translations up to date.');
    process.exit(0);
  }

  console.log(`\nTotal: ${totalMissing} keys to translate\n`);

  const results = { success: {}, failed: {} };

  for (const [lang, missingKeys] of missingByLang) {
    console.log(`\nTranslating to ${LANG_NAMES[lang]}...`);
    
    const translation = translations.get(lang);
    let successCount = 0;
    let failedKeys = [];

    const batches = batchArray(missingKeys, BATCH_SIZE);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`  Batch ${i + 1}/${batches.length} (${batch.length} keys)...`);
      
      const textsToTranslate = {};
      for (const key of batch) {
        textsToTranslate[key] = getNestedValue(refTranslation, key);
      }

      try {
        const translated = await translateWithGemini(apiKey, textsToTranslate, lang);
        
        for (const key of batch) {
          const original = textsToTranslate[key];
          const translatedValue = translated[key];
          
          if (!translatedValue) {
            console.log(`    Warning: Missing translation for '${key}'`);
            failedKeys.push(key);
            continue;
          }
          
          if (!verifyInterpolations(original, translatedValue)) {
            console.log(`    Warning: Interpolation mismatch for '${key}'`);
            console.log(`      Original: ${original}`);
            console.log(`      Translated: ${translatedValue}`);
            failedKeys.push(key);
            continue;
          }
          
          setNestedValue(translation, key, translatedValue);
          successCount++;
        }
        
        if (i < batches.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (e) {
        console.log(`    Error: ${e.message}`);
        failedKeys.push(...batch);
      }
    }

    if (successCount > 0) {
      saveTranslation(lang, translation);
      console.log(`  Saved ${successCount} translations to ${lang}/translation.json`);
    }

    results.success[lang] = successCount;
    if (failedKeys.length > 0) {
      results.failed[lang] = failedKeys;
    }
  }

  console.log('\n=====================');
  console.log('Translation Summary');
  console.log('=====================\n');

  const totalSuccess = Object.values(results.success).reduce((a, b) => a + b, 0);
  const langSummary = Object.entries(results.success)
    .map(([lang, count]) => `${lang}: ${count}`)
    .join(', ');
  
  console.log(`Translated ${totalSuccess} keys (${langSummary})`);

  const totalFailed = Object.values(results.failed).reduce((a, b) => a + b.length, 0);
  if (totalFailed > 0) {
    console.log(`\nFailed keys (${totalFailed}):`);
    for (const [lang, keys] of Object.entries(results.failed)) {
      console.log(`  [${lang}]:`);
      keys.forEach(key => console.log(`    - ${key}`));
    }
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
