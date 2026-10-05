const tests = [];
const test = (name, fn) => tests.push({ name, fn });
import assert from 'node:assert/strict';

// Import the functions we're testing
import { getLocale, t } from '../../lib/education/i18n.ts';

// Test getLocale function
test('getLocale should pick locale from Accept-Language header', () => {
  const request = new Request('https://example.com', {
    headers: new Headers({ 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' })
  });
  
  const locale = getLocale(request);
  assert.equal(locale, 'fr');
});

test('getLocale should fall back to English when no Accept-Language header', () => {
  const request = new Request('https://example.com', {
    headers: new Headers()
  });
  
  const locale = getLocale(request);
  assert.equal(locale, 'en');
});

test('getLocale should fall back to English when unsupported locale', () => {
  const request = new Request('https://example.com', {
    headers: new Headers({ 'accept-language': 'de-DE,de;q=0.9' })
  });
  
  const locale = getLocale(request);
  assert.equal(locale, 'en');
});

test('getLocale should handle locale variants correctly', () => {
  const request = new Request('https://example.com', {
    headers: new Headers({ 'accept-language': 'en-US,en;q=0.9' })
  });
  
  const locale = getLocale(request);
  assert.equal(locale, 'en');
});

test('getLocale should handle multiple languages with first supported being chosen', () => {
  const request = new Request('https://example.com', {
    headers: new Headers({ 'accept-language': 'de-DE,fr;q=0.9,en;q=0.8' })
  });
  
  const locale = getLocale(request);
  assert.equal(locale, 'fr');
});

test('t should return correct translation for English', () => {
  const result = t('students', 'en');
  assert.equal(result, 'Students');
});

test('t should return correct translation for French', () => {
  const result = t('students', 'fr');
  assert.equal(result, 'Étudiants');
});

test('t should return correct translation for Spanish', () => {
  const result = t('students', 'es');
  assert.equal(result, 'Estudiantes');
});

test('t should fall back to key when translation is missing', () => {
  const result = t('nonexistent-key', 'en');
  assert.equal(result, 'nonexistent-key');
});

test('t should use English as default locale when none provided', () => {
  const result = t('students');
  assert.equal(result, 'Students');
});

// Verify all locales have same keys
test('all locales should define exactly the same set of keys as English', () => {
  const englishKeys = Object.keys(t('', 'en')).filter(key => key !== '');
  const locales = ['fr', 'es'];
  
  for (const locale of locales) {
    const localeKeys = Object.keys(t('', locale)).filter(key => key !== '');
    assert.equal(localeKeys.length, englishKeys.length, `Locale ${locale} has ${localeKeys.length} keys, expected ${englishKeys.length}`);
    
    // Check that all english keys are present in the locale
    for (const key of englishKeys) {
      assert.ok(localeKeys.includes(key), `Locale ${locale} is missing key '${key}'`);
    }
  }
});

// Run tests
let passed = 0;
let failed = 0;

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
    passed++;
  } catch (error) {
    console.log(`not ok - ${name}: ${error.message}`);
    failed++;
  }
}

console.log(JSON.stringify({ passed, failed, skipped: 0 }));
process.exitCode = failed ? 1 : 0;