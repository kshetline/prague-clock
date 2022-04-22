import { abs, atan2_deg, atan_deg, cos_deg, floor, max, min, PI, sign, sin_deg, sqrt, tan_deg } from '@tubular/math';
import { Appearance } from 'src/advanced-options/advanced-options.component';
import { circleIntersections, ECLIPTIC_OUTER_RADIUS, eclipticToOffCenter, findCircleRadius } from 'src/math/math';
import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const CLOCK_RADIUS = 250;
const INCLINATION = 23.5;
const ARCTIC = 90 - INCLINATION;
const LABEL_RADIUS = 212;
const EQUATOR_RADIUS = 164.1;
const HORIZON_RADIUS = CLOCK_RADIUS * tan_deg((90 - INCLINATION) / 2);
const TROPIC_RADIUS = HORIZON_RADIUS * tan_deg((90 - INCLINATION) / 2);
const MAX_UNEVEN_HOUR_LATITUDE = 86;

@Pipe({ name: 'safe' })
export class SafeHtmlPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}

export interface SvgHost {
  appearance: Appearance;
  bohemianHours?: string;
  bohemianHoursSouth?: string;
  darkCy?: number;
  darkR?: number;
  dawnLabelPath?: string;
  dawnTextOffset?: number;
  dayAreaMask?: string;
  duskGradientAdjustment?: number;
  duskLabelPath?: string;
  duskTextOffset?: number;
  eclipticMajorTicks?: string;
  eclipticMinorTicks?: string;
  equatorSunriseAngle?: number;
  hourArcs?: string[];
  hourStroke?: number;
  hourWedges?: string[];
  horizonCy?: number;
  horizonPath?: string;
  horizonR?: number;
  innerSunriseAngle?: number;
  latitude: number;
  longitude: number;
  midnightSunR?: number | null;
  moonPhase: number;
  outerSunriseAngle?: number | null;
  riseSetFontSize?: string;
  romanHours?: string;
  romanHoursSouth?: string;
  rotateSign: number;
  solNoctisPath?: string;
  southern?: boolean;
  sunriseLabelPath?: string;
  sunsetLabelPath?: string;
}

export function initSvgHost(host: SvgHost): void {
  host.hourArcs = [];
  host.hourWedges = [];

  host.duskGradientAdjustment = 80;
  host.equatorSunriseAngle = null;
  host.hourStroke = 2;
  host.innerSunriseAngle = null;
  host.midnightSunR = 0;
  host.outerSunriseAngle = null;
  host.riseSetFontSize = '15px';
  host.solNoctisPath = '';
  host.southern = false;

  host.bohemianHours = host.bohemianHoursSouth = '';

  const bh = (p: number, i: number): string => `<text><textPath href="#outerRingTextPath" startOffset="${
    (100 * p / 24).toFixed(1)}%" class="outerRingText">${String.fromCharCode(0x26F + i)}</textPath></text>`;

  for (let i = 1; i <= 24; ++i) {
    host.bohemianHours += bh(i, i);
    host.bohemianHoursSouth += bh(24 - i, i);
  }

  host.romanHours = host.romanHoursSouth = '';

  const hours = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
  const rh = (p: number, i: number, t?: string): string => {
    const pct = (i === 24 ? '50.0' : (100 * p / 24).toFixed(1));
    const text = t || hours[(i - 1) % 12];
    const mod = (t ? ' class="four-iiii"' :
      i === 24 ? ' transform="rotate(180)"' : i === 4 || i === 16 ? ' class="four-iv"' : '');

    return `<text${mod}><textPath href="#timeTextPath" startOffset="${
      pct}%" class="timeText">${text}</textPath></text>\n`;
  };

  for (let i = 1; i <= 24; ++i) {
    host.romanHours += rh(i, i);
    host.romanHoursSouth += rh(24 - i, i);

    if (i === 4 || i === 16) {
      host.romanHours += rh(i, i, 'iiii');
      host.romanHoursSouth += rh(24 - i, i, 'iiii');
    }
  }

  host.eclipticMajorTicks = host.eclipticMinorTicks = '';

  for (let a = -90; a < 270; a += 6) {
    const angle = eclipticToOffCenter(a, false);
    const x = cos_deg(angle) * ECLIPTIC_OUTER_RADIUS;
    const y = sin_deg(angle) * ECLIPTIC_OUTER_RADIUS;

    if (a % 30 === 0)
      host.eclipticMajorTicks += `<path d="M0 71.1L${x.toFixed(2)} ${y.toFixed(2)}" class="eclipticCircle"/>`;
    else
      host.eclipticMinorTicks += `<path d="M0 71.1L${x.toFixed(2)} ${y.toFixed(2)}" class="eclipticDial"/>`;
  }
}

