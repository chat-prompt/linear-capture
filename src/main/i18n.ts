import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import * as path from 'path';
import { app } from 'electron';

const SUPPORTED_LANGUAGES = ['en', 'ko'] as const;
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
    : path.join(process.resourcesPath!, 'locales');

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
  return i18next.t(key, options || {}) as string;
}

export async function changeLanguage(lng: string): Promise<void> {
  await i18next.changeLanguage(lng);
}

export function getCurrentLanguage(): string {
  return i18next.language || 'en';
}

export { i18next };
