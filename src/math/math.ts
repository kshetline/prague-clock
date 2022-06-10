import { MOON, SkyObserver, SolarSystem, SUN } from '@tubular/astronomy';
import { abs, atan2_deg, cos_deg, max, mod, Point, sin_deg, sqrt } from '@tubular/math';
import ttime, { DateTime, Timezone, utToTdt } from '@tubular/time';
import { Timing } from 'src/advanced-options/advanced-options.component';

const { julianDay } = ttime;

export const ECLIPTIC_INNER_RADIUS = 161;
export const ECLIPTIC_OUTER_RADIUS = 178.9;
export const ECLIPTIC_CENTER_OFFSET = 71.1;

export const solarSystem = new SolarSystem();
export const MILLIS_PER_DAY = 86_400_000;
export const MILLIS_PER_SIDEREAL_DAY = 86_164_091;

export function circleIntersections(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): Point[] {
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

export function findCircleRadius(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): number {
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

export interface AngleTriplet {
  ie: number; // inner ecliptic
  oe: number; // outer ecliptic
  orig: number;
}

export interface BasicPositions {
  _date?: DateTime;
  _constrainedSunAngle?: AngleTriplet;
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

export const ZeroAngles: AngleTriplet = { ie: 0, oe: 0, orig: 0 };

export function eclipticToOffCenter(angle: number, inner = true): number {
  // The inner angle is the angle produced by the too-small ecliptic wheel diameter that was calculated in 1864.
  // The mechanical movement of the sun and the moon are still tied to this incorrect value, despite the outer
  // segmented ring that was added later to make the wheel the correct size.
  return mod((inner ? 26.207 : 23.4172) * cos_deg(angle) - angle, 360);
}

export function adjustForEclipticWheel(angle: number, southern: boolean): AngleTriplet {
  return {
    orig: angle,
    ie: 90 + eclipticToOffCenter(angle * (southern ? -1 : 1)),
    oe: 90 + eclipticToOffCenter(angle * (southern ? -1 : 1), false)
  };
}

export function calculateEclipticAnglesFromHandAngle(handAngle: number, siderealAngle: number): AngleTriplet {
  const eclipticAngle = mod(90 - handAngle + siderealAngle, 360);

  return {
    orig: eclipticAngle,
    ie: mod(90 + eclipticToOffCenter(eclipticAngle), 360),
    oe: mod(90 + eclipticToOffCenter(eclipticAngle, false), 360)
  };
}

export function calculateBasicPositions(time: number, zone: string | Timezone, observer: SkyObserver,
                                        disableDst: boolean, timing: Timing): BasicPositions {
  const _jdu = julianDay(time);
  const _jde = utToTdt(_jdu);
  const _date = new DateTime(time, zone);
  const wt = _date.wallTime;
  const southern = observer.latitude.degrees < 0;
  const _hourOfDay = wt.hour + wt.minute / 60 -
    (disableDst || (timing !== Timing.MODERN && timing !== Timing.CONSTRAINED_SUN) ? wt.dstOffset / 3600 : 0);
  const handAngle = _hourOfDay * 15 - 180;
  const baseSunAngle = solarSystem.getEclipticPosition(SUN, _jde).longitude.degrees;
  const baseMoonAngle = solarSystem.getEclipticPosition(MOON, _jde).longitude.degrees;
  const sunAngle = adjustForEclipticWheel(baseSunAngle, southern);
  const moonAngle = adjustForEclipticWheel(baseMoonAngle, southern);
  const siderealAngle = observer.getLocalHourAngle(_jdu, true).degrees - 90;
  const moonPhase = mod(baseMoonAngle - baseSunAngle, 360);
  const moonHandAngle = calculateMoonHandAngle(moonAngle.ie, siderealAngle);
  const _constrainedSunAngle = calculateEclipticAnglesFromHandAngle(handAngle, siderealAngle);

  return { _jde, _jdu, _hourOfDay, _date, handAngle, moonAngle, moonHandAngle, moonPhase, siderealAngle, sunAngle,
           _constrainedSunAngle };
}

export function calculateMechanicalPositions(time: number, timing: Timing, ref: BasicPositions): BasicPositions {
  const deltaDays = (time - ref._referenceTime) / MILLIS_PER_DAY;
  const deltaSiderealDays = deltaDays * 366 / 365;
  // The moon is off by about one day every three months with the original 366 / 379 gear ratio.
  const deltaMoonDays = deltaDays * (timing === Timing.MECHANICAL_ORIGINAL ? 366 / 379 : 0.966139); // 0.966137 is closer to the true mean synodic lunar month
  const phaseCycles = deltaMoonDays * 2 / 57;
  const handAngle = mod(ref.handAngle + deltaDays * 360, 360);
  const moonHandAngle = mod(ref.moonHandAngle + deltaMoonDays * 360, 360);
  const siderealAngle = mod(ref.siderealAngle + deltaSiderealDays * 360, 360);

  return {
    handAngle,
    moonAngle: calculateEclipticAnglesFromHandAngle(moonHandAngle, siderealAngle),
    moonHandAngle,
    moonPhase: mod(ref.moonPhase + phaseCycles * 360, 360),
    siderealAngle,
    sunAngle: calculateEclipticAnglesFromHandAngle(handAngle, siderealAngle)
  };
}

export function calculateMoonHandAngle(moonAngle: number, siderealAngle: number): number {
  // Note: SVG angles start at "noon" and go clockwise, rather than at 3:00 going counterclockwise,
  // so the roles of sin and cos are swapped, and signs are changed.
  const x = sin_deg(moonAngle) * ECLIPTIC_INNER_RADIUS;
  const y = -cos_deg(moonAngle) * ECLIPTIC_INNER_RADIUS - ECLIPTIC_CENTER_OFFSET;

  return 90 + atan2_deg(y, x) + siderealAngle;
}
