import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  eclipticAngle = 0;
  handAngle = 0;
  moonAngle = 0;
  outerRingAngle = 0;
  sunAngle = 0;

  rotate(angle: number): string {
    return `rotate(${angle})`;
  }
}
