import { Component, OnInit } from '@angular/core';
import { abs, atan2_deg, cos_deg, floor, max, mod, Point, sign, sin_deg, sqrt, tan_deg } from '@tubular/math';
import { isChromeOS, isSafari } from '@tubular/util';
import { AngleStyle, DateTimeStyle, TimeEditorOptions } from '@tubular/ng-widgets';
import { AstroEvent, EventFinder, MOON, SET_EVENT, SkyObserver, SolarSystem, SUN } from '@tubular/astronomy';
import ttime, { DateTime, utToTdt } from '@tubular/time';
import julianDay = ttime.julianDay;
import { TzsLocation } from '../timezone-selector/timezone-selector.component';
import { Globe } from '../globe/globe';

const CLOCK_RADIUS = 250;
const INCLINATION = 23.5;
const LABEL_RADIUS = 212;
const EQUATOR_RADIUS = 164.1;
const HORIZON_RADIUS = CLOCK_RADIUS * tan_deg((90 - INCLINATION) / 2);
const TROPIC_RADIUS = HORIZON_RADIUS * tan_deg((90 - INCLINATION) / 2);

interface CircleAttributes {
  cy: number;
  d?: string;
  r: number;
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
  const h = sqrt(r1 ** 2 - a ** 2);
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

  // x1^2 - x3^2
  const sx13 = x1 ** 2 - x3 ** 2;

