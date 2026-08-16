import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';
import { en } from './en';
import { fr } from './fr';

const i18n = new I18n({
  fr,
  en,
});

// Set locale based on device language preferences
const deviceLanguage = getLocales()[0]?.languageCode ?? 'fr';
i18n.locale = deviceLanguage;
i18n.enableFallback = true;
i18n.defaultLocale = 'fr';

export default i18n;
