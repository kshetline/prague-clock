import { Component, ElementRef } from '@angular/core';

export enum Appearance { CURRENT, CURRENT_NO_MAP, PRE_2018, ORIGINAL_1410 }
export enum Timing { MODERN, MECHANICAL_ORIGINAL, MECHANICAL_UPDATED }

export interface SettingsHolder {
  additionalPlanets: boolean;
  appearance: Appearance;
  background: string;
  detailedMechanism: boolean;
  fasterGraphics: boolean;
  hideMap?: boolean;
  post2018?: boolean;
  realPositionMarkers: boolean;
  showInfoPanel: boolean;
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

  appearanceOptions = [
    { label: $localize`Post-2018 colors`, value: Appearance.CURRENT },
    { label: $localize`Post-2018 colors, no map`, value: Appearance.CURRENT_NO_MAP },
    { label: $localize`Pre-2018 colors`, value: Appearance.PRE_2018 },
    { label: $localize`Original 1410 look?`, value: Appearance.ORIGINAL_1410 }
  ];

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

  clicker = (evt: MouseEvent): void => {
    const r = this.elementRef.nativeElement?.getBoundingClientRect();

    if (r && (evt.pageX < r.left || evt.pageX > r.right || evt.pageY < r.top || evt.pageY > r.bottom))
      this.hide();
  }
}
