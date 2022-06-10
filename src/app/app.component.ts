import { Component, OnInit, ViewChild } from '@angular/core';
import { ConfirmationService, MenuItem, MessageService, PrimeNGConfig } from 'primeng/api';
import { abs, floor, max, min, mod, mod2 } from '@tubular/math';
import {
  clone, extendDelimited, forEach, getCssValue, isAndroid, isEqual, isIOS, isLikelyMobile, isMacOS, isObject, isSafari, noop,
  processMillis
} from '@tubular/util';
import { AngleStyle, DateTimeStyle, TimeEditorOptions } from '@tubular/ng-widgets';
import {
  AstroEvent, EventFinder, FALL_EQUINOX, FIRST_QUARTER, FULL_MOON, JUPITER, LAST_QUARTER, MARS, MERCURY, MOON,
  NEW_MOON, RISE_EVENT, SATURN, SET_EVENT, SkyObserver, SPRING_EQUINOX, SUMMER_SOLSTICE, SUN, TRANSIT_EVENT, VENUS,
  WINTER_SOLSTICE
} from '@tubular/astronomy';
import ttime, { DateAndTime, DateTime, Timezone } from '@tubular/time';
import { TzsLocation } from '../timezone-selector/timezone-selector.component';
import { Globe } from '../globe/globe';
import { basePath, languageList, localeSuffix, SOUTH_NORTH, specificLocale, WEST_EAST } from '../locales/locale-info';
import { faForward, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import { AdvancedOptionsComponent, Appearance, SettingsHolder, Timing }
  from '../advanced-options/advanced-options.component';
import {
  adjustForEclipticWheel, AngleTriplet, BasicPositions, calculateBasicPositions, calculateMechanicalPositions,
  MILLIS_PER_DAY, MILLIS_PER_SIDEREAL_DAY, solarSystem, ZeroAngles
} from 'src/math/math';
import { adjustGraphicsForLatitude, initSvgHost, sunlitMoonPath, SvgHost } from 'src/svg/svg';
import { sizeChanges } from '../main';
import { Subscription, timer } from 'rxjs';

const { DATE, DATETIME_LOCAL, julianDay, TIME } = ttime;

const CLICK_REPEAT_DELAY = 500;
const CLICK_REPEAT_RATE  = 100;

const RESUME_FILTERING_DELAY = 1000;
const SIMPLE_FILTER_IS_SLOW_TOO = isAndroid() || (isSafari() && isMacOS());
const STOP_FILTERING_DELAY = SIMPLE_FILTER_IS_SLOW_TOO ? 1000 : 3000;
const START_FILTERING_DELAY = SIMPLE_FILTER_IS_SLOW_TOO ? 1000 : 500;
const RECOMPUTED_WHEN_NEEDED: null = null;

enum EventType { EQUISOLSTICE, MOON_PHASE, RISE_SET }
enum PlaySpeed { NORMAL, FAST }

const MAX_SAVED_LOCATIONS = 10;

const prague = $localize`Prague, CZE`;
const pragueLat = 50.0870;
const pragueLon = 14.4185;

const defaultSettings = {
  additionalPlanets: false,
  animateBySiderealDays: false,
  appearance: Appearance.CURRENT,
  background: '#4D4D4D',
  collapsed: false,
  detailedMechanism: false,
  disableDst: true,
  eventType: EventType.EQUISOLSTICE,
  fasterGraphics: true,
  isoFormat: false,
  latitude: pragueLat,
  longitude: pragueLon,
  placeName: prague,
  realPositionMarkers: false,
  recentLocations: [{
    lastTimeUsed: 0,
    latitude: pragueLat,
    longitude: pragueLon,
    name: prague,
    zone: 'Europe/Prague'
  }] as TzsLocation[],
  showInfoPanel: false,
  suppressOsKeyboard: false,
  timing: Timing.MODERN,
  trackTime: true,
  translucentEcliptic: false,
  zone: 'Europe/Prague'
};

function removeOldestLocation(locations: TzsLocation[]): TzsLocation[] {
  let earliestTime = Number.POSITIVE_INFINITY;
  let earliestIndex = -1;

  for (let i = 0; i < locations.length; ++i) {
    const loc = locations[i];

    if (loc.lastTimeUsed !== 0 && loc.lastTimeUsed < earliestTime) {
      earliestIndex = i;
      earliestTime = loc.lastTimeUsed;
    }
  }

  locations.splice(earliestIndex, 1);

  return locations;
}

function basicPosKey(key: string): boolean { return !key.startsWith('_'); }

function formatTimeOfDay(hours: number | DateTime | DateAndTime, force24 = false, zeroIs24 = false): string {
  if (hours instanceof DateTime)
    hours = hours.wallTime;

  if (isObject(hours))
    hours = hours.hour + hours.minute / 60;

  const minutes = min(floor(hours * 60 + 0.001), 1439);
  const hour = floor(minutes / 60);
  const minute = minutes % 60;
  const format = force24 ? TIME : 'IxS{hour:2-digit}';
  let time = new DateTime([1970, 1, 1, hour, minute], 'UTC', specificLocale).format(format);

  if (zeroIs24)
    time = time.replace(/^00/, '24');

  return time;
}

const menuLanguageList: MenuItem[] = [];
const smallMobile = isLikelyMobile() && (screen.width < 460 || screen.height < 460);

menuLanguageList.push({ label: $localize`Default`, url: basePath, target: '_self' });
menuLanguageList.push({ separator: true });
languageList.forEach(language =>
  menuLanguageList.push({ label: language.name, url: basePath + language.directory, target: '_self' }));

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, SettingsHolder, SvgHost {
  faForward = faForward;
  faPlay = faPlay;
  faStop = faStop;

  CONSTRAINED_SUN = Timing.CONSTRAINED_SUN;
  CURRENT = Appearance.CURRENT;
  CURRENT_NO_MAP = Appearance.CURRENT_NO_MAP;
  DD = AngleStyle.DD;
  DDD = AngleStyle.DDD;
  FAST = PlaySpeed.FAST;
  MODERN = Timing.MODERN;
  MAX_YEAR = 2399;
  menuLanguageList = menuLanguageList;
  MIN_YEAR = 1400;
  NORMAL = PlaySpeed.NORMAL;
  ORIGINAL_1410 = Appearance.ORIGINAL_1410;
  smallMobile = smallMobile;
  SOUTH_NORTH = SOUTH_NORTH;
  specificLocale = specificLocale;
  toZodiac = (angle: number): string => '♈♉♊♋♌♍♎♏♐♑♒♓'.charAt(floor(mod(angle, 360) / 30)) + '\uFE0E';
  WEST_EAST = WEST_EAST;

  LOCAL_OPTS: TimeEditorOptions = {
    dateTimeStyle: DateTimeStyle.DATE_AND_TIME,
    locale: specificLocale,
    twoDigitYear: false,
    showDstSymbol: true,
    showSeconds: false
  };

  ISO_OPTS = ['ISO', this.LOCAL_OPTS, { showUtcOffset: true }];

  private _additionalPlanets = false;
  private _appearance = Appearance.CURRENT;
  private _background = '#4D4D4D';
  private _collapsed = false;
  private delayedCollapse = false;
  private eventClickTimer: Subscription;
  private eventFinder = new EventFinder();
  private eventGoBack = false;
  private eventType = EventType.EQUISOLSTICE;
  private globe: Globe
  private graphicsChangeLastTime = -1;
  private graphicsChangeStartTime = -1;
  private graphicsChangeStopTimer: any;
  private initDone = false;
  private _isoFormat = false;
  private lastSavedSettings: any = null;
  private lastWallTime: DateAndTime;
  private _latitude = pragueLat;
  private _longitude = pragueLon;
  private localTimezone = Timezone.getTimezone('LMT', this._longitude);
  private observer: SkyObserver;
  private _playing = false;
  private playTimeBase: number;
  private playTimeProcessBase: number;
  private _realPositionMarkers = false;
  private _showInfoPanel = false;
  private sunsetA: AstroEvent = null;
  private sunsetB: AstroEvent = null;
  private _suppressOsKeyboard = false;
  private _time = 0;
  private timeCheck: any;
  private _timing = Timing.MODERN;
  private timingReference: BasicPositions | null | undefined;
  private _trackTime = false;
  private _zone = 'Europe/Prague';
  private zoneFixTimeout: any;

  menuItems: MenuItem[] = [
    { label: $localize`↔ Equinox/solstice`, icon: 'pi pi-check',
      command: (): void => this.setEventType(EventType.EQUISOLSTICE) },
    { label: $localize`↔ Moon phase`, icon: 'pi pi-circle',
      command: (): void => this.setEventType(EventType.MOON_PHASE) },
    { label: $localize`↔ Sunrise/transit/sunset`, icon: 'pi pi-circle',
      command: (): void => this.setEventType(EventType.RISE_SET) },
    { separator : true },
    { label: $localize`Advanced options...`, icon: 'pi pi-circle', command: (): void => {
      this.collapsed = false;
      this.advancedOptions?.show();
    } },
    { label: $localize`Language` + (smallMobile ? '...' : ''), icon: 'pi pi-circle',
      items: smallMobile ? undefined : menuLanguageList,
      command: smallMobile ? (): boolean => this.showLanguageMenu = true : undefined },
    { separator : true },
    { label: $localize`Code on GitHub`, icon: 'pi pi-github', url: 'https://github.com/kshetline/prague-clock',
      target: '_blank' },
    { label: $localize`Czech Horological Society site`, icon: 'pi pi-home', url: 'https://www.orloj.eu/',
      target: '_blank' },
    { label: $localize`About the real clock`, icon: 'pi pi-info-circle',
      url: $localize`:Language-specific Wikipedia URL:https://en.wikipedia.org/wiki/Prague_astronomical_clock`,
      target: '_blank' },
    { label: $localize`About this simulator`, icon: 'pi pi-info-circle', url: `assets/about${localeSuffix}.html`,
      target: '_blank' }
  ];

  // This trick is need to be able to access SvgHost fields which are not explicitly declared here.
  self: AppComponent & SvgHost = this;

  altFour = false;
  animateBySiderealDays = false;
  bohemianTime = '';
  canEditName = false;
  canSaveName = false;
  dawnDuskFontSize = '15px';
  dawnTextOffset: number;
  detailedMechanism = false;
  disableDst = true;
  dstChangeAllowed = true;
  emptyCenter = false;
  errorMoon = 0;
  errorMoonDays = 0;
  errorPhase = 0;
  errorPhaseDays = 0;
  errorSun = 0;
  errorSunMinutes = 0;
  fasterGraphics = true;
  handAngle = 0;
  inputLength = 0;
  inputName: string;
  jupiterAngle = ZeroAngles;
  lastHeight = -1;
  lastRecalibration = '';
  localMeanTime = '';
  localSolarTime = '';
  localTime = '';
  marsAngle = ZeroAngles;
  mercuryAngle = ZeroAngles;
  moonAngle = ZeroAngles;
  moonHandAngle = 0;
  moonPhase = 0;
  moonrise = '';
  moonset = '';
  outerRingAngle = 0;
  outerSunriseAngle: number = null;
  overlapShift = [0, 0, 0, 0, 0];
  placeName = 'Prague, CZE';
  playSpeed = PlaySpeed.NORMAL;
  recentLocations: TzsLocation[] = [];
  rotateSign = 1;
  saturnAngle = ZeroAngles;
  showAllErrors = false;
  showErrors = false;
  showLanguageMenu = false;
  showRecalibration = false;
  siderealAngle = 0;
  siderealTime = '';
  siderealTimeOrloj = '';
  sunAngle = ZeroAngles;
  sunrise: string;
  sunset: string;
  svgFilteringOn = true;
  timeText = '';
  translucentEcliptic = false;
  true_handAngle = 0;
  true_moonAngle = ZeroAngles;
  true_moonHandleAngle = 0;
  true_moonPhase = 0;
  true_siderealAngle = 0;
  true_sunAngle = ZeroAngles;
  venusAngle = ZeroAngles;
  zoneOffset = '';

  @ViewChild('advancedOptions', { static: true }) advancedOptions: AdvancedOptionsComponent;

  get filterEcliptic(): string {
    return this.fasterGraphics && (!this.svgFilteringOn || this.playing) ? null : 'url("#filterEcliptic")';
  }

  get filterHand(): string {
    return this.fasterGraphics && (!this.svgFilteringOn || this.playing) ? null : 'url("#filterHand")';
  }

  get filterRelief(): string {
    return this.fasterGraphics && (!this.svgFilteringOn || this.playing) ?
      (SIMPLE_FILTER_IS_SLOW_TOO ? null : 'url("#filterReliefSimple")') : 'url("#filterRelief")';
  }

  constructor(
    private confirmService: ConfirmationService,
    private messageService: MessageService,
    private primeNgConfig: PrimeNGConfig
  ) {
    initSvgHost(this);

    let settings: any;

    if (isLikelyMobile() || isIOS()) {
      this.menuItems.push({ separator: true });
      this.menuItems.push({ label: $localize`Suppress onscreen keyboard`, icon: 'pi pi-circle', id: 'sok',
                            command: (): boolean => this.suppressOsKeyboard = !this.suppressOsKeyboard });
    }

    try {
      settings = JSON.parse(localStorage.getItem('pac-settings') ?? 'null');

      if (settings?.recentLocations && settings.recentLocations.length > 0) {
        delete settings.constrainedSun;
        settings.recentLocations.forEach((loc: any) => { loc.name = loc.name || loc.placeName; delete loc.placeName; });
        settings.recentLocations[0].name = prague;
      }

      if (settings.post2018 != null) {
        settings.appearance = (settings.post2018 ? (settings.hideMap === true ?
          Appearance.CURRENT_NO_MAP : Appearance.CURRENT) : Appearance.PRE_2018);
        delete settings.appearance;
      }

      delete settings.hideMap;
      delete settings.equatorialPositionMarkers;
    }
    catch {
      settings = null;
    }

    settings = settings ?? defaultSettings;
    Object.keys(defaultSettings).forEach(key => (this as any)[key] = settings[key] ?? (defaultSettings as any)[key]);
    this.updateObserver();
    this.updateMenu();

    window.addEventListener('beforeunload', () => this.saveSettings());
    setInterval(() => this.saveSettings(), 5000);
  }

  ngOnInit(): void {
    this.primeNgConfig.setTranslation({
      accept: $localize`:for dialog button:Yes`,
      reject: $localize`:for dialog button:No`
    });

    const placeName = this.placeName;

    this.initDone = true;
    this.globe = new Globe('globe-host');
    this.globe.setAppearance(this.appearance);
    this.adjustLatitude();

    this.setNow();
    this.placeName = placeName;
    this.advancedOptions.settingsHolder = this;

    if (this.delayedCollapse)
      setTimeout(() => this.collapsed = true);

    const docElem = document.documentElement;
    const doResize = (): void => {
      this.graphicsRateChangeCheck();
      setTimeout(() => {
        const height = window.innerHeight;
        const disallowScroll = getCssValue(docElem, 'overflow') === 'hidden';

        docElem.style.setProperty('--mfvh', height + 'px');
        docElem.style.setProperty('--mvh', (height * 0.01) + 'px');
        this.adjustFontScaling();

        if (disallowScroll && (docElem.scrollTop !== 0 || docElem.scrollLeft !== 0)) {
          docElem.scrollTo(0, 0);
          setTimeout(doResize, 50);
        }

        if (this.lastHeight !== height) {
          this.lastHeight = height;
          this.updateGlobe();
        }
      });
    };

    sizeChanges.subscribe(() => doResize());
    doResize();

    setTimeout(() => document.getElementById('graphics-credit').style.opacity = '0', 15000);
    this.graphicsChangeStartTime = -1;
  }

  private saveSettings(): void {
    const settings: any = {};

    Object.keys(defaultSettings).forEach(key => settings[key] = (this as any)[key]);

    if (!isEqual(this.lastSavedSettings, settings)) {
      localStorage.setItem('pac-settings', JSON.stringify(settings));
      this.lastSavedSettings = settings;
    }
  }

  private updateObserver(): void {
    this.observer = new SkyObserver(this._longitude, this._latitude);

    const loc = { latitude: this._latitude, longitude: this._longitude, name: '', zone: this._zone };
    const match = this.findMatchingLocation(loc);

    setTimeout(() => {
      if (match) {
        this.placeName = match.name;
        this.canEditName = (match.lastTimeUsed !== 0);
      }
      else {
        this.placeName = '';
        this.canEditName = true;
      }
    });
  }

  get background(): string { return this._background; }
  set background(value: string) {
    if (this._background !== value) {
      this._background = value;
      document.documentElement.style.setProperty('--background', value);
    }
  }

  get isoFormat(): boolean { return this._isoFormat; }
  set isoFormat(value: boolean) {
    if (this._isoFormat !== value) {
      this._isoFormat = value;
      this.clearTimingReferenceIfNeeded();
      this.updateTime();
    }
  }

  get collapsed(): boolean { return this._collapsed; }
  set collapsed(value: boolean) {
    if (this._collapsed !== value) {
      this._collapsed = value;

      if (this.initDone) {
        if ((document.activeElement as any)?.blur)
          (document.activeElement as any).blur();

        this.adjustFontScaling();
        this.graphicsRateChangeCheck(true);
        this.saveSettings();
      }
      else {
        this.collapsed = false;
        this.delayedCollapse = true;
      }
    }
  }

  get showInfoPanel(): boolean { return this._showInfoPanel; }
  set showInfoPanel(value: boolean) {
    if (this._showInfoPanel !== value) {
      this._showInfoPanel = value;

      if (this.initDone && this.collapsed) {
        this.adjustFontScaling();
        this.graphicsRateChangeCheck(true);
        this.saveSettings();
      }
    }
  }

  get appearance(): Appearance { return this._appearance; }
  set appearance(value: Appearance) {
    if (this.appearance !== value) {
      const wasEmptyCenter = this.emptyCenter;
      this._appearance = value;
      this.emptyCenter = (value === Appearance.ORIGINAL_1410);
      this.altFour = this.emptyCenter;
      this.globe?.setAppearance(value);

      if (this.emptyCenter !== wasEmptyCenter)
        setTimeout(() => this.adjustLatitude());
    }
  }

  get timing(): Timing { return this._timing; }
  set timing(value: Timing) {
    if (this._timing !== value) {
      this._timing = value;

      if (value === Timing.MODERN) {
        this.showErrors = false;
        this.showAllErrors = false;
        this.showRecalibration = false;
        this.dstChangeAllowed = true;
        this.timingReference = undefined;
      }
      else if (value === Timing.CONSTRAINED_SUN) {
        this.showErrors = true;
        this.showAllErrors = false;
        this.showRecalibration = false;
        this.dstChangeAllowed = true;
        this.timingReference = undefined;
      }
      else {
        this.showErrors = true;
        this.showAllErrors = true;
        this.showRecalibration = true;
        this.dstChangeAllowed = false;
        this.timingReference = RECOMPUTED_WHEN_NEEDED;
      }

      this.updateTime(true);
    }
  }

  private adjustFontScaling(): void {
    let fontScaler: number;

    if (window.innerHeight > window.innerWidth)
      fontScaler = max(min(window.innerHeight / 1100, 1), 0.75);
    else if (this.collapsed && window.innerWidth > 1100)
      fontScaler = max(min(window.innerWidth / 600, window.innerHeight / 500, 1), 0.75);
    else
      fontScaler = max(min((window.innerWidth - 500) / 600, (window.innerHeight - 400) / 400, 1), 0.75);

    document.documentElement.style.setProperty('--font-scaler', fontScaler.toPrecision(3));
  }

  private clearTimingReferenceIfNeeded(): void {
    if (this.timing !== Timing.MODERN)
      this.timingReference = RECOMPUTED_WHEN_NEEDED;
  }

  private adjustMechanicalTimingReference(): void {
    if (this.timing === Timing.MODERN) {
      this.timingReference = undefined;
      return;
    }

    const date = new DateTime(this.time, this.getZone());
    const wt = date.wallTime;
    let refTime: DateTime;
    let endTime: DateTime;

    if (this.timing === Timing.MECHANICAL_UPDATED) {
      refTime = new DateTime([wt.y, 1, 1], this.getZone());
      endTime = new DateTime([wt.y + 1, 1, 1], this.getZone());
    }
    else {
      refTime = new DateTime([wt.y, wt.m - (wt.m % 3), 1], this.getZone());
      endTime = new DateTime([wt.y, wt.m - (wt.m % 3), 1], this.getZone()).add('months', 3);
    }

    this.timingReference = calculateBasicPositions(refTime.utcMillis, this.getZone(), this.observer,
      this.disableDst, this.timing);
    this.lastWallTime = this.timingReference._date?.wallTime;
    this.timingReference._referenceTime = refTime.utcMillis;
    this.timingReference._endTime = endTime.utcMillis;
    this.lastRecalibration = refTime.format(this.isoFormat ? DATE :
      'IS{year:numeric,month:2-digit,day:2-digit}', specificLocale);
  }

  get additionalPlanets(): boolean { return this._additionalPlanets; }
  set additionalPlanets(value: boolean) {
    if (this._additionalPlanets !== value) {
      this._additionalPlanets = value;
      this.checkPlanetOverlaps();
    }
  }

  get realPositionMarkers(): boolean { return this._realPositionMarkers; }
  set realPositionMarkers(value: boolean) {
    if (this._realPositionMarkers !== value) {
      this._realPositionMarkers = value;
      this.checkPlanetOverlaps();
    }
  }

  get playing(): boolean { return this._playing; }
  set playing(value: boolean) {
    if (this._playing !== value) {
      this._playing = value;

      if (value) {
        this.trackTime = false;
        this.playTimeBase = this._time;
        this.playTimeProcessBase = processMillis();
        requestAnimationFrame(this.playStep);
      }
    }
  }

  play(): void {
    if (this.playSpeed !== PlaySpeed.NORMAL) {
      this.playing = false;
      this.playSpeed = PlaySpeed.NORMAL;
    }

    this.playing = true;
  }

  playFast(): void {
    if (this.playSpeed !== PlaySpeed.FAST) {
      this.playing = false;
      this.playSpeed = PlaySpeed.FAST;
    }

    this.playing = true;
  }

  stop(): void {
    if (this.playing) {
      this.playing = false;

      // Round time to the nearest whole minute when animation stops.
      if (this.playSpeed === PlaySpeed.FAST)
        this.time = floor((this.time + 30000) / 60000) * 60000;
    }
  }

  private playStep = (): void => {
    if (!this.playing)
      return;

    const elapsed = processMillis() - this.playTimeProcessBase;

    if (this.playSpeed === PlaySpeed.NORMAL)
      this.time = this.playTimeBase + floor(elapsed / 25) * 60_000;
    else
      this.time = this.playTimeBase + floor(elapsed / 100) *
        (this.animateBySiderealDays ? MILLIS_PER_SIDEREAL_DAY : MILLIS_PER_DAY);

    if (this.lastWallTime && this.lastWallTime.y === this.MAX_YEAR &&
        this.lastWallTime.m === 12 && this.lastWallTime.d === 31)
      this.stop();
    else
      requestAnimationFrame(this.playStep);
  }

  clearLocationItem(index: number): void {
    if (this.placeName === this.recentLocations[index].name)
      this.placeName = '';

    this.recentLocations.splice(index, 1);
    this.recentLocations = clone(this.recentLocations);
    this.sortRecentLocations();
  }

  clearRecents(): void {
    this.recentLocations = clone(defaultSettings.recentLocations);
    this.changeLocation(this.recentLocations[0]);
    this.saveSettings();
  }

  findMatchingLocation(location?: TzsLocation): TzsLocation {
    if (!location)
      location = { latitude: this._latitude, longitude: this._longitude, zone: this._zone, name: '' };

    for (const loc of this.recentLocations) {
      if (loc.zone === location.zone &&
          abs(loc.latitude - location.latitude) < 0.05 && abs(loc.longitude - location.longitude) < 0.05)
        return loc;
    }

    return null;
  }

  private menuItemById(id: string): MenuItem {
    return this.menuItems.find(item => item.id === id);
  }

  get suppressOsKeyboard(): boolean { return this._suppressOsKeyboard; }
  set suppressOsKeyboard(value: boolean) {
    if (this._suppressOsKeyboard !== value) {
      this._suppressOsKeyboard = value;
      this.updateMenu();
    }
  }

  get latitude(): number { return this._latitude; }
  set latitude(newValue: number) {
    if (this._latitude !== newValue) {
      this._latitude = newValue;

      if (this.initDone)
        this.adjustLatitude();
    }
  }

  get longitude(): number { return this._longitude; }
  set longitude(newValue: number) {
    if (this._longitude !== newValue) {
      this._longitude = newValue;
      this.localTimezone = Timezone.getTimezone('LMT', this.longitude);

      if (this.initDone) {
        this.placeName = '';
        this.updateObserver();
        this.clearTimingReferenceIfNeeded();
        this.updateTime(true);
        this.updateGlobe();
      }
    }
  }

  get zone(): string { return this._zone; }
  set zone(newValue: string) {
    if (this._zone !== newValue) {
      this._zone = newValue;

      if (this.initDone) {
        if (newValue === 'LMT') {
          const lon = this._longitude;

          this._longitude = undefined;
          this.longitude = lon;
        }
        else {
          this.placeName = '';
          this.updateObserver();
          this.clearTimingReferenceIfNeeded();
          this.updateTime(true);
        }
      }
    }
  }

  getZone(): string | Timezone {
    return (this.zone === 'LMT' ? this.localTimezone : this.zone);
  }

  get time(): number { return this._time; }
  set time(newValue: number) {
    if (this._time !== newValue) {
      this._time = newValue;

      if (this.initDone)
        this.updateTime();
    }
  }

  get trackTime(): boolean { return this._trackTime; }
  set trackTime(newValue: boolean) {
    if (this._trackTime !== newValue) {
      this._trackTime = newValue;

      if (newValue) {
        const timeStep = (): void => {
          this.setNow();
          this.timeCheck = setTimeout(timeStep, 59999 - Date.now() % 60000);
        };

        timeStep();
      }
      else if (this.timeCheck) {
        clearTimeout(this.timeCheck);
        this.timeCheck = undefined;
      }
    }
  }

  changeLocation(location: TzsLocation): void {
    if (this.zoneFixTimeout)
      clearTimeout(this.zoneFixTimeout);

    this.longitude = location.longitude;
    this.latitude = location.latitude;
    this.placeName = location.name;
    this.updateRecentLocations(location);
    this.zoneFixTimeout = setTimeout(() => {
      this.placeName = location.name;
      this.zone = location.zone;
      this.zoneFixTimeout = undefined;
    }, 250);
  }

  private updateRecentLocations(location: TzsLocation): void {
    const match = this.findMatchingLocation(location);

    if (match) {
      match.lastTimeUsed = (match.lastTimeUsed === 0 ? 0 : Date.now());
      match.latitude = location.latitude;
      match.longitude = location.longitude;
      match.name = location.name;
    }
    else {
      if (this.recentLocations.length >= MAX_SAVED_LOCATIONS)
        removeOldestLocation(this.recentLocations);

      location.lastTimeUsed = (location.lastTimeUsed === 0 ? 0 : Date.now());
      this.recentLocations.push(location);
    }

    this.sortRecentLocations();
  }

  private sortRecentLocations(): void {
    const sortTime = (time: number): number => time === 0 ? Number.MAX_SAFE_INTEGER : time;

    this.recentLocations.sort((a, b) => sortTime(b.lastTimeUsed) - sortTime(a.lastTimeUsed));
    this.recentLocations = clone(this.recentLocations);
  }

  setNow(): void {
    const newTime = floor(Date.now() / 60000) * 60000;

    if (this.time !== newTime) {
      this.time = newTime;

      if (this.playing) {
        this.playTimeBase = newTime;
        this.playTimeProcessBase = processMillis();
      }
    }
  }

  private clearZoneFixTimeout(): void {
    if (this.zoneFixTimeout) {
      clearTimeout(this.zoneFixTimeout);
      this.zoneFixTimeout = undefined;
    }
  }

  private adjustLatitude(): void {
    this.graphicsRateChangeCheck();
    this.clearZoneFixTimeout();
    this.updateObserver();
    this.clearTimingReferenceIfNeeded();
    adjustGraphicsForLatitude(this);
    this.placeName = '';
    this.updateTime(true);
    this.updateGlobe();
  }

  private graphicsRateChangeCheck(suppressFilteringImmediately = false): void {
    const now = processMillis();
    const resumeFiltering = (): void => {
      this.svgFilteringOn = true;
      this.graphicsChangeStartTime = -1;
      this.graphicsChangeStopTimer = undefined;
    };

    if (this.svgFilteringOn) {
      if (!suppressFilteringImmediately &&
          (this.graphicsChangeStartTime < 0 ||
           (this.graphicsChangeStartTime > 0 && now > this.graphicsChangeLastTime + START_FILTERING_DELAY) ||
           now > this.graphicsChangeLastTime + STOP_FILTERING_DELAY))
        this.graphicsChangeStartTime = now;
      else if (now > this.graphicsChangeStartTime + STOP_FILTERING_DELAY || suppressFilteringImmediately) {
        this.graphicsChangeStartTime = -1;

        if (!this.playing) {
          this.svgFilteringOn = false;
          this.graphicsChangeStopTimer = setTimeout(resumeFiltering, RESUME_FILTERING_DELAY);
        }
      }
    }
    else if (this.graphicsChangeStopTimer) {
      clearTimeout(this.graphicsChangeStopTimer);

      if (!this.playing)
        this.graphicsChangeStopTimer = setTimeout(resumeFiltering, RESUME_FILTERING_DELAY);
    }

    this.graphicsChangeLastTime = now;
  }

  private updateGlobe(): void {
    this.globe.orient(this._longitude, this.latitude).catch(noop);
  }

  updateTime(forceUpdate = false): void {
    if (!this.observer)
      return;

    this.graphicsRateChangeCheck();

    const jdu = julianDay(this.time);

    // Finding sunset events can be slow at high latitudes, so use cached values when possible.
    if (forceUpdate || !this.sunsetA || !this.sunsetB || jdu <= this.sunsetA.ut || jdu > this.sunsetB.ut) {
      this.sunsetA = this.eventFinder.findEvent(SUN, SET_EVENT, jdu, this.observer, undefined, undefined, true);
      this.sunsetB = this.eventFinder.findEvent(SUN, SET_EVENT, this.sunsetA.ut, this.observer,
        undefined, undefined, false);
    }

    const dayLength = this.sunsetB.ut - this.sunsetA.ut;
    const bohemianHour = (jdu - this.sunsetA.ut) / dayLength * 24;
    const basicPositions =
      calculateBasicPositions(this.time, this.getZone(), this.observer, this.disableDst, this.timing);
    const date = basicPositions._date;
    const wt = date.wallTime;
    const dateLocal = new DateTime(this.time, this.localTimezone);
    const jde = basicPositions._jde;
    const southern = this.self.southern;

    this.lastWallTime = basicPositions._date?.wallTime;
    forEach(basicPositions as any, (key, value) => basicPosKey(key) && ((this as any)['true_' + key] = value));

    this.mercuryAngle = adjustForEclipticWheel(solarSystem.getEclipticPosition(MERCURY, jde).longitude.degrees, southern);
    this.venusAngle = adjustForEclipticWheel(solarSystem.getEclipticPosition(VENUS, jde).longitude.degrees, southern);
    this.marsAngle = adjustForEclipticWheel(solarSystem.getEclipticPosition(MARS, jde).longitude.degrees, southern);
    this.jupiterAngle = adjustForEclipticWheel(solarSystem.getEclipticPosition(JUPITER, jde).longitude.degrees, southern);
    this.saturnAngle = adjustForEclipticWheel(solarSystem.getEclipticPosition(SATURN, jde).longitude.degrees, southern);

    if (this.timing !== Timing.MODERN && this.timing !== Timing.CONSTRAINED_SUN) {
      if (!this.timingReference || this.time < this.timingReference._referenceTime ||
          this.time >= this.timingReference._endTime)
        this.adjustMechanicalTimingReference();

      forEach(calculateMechanicalPositions(this.time, this.timing, this.timingReference) as any,
        (key, value) => basicPosKey(key) && ((this as any)[key] = value));
    }
    else {
      forEach(basicPositions as any, (key, value) => basicPosKey(key) && ((this as any)[key] = value));

      if (this.timing === Timing.CONSTRAINED_SUN)
        this.sunAngle = basicPositions._constrainedSunAngle;
    }

    const format = this.isoFormat ? DATETIME_LOCAL : 'ISS{year:numeric,month:2-digit,day:2-digit,hour:2-digit}';

    this.timeText = date.format(format, specificLocale);
    this.timeText = this.isoFormat ? this.timeText.replace('T', '\xA0') : this.timeText;
    this.outerRingAngle = 180 - (bohemianHour - basicPositions._hourOfDay) * 15;
    this.zoneOffset = 'UTC' + Timezone.formatUtcOffset(date.utcOffsetSeconds);
    this.localTime = formatTimeOfDay(date, this.isoFormat);
    this.localMeanTime = formatTimeOfDay(dateLocal, this.isoFormat);
    this.localSolarTime = formatTimeOfDay(this.observer.getApparentSolarTime(jdu).hours, this.isoFormat);
    this.siderealTime = formatTimeOfDay(mod(this.true_siderealAngle + 90, 360) / 15, true);
    this.siderealTimeOrloj = formatTimeOfDay(mod(this.siderealAngle + 90, 360) / 15, true);
    this.bohemianTime = formatTimeOfDay(bohemianHour, true, true); // Round to match rounded sunrise/sunset times

    this.errorMoon = mod2(this.moonAngle.orig - this.true_moonAngle.orig, 360);
    this.errorMoonDays = this.errorMoon / 360 * 27.321;
    this.errorPhase = mod2(this.moonPhase - this.true_moonPhase, 360) * this.rotateSign;
    this.errorPhaseDays = this.errorPhase / 360 * 29.53059;
    this.errorSun = mod2(this.sunAngle.orig - this.true_sunAngle.orig, 360);
    this.errorSunMinutes = this.errorSun / 360 * 1440;

    [this.sunrise, this.sunset] =
      this.extractRiseAndSetTimes(
        this.eventFinder.getRiseAndSetTimes(SUN, wt.year, wt.month, wt.day, this.observer, date.timezone));

    [this.moonrise, this.moonset] =
      this.extractRiseAndSetTimes(
        this.eventFinder.getRiseAndSetTimes(MOON, wt.year, wt.month, wt.day, this.observer, date.timezone));

    this.checkPlanetOverlaps();
  }

  private extractRiseAndSetTimes(events: AstroEvent[]): string[] {
    let rise = '';
    let set = '';

    if (events) {
      for (const evt of events) {
        const time = formatTimeOfDay(evt.eventTime, this.isoFormat);

        if (evt.eventType === RISE_EVENT)
          rise = extendDelimited(rise, time, ', ');
        else if (evt.eventType === SET_EVENT)
          set = extendDelimited(set, time, ', ');
      }
    }

    return [rise || '---', set || '---'];
  }

  private checkPlanetOverlaps(): void {
    const angles =
      [this.mercuryAngle.oe, this.venusAngle.oe, this.marsAngle.oe, this.jupiterAngle.oe,
       this.saturnAngle.oe, -999, -999];

    if (this.realPositionMarkers) {
      angles[5] = this.true_sunAngle.oe;
      angles[6] = this.true_moonAngle.oe;
    }

    this.overlapShift.fill(0);

    for (let i = 0; i <= 4; ++i) {
      let maxShift = 0;
      const angle = angles[i];

      for (let j = i + 1; j <= 6; ++j) {
        if (abs(mod2(angle - angles[j], 360)) < 2.5)
          maxShift = max((this.overlapShift[j] || 0) + 3, maxShift);
      }

      this.overlapShift[i] = maxShift;
    }
  }

  eclipticTransform(): string {
    return this.rotate(this.siderealAngle) + (this.self.southern ? ' scale(1, -1)' : '');
  }

  rotate(angle: number): string {
    return `rotate(${angle * this.rotateSign})`;
  }

  reorient(angle: AngleTriplet): string {
    return isSafari() ? null : this.self.southern ?
      `scale(-1, 1) rotate(${90 + angle.orig - angle.oe})` : `rotate(${90 - angle.orig - angle.oe})`;
  }

  sunlitMoonPath(): string {
    return sunlitMoonPath(this);
  }

  checkIfTimeIsEditable(): void {
    if (!this.trackTime)
      return;

    this.confirmService.confirm({
      message: $localize`Turn off "Track current time" so you can edit the time?`,
      accept: () => this.trackTime = false
    });
  }

  private setEventType(eventType: EventType): void {
    if (this.eventType !== eventType) {
      this.eventType = eventType;
      this.updateMenu();
    }
  }

  private updateMenu(): void {
    this.menuItems = clone(this.menuItems);
    this.menuItems.forEach((item, index) => {
      if (index < 3)
        item.icon = (index === this.eventType ? 'pi pi-check' : 'pi pi-circle');
    });

    if (this.menuItemById('sok'))
      this.menuItemById('sok').icon = (this.suppressOsKeyboard ? 'pi pi-check' : 'pi pi-circle');
  }

  editName(): void {
    this.canEditName = false;
    this.canSaveName = true;
    this.inputName = this.placeName || '';
    this.inputLength = this.inputName.trim().length;

    setTimeout(() => document.getElementById('name-input')?.focus());
  }

  inputChanged(evt: any): void {
    this.inputName = (evt.target as HTMLInputElement).value || '';
    this.inputLength = this.inputName.trim().length;
  }

  saveName(): void {
    if (!this.inputLength)
      return;

    this.canEditName = true;
    this.canSaveName = false;
    this.placeName = this.inputName.trim();

    const match = this.findMatchingLocation();

    if (match) {
      match.name = this.placeName;
      match.lastTimeUsed = Date.now();
    }
    else {
      if (this.recentLocations.length >= MAX_SAVED_LOCATIONS)
        removeOldestLocation(this.recentLocations);

      this.recentLocations.push({
        lastTimeUsed: Date.now(),
        latitude: this._latitude,
        longitude: this._longitude,
        name: this.placeName,
        zone: this._zone
      });
    }

    this.sortRecentLocations();
  }

  cancelEdit(): void {
    this.canEditName = true;
    this.canSaveName = false;
  }

  eventClick(evt?: TouchEvent | MouseEvent, goBack = false): void {
    if (!evt)
      this.stopEventClickTimer();
    else if (evt?.type === 'touchstart' || evt?.type === 'mousedown') {
      if (evt.type === 'touchstart' && evt.cancelable)
        evt.preventDefault();

      this.eventGoBack = goBack;

      if (!this.eventClickTimer) {
        this.eventClickTimer = timer(CLICK_REPEAT_DELAY, CLICK_REPEAT_RATE).subscribe(() => {
          this.skipToEvent(this.eventGoBack);
        });
      }
    }
    else if (evt?.type === 'touchend' || evt?.type === 'mouseup') {
      if (evt.type === 'touchend' && evt.cancelable)
        evt.preventDefault();

      if (this.eventClickTimer) {
        this.stopEventClickTimer();
        this.skipToEvent(this.eventGoBack);
      }
    }
  }

  private stopEventClickTimer(): void {
    if (this.eventClickTimer) {
      this.eventClickTimer.unsubscribe();
      this.eventClickTimer = undefined;
    }
  }

  private skipToEvent(previous: boolean): void {
    if (this.trackTime) {
      this.stopEventClickTimer();
      this.confirmService.confirm({
        message: $localize`Turn off "Track current time" and change the clock time?`,
        accept: () => {
          this.trackTime = false;
          this.skipToEvent(previous);
        }
      });

      return;
    }

    const jdu = julianDay(this.time);
    let eventsToCheck: number[] = [];
    const eventsFound: AstroEvent[] = [];

    switch (this.eventType) {
      case EventType.EQUISOLSTICE:
        eventsToCheck = [SPRING_EQUINOX, SUMMER_SOLSTICE, FALL_EQUINOX, WINTER_SOLSTICE];
        break;
      case EventType.MOON_PHASE:
        eventsToCheck = [NEW_MOON, FIRST_QUARTER, FULL_MOON, LAST_QUARTER];
        break;
      case EventType.RISE_SET:
        eventsToCheck = [RISE_EVENT, TRANSIT_EVENT, SET_EVENT];
        break;
    }

    for (const eventType of eventsToCheck) {
      const evt = this.eventFinder.findEvent(SUN, eventType, jdu, this.observer, undefined, undefined, previous);

      if (evt)
        eventsFound.push(evt);
    }

    eventsFound.sort((a, b) => previous ? b.ut - a.ut : a.ut - b.ut);

    if (eventsFound.length > 0) {
      const evt = eventsFound[0];
      const eventText = AppComponent.translateEvent(evt.eventText);
      const year = new DateTime(evt.eventTime.utcMillis, this.zone).wallTime.year;

      this.messageService.clear();

      if (year < this.MIN_YEAR || year > this.MAX_YEAR)
        this.messageService.add({ severity: 'error', summary: $localize`Event`,
                                  detail: $localize`Event outside of ${this.MIN_YEAR}-${this.MAX_YEAR} year range.` });
      else {
        this.time = evt.eventTime.utcMillis;
        this.messageService.add({ severity: 'info', summary: $localize`Event`, detail: eventText });
      }
    }
  }

  private static translateEvent(text: string): string {
    if (text.match(/\brise\b/i))
      return $localize`Sunrise`;
    else if (text.match(/\bset\b/i))
      return $localize`Sunset`;
    else if (text.match(/\btransit\b/i))
      return $localize`Transit`;
    else if (text.match(/\bvernal equinox\b/i))
      return $localize`Vernal equinox`;
    else if (text.match(/\bsummer solstice\b/i))
      return $localize`Summer solstice`;
    else if (text.match(/\bautumnal equinox\b/i))
      return $localize`Autumnal equinox`;
    else if (text.match(/\bwinter solstice\b/i))
      return $localize`Winter Solstice`;
    else if (text.match(/\bnew moon\b/i))
      return $localize`New moon`;
    else if (text.match(/\b(1st|first)\b/i))
      return $localize`First quarter`;
    else if (text.match(/\bfull moon\b/i))
      return $localize`Full moon`;
    else if (text.match(/\b(3rd|third)\b/i))
      return $localize`Third quarter`;
    else
      return text;
  }
}
