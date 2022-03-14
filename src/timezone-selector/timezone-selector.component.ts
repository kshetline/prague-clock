import { Component, EventEmitter, forwardRef, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { abs, max, sign } from '@tubular/math';
import { Timezone, RegionAndSubzones } from '@tubular/time';
import { noop, toNumber, urlEncodeParams } from '@tubular/util';
import { Subject, Subscription, timer } from 'rxjs';
import { throttleTime } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { AutoComplete } from 'primeng/autocomplete';

const SVC_ZONE_SELECTOR_VALUE_ACCESSOR: any = {
  provide: NG_VALUE_ACCESSOR,
  useExisting: forwardRef(() => TimezoneSelectorComponent),
  multi: true,
};

const MISC_OPTION = '- Miscellaneous -';
const UT_OPTION   = '- UTC hour offsets -';
const OS_OPTION   = '- Your OS timezone -';
const LMT_OPTION  = '- Local Mean Time -';

const MISC = 'MISC';
const UT   = 'UT';
const OS   = 'OS';
const LMT  = 'LMT';

interface AtlasLocation {
  displayName: string;
  latitude: number;
  longitude: number;
  matchedBySound: boolean;
  placeType: string;
  zone: string;
}

interface AtlasResults {
  error: string;
  matches: AtlasLocation[];
}

export interface TzsLocation {
  latitude: number;
  longitude: number;
  name: string;
}

function toCanonicalOffset(offset: string): string {
  let off = offset;
  let dst = '';
  const $ = /([-+]\d+(?::\d+)?)(.+)?/.exec(offset);

  if ($) {
    off = $[1];
    dst = ($[2] ?? '').replace('with', '').trim();

    if (dst.includes('two'))
      dst = '#';
    else if (dst.includes('half'))
      dst = '^';
    else if (dst.includes('negative'))
      dst = '\u2744';
    else if (dst === 'DST')
      dst = '§';
    else if (dst)
      dst = '~';
  }

  return off + dst;
}

function toCanonicalZone(zone: string): string {
  return zone?.replace(/^.+:\xA0/, '').replace(/\s+\([^)]+\)$/, '').replace(/ /g, '_').replace(/\bKyiv\b/, 'Kiev');
}

