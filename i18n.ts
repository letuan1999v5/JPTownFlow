// i18n.ts

import * as Localization from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files - Top 10 languages in Japan
import enTranslations from './locales/en.json';
import jaTranslations from './locales/ja.json';
import viTranslations from './locales/vi.json';
import zhTranslations from './locales/zh.json';
import koTranslations from './locales/ko.json';
import ptTranslations from './locales/pt.json';
import esTranslations from './locales/es.json';
import filTranslations from './locales/fil.json';
import thTranslations from './locales/th.json';
import idTranslations from './locales/id.json';

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
  zh: {
    translation: zhTranslations,
  },
  ko: {
    translation: koTranslations,
  },
  pt: {
    translation: ptTranslations,
  },
  es: {
    translation: esTranslations,
  },
  fil: {
    translation: filTranslations,
  },
  th: {
    translation: thTranslations,
  },
  id: {
    translation: idTranslations,
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