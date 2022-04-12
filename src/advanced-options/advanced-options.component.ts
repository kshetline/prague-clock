import { Component, ElementRef } from '@angular/core';

export enum Timing { MODERN, MECHANICAL_ORIGINAL, MECHANICAL_UPDATED }

export interface SettingsHolder {
  additionalPlanets: boolean;
  detailedMechanism: boolean;
  fasterGraphics: boolean;
  hideMap: boolean;
  post2018: boolean;
  realPositionMarkers: boolean;
  showErrorValues: boolean;
  timing: Timing;
  translucentEcliptic: boolean;
}

@Component({
  selector: 'app-advanced-options',
  templateUrl: './advanced-options.component.html',
  styleUrls: ['./advanced-options.component.scss']
})
export class AdvancedOptionsComponent {
  MODERN = Timing.MODERN;
  MECHANICAL_ORIGINAL = Timing.MECHANICAL_ORIGINAL;
  MECHANICAL_UPDATED = Timing.MECHANICAL_UPDATED;

  private shown = false;

  settingsHolder: SettingsHolder;

  constructor(private elementRef: ElementRef) {}

  show(): void {
    (this.elementRef.nativeElement as HTMLElement).style.display = 'flex';

    if (!this.shown) {
      document.body.addEventListener('click', this.clicker);
      this.shown = true;
    }
  }

  hide(): void {
    (this.elementRef.nativeElement as HTMLElement).style.display = 'none';

    if (this.shown) {
      document.body.removeEventListener('click', this.clicker);
      this.shown = false;
    }
  }

  get pre2018(): boolean { return !this.settingsHolder.post2018; }
  set pre2018(value: boolean) { this.settingsHolder.post2018 = !value; }

  clicker = (evt: MouseEvent): void => {
    const r = this.elementRef.nativeElement?.getBoundingClientRect();

    if (r && (evt.pageX < r.left || evt.pageX > r.right || evt.pageY < r.top || evt.pageY > r.bottom))
      this.hide();
  }
}
