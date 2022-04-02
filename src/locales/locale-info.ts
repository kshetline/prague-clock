export const SOUTH_NORTH = [
  $localize`:Single-letter abbreviation for South:S`,
  $localize`:Single-letter abbreviation for North:N`
];
export const WEST_EAST = [
  $localize`:Single-letter abbreviation for West:W`,
  $localize`:Single-letter abbreviation for East:E`
];

export let currentLocale = 'en-US';
export let specificLocale: string;
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
  if (locale.startsWith('es')) {
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
