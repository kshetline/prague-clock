import { Component, OnInit } from '@angular/core';
import { abs, cos_deg, floor, mod } from '@tubular/math';
import { DateTimeStyle, TimeEditorOptions } from '@tubular/ng-widgets';
import { MOON, SkyObserver, SolarSystem, SUN } from '@tubular/astronomy';
import ttime, { DateTime, utToTdt } from '@tubular/time';
import julianDay = ttime.julianDay;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  private baseMoonAngle: number;
  private baseSunAngle: number;
  private observer = new SkyObserver(14.4208, 50.088);
  private _time = Date.now();

  handAngle = 0;
  moonAngle = 0;
  outerRingAngle = 0;
  siderealAngle = 0;
  solarSystem = new SolarSystem();
  sunAngle = 0;
  zone = 'Europe/Prague';

  timeOptions: TimeEditorOptions = {
    dateTimeStyle: DateTimeStyle.DATE_AND_TIME,
    twoDigitYear: false
  };

  ngOnInit(): void {
    this.setNow();
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

  updateTime(): void {
    const jdu = julianDay(this.time);
    const jde = utToTdt(jdu);
    const date = new DateTime(this.time, this.zone);
    const wt = date.wallTime;

    this.baseSunAngle = this.solarSystem.getEclipticPosition(SUN, jde).longitude.degrees;
    this.baseMoonAngle = this.solarSystem.getEclipticPosition(MOON, jde).longitude.degrees;
    // @ts-ignore
    this.handAngle = (wt.hour * 60 + wt.minute - wt.dstOffset / 60) / 4 - 180;
    this.sunAngle = 90 - this.baseSunAngle + cos_deg(this.baseSunAngle) * 26.6;
    this.moonAngle = 90 - this.baseMoonAngle + cos_deg(this.baseMoonAngle) * 26.6;
    this.siderealAngle = this.observer.getLocalHourAngle(jdu, false).degrees - 90;
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
}
