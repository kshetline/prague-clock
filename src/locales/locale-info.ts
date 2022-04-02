export const SOUTH_NORTH = [
  $localize`:Single-letter abbreviation for South:S`,
  $localize`:Single-letter abbreviation for North:N`
];
export const WEST_EAST = [
  $localize`:Single-letter abbreviation for West:W`,
  $localize`:Single-letter abbreviation for East:E`
];

export let currentLocale = 'en-US';
export let localeSuffix = '';

let locales: string[] = [];

if (navigator.languages)
  locales = Array.from(navigator.languages);
else if (navigator.language)
  locales = [navigator.language];

for (const locale of locales) {
  if (locale.startsWith('es'))
    currentLocale = 'es';
}

if (currentLocale !== 'en-US')
  localeSuffix = '_' + currentLocale;
