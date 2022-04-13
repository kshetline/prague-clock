import { Component, OnInit, ViewChild } from '@angular/core';
import { ConfirmationService, MenuItem, MessageService, PrimeNGConfig } from 'primeng/api';
import {
  abs, atan2_deg, atan_deg, cos_deg, floor, max, min, mod, mod2, PI, Point, sign, sin_deg, sqrt, tan_deg
} from '@tubular/math';
import { clone, extendDelimited, forEach, getCssValue, isEqual, isLikelyMobile, isObject, isSafari, processMillis } from '@tubular/util';
import { AngleStyle, DateTimeStyle, TimeEditorOptions } from '@tubular/ng-widgets';
import {
  AstroEvent, EventFinder, FALL_EQUINOX, FIRST_QUARTER, FULL_MOON, JUPITER, LAST_QUARTER, MARS, MERCURY, MOON,
  NEW_MOON, RISE_EVENT, SATURN, SET_EVENT, SkyObserver, SolarSystem, SPRING_EQUINOX, SUMMER_SOLSTICE, SUN,
  TRANSIT_EVENT, VENUS, WINTER_SOLSTICE
} from '@tubular/astronomy';
import ttime, { DateAndTime, DateTime, Timezone, utToTdt } from '@tubular/time';
import { TzsLocation } from '../timezone-selector/timezone-selector.component';
import { Globe } from '../globe/globe';
import { languageList, localeSuffix, SOUTH_NORTH, specificLocale, WEST_EAST } from '../locales/locale-info';
import { faForward, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import { AdvancedOptionsComponent, SettingsHolder, Timing } from '../advanced-options/advanced-options.component';

const { DATE, DATETIME_LOCAL, julianDay, TIME } = ttime;

const CLOCK_RADIUS = 250;
const INCLINATION = 23.5;
const ARCTIC = 90 - INCLINATION;
const LABEL_RADIUS = 212;
const EQUATOR_RADIUS = 164.1;
const HORIZON_RADIUS = CLOCK_RADIUS * tan_deg((90 - INCLINATION) / 2);
const TROPIC_RADIUS = HORIZON_RADIUS * tan_deg((90 - INCLINATION) / 2);
const ECLIPTIC_INNER_RADIUS = 161;
// const ECLIPTIC_OUTER_RADIUS = 178.9;
const ECLIPTIC_CENTER_OFFSET = 71.1;
const MAX_UNEVEN_HOUR_LATITUDE = 86;
const RESUME_FILTERING_DELAY = 1000;
const START_FILTERING_DELAY = 500;
const STOP_FILTERING_DELAY = isSafari() ? 1000 : 3000;
const MILLIS_PER_DAY = 86_400_000;
const RECOMPUTED_WHEN_NEEDED: null = null;

interface CircleAttributes {
  cy: number;
  d?: string;
  r: number;
}

enum EventType { EQUISOLSTICE, MOON_PHASE, RISE_SET }
enum PlaySpeed { NORMAL, FAST }

const MAX_SAVED_LOCATIONS = 10;

const prague = $localize`Prague, CZE`;
const defaultSettings = {
  additionalPlanets: false,
  background: '#4D4D4D',
  collapsed: false,
  detailedMechanism: false,
  disableDst: true,
  eventType: EventType.EQUISOLSTICE,
  fasterGraphics: true,
  hideMap: false,
  isoFormat: false,
  latitude: 50.0870,
  longitude: 14.4185,
  placeName: prague,
  post2018: true,
  realPositionMarkers: false,
  recentLocations: [{
    lastTimeUsed: 0,
    latitude: 50.0870,
    longitude: 14.4185,
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

function circleIntersections(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): Point[] {
  // See https://planetcalc.com/8098/
  if (x1 === x2 && y1 === y2 && r1 === r2)
    return null;
  else if (r1 === 0 && r2 === 0)
    return [];

  const d = sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);

  if (d === 0 || d > r1 + r2 || d < abs(r1 - r2))
    return [];

  const a = (r1 ** 2 - r2 ** 2 + d ** 2) / 2 / d;
  const h = sqrt(max(r1 ** 2 - a ** 2, 0));
  const x3 = x1 + a * (x2 - x1) / d;
  const y3 = y1 + a * (y2 - y1) / d;

  if (h === 0)
    return [{ x: x3, y: y3 }];

  return [
    { x: x3 + h * (y2 - y1) / d, y: y3 - h * (x2 - x1) / d },
    { x: x3 - h * (y2 - y1) / d, y: y3 + h * (x2 - x1) / d }
  ];
}

function findCircleRadius(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): number {
  // See https://www.geeksforgeeks.org/equation-of-circle-when-three-points-on-the-circle-are-given/
  const x12 = x1 - x2;
  const x13 = x1 - x3;

  const y12 = y1 - y2;
  const y13 = y1 - y3;

  const y31 = y3 - y1;
  const y21 = y2 - y1;

  const x31 = x3 - x1;
  const x21 = x2 - x1;

  const sx13 = x1 ** 2 - x3 ** 2;

  const sy13 = y1 ** 2 - y3 ** 2;

  const sx21 = x2 ** 2 - x1 ** 2;
  const sy21 = y2 ** 2 - y1 ** 2;

  const f = ((sx13) * (x12)
           + (sy13) * (x12)
           + (sx21) * (x13)
           + (sy21) * (x13))
          / (2 * ((y31) * (x12) - (y21) * (x13)));
  const g = ((sx13) * (y12)
           + (sy13) * (y12)
           + (sx21) * (y13)
           + (sy21) * (y13))
          / (2 * ((x31) * (y12) - (x21) * (y13)));

  const c = -(x1 ** 2) - y1 ** 2 - 2 * g * x1 - 2 * f * y1;

  // eqn of circle be x^2 + y^2 + 2*g*x + 2*f*y + c = 0
  // where centre is (h = -g, k = -f) and radius r
  // as r^2 = h^2 + k^2 - c
  const h = -g;
  const k = -f;
  const sqr_of_r = h * h + k * k - c;

  return sqrt(sqr_of_r);
}

interface AngleTriplet {
  ie: number; // outer ecliptic
  oe?: number; // outer ecliptic
  orig: number;
}

const ZeroAngles: AngleTriplet = { ie: 0, oe: 0, orig: 0 };

function adjustForEclipticWheel(angle: number): AngleTriplet {
  return {
    orig: angle,
    ie: mod2(90 - angle + cos_deg(angle) * 26.6, 360),
    oe: mod2(90 - angle + cos_deg(angle) * 23.97, 360)
  };
}

function revertEcliptic(angle: number): number {
  let a = mod2(angle, 360);

  if (a < -160)
    a += 360;

  return 90
    - 6.6332233812159713E-01 * a
    + 2.3389691314831506E-11 * a ** 2
    - 1.5792576669476430E-05 * a ** 3
    - 6.0222139948410238E-15 * a ** 4
    + 1.5070052507741876E-09 * a ** 5
    + 5.9520108482720510E-19 * a ** 6
    - 9.5776714390600572E-14 * a ** 7
    - 2.8435133497605280E-23 * a ** 8
    + 2.4104018034444760E-18 * a ** 9
    + 7.0399683226780882E-28 * a ** 10
    - 2.5620395767654543E-23 * a ** 11
    - 8.6947165717662011E-33 * a ** 12
    + 9.5219686117688832E-29 * a ** 13
    + 4.2345499213097502E-38 * a ** 14;
}

function bpKey(key: string): boolean { return !key.startsWith('_'); }

interface BasicPositions {
  _date?: DateTime;
  _endTime?: number;
  _hourOfDay?: number;
  _jde?: number;
  _jdu?: number;
  _referenceTime?: number;
  handAngle: number;
  moonAngle: AngleTriplet;
  moonHandAngle: number;
  moonPhase: number;
  siderealAngle: number;
  sunAngle: AngleTriplet;
}

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

menuLanguageList.push({ label: $localize`Default` });
menuLanguageList.push({ separator: true });
languageList.forEach(language => menuLanguageList.push({ label: language }));

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, SettingsHolder {
  faForward = faForward;
  faPlay = faPlay;
  faStop = faStop;

  DD = AngleStyle.DD;
  DDD = AngleStyle.DDD;
  FAST = PlaySpeed.FAST;
  MODERN = Timing.MODERN;
  MAX_YEAR = 2399;
  MIN_YEAR = 1400;
  NORMAL = PlaySpeed.NORMAL;
  SOUTH_NORTH = SOUTH_NORTH;
  specificLocale = specificLocale;
  toZodiac = (angle: number): string => '♈♉♊♋♌♍♎♏♐♑♒♓'.charAt(floor(mod(angle, 360) / 30));
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
  private _background = '#4D4D4D';
  private _collapsed = false;
  private delayedCollapse = false;
  private eventFinder = new EventFinder();
  private eventType = EventType.EQUISOLSTICE;
  private globe: Globe
  private graphicsChangeLastTime = -1;
  private graphicsChangeStartTime = -1;
  private graphicsChangeStopTimer: any;
  private _hideMap = false;
  private initDone = false;
  private _isoFormat = false;
  private lastSavedSettings: any = null;
  private lastWallTime: DateAndTime;
  private _latitude = 50.0870;
  private _longitude = 14.4185;
  private localTimezone = Timezone.getTimezone('LMT', this._longitude);
  private observer: SkyObserver;
  private _playing = false;
  private playTimeBase: number;
  private playTimeProcessBase: number;
  private _post2018 = false;
  private _realPositionMarkers = false;
  private solarSystem = new SolarSystem();
  private sunsetA: AstroEvent = null;
  private sunsetB: AstroEvent = null;
  private _suppressOsKeyboard = false;
  private _time = 0;
  private timeCheck: any;
  private _timing = Timing.MODERN;
  private timingReference: BasicPositions| null | undefined;
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
    { label: $localize`Language`, items: menuLanguageList },
    { label: $localize`Advanced options...`, icon: 'pi pi-circle', command: (): void => this.advancedOptions?.show() },
    { separator : true },
    { label: $localize`Code on GitHub`, icon: 'pi pi-github', url: 'https://github.com/kshetline/prague-clock' },
    { label: $localize`About the real clock`, icon: 'pi pi-info-circle',
      url: $localize`:Language-specific Wikipedia URL:https://en.wikipedia.org/wiki/Prague_astronomical_clock` },
    { label: $localize`About this simulator`, icon: 'pi pi-info-circle',
      url: `assets/about${localeSuffix}.html` }
  ];

  bohemianTime = '';
  canEditName = false;
  canSaveName = false;
  darkCy: number;
  darkR: number;
  dayAreaMask: string;
  dawnDuskFontSize = '15px';
  dawnLabelPath: string;
  dawnTextOffset: number;
  detailedMechanism = false;
  disableDst = true;
  duskGradientAdjustment = 80;
  duskLabelPath: string;
  duskTextOffset: number;
  equatorSunriseAngle: number = null;
  errorMoon = 0;
  errorMoonDays = 0;
  errorPhase = 0;
  errorPhaseDays = 0;
  errorSun = 0;
  errorSunMinutes = 0;
  fasterGraphics = true;
  handAngle = 0;
  hourStroke = 2;
  horizonCy: number;
  horizonPath: string;
  horizonR: number;
  hourArcs: string[] = [];
  hourWedges: string[] = [];
  innerSunriseAngle: number = null;
  inputLength = 0;
  inputName: string;
  jupiterAngle = ZeroAngles;
  lastHeight = -1;
  lastRecalibration = '';
  localMeanTime = '';
  localSolarTime = '';
  localTime = '';
  marsAngle = ZeroAngles;
  midnightSunR = 0;
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
  riseSetFontSize = '15px';
  rotateSign = 1;
  saturnAngle = ZeroAngles;
  showErrors = false;
  showInfoPanel = false;
  siderealAngle = 0;
  siderealTime = '';
  siderealTimeOrloj = '';
  solNoctisPath = '';
  southern = false;
  sunAngle = ZeroAngles;
  sunrise: string;
  sunriseLabelPath: string;
  sunset: string;
  sunsetLabelPath: string;
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
    return this.fasterGraphics &&  (!this.svgFilteringOn || this.playing) ? null : 'url("#filterRelief")';
  }

  constructor(
    private confirmService: ConfirmationService,
    private messageService: MessageService,
    private primeNgConfig: PrimeNGConfig
  ) {
    let settings: any;

    if (isLikelyMobile()) {
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
    this.globe.setColorScheme(this.post2018);
    this.globe.setHideMap(this.hideMap);
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

    let lastW = window.innerWidth;
    let lastH = window.innerHeight;

    const poll = (): void => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const disallowScroll = docElem.style.overflow === 'hidden';

      if (lastW !== w || lastH !== h || (disallowScroll && (docElem.scrollTop !== 0 || docElem.scrollLeft !== 0))) {
        lastW = w;
        lastH = h;
        doResize();
      }

      setTimeout(poll, 100);
    };

    poll();
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

        this.graphicsRateChangeCheck(true);
        this.saveSettings();
      }
      else {
        this.collapsed = false;
        this.delayedCollapse = true;
      }
    }
  }

  get post2018(): boolean { return this._post2018; }
  set post2018(value: boolean) {
    if (this._post2018 !== value) {
      this._post2018 = value;
      this.globe?.setColorScheme(value);
    }
  }

  get hideMap(): boolean { return this._hideMap; }
  set hideMap(value: boolean) {
    if (this._hideMap !== value) {
      this._hideMap = value;
      this.globe?.setHideMap(value);
    }
  }

  get timing(): Timing { return this._timing; }
  set timing(value: Timing) {
    if (this._timing !== value) {
      this._timing = value;

      if (value !== Timing.MODERN) {
        this.showErrors = true;
        this.timingReference = RECOMPUTED_WHEN_NEEDED;
      }
      else {
        this.showErrors = false;
        this.timingReference = undefined;
      }

      this.updateTime(true);
    }
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

    const date = new DateTime(this.time, this.zone);
    const wt = date.wallTime;
    let refTime: DateTime;
    let endTime: DateTime;

    if (this.timing === Timing.MECHANICAL_UPDATED) {
      refTime = new DateTime([wt.y, 1, 1], this.zone);
      endTime = new DateTime([wt.y + 1, 1, 1], this.zone);
    }
    else {
      refTime = new DateTime([wt.y, wt.m - (wt.m % 3), 1], this.zone);
      endTime = new DateTime([wt.y, wt.m - (wt.m % 3), 1], this.zone).add('months', 3);
    }

    this.timingReference = this.calculateBasicPositions(refTime.utcMillis);
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
    this.playing = false;
  }

  private playStep = (): void => {
    if (!this.playing)
      return;

    const elapsed = processMillis() - this.playTimeProcessBase;

    if (this.playSpeed === PlaySpeed.NORMAL)
      this.time = this.playTimeBase + floor(elapsed / 25) * 60_000;
    else
      this.time = this.playTimeBase + floor(elapsed / 100) * MILLIS_PER_DAY;

    if (this.lastWallTime && this.lastWallTime.y === this.MAX_YEAR && this.lastWallTime.m === 12 && this.lastWallTime.d === 31)
      this.stop();
    else
      requestAnimationFrame(this.playStep);
  }

  clearItem(index: number): void {
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
        this.placeName = '';
        this.updateObserver();
        this.clearTimingReferenceIfNeeded();
        this.updateTime(true);
      }
    }
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

    this.southern = (this._latitude < 0);
    this.rotateSign = (this.southern ? -1 : 1);
    this.clearTimingReferenceIfNeeded();
    this.updateObserver();
    this.placeName = '';
    ({ cy: this.horizonCy, d: this.horizonPath, r: this.horizonR } = this.getAltitudeCircle(0, true));
    ({ cy: this.darkCy, r: this.darkR } = this.getAltitudeCircle(-18));

    const absLat = abs(this._latitude);
    const excessLatitude = absLat - ARCTIC;

    if (excessLatitude < 0) {
      this.midnightSunR = 0;
      this.solNoctisPath = '';
      this.createDayAreaMask(CLOCK_RADIUS);
    }
    else {
      this.midnightSunR = this.horizonR + this.horizonCy - 1E-4;

      const r = (this.midnightSunR + CLOCK_RADIUS) / 2;
      const x1 = cos_deg(105) * r;
      const y1 = sin_deg(105) * r;
      const x2 = cos_deg(75) * r;
      const y2 = sin_deg(75) * r;

      this.solNoctisPath = `M ${x1} ${y1} A ${r} ${r} 0 0 0${x2} ${y2}`;
      this.createDayAreaMask(this.midnightSunR);
    }

    if (this.outerSunriseAngle != null && absLat <= MAX_UNEVEN_HOUR_LATITUDE) {
      for (let h = 1; h <= 11; ++h) {
        this.hourArcs[h] = this.getHourArc(h);
        this.hourWedges[h] = this.getHourArc(h, true);
      }

      this.sunriseLabelPath = this.getHourArc(0.5);
      this.sunsetLabelPath = this.getHourArc(11.5, false, true);

      const top = (this.horizonCy - this.horizonR + this.darkCy - this.darkR) / 2;
      const bottom = (this.horizonCy + this.horizonR + this.darkCy + this.darkR) / 2;
      const r = (this.horizonR + this.darkR) / 2;
      const leftArc = `M 0 ${bottom} A ${r} ${r} 0 0 1 0 ${top}`;
      const rightArc = `M 0 ${top} A ${r} ${r} 0 0 1 0 ${bottom}`;
      const pathLength = r * PI;
      const labelShift = 250 - cos_deg(this._latitude) * 70;

      this.dawnLabelPath = this.southern ? rightArc : leftArc;
      this.dawnTextOffset = this.southern ? labelShift : pathLength - labelShift;
      this.duskLabelPath = this.southern ? leftArc : rightArc;
      this.duskTextOffset = this.southern ? pathLength - labelShift : labelShift;

      if (excessLatitude <= 0) {
        this.hourStroke = 2;
        this.riseSetFontSize = '15px';
      }
      else {
        this.hourStroke = 1;
        this.riseSetFontSize = (cos_deg(absLat) * 37.6).toFixed(1) + 'px';
      }
    }
    else {
      this.hourArcs = [];
      this.hourStroke = 2;
      this.hourWedges = [];
      this.dawnLabelPath = this.duskLabelPath = this.sunriseLabelPath = this.sunsetLabelPath = '';
    }

    const hourLabels = document.getElementById('unequalHourLabels') as unknown as SVGGElement;
    const pts = circleIntersections(0, 0, LABEL_RADIUS, 0, this.horizonCy, this.horizonR);
    const hAdj1 = [0, 3, -3, -7, -9, -9, -9, -12, -14, -13, -9, -3, 5];
    const vAdj1 = [0, 30, 27, 23, 19, 16, 12, 9, 3, -4, -9, -14, -17];
    const hAdj2 = [0, 15, 12, 0, -12, -20, -9, -5, -5, 0, 0, 8, 20];
    const vAdj2 = [0, 30, 27, 42, 38, 25, 12, 9, 6, 5, -5, -14, -24];

    if (this.outerSunriseAngle == null || !pts || pts.length < 2 || absLat > 74)
      hourLabels.innerHTML = '';
    else {
      const sunrise = atan2_deg(pts[0].y, pts[0].x);
      const step = (180 + sunrise * 2) / 12;
      let angle = -180 - sunrise + step;
      let html = '';

      for (let h = 1; h <= 12; ++h, angle += step) {
        const x = cos_deg(angle) * LABEL_RADIUS;
        const y = sin_deg(angle) * LABEL_RADIUS;
        let hAdj = hAdj1[h];
        let vAdj = vAdj1[h];
        let fontSize = 30;

        if (absLat > ARCTIC) {
          if (h === 1)
            hAdj = 0.0555555556 * absLat ** 3 - 11.55555557 * absLat ** 2 + 801.5416677 * absLat - 18521.50002;
          else if (h === 12)
            hAdj = 0.1666666669 * absLat ** 3 - 34.50000004 * absLat ** 2 + 2379.958336 * absLat - 54688.87507;
          else
            hAdj = hAdj2[h];

          vAdj = vAdj2[h];
          fontSize = 20;
        }
        else if (absLat > 50) {
          const wgt = (ARCTIC - absLat) / (ARCTIC - 50);

          hAdj = hAdj * wgt + hAdj2[h] * (1 - wgt);
          vAdj = vAdj * wgt + vAdj2[h] * (1 - wgt);
          fontSize = 30 * wgt + 20 * (1 - wgt);
        }

        html += `<text x="${x}" y="${y}" dx="${hAdj}" dy="${vAdj}" class="unequalHourText"`;

        if (fontSize !== 30 && (h < 4 || h > 9))
          html += ` style="font-size: ${fontSize}px"`;

        html += `>${this.southern ? 13 - h : h}</text>`;
      }

      hourLabels.innerHTML = html;
    }

    this.adjustDawnDuskGradient();
    this.updateTime(true);
    this.updateGlobe();
  }

  private adjustDawnDuskGradient(): void {
    // Adjust radial gradient based on the rough distance between the horizon circle and then
    // absolute night circle, in comparison to the horizon circle radius.
    const gp1 = (circleIntersections(0, 0, EQUATOR_RADIUS, 0, this.horizonCy, this.horizonR) ?? [])[0];
    const gp2 = (circleIntersections(0, 0, EQUATOR_RADIUS, 0, this.darkCy, this.darkR) ?? [])[0];
    let span = this.horizonR / 3;

    if (gp1 && gp2)
      span = sqrt((gp2.x - gp1.x) ** 2 + (gp2.y - gp1.y) ** 2);

    span = min(span, this.horizonR - this.darkR);
    this.duskGradientAdjustment = max(min((1 - span / this.horizonR) * 100, 99.6), 80);
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
    this.globe.orient(this._longitude, this.latitude).finally();
  }

  private createDayAreaMask(outerR: number): void {
    let inner = TROPIC_RADIUS;

    if (outerR !== CLOCK_RADIUS) {
      const deltaLat = 90 - 2 * atan_deg(outerR / CLOCK_RADIUS);
      inner = TROPIC_RADIUS * tan_deg((90 + deltaLat) / 2);
    }

    let outerPoints = circleIntersections(0, 0, outerR, 0, this.horizonCy, this.horizonR);
    const equatorPoints = circleIntersections(0, 0, EQUATOR_RADIUS, 0, this.horizonCy, this.horizonR);
    let innerPoints = circleIntersections(0, 0, inner, 0, this.horizonCy, this.horizonR);

    if (!outerPoints || outerPoints.length < 2)
      outerPoints = circleIntersections(0, 0, outerR - 1E-6, 0, this.horizonCy, this.horizonR);

    if (!innerPoints || innerPoints.length < 2)
      innerPoints = circleIntersections(0, 0, inner + 1E-6, 0, this.horizonCy, this.horizonR);

    if (!outerPoints || outerPoints.length < 2 || !innerPoints || innerPoints.length < 2 ||
        abs(this._latitude) > MAX_UNEVEN_HOUR_LATITUDE) {
      this.dayAreaMask = '';
      this.outerSunriseAngle = null;
      return;
    }

    const x1 = outerPoints[0].x;
    const y1 = outerPoints[0].y;
    const r2 = this.horizonR;
    const x2 = innerPoints[0].x;
    const y2 = innerPoints[0].y;
    const r3 = inner;
    const x3 = innerPoints[1].x;
    const y3 = innerPoints[1].y;
    const r4 = this.horizonR;
    const x4 = outerPoints[1].x;
    const y4 = outerPoints[1].y;
    const r5 = outerR;

    this.dayAreaMask = `M${x1} ${y1} A${r2} ${r2} 0 0 0 ${x2} ${y2}`;

    if (outerR === CLOCK_RADIUS)
      this.dayAreaMask += `A${r3} ${r3} 0 0 0 ${x3} ${y3} `;

    this.dayAreaMask += `A${r4} ${r4} 0 0 0 ${x4} ${y4}A${r5} ${r5} 0 1 1 ${x1} ${y1}`;

    this.outerSunriseAngle = atan2_deg(y1, x1);
    this.innerSunriseAngle = atan2_deg(y2, x2);
    this.equatorSunriseAngle = atan2_deg(equatorPoints[0].y, equatorPoints[0].x);
  }

  updateTime(forceUpdate = false): void {
    if (!this.observer)
      return;

    this.graphicsRateChangeCheck();

    const jdu = julianDay(this.time);

    // Finding sunset events can be slow at high latitudes, so use cached values when possible.
    if (forceUpdate || !this.sunsetA || !this.sunsetB || jdu <= this.sunsetA.ut || jdu > this.sunsetB.ut) {
      this.sunsetA = this.eventFinder.findEvent(SUN, SET_EVENT, jdu, this.observer, undefined, undefined, true);
      this.sunsetB = this.eventFinder.findEvent(SUN, SET_EVENT, this.sunsetA.ut, this.observer, undefined, undefined, false);
    }

    const dayLength = this.sunsetB.ut - this.sunsetA.ut;
    const bohemianHour = (jdu - this.sunsetA.ut) / dayLength * 24;
    const basicPositions = this.calculateBasicPositions(this.time);
    const date = basicPositions._date;
    const wt = date.wallTime;
    const dateLocal = new DateTime(this.time, this.localTimezone);
    const jde = basicPositions._jde;

    forEach(basicPositions as any, (key, value) => bpKey(key) && ((this as any)['true_' + key] = value));

    this.mercuryAngle = adjustForEclipticWheel(this.solarSystem.getEclipticPosition(MERCURY, jde).longitude.degrees);
    this.venusAngle = adjustForEclipticWheel(this.solarSystem.getEclipticPosition(VENUS, jde).longitude.degrees);
    this.marsAngle = adjustForEclipticWheel(this.solarSystem.getEclipticPosition(MARS, jde).longitude.degrees);
    this.jupiterAngle = adjustForEclipticWheel(this.solarSystem.getEclipticPosition(JUPITER, jde).longitude.degrees);
    this.saturnAngle = adjustForEclipticWheel(this.solarSystem.getEclipticPosition(SATURN, jde).longitude.degrees);

    if (this.timing !== Timing.MODERN) {
      if (!this.timingReference || this.time < this.timingReference._referenceTime ||
          this.time >= this.timingReference._endTime)
        this.adjustMechanicalTimingReference();

      forEach(this.calculateMechanicalPositions(this.time, this.timingReference) as any,
        (key, value) => bpKey(key) && ((this as any)[key] = value));
    }
    else
      forEach(basicPositions as any, (key, value) => bpKey(key) && ((this as any)[key] = value));

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
      [this.mercuryAngle.oe, this.venusAngle.oe, this.marsAngle.oe, this.jupiterAngle.oe, this.saturnAngle.oe, -999, -999];

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

  private calculateBasicPositions(time: number): BasicPositions {
    const _jdu = julianDay(time);
    const _jde = utToTdt(_jdu);
    const _date = new DateTime(time, this.zone);
    const wt = this.lastWallTime = _date.wallTime;
    const _hourOfDay = wt.hour + wt.minute / 60 -
      (this.disableDst || this.timing !== Timing.MODERN ? wt.dstOffset / 3600 : 0);
    const handAngle = _hourOfDay * 15 - 180;
    const baseSunAngle = this.solarSystem.getEclipticPosition(SUN, _jde).longitude.degrees;
    const baseMoonAngle = this.solarSystem.getEclipticPosition(MOON, _jde).longitude.degrees;
    const sunAngle = adjustForEclipticWheel(baseSunAngle);
    const moonAngle = adjustForEclipticWheel(baseMoonAngle);
    const siderealAngle = this.observer.getLocalHourAngle(_jdu, true).degrees - 90;
    const moonPhase = mod((baseMoonAngle - baseSunAngle) * this.rotateSign, 360);
    const moonHandAngle = AppComponent.calculateMoonHandAngle(moonAngle.ie, siderealAngle);

    return { _jde, _jdu, _hourOfDay, _date, handAngle, moonAngle, moonHandAngle, moonPhase, siderealAngle, sunAngle };
  }

  private calculateMechanicalPositions(time: number, ref: BasicPositions): BasicPositions {
    const deltaDays = (time - ref._referenceTime) / MILLIS_PER_DAY;
    const deltaSiderealDays = deltaDays * 366 / 365;
    // The moon is off by about one day every three months with the original 366 / 379 gear ratio.
    const deltaMoonDays = deltaDays * (this.timing === Timing.MECHANICAL_ORIGINAL ? 366 / 379 : 0.966137);
    const phaseCycles = deltaMoonDays * 2 / 57;
    const handAngle = mod(ref.handAngle + deltaDays * 360, 360);
    const moonHandAngle = mod(ref.moonHandAngle + deltaMoonDays * 360, 360);
    const siderealAngle = mod(ref.siderealAngle + deltaSiderealDays * 360, 360);

    return {
      handAngle,
      moonAngle: AppComponent.calculateEclipticAnglesFromHandAngle(moonHandAngle, siderealAngle),
      moonHandAngle,
      moonPhase: mod(ref.moonPhase + phaseCycles * 360, 360),
      siderealAngle,
      sunAngle: AppComponent.calculateEclipticAnglesFromHandAngle(handAngle, siderealAngle)
    };
  }

  private static calculateMoonHandAngle(moonAngle: number, siderealAngle: number): number {
    // Note: SVG angles start at "noon" and go clockwise, rather than at 3:00 going counterclockwise,
    // so the roles of sin and cos are swapped, and signs are changed.
    const x = sin_deg(moonAngle) * ECLIPTIC_INNER_RADIUS;
    const y = -cos_deg(moonAngle) * ECLIPTIC_INNER_RADIUS - ECLIPTIC_CENTER_OFFSET;

    return 90 + atan2_deg(y, x) + siderealAngle;
  }

  private static calculateEclipticAnglesFromHandAngle(handAngle: number, siderealAngle = 0): AngleTriplet {
    let result: number;
    const t = mod2(handAngle - siderealAngle, 360);

    if (abs(t) < 0.01)
      result = 0;
    else if (abs(t - 180) < 0.01)
      result = 180;
    // Avoid tan explosions
    else if (abs(abs(t) - 90) < 0.001)
      result = (this.calculateEclipticAnglesFromHandAngle(t - 0.0011).ie +
                this.calculateEclipticAnglesFromHandAngle(t + 0.0011).ie) / 2;
    else {
      const M = tan_deg(90 - abs(t)); // As in y = mx + b
      const B = -ECLIPTIC_CENTER_OFFSET; // As in y = mx + b
      const a = 1 + M ** 2; // a, b, and c as in quadratic equation.
      const b = 2 * M * B;
      const R2 = ECLIPTIC_INNER_RADIUS ** 2;
      const c = B ** 2 - R2;
      const root = sqrt(b ** 2 - 4 * a * c);
      const x = (-b + root) / 2 / a;
      const y = sqrt(R2 - x ** 2) * (abs(t) > 66.173 ? -1 : 1);

      result = atan2_deg(x, y) * sign(t);
    }

    return { orig: mod(revertEcliptic(result), 360), ie: mod(result, 360) };
  }

  rotate(angle: number): string {
    return `rotate(${angle})`;
  }

  sunlitMoonPath(): string {
    const largeArcFlag = this.moonPhase < 180 ? 1 : 0;
    const sweepFlag = floor(this.moonPhase / 90) % 2;
    const x = (abs(cos_deg(this.moonPhase)) * 12).toFixed(1);

    return `M0 -12.0A12.0 12.0 0 0 ${largeArcFlag} 0 12.0A${x} 12.0 0 0 ${sweepFlag} 0 -12.0`;
  }

  private getAltitudeCircle(alt: number, doPath = false): CircleAttributes {
    const lat = max(abs(this.observer.latitude.degrees), 0.5);
    const theta1 = -lat - (90 + alt);
    const theta2 = -lat + (90 + alt);
    const x1 = HORIZON_RADIUS * sin_deg(theta1);
    const y1 = HORIZON_RADIUS * cos_deg(theta1);
    const x2 = HORIZON_RADIUS * sin_deg(theta2);
    const y2 = HORIZON_RADIUS * cos_deg(theta2);
    const ya = y1 * (HORIZON_RADIUS / (HORIZON_RADIUS - x1));
    const yb = y2 * (HORIZON_RADIUS / (HORIZON_RADIUS - x2));
    const cy = (ya + yb) / 2;
    const r = (yb - ya) / 2;

    return {
      cy,
      d: doPath && `M 0 ${cy} m ${-r} 0 a ${r},${r} 0 1,1 ${r * 2},0 a ${r},${r} 0 1,1 ${-r * 2},0`,
      r
    };
  }

  private getHourArc(hour: number, asWedge = false, reverse = false): string {
    if (this.outerSunriseAngle == null)
      return '';

    let outer = CLOCK_RADIUS;
    let inner = TROPIC_RADIUS;

    if (this.midnightSunR) {
      outer = this.midnightSunR;
      const deltaLat = 90 - 2 * atan_deg(this.midnightSunR / CLOCK_RADIUS);
      inner = TROPIC_RADIUS * tan_deg((90 + deltaLat) / 2);
    }

    const h = (this.southern ? hour : 12 - hour);
    const outerSweep = 180 + this.outerSunriseAngle * 2;
    const outerAngle = this.outerSunriseAngle - outerSweep / 12 * h;
    const x1 = outer * cos_deg(outerAngle);
    const y1 = outer * sin_deg(outerAngle);
    const equatorSweep = 180 + this.equatorSunriseAngle * 2;
    const equatorAngle = this.equatorSunriseAngle - equatorSweep / 12 * h;
    const x2 = EQUATOR_RADIUS * cos_deg(equatorAngle);
    const y2 = EQUATOR_RADIUS * sin_deg(equatorAngle);
    const innerSweep = 180 + this.innerSunriseAngle * 2;
    const innerAngle = this.innerSunriseAngle - innerSweep / 12 * h;
    const x3 = inner * cos_deg(innerAngle);
    const y3 = inner * sin_deg(innerAngle);
    const r = findCircleRadius(x1, y1, x2, y2, x3, y3);

    if (!asWedge && this.southern)
      reverse = !reverse;

    if (reverse)
      return `M ${x3} ${y3} A${r} ${r} 0 0 ${h < 6 ? 1 : 0} ${x1} ${y1} `;

    let path = `M ${x1} ${y1} A${r} ${r} 0 0 ${h < 6 ? 0 : 1} ${x3} ${y3}`;

    if (asWedge)
      path += 'L' + this.getHourArc(hour + sign(hour - 6), false, !this.southern).substring(1) +
        `A ${outer} ${outer} 0 0 ${h < 6 ? 0 : 1} ${x1} ${y1} Z`;

    return path;
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

  skipToEvent(previous = false): void {
    if (this.trackTime) {
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