function getHourArc(host: SvgHost, hour: number, asWedge = false, reverse = false): string {
  if (host.outerSunriseAngle == null)
    return '';

  let outer = CLOCK_RADIUS;
  let inner = TROPIC_RADIUS;

  if (host.midnightSunR) {
    outer = host.midnightSunR;
    const deltaLat = 90 - 2 * atan_deg(host.midnightSunR / CLOCK_RADIUS);
    inner = TROPIC_RADIUS * tan_deg((90 + deltaLat) / 2);
  }

  const h = (host.southern ? hour : 12 - hour);
  const outerSweep = 180 + host.outerSunriseAngle * 2;
  const outerAngle = host.outerSunriseAngle - outerSweep / 12 * h;
  const x1 = outer * cos_deg(outerAngle);
  const y1 = outer * sin_deg(outerAngle);
  const equatorSweep = 180 + host.equatorSunriseAngle * 2;
  const equatorAngle = host.equatorSunriseAngle - equatorSweep / 12 * h;
  const x2 = EQUATOR_RADIUS * cos_deg(equatorAngle);
  const y2 = EQUATOR_RADIUS * sin_deg(equatorAngle);
  const innerSweep = 180 + host.innerSunriseAngle * 2;
  const innerAngle = host.innerSunriseAngle - innerSweep / 12 * h;
  const x3 = inner * cos_deg(innerAngle);
  const y3 = inner * sin_deg(innerAngle);
  const r = findCircleRadius(x1, y1, x2, y2, x3, y3);

  if (!asWedge && host.southern)
    reverse = !reverse;

  if (reverse)
    return `M ${x3} ${y3} A${r} ${r} 0 0 ${h < 6 ? 1 : 0} ${x1} ${y1} `;

  let path = `M ${x1} ${y1} A${r} ${r} 0 0 ${h < 6 ? 0 : 1} ${x3} ${y3}`;

  if (asWedge)
    path += 'L' + getHourArc(host, hour + sign(hour - 6), false, !host.southern).substring(1) +
      `A ${outer} ${outer} 0 0 ${h < 6 ? 0 : 1} ${x1} ${y1} Z`;

  return path;
}

interface CircleAttributes {
  cy: number;
  d?: string;
  r: number;
}