function toDisplayOffset(offset: string): string {
  if (!offset)
    return null;

  let off = offset;
  let dst = '';
  const $ = /([-+]\d+(?::\d+)?)([§#~^\u2744])?/.exec(offset);

  if ($) {
    off = $[1];
    dst = $[2] ?? '';

    if (dst === '§')
      dst = 'DST';
    else if (dst === '#')
      dst = 'two-hour DST';
    else if (dst === '^')
      dst = 'half-hour DST';
    else if (dst === '\u2744')
      dst = 'negative DST';
    else if (dst === '~')
      dst = 'non-standard DST';

    if (dst)
      dst = ' with ' + dst;
  }

  return `UTC${off}${dst}`;
}

function toDisplayZone(zone: string): string {
  return zone?.replace(/_/g, ' ').replace(/\bKiev\b/, 'Kyiv');
}

function formatSearchResult(location: AtlasLocation): string {
  let s = location.displayName.replace(/\s*\(.+?\)\s*/g, '') + ':\xA0' + location.zone;

  if (s.length > 40)
    s = s.replace(/^[^,]+/, match => match.substr(0, max(match.length - s.length + 39, 8)) + '…');

  s += ` (${abs(location.latitude).toFixed(1)}°${location.latitude < 0 ? 'S' : 'N'},` +
       ` ${abs(location.longitude).toFixed(1)}°${location.longitude < 0 ? 'W' : 'E'})`;

  return s;
}

@Component({
  selector: 'tze-zone-selector',
  templateUrl: './timezone-selector.component.html',
  styleUrls: ['./timezone-selector.component.scss'],
  providers: [SVC_ZONE_SELECTOR_VALUE_ACCESSOR],
})
export class TimezoneSelectorComponent implements ControlValueAccessor, OnInit {
  regions: string[] = [UT_OPTION];
  subzones: string[] = [UT];
  offsets: string[] = [];
  zones: string[] = [];

  private _offset: string;
  private _region: string = this.regions[0];
  private _searchText = '';
  private _selectByOffset = true;
  private _subzone: string = this.subzones[0];
  private _value: string = UT;
  private _zone: string;

  private focusCount = 0;
  private hasFocus = false;
  private knownIanaZones = new Set<string>();
  private lastRemoteSearch: Subscription;
  private lastSearch: string;
  private lastSubzones: Record<string, string> = {};
  private lastZones: Record<string, string> = {};
  private offsetByZone = new Map<string, string>();
  private onChangeCallback: (_: any) => void = noop;
  private onTouchedCallback: () => void = noop;
  private searchCheck: any;
  private searches = new Subject<string>();
  private subzonesByRegion: Record<string, string[]> = {};
  private zonesByOffset = new Map<string, string[]>();

  @Input() autofocus = false;
  disabled = false;
  emptyMessage: string;
  error: string;
  matchZones: string[] = [];
  searching = false;

  // eslint-disable-next-line @angular-eslint/no-output-native
  @Output() focus: EventEmitter<any> = new EventEmitter();
  // eslint-disable-next-line @angular-eslint/no-output-native
  @Output() blur: EventEmitter<any> = new EventEmitter();
  @Output() location: EventEmitter<TzsLocation> = new EventEmitter();

  @ViewChild('autoComplete', { static: true }) autoComplete: AutoComplete;

  constructor(private http: HttpClient) {
    this.lastSubzones[this._region] = this._subzone;
    this.subzonesByRegion[this._region] = this.subzones;

    this.searches.pipe(throttleTime(1000, undefined, { leading: true, trailing: true })).subscribe(search => {
      if (this.lastRemoteSearch)
        this.lastRemoteSearch.unsubscribe();

      const params = urlEncodeParams({
        client: 'web',
        pt: 'false',
        q: search
      });
      const timer = setTimeout(() => this.searching = true, 500);

      this.lastRemoteSearch = this.http.jsonp<AtlasResults>('https://skyviewcafe.com/atlas/?' + params, 'callback')
        .subscribe({
          next: results => {
            clearTimeout(timer);
            this.searching = false;

            if (!results.error) {
              const matches = results.matches.filter(match => !match.matchedBySound &&
                  /^(A.ADM|P.PPL)/.test(match.placeType));
              const newMatches: string[] = [];

              newMatches.push(...this.matchZones, ...matches.map(match => formatSearchResult(match)));
              this.autoComplete.loading = true;
              this.matchZones = newMatches;
              this.emptyMessage = 'No matching cites/timezones';
            }
          },
          error: err => { this.searching = false; console.error(err); }
        });
    });
  }

  get value(): string | null {
    if (!this._region || this._subzone == null)
      return null;
    else if (this._region === MISC_OPTION || this._region === UT_OPTION)
      return this._subzone;
    else if (this._region === LMT_OPTION)
      return LMT;
    else if (this._region === OS_OPTION)
      return OS;
    else if (this._subzone.startsWith('UT'))
      return null;

    return toCanonicalZone(this._region + '/' + this._subzone);
  }

  set value(newValue: string) {
    let $ = /\s+\([^)]+\)$/.exec(newValue);

    if ($ && ($ = /^(.+?):\xA0.*?([0-9.]+).([NS]).+?([0-9.]+).([EW])/.exec(newValue)))
      this.location.emit({
        latitude: toNumber($[2]) * ($[3] === 'S' ? -1 : 1),
        longitude: toNumber($[4]) * ($[5] === 'W' ? -1 : 1),
        name: $[1]
      });

    newValue = toCanonicalZone(newValue);

    if (this._value !== newValue) {
      this._value = newValue;
      this.updateValue(newValue);
      setTimeout(() => this.onChangeCallback(newValue));
    }
  }

  private updateValue(newZone: string): void {
    if (newZone === null) {
      this._region = this._subzone = this._value = null;
      this._offset = this._zone = null;

      return;
    }

    if (!this.knownIanaZones.has(newZone) && Timezone.has(newZone)) {
      const aliasFor = Timezone.getTimezone(newZone).aliasFor;

      if (aliasFor)
        newZone = aliasFor;
    }

    const groups: string[] = /^(America\/Argentina\/|America\/Indiana\/|SystemV\/\w+|\w+\/|[-+:0-9A-Za-z]+)(.+)?$/.exec(newZone);

    if (groups) {
      let g1 = groups[1];
      let g2 = groups[2];

      if (!this.knownIanaZones.has(newZone) && g1 !== LMT && g1 !== OS && !g1.startsWith(UT)) {
        g1 = OS;
        g2 = undefined;
      }

      if (g1.endsWith('/'))
        g1 = groups[1].slice(0, -1);

      if (g2 === undefined) {
        if (g1.startsWith(UT)) {
          this.setRegion(UT_OPTION);
          this.subzone = g1;
        }
        else if (g1 === LMT) {
          this.setRegion(LMT_OPTION);
          this.subzone = '';
        }
        else if (g1 === OS) {
          this.setRegion(OS_OPTION);
          this.subzone = '';
        }
        else {
          this.setRegion(MISC_OPTION);
          this.subzone = g1;
        }
      }
      else {
        this.setRegion(g1);
        this.subzone = toDisplayZone(g2);
      }
    }
    else {
      this.setRegion(UT_OPTION);
      this.subzone = UT;
    }

    this.updateOffsetAndZoneForValue(newZone);
  }

  private updateOffsetAndZoneForValue(newZone: string): void {
    if (!newZone)
      return;

    const offset = toDisplayOffset(this.offsetByZone.get(newZone));

    if (offset) {
      this.setOffset(offset);
      this.zone = toDisplayZone(newZone);
      this.lastZones[offset] = this._zone;
    }
    else {
      this.setOffset('UTC+00:00');
      this._zone = this.zones[0];
      this.selectByOffset = false;
    }
  }

  onDropdownFocus(event: any): void {
    this.hasFocus = true;

    if (this.focusCount++ === 0)
      this.focus.emit(event);
  }

  onDropdownBlur(event: any): void {
    this.hasFocus = false;
    // If focus is lost and hasn't come back to a different selection on the next event cycle, assume
    // the selector as a whole has lost focus.
    timer(0).subscribe(() => {
      --this.focusCount;

      if (!this.hasFocus) {
        this.onTouchedCallback();
        this.blur.emit(event);
      }
    });
  }

  writeValue(newZone: any): void {
    if (this._value !== newZone)
      this.updateValue(newZone);
  }

  registerOnChange(fn: any): void {
    this.onChangeCallback = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouchedCallback = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  get selectByOffset(): boolean { return this._selectByOffset; };
  set selectByOffset(newValue: boolean) {
    if (this._selectByOffset !== newValue) {
      this._selectByOffset = newValue;

      if (newValue && this._value !== toCanonicalZone(this._zone))
        this.value = toCanonicalZone(this._zone);
    }
  }

  get offset(): string { return this._offset; }
  set offset(newOffset: string) { this.setOffset(newOffset, true); }

  get region(): string { return this._region; }
  set region(newRegion: string) { this.setRegion(newRegion, true); }

  get subzone(): string { return this._subzone; }
  set subzone(newZone: string) {
    if (!newZone)
      return;

    if (this._subzone !== newZone) {
      this._subzone = newZone;
      this.lastSubzones[this._region] = newZone;
      this._value = this.value;
      this.updateOffsetAndZoneForValue(this._value);
      this.onChangeCallback(this._value);
    }
  }

  get zone(): string { return this._zone; }
  set zone(newZone: string) {
    if (!newZone)
      return;

    if (this._zone !== newZone) {
      this._zone = newZone;
      this.lastZones[this._offset] = newZone;
      this.value = toCanonicalZone(newZone);
    }
  }

  get searchText(): string { return this._searchText; }
  set searchText(newValue: string) {
    if (this._searchText !== newValue) {
      this._searchText = newValue;

      if (newValue) {
        if (this.searchCheck)
          clearTimeout(this.searchCheck);

        this.lastSearch = newValue;
        this.value = newValue;

        let checkCount = 0;
        const check = (): void => {
          if (this.lastSearch && this.searchText === this.lastSearch)
            this.searchText = '';

          if (++checkCount < 10)
            this.searchCheck = setTimeout(check, 100);
          else
            this.searchCheck = undefined;
        };

        this.searchCheck = setTimeout(check, 100);
      }
      else if (this.searchText !== '')
        setTimeout(() => this.searchText = '', 100);
    }
  }

  ngOnInit(): void {
    this.updateTimezones();

    // this.appService.getAppEventUpdates(evt => {
    //   if (evt.name === IANA_DB_UPDATE)
    //     this.updateTimezones();
    // });
  }

  searchSelect(s: any): void {
    this.searching = false;

    const remoteQuery = (s.query || '').trim().replace(/\s+/g, '_').toLowerCase();
    const query = (remoteQuery || '#');
    const zones = Timezone.getAvailableTimezones();
    const kiev = zones.indexOf('Europe/Kiev');

    if (kiev >= 0)
      zones.splice(kiev, 0, 'Europe/Kyiv');

    this.matchZones = zones.filter(zone => zone.toLowerCase().includes(query));

    if (this.lastRemoteSearch) {
      this.lastRemoteSearch.unsubscribe();
      this.lastRemoteSearch = undefined;
    }

    if (remoteQuery.length > 3) {
      this.emptyMessage = 'Searching...';
      this.searches.next(remoteQuery);
    }
    else
      this.emptyMessage = 'No matching timezones';
  }

  checkForEnter(evt: KeyboardEvent): void {
    if (evt.key === 'Enter' && this.matchZones.length === 1) {
      this.searchText = this.matchZones[0];
      let count = 0;
      const interval = setInterval(() => {
        (evt.target as HTMLInputElement).value = '';
        this.matchZones = [];

        if (++count === 3)
          clearInterval(interval);
      }, 100);
    }
  }

  private updateTimezones(): void {
    const rAndS = Timezone.getRegionsAndSubzones();

    this.knownIanaZones.clear();

    for (const region of rAndS) {
      region.subzones.forEach((subzone: string) => {
        const zone = (region.region === MISC ? '' : region.region + '/') + toCanonicalZone(subzone);
        this.knownIanaZones.add(zone);
      });
    }

    const hourOffsets: string[] = [];

    for (let h = -12; h <= 14; ++h) {
      const habs = Math.abs(h);

      hourOffsets.push('UT' + (h === 0 ? '' : (h > 0 ? '+' : '-') + (habs < 10 ? '0' : '') + habs + ':00'));
    }

    rAndS.push({ region: UT_OPTION, subzones: hourOffsets });
    rAndS.push({ region: OS_OPTION, subzones: [] });
    rAndS.push({ region: LMT_OPTION, subzones: [] });

    rAndS.forEach((region: RegionAndSubzones) => {
      if (region.region === MISC)
        region.region = MISC_OPTION;

      const forDisplay = region.subzones.map(zone => toDisplayZone(zone));

      this.subzonesByRegion[region.region] = forDisplay;

      if (region.region === this._region)
        this.subzones = forDisplay;
    });

    this.regions = rAndS.map((region: RegionAndSubzones) => region.region);
    this.offsets = [];
    this.offsetByZone.clear();
    this.zonesByOffset.clear();

    const oAndZ = Timezone.getOffsetsAndZones();

    oAndZ.sort((a, b) => {
      const diff = a.offsetSeconds - b.offsetSeconds;

      if (diff !== 0)
        return sign(diff);
      else
        return sign(abs(a.dstOffset) - abs(b.dstOffset));
    });

    for (const offset of oAndZ) {
      this.offsets.push(toDisplayOffset(offset.offset));
      this.zonesByOffset.set(offset.offset, offset.zones.map(zone => toDisplayZone(zone)));

      for (const zone of offset.zones)
        this.offsetByZone.set(toCanonicalZone(zone), offset.offset);
    }
  }

  private setOffset(newOffset: string, doChangeCallback?: boolean): void {
    if (this._offset !== newOffset) {
      this._offset = newOffset;
      this._zone = '';

      const zones = this.zonesByOffset.get(toCanonicalOffset(newOffset));

      if (zones)
        this.zones = zones;
      else
        this.zones = [];

      if (doChangeCallback) {
        const lastZone = this.lastZones[newOffset];

        if (lastZone)
          this._zone = lastZone;
        else if (this.zones.length > 0) {
          this._zone = this.zones[0];
          this.lastZones[newOffset] = this._zone;
        }

        if (this.zones.length > 0 && this.zone) {
          this._value = toCanonicalZone(this._zone);
          this.updateValue(this._value);
        }

        this.onChangeCallback(this._value);
      }
      else
        this._zone = toDisplayZone(this._value);
    }
  }

  private setRegion(newRegion: string, doChangeCallback?: boolean): void {
    if (this._region !== newRegion) {
      this._region = newRegion;
      this._subzone = '';

      const subzones = this.subzonesByRegion[newRegion];

      if (subzones)
        this.subzones = subzones;
      else
        this.subzones = [];

      const lastSubzone = this.lastSubzones[newRegion];

      if (lastSubzone)
        this._subzone = lastSubzone;
      else if (this.subzones.length > 0) {
        this._subzone = this.subzones[0];
        this.lastSubzones[newRegion] = this._subzone;
      }

      if (this.subzones.length > 0 && this.subzone)
        this._value = this.value;
      else if (newRegion === LMT_OPTION)
        this._value = LMT;
      else if (this._region === OS_OPTION)
        this._value = OS;

      if (doChangeCallback)
        this.onChangeCallback(this._value);
    }
  }
}
