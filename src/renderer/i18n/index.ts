import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { cs } from './cs';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof cs };
  }
}

export function createI18n() {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    lng: 'cs',
    fallbackLng: 'cs',
    resources: { cs: { translation: cs } },
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}
