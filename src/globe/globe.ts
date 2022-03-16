/* eslint-disable @typescript-eslint/no-unused-vars */
import { getPixel, strokeLine } from '@tubular/util';
import { abs, atan, atan2, cos, max, min, mod, PI, round, sin, SphericalPosition3D, sqrt, to_degree } from '@tubular/math';

const MAP_HEIGHT = 500;
const MAP_WIDTH = 1000;
const GLOBE_SIZE = 500;
const VIEW_DISTANCE = 3; // Earth radii
const VIEW_ANGLE = atan(sqrt(VIEW_DISTANCE ** 2 + 2 * VIEW_DISTANCE));
const VIEW_RADIUS = sin(VIEW_ANGLE);
const VIEW_PLANE = cos(VIEW_ANGLE);

export class Globe {
  private static mapFailed = false;
  private static mapImage: HTMLImageElement;
  private static mapLoading = false;
  private static mapPixels: ImageData;
  private static waitList: { resolve: () => void, reject: (reason: any) => void }[] = [];

  private canvas = document.createElement('canvas');
  private lat: number;
  private lon: number;

  static loadMap(): void {
    this.mapLoading = true;

    const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();

      image.onload = (): void => {
        resolve(image);
      };
      image.onerror = (): void => {
        reject(new Error('Map image failed to load from: ' + image.src));
      };

      image.src = 'assets/world.jpg';
    });

    imagePromise.then(image => {
      this.mapLoading = false;
      this.mapImage = image;

      const canvas = document.createElement('canvas');

      canvas.width = MAP_WIDTH;
      canvas.height = MAP_HEIGHT;

      const context = canvas.getContext('2d');

      context.drawImage(image, 0, 0, MAP_WIDTH, MAP_HEIGHT);
      context.strokeStyle = '#666';

      // Draw lines of latitude
      for (let lat = -75; lat < 90; lat += 15) {
        const y = (lat + 90) / 180 * MAP_HEIGHT;

        strokeLine(context, 0, y, MAP_WIDTH, y);
      }

      // Draw lines of longitude
      for (let lon = 0; lon < 360; lon += 15) {
        const x = lon / 360 * MAP_WIDTH;

        strokeLine(context, x, 0, x, MAP_HEIGHT);
      }

      this.mapPixels = context.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT);
      this.waitList.forEach(cb => cb.resolve());
    }, reason => {
      this.mapLoading = false;
      this.mapFailed = true;
      this.waitList.forEach(cb => cb.reject(reason instanceof Error ? reason : new Error(reason)));
      console.error(reason);
    });
  }

  constructor() {
    this.canvas.width = this.canvas.height = GLOBE_SIZE;

    if (!Globe.mapImage && !Globe.mapFailed && !Globe.mapLoading)
      Globe.loadMap();
  }

  async draw(lat: number, lon: number): Promise<void> {
    if (Globe.mapFailed)
      throw new Error('Map not available');
    else if (!Globe.mapImage)
      await new Promise<void>((resolve, reject) => Globe.waitList.push({ resolve, reject }));

    if (this.lat !== lat || this.lon !== lon)
      this.generateRotatedGlobe(lat, lon);
  }

  private generateRotatedGlobe(lat: number, lon: number): void {
    const context = this.canvas.getContext('2d');

    this.lat = lat;
    this.lon = lon;
    context.clearRect(0, 0, GLOBE_SIZE, GLOBE_SIZE);

    const rt = GLOBE_SIZE / 2;
    const eye = new SphericalPosition3D(this.lon, this.lat, VIEW_DISTANCE + 1).xyz;
    let minDi = Number.MAX_SAFE_INTEGER;
    let maxDi = Number.MIN_SAFE_INTEGER;

    for (let yt = 0; yt < GLOBE_SIZE; ++yt) {
      for (let xt = 0; xt < GLOBE_SIZE; ++xt) {
        const d = sqrt((xt - rt) ** 2 + (yt - rt) ** 2);
        let alpha = 1;

        if (d > rt + 0.5)
          continue;
        else if (d > rt - 0.5)
          alpha = rt - d + 0.5;

        const x0 = VIEW_PLANE;
        const y0 = (xt - rt) / GLOBE_SIZE * VIEW_RADIUS;
        const z0 = (rt - yt) / GLOBE_SIZE * VIEW_RADIUS;
        const dx = eye.x - x0;
        const dy = eye.y - y0;
        const dz = eye.z - z0;
        // Unit vector for line-of-sight
        const mag = sqrt(dx ** 2 + dy ** 2 + dz ** 2);
        const xu = dx / mag;
        const yu = dy / mag;
        const zu = dz / mag;
        // Dot product of unit vector and origin
        const dp = xu * eye.x + yu * eye.y + zu * eye.z;
        const nabla = max(dp ** 2 - (VIEW_DISTANCE + 1) ** 2 + 1, 0);
        // Distance from eye to globe intersection
        const di = -dp + sqrt(nabla);
        // Point of intersection with surface of globe
        const xi = eye.x + di * xu;
        const yi = eye.y + di * yu;
        const zi = eye.z + di * zu;
        const i = SphericalPosition3D.convertRectangular(xi, yi, zi);
        const xs = mod(i.longitude.degrees + 180, 360) / 360 * MAP_WIDTH;
        const ys = (90 - i.latitude.degrees) / 180 * MAP_HEIGHT;
        const pixel = mod(getPixel(Globe.mapPixels, round(xs), round(ys)), 255);
        minDi = min(di, minDi);
        maxDi = max(di, maxDi);

        context.fillStyle = `rgba(${pixel}, ${pixel}, ${pixel}, ${alpha})`;
        context.fillRect(xt, yt, 1, 1);
      }
    }
    console.log(minDi, maxDi);

    document.getElementById('temp-image').appendChild(this.canvas);
  }
}
