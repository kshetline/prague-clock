import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app.module';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

const width = Math.min(window.innerWidth, document.documentElement.clientWidth);
const height = Math.min(window.innerHeight, document.documentElement.clientHeight);

if (Math.min(width, height) < 428) {
  const viewport = document.querySelector('meta[name="viewport"]');

  if (viewport) {
    viewport.setAttribute('content', 'width=device-width, initial-scale=0.95, minimum-scale=0.95, maximum-scale=0.95');
  }
}

let screenOrientationSucceeded = false;
let orientationChangeTimer: any;

function orientationChange(): void {
  if (orientationChangeTimer)
    clearTimeout(orientationChangeTimer);

  document.body.classList.add('orientation-change');
  orientationChangeTimer = setTimeout(() => {
    orientationChangeTimer = undefined;
    document.body.classList.remove('orientation-change');
  }, 1000);
}

try {
  if (screen.orientation) {
    screen.orientation.addEventListener('change', orientationChange);
    screenOrientationSucceeded = true;
  }
}
catch {}

if (!screenOrientationSucceeded) {
  window.addEventListener('orientationchange', orientationChange);
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
