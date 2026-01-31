import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import * as path from 'path';
import { app } from 'electron';

const SUPPORTED_LANGUAGES = ['en', 'ko', 'de', 'fr', 'es'] as const;
type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

let initialized = false;

export async function initI18n(language?: string): Promise<typeof i18next> {
  if (initialized) return i18next;

  const systemLang = language || app.getLocale().split('-')[0];
  const lng: SupportedLanguage = SUPPORTED_LANGUAGES.includes(systemLang as SupportedLanguage)
    ? (systemLang as SupportedLanguage)
    : 'en';

  const isDev = !app.isPackaged;
  const localesPath = isDev
    ? path.join(__dirname, '../../locales')
    : path.join(app.getAppPath(), 'locales');

  await i18next.use(Backend).init({
    lng,
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LANGUAGES],
    backend: {
      loadPath: path.join(localesPath, '{{lng}}/translation.json'),
    },
    interpolation: {
      escapeValue: false,
    },
  });

  initialized = true;
  return i18next;
}

export function t(key: string, options?: Record<string, any>): string {
  const result = i18next.t(key, options || {}) as string;
  // Debug: log language on first few calls
  if (key === 'capture.title' || key === 'settings.title') {
    console.log(`[i18n] t('${key}') lang=${i18next.language} => '${result}'`);
  }
  return result;
}

export async function changeLanguage(lng: string): Promise<void> {
  console.log(`[i18n] changeLanguage called: ${lng}, current: ${i18next.language}`);
  await i18next.changeLanguage(lng);
  console.log(`[i18n] changeLanguage done: now ${i18next.language}`);
}

export function getCurrentLanguage(): string {
  return i18next.language || 'en';
}

export { i18next };
