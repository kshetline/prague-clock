(() => {
  const specificLocale = (/\?(.*)\blang=([^&]+)/.exec(window.location.href) || [])[2];
  const urlLocale = (/\borloj\/([^/]+)/.exec(window.location.href) || [])[1];
  let locales = [];

  if (navigator.languages)
    locales = navigator.languages;
  else if (navigator.language)
    locales = [navigator.language];

  if (specificLocale)
    locales = [specificLocale];
  else if (urlLocale) {
    let matched = false;

    for (const locale of locales) {
      if (locale.startsWith(urlLocale)) {
        locales = [locale];
        matched = true;
        break;
      }
    }

    if (!matched)
      locales = [urlLocale];
  }

  for (const locale of locales) {
    if (locale.startsWith('cs')) {
      /* cSpell:disable-next-line */ // noinspection SpellCheckingInspection
      document.querySelector('title').innerText = 'Simulátor pražského orloje';
      /* cSpell:disable-next-line */ // noinspection SpellCheckingInspection
      document.getElementById('loading').innerText = 'Načítání...';
      break;
    }
    else if (locale.startsWith('de')) {
      /* cSpell:disable-next-line */ // noinspection SpellCheckingInspection
      document.querySelector('title').innerText = 'Pražský Orloj - Simulator der Prager astronomischen Uhr';
      /* cSpell:disable-next-line */ // noinspection SpellCheckingInspection
      document.getElementById('loading').innerText = 'Wird geladen...';
      break;
    }
    else if (locale.startsWith('es')) {
      /* cSpell:disable-next-line */ // noinspection SpellCheckingInspection
      document.querySelector('title').innerText = 'Pražský Orloj - Simulador de Reloj Astronómico de Praga';
      /* cSpell:disable-next-line */ // noinspection SpellCheckingInspection
      document.getElementById('loading').innerText = 'Cargando...';
      break;
    }
    else if (locale.startsWith('fr')) {
      /* cSpell:disable-next-line */ // noinspection SpellCheckingInspection
      document.querySelector('title').innerText = 'Pražský Orloj - Simulateur d\'horloge astronomique de Prague';
      /* cSpell:disable-next-line */ // noinspection SpellCheckingInspection
      document.getElementById('loading').innerText = 'Chargement...';
      break;
    }
    else if (locale.startsWith('en'))
      break;
  }
})();
