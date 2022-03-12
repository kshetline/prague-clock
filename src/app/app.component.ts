import { Component, OnInit } from '@angular/core';
import { abs, acos_deg, cos_deg, floor, max, min, mod, Point, sign, sin_deg, sqrt, tan_deg } from '@tubular/math';
import { AngleStyle, DateTimeStyle, TimeEditorOptions } from '@tubular/ng-widgets';
import { EventFinder, MOON, SET_EVENT, SkyObserver, SolarSystem, SUN } from '@tubular/astronomy';
import ttime, { DateTime, utToTdt } from '@tubular/time';
import julianDay = ttime.julianDay;

const CLOCK_RADIUS = 250;
const INCLINATION = 23.5;
const HORIZON_RADIUS = CLOCK_RADIUS * tan_deg((90 - INCLINATION) / 2);
const TROPIC_RADIUS = HORIZON_RADIUS * tan_deg((90 - INCLINATION) / 2);

interface CircleAttributes {
  cy: number;
  d?: string;
  r: number;
}

function circleIntersections(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): Point[] {
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
  handAngle = 0;
  horizonCy: number;
  horizonPath: string;
  horizonR: number;
  isoFormat = false;
  moonAngle = 0;
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
  }

  private createDayAreaMask(): void {
    const outerPoints = circleIntersections(0, 0, CLOCK_RADIUS, 0, this.horizonCy, this.horizonR);
    const innerPoints = circleIntersections(0, 0, TROPIC_RADIUS, 0, this.horizonCy, this.horizonR);

    if (!outerPoints || outerPoints.length < 2 || !innerPoints || innerPoints.length < 2) {
      console.log(outerPoints, innerPoints);
      this.dayAreaMask = '';
      return;
    }

    const x1 = RO(outerPoints[0].x);
    const y1 = RO(outerPoints[0].y);
    const r2 = RO(this.horizonR);
    const x2 = RO(innerPoints[0].x);
    const y2 = RO(innerPoints[0].y);
    const r3 = RO(TROPIC_RADIUS);
    const x3 = RO(innerPoints[1].x);
    const y3 = RO(innerPoints[1].y);
    const r4 = RO(this.horizonR);
    const x4 = RO(outerPoints[1].x);
    const y4 = RO(outerPoints[1].y);
    const r5 = RO(CLOCK_RADIUS);

    this.dayAreaMask = `M${x1} ${y1}A${r2} ${r2} 0 0 0 ${x2} ${y2}A${r3} ${r3} 0 0 0 ${x3} ${y3}A${r4} ${r4} 0 0 0 ${x4} ${y4}A${r5} ${r5} 0 1 1 ${x1} ${y1}`;
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

  /* private */ getHourCircle(hour: number): string {
    const theta_unequal_hours = (r: number): number => {
      const arg = (r ** 2 + this.horizonCy ** 2 - this.horizonR ** 2) / (2 * r * this.horizonCy);
      if (arg <= -1)
        return 180;
      else if (arg >= 1)
        return 0;

      return acos_deg(arg);
    };

    let d = '';

    for (let r = max(TROPIC_RADIUS, this.horizonR - this.horizonCy); r <= CLOCK_RADIUS; r += 1) {
      const r_1 = min(r + 1, CLOCK_RADIUS);
      const theta0 = theta_unequal_hours(r);
      const theta1 = theta_unequal_hours(r_1);
      const psi0 = theta0 + (360 - 2 * theta0) / 12 * hour;
      const psi1 = theta1 + (360 - 2 * theta1) / 12 * hour;
      d += `M ${r * sin_deg(psi0)} ${r * cos_deg(psi0)} L ${r * sin_deg(psi1)} ${r * cos_deg(psi1)}`;
    }

    return d;
  }
}
