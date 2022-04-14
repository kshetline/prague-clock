export interface LanguageInfo {
  directory: string;
  name: string;
}

export const languageList: LanguageInfo[] = [
  { directory: 'cs', name: 'Čeština' },
  { directory: 'de', name: 'Deutsch' },
  { directory: 'en-US', name: 'English' },
  { directory: 'es', name: 'Español' },
  { directory: 'fr', name: 'Français' }
];

export const SOUTH_NORTH = [
  $localize`:Single-letter abbreviation for South:S`,
  $localize`:Single-letter abbreviation for North:N`
];
export const WEST_EAST = [
  $localize`:Single-letter abbreviation for West:W`,
  $localize`:Single-letter abbreviation for East:E`
];

export let specificLocale = '';
export let basePath = location.origin + location.pathname.replace(/\/([a-z][a-z](-[a-z][a-z])?)\/?$/, (_match, $1) => {
  specificLocale = $1;
  return '';
});

if (!basePath.endsWith('/'))
  basePath += '/';

specificLocale = (/\?(.*)\blang=([^&]+)/.exec(window.location.href) ?? [])[2] || specificLocale;

export let currentLocale: string;
export let localeSuffix = '';

let locales: string[] = [];

if (navigator.languages)
  locales = Array.from(navigator.languages);
else if (navigator.language)
  locales = [navigator.language];

if (specificLocale) {
  for (const locale of locales) {
    if (locale.startsWith(specificLocale)) {
      specificLocale = locale;
      locales = [locale];
      break;
    }
  }
}

currentLocale = specificLocale;

if (!currentLocale) {
  currentLocale = 'en-US';

  for (const locale of locales) {
    if (locale.startsWith('cs')) {
      currentLocale = 'cs';
      break;
    }
    if (locale.startsWith('de')) {
      currentLocale = 'de';
      break;
    }
    else if (locale.startsWith('es')) {
      currentLocale = 'es';
      break;
    }
    else if (locale.startsWith('fr')) {
      currentLocale = 'fr';
      break;
    }
    else if (!specificLocale && locale.startsWith('en')) {
      specificLocale = locale;
      break;
    }
  }
}
else if (currentLocale.startsWith('en') || !/^(cs|de|es|fr)/i.test(currentLocale))
  currentLocale = 'en-US';
else
  currentLocale = currentLocale.substring(0, 2).toLowerCase();

if (currentLocale !== 'en-US')
  localeSuffix = '_' + currentLocale;
