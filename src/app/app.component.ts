import { Component, OnInit } from '@angular/core';
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api';
import { abs, atan2_deg, atan_deg, cos_deg, floor, max, mod, PI, Point, sign, sin_deg, sqrt, tan_deg } from '@tubular/math';
import { clone, getCssValue, isChromeOS, isEqual, isLikelyMobile, isSafari, toMixedCase } from '@tubular/util';
import { AngleStyle, DateTimeStyle, TimeEditorOptions } from '@tubular/ng-widgets';
import { AstroEvent, EventFinder, FALL_EQUINOX, FIRST_QUARTER, FULL_MOON, LAST_QUARTER, MOON, NEW_MOON, RISE_EVENT, SET_EVENT, SkyObserver, SolarSystem, SPRING_EQUINOX, SUMMER_SOLSTICE, SUN, TRANSIT_EVENT, WINTER_SOLSTICE } from '@tubular/astronomy';
import ttime, { DateTime, utToTdt } from '@tubular/time';
import julianDay = ttime.julianDay;
import { TzsLocation } from '../timezone-selector/timezone-selector.component';
import { Globe } from '../globe/globe';

const CLOCK_RADIUS = 250;
const INCLINATION = 23.5;
const ARCTIC = 90 - INCLINATION;
const LABEL_RADIUS = 212;
const EQUATOR_RADIUS = 164.1;
const HORIZON_RADIUS = CLOCK_RADIUS * tan_deg((90 - INCLINATION) / 2);
const TROPIC_RADIUS = HORIZON_RADIUS * tan_deg((90 - INCLINATION) / 2);
const MAX_UNEVEN_HOUR_LATITUDE = 86;

interface CircleAttributes {
  cy: number;
  d?: string;
  r: number;
}

enum EventType { EQUISOLSTICE, MOON_PHASE, RISE_SET }

const MAX_SAVED_LOCATIONS = 10;