function getAltitudeCircle(host: SvgHost, alt: number, doPath = false): CircleAttributes {
  const lat = max(abs(host.latitude), 0.5);
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

function adjustDawnDuskGradient(host: SvgHost): void {
  // Adjust radial gradient based on the rough distance between the horizon circle and then
  // absolute night circle, in comparison to the horizon circle radius.
  const gp1 = (circleIntersections(0, 0, EQUATOR_RADIUS, 0, host.horizonCy, host.horizonR) ?? [])[0];
  const gp2 = (circleIntersections(0, 0, EQUATOR_RADIUS, 0, host.darkCy, host.darkR) ?? [])[0];
  let span = host.horizonR / 3;

  if (gp1 && gp2)
    span = sqrt((gp2.x - gp1.x) ** 2 + (gp2.y - gp1.y) ** 2);

  span = min(span, host.horizonR - host.darkR);
  host.duskGradientAdjustment = max(min((1 - span / host.horizonR) * 100, 99.6), 80);
}

function createDayAreaMask(host: SvgHost, outerR: number): void {
  let inner = TROPIC_RADIUS;

  if (outerR !== CLOCK_RADIUS) {
    const deltaLat = 90 - 2 * atan_deg(outerR / CLOCK_RADIUS);
    inner = TROPIC_RADIUS * tan_deg((90 + deltaLat) / 2);
  }

  let outerPoints = circleIntersections(0, 0, outerR, 0, host.horizonCy, host.horizonR);
  const equatorPoints = circleIntersections(0, 0, EQUATOR_RADIUS, 0, host.horizonCy, host.horizonR);
  let innerPoints = circleIntersections(0, 0, inner, 0, host.horizonCy, host.horizonR);

  if (!outerPoints || outerPoints.length < 2)
    outerPoints = circleIntersections(0, 0, outerR - 1E-6, 0, host.horizonCy, host.horizonR);

  if (!innerPoints || innerPoints.length < 2)
    innerPoints = circleIntersections(0, 0, inner + 1E-6, 0, host.horizonCy, host.horizonR);

  if (!outerPoints || outerPoints.length < 2 || !innerPoints || innerPoints.length < 2 ||
      abs(host.latitude) > MAX_UNEVEN_HOUR_LATITUDE) {
    host.dayAreaMask = '';
    host.outerSunriseAngle = null;
    return;
  }

  const x1 = outerPoints[0].x;
  const y1 = outerPoints[0].y;
  const r2 = host.horizonR;
  const x2 = innerPoints[0].x;
  const y2 = innerPoints[0].y;
  const r3 = inner;
  const x3 = innerPoints[1].x;
  const y3 = innerPoints[1].y;
  const r4 = host.horizonR;
  const x4 = outerPoints[1].x;
  const y4 = outerPoints[1].y;
  const r5 = outerR;

  host.dayAreaMask = `M${x1} ${y1} A${r2} ${r2} 0 0 0 ${x2} ${y2}`;

  if (outerR === CLOCK_RADIUS)
    host.dayAreaMask += `A${r3} ${r3} 0 0 0 ${x3} ${y3} `;

  host.dayAreaMask += `A${r4} ${r4} 0 0 0 ${x4} ${y4}A${r5} ${r5} 0 1 1 ${x1} ${y1}`;

  host.outerSunriseAngle = atan2_deg(y1, x1);
  host.innerSunriseAngle = atan2_deg(y2, x2);
  host.equatorSunriseAngle = atan2_deg(equatorPoints[0].y, equatorPoints[0].x);
}

export function adjustGraphicsForLatitude(host: SvgHost): void {
  host.southern = (host.latitude < 0);
  host.rotateSign = (host.southern ? -1 : 1);
  ({ cy: host.horizonCy, d: host.horizonPath, r: host.horizonR } = getAltitudeCircle(host, 0, true));
  ({ cy: host.darkCy, r: host.darkR } =
    getAltitudeCircle(host, host.appearance === Appearance.ORIGINAL_1410 ? -10 : -18));

  const absLat = abs(host.latitude);
  const excessLatitude = absLat - ARCTIC;

  if (excessLatitude < 0) {
    host.midnightSunR = 0;
    host.solNoctisPath = '';
    createDayAreaMask(host, CLOCK_RADIUS);
  }
  else {
    host.midnightSunR = host.horizonR + host.horizonCy - 1E-4;

    const r = (host.midnightSunR + CLOCK_RADIUS) / 2;
    const x1 = cos_deg(105) * r;
    const y1 = sin_deg(105) * r;
    const x2 = cos_deg(75) * r;
    const y2 = sin_deg(75) * r;

    host.solNoctisPath = `M ${x1} ${y1} A ${r} ${r} 0 0 0 ${x2} ${y2}`;
    createDayAreaMask(host, host.midnightSunR);
  }

  if (host.outerSunriseAngle != null && absLat <= MAX_UNEVEN_HOUR_LATITUDE) {
    for (let h = 1; h <= 11; ++h) {
      host.hourArcs[h] = getHourArc(host, h);
      host.hourWedges[h] = getHourArc(host, h, true);
    }

    host.sunriseLabelPath = getHourArc(host, 0.5);
    host.sunsetLabelPath = getHourArc(host, 11.5, false, true);

    const top = (host.horizonCy - host.horizonR + host.darkCy - host.darkR) / 2;
    const bottom = (host.horizonCy + host.horizonR + host.darkCy + host.darkR) / 2;
    const r = (host.horizonR + host.darkR) / 2;
    const leftArc = `M 0 ${bottom} A ${r} ${r} 0 0 1 0 ${top}`;
    const rightArc = `M 0 ${top} A ${r} ${r} 0 0 1 0 ${bottom}`;
    const pathLength = r * PI;
    const labelShift = 250 - cos_deg(host.latitude) * 70;

    host.dawnLabelPath = host.southern ? rightArc : leftArc;
    host.dawnTextOffset = host.southern ? labelShift : pathLength - labelShift;
    host.duskLabelPath = host.southern ? leftArc : rightArc;
    host.duskTextOffset = host.southern ? pathLength - labelShift : labelShift;

    if (excessLatitude <= 0) {
      host.hourStroke = 2;
      host.riseSetFontSize = '15px';
    }
    else {
      host.hourStroke = 1;
      host.riseSetFontSize = (cos_deg(absLat) * 37.6).toFixed(1) + 'px';
    }
  }
  else {
    host.hourArcs = [];
    host.hourStroke = 2;
    host.hourWedges = [];
    host.dawnLabelPath = host.duskLabelPath = host.sunriseLabelPath = host.sunsetLabelPath = '';
  }

  const hourLabels = document.getElementById('unequalHourLabels') as unknown as SVGGElement;
  const pts = circleIntersections(0, 0, LABEL_RADIUS, 0, host.horizonCy, host.horizonR);
  const hAdj1 = [0, 3, -3, -7, -9, -9, -9, -12, -14, -13, -9, -3, 5];
  const vAdj1 = [0, 30, 27, 23, 19, 16, 12, 9, 3, -4, -9, -14, -17];
  const hAdj2 = [0, 15, 12, 0, -12, -20, -9, -5, -5, 0, 0, 8, 20];
  const vAdj2 = [0, 30, 27, 42, 38, 25, 12, 9, 6, 5, -5, -14, -24];

  if (host.outerSunriseAngle == null || !pts || pts.length < 2 || absLat > 74)
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

      html += `>${host.southern ? 13 - h : h}</text>`;
    }

    hourLabels.innerHTML = html;
  }

  adjustDawnDuskGradient(host);
}

export function sunlitMoonPath(host: SvgHost): string {
  const largeArcFlag = host.moonPhase < 180 ? 1 : 0;
  const sweepFlag = floor(host.moonPhase / 90) % 2;
  const x = (abs(cos_deg(host.moonPhase)) * 12).toFixed(1);

  return `M0 -12.0A12.0 12.0 0 0 ${largeArcFlag} 0 12.0A${x} 12.0 0 0 ${sweepFlag} 0 -12.0`;
}