  // y1^2 - y3^2
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

function RO(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  DD = AngleStyle.DD;
  DDD = AngleStyle.DDD;
  buggyForeignObject = isChromeOS() || isSafari();

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
  private globe: Globe
  private lastHeight = -1;
  private _latitude = 50.0870;
  private _longitude = 14.4185;
  private observer: SkyObserver;
  private solarSystem = new SolarSystem();
  private sunsetA: AstroEvent = null;
  private sunsetB: AstroEvent = null;
  private _time = Date.now();
  private timeCheck: any;
  private _trackTime = false;
  private _zone = 'Europe/Prague';

  darkCy: number;
  darkR: number;
  dayAreaMask: string;
  dawnLabelPath: string;
  disableDst = true;
  duskLabelPath: string;
  equatorSunriseAngle: number = null;
  handAngle = 0;
  horizonCy: number;
  horizonPath: string;
  horizonR: number;
  hourArcs: string[] = [];
  hourWedges: string[] = [];
  innerSunriseAngle: number = null;
  isoFormat = false;
  moonAngle = 0;
  outerRingAngle = 0;
  outerSunriseAngle: number = null;
  placeName = '\xA0';
  rotateSign = 1;
  siderealAngle = 0;
  southern = false;
  sunAngle = 0;
  sunriseLabelPath: string;
  sunsetLabelPath: string;

  ngOnInit(): void {
    this.globe = new Globe('globe-host');
    this.adjustLatitude();
    this.setNow();
    this.trackTime = true;
    this.placeName = 'Prague, CZE';

    const docElem = document.documentElement;
    const doResize = (): void => {
      setTimeout(() => {
        const height = window.innerHeight;
        const disallowScroll = docElem.style.overflow === 'hidden';

        docElem.style.setProperty('--mfh', height + 'px');
        docElem.style.setProperty('--mvh', (height * 0.01) + 'px');

        if (this.lastHeight !== height) {
          this.lastHeight = height;

          if (disallowScroll && (docElem.scrollTop !== 0 || docElem.scrollLeft !== 0)) {
            docElem.scrollTo(0, 0);
            setTimeout(doResize, 50);
          }
          else
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

  get latitude(): number { return this._latitude; }
  set latitude(newValue: number) {
    if (this._latitude !== newValue) {
      this._latitude = newValue;
      this.adjustLatitude();
    }
  }

  get longitude(): number { return this._longitude; }
  set longitude(newValue: number) {
    if (this._longitude !== newValue) {
      this._longitude = newValue;
      this.placeName = '\xA0';
      this.observer = new SkyObserver(this._longitude, this._latitude);
      this.updateTime(true);
      this.updateGlobe();
    }
  }

  get zone(): string { return this._zone; }
  set zone(newValue: string) {
    if (this._zone !== newValue) {
      this._zone = newValue;
      this.updateTime(true);
    }
  }

  get time(): number { return this._time; }
  set time(newValue: number) {
    if (this._time !== newValue) {
      this._time = newValue;
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
  }

  setNow(): void {
    const newTime = floor(Date.now() / 60000) * 60000;

    if (this.time !== newTime)
      this.time = newTime;
  }

  private adjustLatitude(): void {
    this.southern = (this._latitude < 0);
    this.rotateSign = (this.southern ? -1 : 1);
    this.observer = new SkyObserver(this._longitude, this._latitude);
    this.placeName = '\xA0';
    ({ cy: this.horizonCy, d: this.horizonPath, r: this.horizonR } = this.getAltitudeCircle(0, true));
    ({ cy: this.darkCy, r: this.darkR } = this.getAltitudeCircle(-18));
    this.createDayAreaMask();

    if (this.outerSunriseAngle != null && abs(this._latitude) <= 66) {
      for (let h = 1; h <= 11; ++h) {
        this.hourArcs[h] = this.getHourArc(h);
        this.hourWedges[h] = this.getHourArc(h, true);
      }

      this.dawnLabelPath = this.getHourArc(-0.5 - sin_deg(abs(this._latitude)) * 0.65);
      this.duskLabelPath = this.getHourArc(12.5 + sin_deg(abs(this._latitude)) * 0.65, false, true);
      this.sunriseLabelPath = this.getHourArc(0.5);
      this.sunsetLabelPath = this.getHourArc(11.5, false, true);
    }
    else {
      this.hourArcs = [];
      this.hourWedges = [];
      this.dawnLabelPath = this.duskLabelPath = this.sunriseLabelPath = this.sunsetLabelPath = '';
    }

    const hourLabels = document.getElementById('unequalHourLabels') as unknown as SVGGElement;
    const pts = circleIntersections(0, 0, LABEL_RADIUS, 0, this.horizonCy, this.horizonR);
    const hAdj = [0, 3, -3, -7, -9, -9, -9, -12, -14, -13, -9, -3, 5];
    const vAdj = [0, 30, 27, 23, 19, 16, 12, 9, 3, -4, -9, -14, -17];

    if (this.outerSunriseAngle == null || !pts || pts.length < 2)
      hourLabels.innerHTML = '';
    else {
      const sunrise = atan2_deg(pts[0].y, pts[0].x);
      const step = (180 + sunrise * 2) / 12;
      let angle = -180 - sunrise + step;
      let html = '';

      for (let h = 1; h <= 12; ++h, angle += step) {
        const x = RO(cos_deg(angle) * LABEL_RADIUS + hAdj[h]);
        const y = RO(sin_deg(angle) * LABEL_RADIUS + vAdj[h]);

        html += `<text x="${x}" y="${y}" class="unequalHourText">${this.southern ? 13 - h : h}</text>`;
      }

      hourLabels.innerHTML = html;
    }

    this.updateTime(true);
    this.updateGlobe();
  }

  private updateGlobe(): void {
    this.globe.orient(this._longitude, this.latitude).finally();
  }

  private createDayAreaMask(): void {
    const outerPoints = circleIntersections(0, 0, CLOCK_RADIUS, 0, this.horizonCy, this.horizonR);
    const equatorPoints = circleIntersections(0, 0, EQUATOR_RADIUS, 0, this.horizonCy, this.horizonR);
    const innerPoints = circleIntersections(0, 0, TROPIC_RADIUS, 0, this.horizonCy, this.horizonR);

    if (!outerPoints || outerPoints.length < 2 || !innerPoints || innerPoints.length < 2 ||  abs(this._latitude) > 66) {
      this.dayAreaMask = '';
      this.outerSunriseAngle = null;
      return;
    }

    const x1 = outerPoints[0].x;
    const y1 = outerPoints[0].y;
    const r2 = RO(this.horizonR);
    const x2 = innerPoints[0].x;
    const y2 = innerPoints[0].y;
    const r3 = RO(TROPIC_RADIUS);
    const x3 = RO(innerPoints[1].x);
    const y3 = RO(innerPoints[1].y);
    const r4 = RO(this.horizonR);
    const x4 = RO(outerPoints[1].x);
    const y4 = RO(outerPoints[1].y);
    const r5 = RO(CLOCK_RADIUS);

    this.dayAreaMask = `M${RO(x1)} ${RO(y1)} A${r2} ${r2} 0 0 0 ${RO(x2)} ${RO(y2)}A${r3} ${r3} 0 0 0 ${x3} ${y3} ` +
                       `A${r4} ${r4} 0 0 0 ${x4} ${y4}A${r5} ${r5} 0 1 1 ${x1} ${y1}`;
    this.outerSunriseAngle = atan2_deg(y1, x1);
    this.innerSunriseAngle = atan2_deg(y2, x2);
    this.equatorSunriseAngle = atan2_deg(equatorPoints[0].y, equatorPoints[0].x);
  }

  updateTime(forceUpdate = false): void {
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
      d: doPath && `M 0 ${RO(cy)} m ${RO(-r)} 0 a ${RO(r)},${RO(r)} 0 1,1 ${RO(r * 2)},0 a ${RO(r)},${RO(r)} 0 1,1 ${RO(-r * 2)},0`,
      r
    };
  }

  private getHourArc(hour: number, asWedge = false, reverse = false): string {
    if (this.outerSunriseAngle == null)
      return '';

    const h = (this.southern ? hour : 12 - hour);
    const outerSweep = 180 + this.outerSunriseAngle * 2;
    const outerAngle = this.outerSunriseAngle - outerSweep / 12 * h;
    const x1 = CLOCK_RADIUS * cos_deg(outerAngle);
    const y1 = CLOCK_RADIUS * sin_deg(outerAngle);
    const equatorSweep = 180 + this.equatorSunriseAngle * 2;
    const equatorAngle = this.equatorSunriseAngle - equatorSweep / 12 * h;
    const x2 = EQUATOR_RADIUS * cos_deg(equatorAngle);
    const y2 = EQUATOR_RADIUS * sin_deg(equatorAngle);
    const innerSweep = 180 + this.innerSunriseAngle * 2;
    const innerAngle = this.innerSunriseAngle - innerSweep / 12 * h;
    const x3 = TROPIC_RADIUS * cos_deg(innerAngle);
    const y3 = TROPIC_RADIUS * sin_deg(innerAngle);
    const r = findCircleRadius(x1, y1, x2, y2, x3, y3);

    if (!asWedge && this.southern)
      reverse = !reverse;

    if (reverse)
      return `M ${RO(x3)} ${RO(y3)} A${RO(r)} ${RO(r)} 0 0 ${h < 6 ? 1 : 0} ${RO(x1)} ${RO(y1)} `;

    let path = `M ${RO(x1)} ${RO(y1)} A${RO(r)} ${RO(r)} 0 0 ${h < 6 ? 0 : 1} ${RO(x3)} ${RO(y3)}`;

    if (asWedge)
      path += 'L' + this.getHourArc(hour + sign(hour - 6), false, !this.southern).substring(1) +
        `A ${CLOCK_RADIUS} ${CLOCK_RADIUS} 0 0 ${h < 6 ? 0 : 1} ${RO(x1)} ${RO(y1)} Z`;

    return path;
  }
}
