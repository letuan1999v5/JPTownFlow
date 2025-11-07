// i18n.ts

import * as Localization from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files
import enTranslations from './locales/en.json';
import jaTranslations from './locales/ja.json';
import viTranslations from './locales/vi.json';

const resources = {
  ja: {
    translation: jaTranslations,
  },
  en: {
    translation: enTranslations,
  },
  vi: {
    translation: viTranslations,
  },
};

// Get device language
const deviceLanguage = Localization.locale.split('-')[0]; // 'ja-JP' -> 'ja'

i18next
  .use(initReactI18next)
  .init({
    resources,
    lng: deviceLanguage,
    fallbackLng: 'ja',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v3',
  });

export default i18next;