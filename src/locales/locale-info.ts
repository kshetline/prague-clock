export interface LanguageInfo {
  directory: string;
  name: string;
}

export const languageList: LanguageInfo[] = [
  { directory: 'en-US', name: 'English' },
  { directory: 'cs', name: 'Čeština' },
  { directory: 'es', name: 'Español' }
];

export const SOUTH_NORTH = [
  $localize`:Single-letter abbreviation for South:S`,
  $localize`:Single-letter abbreviation for North:N`
];
export const WEST_EAST = [
  $localize`:Single-letter abbreviation for West:W`,
  $localize`:Single-letter abbreviation for East:E`
];

export let basePath = location.origin + location.pathname.replace(/\/[a-z][a-z]()\/?$/, '');

if (!basePath.endsWith('/'))
  basePath += '/';

export let currentLocale = 'en-US';
export let specificLocale: string = (/\?(.*)\blang=([^&]+)/.exec(window.location.href) ?? [])[2];
export let localeSuffix = '';

const urlLocale = (/\borloj\/([^/]+)/.exec(window.location.href) ?? [])[1];
let locales: string[] = [];

if (navigator.languages)
  locales = Array.from(navigator.languages);
else if (navigator.language)
  locales = [navigator.language];

if (urlLocale) {
  for (const locale of locales) {
    if (locale.startsWith(urlLocale)) {
      specificLocale = locale;
      locales = [locale];
      break;
    }
  }
}

for (const locale of locales) {
  if (locale.startsWith('cs')) {
    currentLocale = 'cs';
    break;
  }
  else if (locale.startsWith('es')) {
    currentLocale = 'es';
    break;
  }
  else if (!specificLocale && locale.startsWith('en')) {
    specificLocale = locale;
    break;
  }
}

if (currentLocale !== 'en-US')
  localeSuffix = '_' + currentLocale;
