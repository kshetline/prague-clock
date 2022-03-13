import { Component, OnInit } from '@angular/core';
import { abs, atan2_deg, cos_deg, floor, mod, Point, sign, sin_deg, sqrt, tan_deg } from '@tubular/math';
import { AngleStyle, DateTimeStyle, TimeEditorOptions } from '@tubular/ng-widgets';
import { EventFinder, MOON, SET_EVENT, SkyObserver, SolarSystem, SUN } from '@tubular/astronomy';
import ttime, { DateTime, utToTdt } from '@tubular/time';
import julianDay = ttime.julianDay;

const CLOCK_RADIUS = 250;
const INCLINATION = 23.5;
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

  LOCAL_OPTS: TimeEditorOptions = {
    dateTimeStyle: DateTimeStyle.DATE_AND_TIME,
    twoDigitYear: false,
    showSeconds: false
  };

  ISO_OPTS = ['ISO', this.LOCAL_OPTS];

  private baseMoonAngle: number;
  private baseSunAngle: number;
  private eventFinder = new EventFinder();
  private _latitude = 50.0870;
  private _longitude = 14.4185;
  private observer: SkyObserver;
  private solarSystem = new SolarSystem();
  private _time = Date.now();

  darkCy: number;
  darkR: number;
  dayAreaMask: string;
  disableDst = true;
  equatorMorningAngle: number = null;
  handAngle = 0;
  horizonCy: number;
  horizonPath: string;
  horizonR: number;
  hourArcs: string[] = [];
  hourWedges: string[] = [];
  innerMorningAngle: number = null;
  isoFormat = false;
  moonAngle = 0;
  outerMorningAngle: number = null;
  outerRingAngle = 0;
  siderealAngle = 0;
  sunAngle = 0;
  zone = 'Europe/Prague';

  ngOnInit(): void {
    this.adjustLatitude();
    this.setNow();
  }

  get latitude(): number { return this._latitude; }
  set latitude(newValue: number) {
    if (this._latitude !== newValue) {
      this._latitude = newValue;
      this.adjustLatitude();
    }
  }

  get time(): number { return this._time; }
  set time(newValue: number) {
    if (this._time !== newValue) {
      this._time = newValue;
      this.updateTime();
    }
  }

  setNow(): void {
    this.time = floor(Date.now() / 60000) * 60000;
    this.updateTime();
  }

  private adjustLatitude(): void {
    this.observer = new SkyObserver(this._longitude, this._latitude);
    ({ cy: this.horizonCy, d: this.horizonPath, r: this.horizonR } = this.getAltitudeCircle(0, true));
    ({ cy: this.darkCy, r: this.darkR } = this.getAltitudeCircle(-18));
    this.createDayAreaMask();

    if (this.outerMorningAngle != null) {
      for (let h = 1; h <= 11; ++h) {
        this.hourArcs[h] = this.getHourArc(h);
        this.hourWedges[h] = this.getHourArc(h, true);
      }
    }
    else {
      this.hourArcs = [];
      this.hourWedges = [];
    }
  }

  private createDayAreaMask(): void {
    const outerPoints = circleIntersections(0, 0, CLOCK_RADIUS, 0, this.horizonCy, this.horizonR);
    const equatorPoints = circleIntersections(0, 0, EQUATOR_RADIUS, 0, this.horizonCy, this.horizonR);
    const innerPoints = circleIntersections(0, 0, TROPIC_RADIUS, 0, this.horizonCy, this.horizonR);

    if (!outerPoints || outerPoints.length < 2 || !innerPoints || innerPoints.length < 2) {
      this.dayAreaMask = '';
      this.outerMorningAngle = null;
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
    this.outerMorningAngle = atan2_deg(y1, x1);
    this.innerMorningAngle = atan2_deg(y2, x2);
    this.equatorMorningAngle = atan2_deg(equatorPoints[0].y, equatorPoints[0].x);
  }

  updateTime(): void {
    const jdu = julianDay(this.time);
    const jde = utToTdt(jdu);
    const sunsetA = this.eventFinder.findEvent(SUN, SET_EVENT, jdu, this.observer, undefined, undefined, true);
    const sunsetB = this.eventFinder.findEvent(SUN, SET_EVENT, sunsetA.ut, this.observer, undefined, undefined, false);
    const dayLength = sunsetB.ut - sunsetA.ut;
    const bohemianHour = (jdu - sunsetA.ut) / dayLength * 24;
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
    const phaseAngle = mod(this.baseMoonAngle - this.baseSunAngle, 360);
    const largeArcFlag = phaseAngle < 180 ? 1 : 0;
    const sweepFlag = floor(phaseAngle / 90) % 2;
    const x = (abs(cos_deg(phaseAngle)) * 12).toFixed(1);

    return `M0 -12.0A12.0 12.0 0 0 ${largeArcFlag} 0 12.0A${x} 12.0 0 0 ${sweepFlag} 0 -12.0`;
  }

  private getAltitudeCircle(alt: number, doPath = false): CircleAttributes {
    const l = this.observer.latitude.degrees;
    const lat = abs(l) > 0.01 ? l : (sign(l) || 1) * 0.01;
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
    if (this.outerMorningAngle == null)
      return '';

    const outerSweep = 180 + this.outerMorningAngle * 2;
    const outerAngle = this.outerMorningAngle - outerSweep / 12 * (12 - hour);
    const x1 = CLOCK_RADIUS * cos_deg(outerAngle);
    const y1 = CLOCK_RADIUS * sin_deg(outerAngle);
    const equatorSweep = 180 + this.equatorMorningAngle * 2;
    const equatorAngle = this.equatorMorningAngle - equatorSweep / 12 * (12 - hour);
    const x2 = EQUATOR_RADIUS * cos_deg(equatorAngle);
    const y2 = EQUATOR_RADIUS * sin_deg(equatorAngle);
    const innerSweep = 180 + this.innerMorningAngle * 2;
    const innerAngle = this.innerMorningAngle - innerSweep / 12 * (12 - hour);
    const x3 = TROPIC_RADIUS * cos_deg(innerAngle);
    const y3 = TROPIC_RADIUS * sin_deg(innerAngle);
    const r = findCircleRadius(x1, y1, x2, y2, x3, y3);

    if (reverse)
      return `L ${RO(x3)} ${RO(y3)} A${RO(r)} ${RO(r)} 0 0 ${hour < 6 ? 0 : 1} ${RO(x1)} ${RO(y1)} `;

    let path = `M ${RO(x1)} ${RO(y1)} A${RO(r)} ${RO(r)} 0 0 ${hour < 6 ? 1 : 0} ${RO(x3)} ${RO(y3)}`;

    if (asWedge)
      path += this.getHourArc(hour + sign(hour - 6), false, true) +
        `A ${CLOCK_RADIUS} ${CLOCK_RADIUS} 0 0 ${hour < 6 ? 1 : 0} ${RO(x1)} ${RO(y1)} Z`;

    return path;
  }
}
