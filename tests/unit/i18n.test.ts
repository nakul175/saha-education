import { test } from 'node:test';
import * as assert from 'node:assert';
import { getLocale, t } from '@/lib/education/i18n';

test('getLocale extracts correct locale from headers', async () => {
  // Mock request with English header
  const mockRequestEn = {
    headers: {
      get: (header: string) => {
        if (header === 'accept-language') return 'en-US,en;q=0.9';
        return null;
      }
    }
  };
  
  const locale = getLocale(mockRequestEn as any);
  assert.equal(locale, 'en', 'Should extract English locale');
});

test('getLocale extracts correct French locale from headers', async () => {
  const mockRequestFr = {
    headers: {
      get: (header: string) => {
        if (header === 'accept-language') return 'fr-FR,fr;q=0.9,en;q=0.8';
        return null;
      }
    }
  };
  
  const locale = getLocale(mockRequestFr as any);
  assert.equal(locale, 'fr', 'Should extract French locale');
});

test('getLocale defaults to English when no header', async () => {
  const mockRequest = {
    headers: {
      get: (header: string) => null
    }
  };
  
  const locale = getLocale(mockRequest as any);
  assert.equal(locale, 'en', 'Should default to English');
});

test('getLocale handles variant locales correctly', async () => {
  const mockRequest = {
    headers: {
      get: (header: string) => {
        if (header === 'accept-language') return 'es-ES,es;q=0.9,en;q=0.8';
        return null;
      }
    }
  };
  
  const locale = getLocale(mockRequest as any);
  assert.equal(locale, 'es', 'Should handle Spanish variant locales');
});

test('t returns correct translations for English', async () => {
  const translation = t('students', 'en');
  assert.equal(translation, 'Students', 'Should return English translation for students');
});

test('t returns correct translations for French', async () => {
  const translation = t('students', 'fr');
  assert.equal(translation, 'Étudiants', 'Should return French translation for students');
});

test('t returns correct translations for Spanish', async () => {
  const translation = t('students', 'es');
  assert.equal(translation, 'Estudiantes', 'Should return Spanish translation for students');
});

test('t returns original key when no translation exists', async () => {
  const translation = t('nonexistent-key', 'en');
  assert.equal(translation, 'nonexistent-key', 'Should return original key if no translation exists');
});