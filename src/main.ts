import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app.module';
import { environment } from './environments/environment';
import { Subject, throttleTime } from 'rxjs';

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
const docElem = document.documentElement;
const rawSizeChanges = new Subject<void>();

export const sizeChanges = rawSizeChanges.pipe(throttleTime<void>(100, undefined, { leading: true, trailing: true }));

function sizeChange(): void {
  rawSizeChanges.next();
}

function orientationChange(): void {
  sizeChange();

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

window.addEventListener('resize', sizeChange);
docElem.addEventListener('scroll', () => {
  if (docElem.style.overflow === 'hidden' && (docElem.scrollTop !== 0 || docElem.scrollLeft !== 0))
    sizeChange();
});

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