const defaultSettings = {
  disableDst: true,
  eventType: EventType.EQUISOLSTICE,
  isoFormat: false,
  latitude: 50.0870,
  longitude: 14.4185,
  placeName: 'Prague, CZE',
  recentLocations: [{
    lastTimeUsed: 0,
    latitude: 50.0870,
    longitude: 14.4185,
    name: 'Prague, CZE',
    zone: 'Europe/Prague'
  }] as TzsLocation[],
  suppressOsKeyboard: false,
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

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  buggyForeignObject = isChromeOS() || isSafari();
  DD = AngleStyle.DD;
  DDD = AngleStyle.DDD;
  MAX_YEAR = 2399;
  MIN_YEAR = 1400;

  LOCAL_OPTS: TimeEditorOptions = {
    dateTimeStyle: DateTimeStyle.DATE_AND_TIME,
    twoDigitYear: false,
    showDstSymbol: true,
    showSeconds: false
  };

  ISO_OPTS = ['ISO', this.LOCAL_OPTS, { showUtcOffset: true }];

  private baseMoonAngle: number;
  private baseSunAngle: number;
  private eventFinder = new EventFinder();
  private eventType = EventType.EQUISOLSTICE;
  private globe: Globe
  private initDone = false;
  private lastSavedSettings: any = null;
  private _latitude = 50.0870;
  private _longitude = 14.4185;
  private observer: SkyObserver;
  private solarSystem = new SolarSystem();
  private sunsetA: AstroEvent = null;
  private sunsetB: AstroEvent = null;
  private _suppressOsKeyboard = false;
  private _time = 0;
  private timeCheck: any;
  private _trackTime = false;
  private _translucentEcliptic = false;
  private _zone = 'Europe/Prague';

  menuItems: MenuItem[] = [
    { label: '↔ Equinox/solstice', icon: 'pi pi-check',
      command: (): void => this.setEventType(EventType.EQUISOLSTICE) },
    { label: '↔ Moon phase', icon: 'pi pi-circle',
      command: (): void => this.setEventType(EventType.MOON_PHASE) },
    { label: '↔ Sunrise/transit/sunset', icon: 'pi pi-circle',
      command: (): void => this.setEventType(EventType.RISE_SET) },
    { separator : true },
    { label: 'Translucent ecliptic', icon: 'pi pi-circle', id: 'tec',
      command: (): boolean => this.translucentEcliptic = !this.translucentEcliptic },
    { label: 'Code on GitHub', icon: 'pi pi-github', url: 'https://github.com/kshetline/prague-clock' },
    { label: 'About the clock', icon: 'pi pi-info-circle',
      url: 'https://en.wikipedia.org/wiki/Prague_astronomical_clock' }
  ];

  canEditName = false;
  canSaveName = false;
  darkCy: number;
  darkR: number;
  dayAreaMask: string;
  dawnDuskFontSize = '15px';
  dawnLabelPath: string;
  dawnTextOffset: number;
  disableDst = true;
  duskLabelPath: string;
  duskTextOffset: number;
  equatorSunriseAngle: number = null;
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
  isoFormat = false;
  lastHeight = -1;
  midnightSunR = 0;
  moonAngle = 0;
  outerRingAngle = 0;
  outerSunriseAngle: number = null;
  placeName = 'Prague, CZE';
  recentLocations: TzsLocation[] = [];
  riseSetFontSize = '15px';
  rotateSign = 1;
  siderealAngle = 0;
  solNoctisPath = '';
  southern = false;
  sunAngle = 0;
  sunriseLabelPath: string;
  sunsetLabelPath: string;

  constructor(
    private confirmService: ConfirmationService,
    private messageService: MessageService
  ) {
    let settings: any;

    if (isLikelyMobile()) {
      this.menuItems.push({ separator: true });
      this.menuItems.push({ label: 'Suppress onscreen keyboard', icon: 'pi pi-circle', id: 'sok',
                            command: (): boolean => this.suppressOsKeyboard = !this.suppressOsKeyboard });
    }

    try {
      settings = JSON.parse(localStorage.getItem('pac-settings') ?? 'null');

      if (settings?.recentLocations)
        settings?.recentLocations.forEach((loc: any) => { loc.name = loc.name || loc.placeName; delete loc.placeName; });
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
    const placeName = this.placeName;

    this.initDone = true;
    this.globe = new Globe('globe-host');
    this.adjustLatitude();
    this.setNow();
    this.placeName = placeName;

    const docElem = document.documentElement;
    const doResize = (): void => {
      setTimeout(() => {
        const height = window.innerHeight;
        const disallowScroll = getCssValue(docElem, 'overflow') === 'hidden';

        docElem.style.setProperty('--mfh', height + 'px');
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

  clearRecents(): void {
    this.recentLocations = clone(defaultSettings.recentLocations);
    this.changeLocation(this.recentLocations[0]);
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

  get translucentEcliptic(): boolean { return this._translucentEcliptic; }
  set translucentEcliptic(value: boolean) {
    if (this._translucentEcliptic !== value) {
      this._translucentEcliptic = value;
      this.updateMenu();
    }
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

      if (this.initDone) {
        this.placeName = '';
        this.updateObserver();
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
    this._longitude = location.longitude;
    this.latitude = location.latitude;
    this.placeName = location.name;
    setTimeout(() => this.zone = location.zone);
    this.updateRecentLocations(location);
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

    const sortTime = (time: number): number => time === 0 ? Number.MAX_SAFE_INTEGER : time;
    this.recentLocations.sort((a, b) => sortTime(b.lastTimeUsed) - sortTime(a.lastTimeUsed));
    this.recentLocations = clone(this.recentLocations);
    this.saveSettings();
  }

  setNow(): void {
    const newTime = floor(Date.now() / 60000) * 60000;

    if (this.time !== newTime)
      this.time = newTime;
  }

  private adjustLatitude(): void {
    this.southern = (this._latitude < 0);
    this.rotateSign = (this.southern ? -1 : 1);
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

    this.updateTime(true);
    this.updateGlobe();
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

    const jdu = julianDay(this.time);
    const jde = utToTdt(jdu);

    // Finding sunset events can be slow at high latitudes, so use cached values when possible.
    if (forceUpdate || !this.sunsetA || !this.sunsetB || jdu < this.sunsetA.ut || jdu > this.sunsetB.ut) {
      this.sunsetA = this.eventFinder.findEvent(SUN, SET_EVENT, jdu, this.observer, undefined, undefined, true);
      this.sunsetB = this.eventFinder.findEvent(SUN, SET_EVENT, this.sunsetA.ut, this.observer, undefined, undefined, false);
    }

    const dayLength = this.sunsetB.ut - this.sunsetA.ut;
    const bohemianHour = (jdu - this.sunsetA.ut) / dayLength * 24;
    const date = new DateTime(this.time, this.zone);
    const wt = date.wallTime;
    const hourOfDay = wt.hour + wt.minute / 60 - (this.disableDst ? wt.dstOffset / 3600 : 0);

    this.baseSunAngle = this.solarSystem.getEclipticPosition(SUN, jde).longitude.degrees;
    this.baseMoonAngle = this.solarSystem.getEclipticPosition(MOON, jde).longitude.degrees;
    this.handAngle = hourOfDay * 15 - 180;
    this.sunAngle = 90 - this.baseSunAngle + cos_deg(this.baseSunAngle) * 26.6;
    this.moonAngle = 90 - this.baseMoonAngle + cos_deg(this.baseMoonAngle) * 26.6;
    this.siderealAngle = this.observer.getLocalHourAngle(jdu, true).degrees - 90;
    this.outerRingAngle = 180 - (bohemianHour - hourOfDay) * 15;
  }

  rotate(angle: number): string {
    return `rotate(${angle})`;
  }

  sunlitMoonPath(): string {
    const phaseAngle = mod((this.baseMoonAngle - this.baseSunAngle) * this.rotateSign, 360);
    const largeArcFlag = phaseAngle < 180 ? 1 : 0;
    const sweepFlag = floor(phaseAngle / 90) % 2;
    const x = (abs(cos_deg(phaseAngle)) * 12).toFixed(1);

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
      message: 'Turn off "Track current time" so you can edit the time?',
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

    if (this.menuItemById('tec'))
      this.menuItemById('tec').icon = (this.translucentEcliptic ? 'pi pi-check' : 'pi pi-circle');

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

    this.recentLocations = clone(this.recentLocations);
    this.saveSettings();
  }

  cancelEdit(): void {
    this.canEditName = true;
    this.canSaveName = false;
  }

  skipToEvent(previous = false): void {
    if (this.trackTime) {
      this.confirmService.confirm({
        message: 'Turn off "Track current time" and change the clock time?',
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
    let altitude: number;

    switch (this.eventType) {
      case EventType.EQUISOLSTICE:
        eventsToCheck = [SPRING_EQUINOX, SUMMER_SOLSTICE, FALL_EQUINOX, WINTER_SOLSTICE];
        break;
      case EventType.MOON_PHASE:
        eventsToCheck = [NEW_MOON, FIRST_QUARTER, FULL_MOON, LAST_QUARTER];
        break;
      case EventType.RISE_SET:
        eventsToCheck = [RISE_EVENT, TRANSIT_EVENT, SET_EVENT];
        altitude = 0;
        break;
    }

    for (const eventType of eventsToCheck) {
      const evt = this.eventFinder.findEvent(SUN, eventType, jdu, this.observer, undefined, undefined, previous, altitude);

      if (evt)
        eventsFound.push(evt);
    }

    eventsFound.sort((a, b) => previous ? b.ut - a.ut : a.ut - b.ut);

    if (eventsFound.length > 0) {
      const evt = eventsFound[0];
      const eventText = toMixedCase(evt.eventText).replace('Rise', 'Sunrise').replace('Set', 'Sunset');
      const year = new DateTime(evt.eventTime.utcMillis, this.zone).wallTime.year;

      if (year < this.MIN_YEAR || year > this.MAX_YEAR)
        this.messageService.add({ severity: 'error', summary:'Event',
                                  detail: `Event outside of ${this.MIN_YEAR}-${this.MAX_YEAR} year range.` });
      else {
        this.time = evt.eventTime.utcMillis;
        this.messageService.add({ severity: 'info', summary:'Event', detail: eventText });
      }
    }
  }
}
