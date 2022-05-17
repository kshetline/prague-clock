import { BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, SphereGeometry, WebGLRenderer } from 'three';
import { getPixel, isString, noop, processMillis, setPixel, strokeLine } from '@tubular/util';
import { cos, floor, max, mod, PI, round, sin, SphericalPosition3D, sqrt, tan_deg, to_radian } from '@tubular/math';
import { mergeBufferGeometries } from '../three/three-utils';
import { Appearance } from '../advanced-options/advanced-options.component';

const MAP_HEIGHT = 500;
const MAP_WIDTH = 1000;
const DEFAULT_GLOBE_PIXEL_SIZE = 500;
const GLOBE_RADIUS = 5;
const FIELD_OF_VIEW = 91;
const FIELD_OF_VIEW_2018 = 29;
const VIEW_DISTANCE = 4.975;
const VIEW_DISTANCE_2018 = 20;
const LINE_THICKNESS = 0.03;
const LINE_THICKNESS_2018 = 0.09;
const HAG = -0.02; // Sleight distance above globe that longitude/latitude lines are drawn.
const HAG_2018 = 0.05;

const GRID_COLOR = '#262F36';

let hasWebGl = !/\bwebgl=[0fn]/i.test(location.search);

try {
  hasWebGl = hasWebGl && !!document.createElement('canvas').getContext('webgl2');
}
catch {}

export class Globe {
  private static mapCanvas: HTMLCanvasElement;
  private static mapCanvas2018: HTMLCanvasElement;
  private static mapFailed = false;
  private static mapImage: HTMLImageElement;
  private static mapImage2018: HTMLImageElement;
  private static mapLoading = false;
  private static waitList: { resolve: () => void, reject: (reason: any) => void }[] = [];

  private appearance = Appearance.CURRENT;
  private camera: PerspectiveCamera;
  private currentPixelSize = DEFAULT_GLOBE_PIXEL_SIZE;
  private drawingTimer: any;
  private globeMesh: Mesh;
  private initialized = false;
  private lastGlobeResolve: () => void;
  private lastLatitude: number;
  private lastLongitude: number;
  private lastPixelSize = DEFAULT_GLOBE_PIXEL_SIZE;
  private lastRenderer: HTMLElement;
  private static mapPixels: ImageData[] = [];
  private offscreen: ImageData;
  private renderer: WebGLRenderer;
  private rendererHost: HTMLElement;
  private renderIndex2d = 0;
  private scene: Scene;

  static loadMap(): void {
    this.mapLoading = true;

    let mapIndex = 0;

    const loadOneMap = (): void => {
      const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();

        image.onload = (): void => {
          requestAnimationFrame(() => {
            let checkCount = 0;
            const renderCheck = setInterval(() => {
              if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                clearInterval(renderCheck);
                resolve(image);
              }
              else if (++checkCount > 300) {
                clearInterval(renderCheck);
                reject(new Error('Map image failed to render from: ' + image.src));
              }
            }, 50);
          });
        };
        image.onerror = (): void => {
          reject(new Error('Map image failed to load from: ' + image.src));
        };

        image.src = mapIndex ? 'assets/world-p2018.jpg' : 'assets/world.jpg';
      });

      imagePromise.then(image => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.width = MAP_WIDTH;
        canvas.height = MAP_HEIGHT;
        context.drawImage(image, 0, 0, MAP_WIDTH, MAP_HEIGHT);
        context.strokeStyle = [GRID_COLOR, this.getGoldTrimColor()][mapIndex];
        context.lineWidth = [1.5, 3][mapIndex];

        this.drawGlobeGrid(context);

        if (mapIndex) {
          this.mapImage2018 = image;
          this.mapCanvas2018 = canvas;
          this.mapPixels[Appearance.CURRENT] = context.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT);
          // Make mapless grid for Appearance.CURRENT_NO_MAP
          context.fillStyle = this.getSkyColorColor2018();
          context.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
          this.drawGlobeGrid(context);
          this.mapPixels[Appearance.CURRENT_NO_MAP] = context.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT);
          // Restore map pixels to canvas
          context.putImageData(this.mapPixels[Appearance.CURRENT], 0, 0);

          this.mapLoading = false;
          this.waitList.forEach(cb => cb.resolve());
        }
        else {
          this.mapImage = image;
          this.mapCanvas = canvas;
          this.mapPixels[Appearance.PRE_2018] = context.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT);
          ++mapIndex;
          loadOneMap();
        }
      }, reason => {
        this.mapLoading = false;
        this.mapFailed = true;
        this.waitList.forEach(cb => cb.reject(reason instanceof Error ? reason : new Error(reason)));
        console.error(reason);
      });
    };

    loadOneMap();
  }

  private static getGoldTrimColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--gold-trim-2018').trim() || '#FFECAE';
  }

  private static getSkyColorColor2018(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--sky-color-2018').trim() || '#2F9DE7';
  }

  private static drawGlobeGrid(context: CanvasRenderingContext2D): void {
    // Draw lines of latitude
    for (let lat = -75; lat < 90; lat += 15) {
      const y = (lat + 90) / 180 * MAP_HEIGHT + 2;

      strokeLine(context, 0, y - 1, MAP_WIDTH, y - 1);
    }

    // Draw lines of longitude
    for (let lon = 0; lon <= 360; lon += 15) {
      const x = lon / 360 * MAP_WIDTH + 2;

      strokeLine(context, x - 1, MAP_HEIGHT / 12, x - 1, MAP_HEIGHT * 11 / 12);
    }
  }

  constructor(rendererHost: string | HTMLElement) {
    if (isString(rendererHost))
      this.rendererHost = document.getElementById(rendererHost);
    else
      this.rendererHost = rendererHost;

    if (!hasWebGl)
      this.rendererHost.classList.add('no-web-gl');

    if (!Globe.mapImage && !Globe.mapFailed && !Globe.mapLoading)
      Globe.loadMap();
  }

  async orient(lon: number, lat: number): Promise<void> {
    if (Globe.mapFailed)
      throw new Error('Map not available');
    else if (!Globe.mapImage2018)
      await new Promise<void>((resolve, reject) => Globe.waitList.push({ resolve, reject }));

    this.currentPixelSize = (this.rendererHost.getBoundingClientRect().width * 2) || DEFAULT_GLOBE_PIXEL_SIZE;

    if (hasWebGl)
      this.renderWebGl(lon, lat);
    else
      await this.render2D(lon, lat);

    this.lastPixelSize = this.currentPixelSize;
    this.lastLatitude = lat;
    this.lastLongitude = lon;
  }

  private renderWebGl(lon: number, lat: number): void {
    if (!this.initialized)
      this.setUpRenderer();

    if (!this.initialized || this.lastPixelSize !== this.currentPixelSize) {
      this.renderer.setSize(this.currentPixelSize, this.currentPixelSize);
      this.initialized = true;
    }

    this.globeMesh.rotation.y = -to_radian(lon);
    this.globeMesh.rotation.x = to_radian(lat);
    this.camera.rotation.z = (lat >= 0 || this.appearance === Appearance.CURRENT ||
      this.appearance === Appearance.CURRENT_NO_MAP ? PI : 0);

    requestAnimationFrame(() => this.renderer.render(this.scene, this.camera));
  }

  private async render2D(lon: number, lat: number): Promise<void> {
    if (this.lastGlobeResolve) {
      ++this.renderIndex2d;
      this.lastGlobeResolve();
      this.lastGlobeResolve = undefined;
    }

    if (!this.drawingTimer)
      this.drawingTimer = setTimeout(() => this.rendererHost.style.opacity = '0.25', 1000);

    let target = this.rendererHost.querySelector('canvas') as HTMLCanvasElement;
    let doDraw = true;

    if (!target) {
      target = document.createElement('canvas');
      this.rendererHost.appendChild(target);
    }

    if (!this.initialized || this.lastPixelSize !== this.currentPixelSize || !this.offscreen) {
      target.width = this.currentPixelSize;
      target.height = this.currentPixelSize;
      this.offscreen = new ImageData(this.currentPixelSize, this.currentPixelSize);
    }

    if (this.appearance === Appearance.ORIGINAL_1410) {
      target.getContext('2d').clearRect(0, 0, this.currentPixelSize, this.currentPixelSize);
      return;
    }

    if (!this.initialized || this.lastLatitude !== lat || this.lastLongitude !== lon) {
      doDraw = false;
      const generator = this.generateRotatedGlobe(lon, lat);

      await new Promise<void>(resolve => {
        this.lastGlobeResolve = resolve;

        const renderSome = (): void => {
          const next = generator.next();

          if (next.done) {
            doDraw = next.value;
            this.lastGlobeResolve = undefined;
            resolve();
          }
          else
            setTimeout(renderSome);
        };

        renderSome();
      });
    }

    this.initialized = true;

    if (doDraw) {
      target.getContext('2d').putImageData(this.offscreen, 0, 0);
      this.rendererHost.style.opacity = '1';

      if (this.drawingTimer) {
        clearTimeout(this.drawingTimer);
        this.drawingTimer = undefined;
      }
    }
  }

  setAppearance(appearance: Appearance): void {
    if (this.appearance !== appearance) {
      this.appearance = appearance;
      this.resetRenderer();
    }
  }

  private resetRenderer(): void {
    if (!this.initialized)
      return;

    if (hasWebGl) {
      this.setUpRenderer();
      this.renderer.setSize(this.lastPixelSize, this.lastPixelSize);
    }
    else
      this.initialized = false;

    this.orient(this.lastLongitude, this.lastLatitude).catch(noop);
  }

  private setUpRenderer(): void {
    const post2018 = (this.appearance === Appearance.CURRENT || this.appearance === Appearance.CURRENT_NO_MAP);

    this.camera = new PerspectiveCamera(post2018 ? FIELD_OF_VIEW_2018 : FIELD_OF_VIEW, 1);
    this.scene = new Scene();
    const globe = new SphereGeometry(GLOBE_RADIUS, 50, 50);
    globe.rotateY(-PI / 2);

    if (!post2018)
      globe.scale(-1, -1, -1);

    if (this.appearance === Appearance.CURRENT_NO_MAP)
      this.globeMesh = new Mesh(globe, new MeshBasicMaterial({ color: Globe.getSkyColorColor2018() }));
    else
      this.globeMesh = new Mesh(globe,
        new MeshBasicMaterial(
          { map: new CanvasTexture(post2018 ? Globe.mapCanvas2018 : Globe.mapCanvas), side: DoubleSide }));

    this.scene.add(this.globeMesh);

    const lines: BufferGeometry[] = [];
    const thickness = post2018 ? LINE_THICKNESS_2018 : LINE_THICKNESS;
    const hag = post2018 ? HAG_2018 : HAG;
    const arcAdjust = 0.02;

    // Lines of longitude
    for (let n = 0; n < 24; ++n) {
      const line = new CylinderGeometry(GLOBE_RADIUS + hag, GLOBE_RADIUS + hag, thickness, 50, 1, true,
        PI / 12 + arcAdjust, PI * 5 / 6 - arcAdjust * 2);
      line.translate(0, -thickness / 2, 0);
      line.rotateX(PI / 2);
      line.rotateY(n * PI / 12);
      lines.push(line);
    }

    // Lines of latitude
    for (let n = 1; n < 12; ++n) {
      const lat = (n - 6) * PI / 12;
      const r = GLOBE_RADIUS * cos(lat);
      const y = GLOBE_RADIUS * sin(lat);
      const r1 = r - thickness * sin(lat) / 2;
      const r2 = r + thickness * sin(lat) / 2;
      const line = new CylinderGeometry(r1 + hag, r2 + hag, cos(lat) * thickness, 50, 8, true);
      line.translate(0, -cos(lat) * thickness / 2 + y, 0);
      lines.push(line);
    }

    this.globeMesh.add(new Mesh(mergeBufferGeometries(lines),
      new MeshBasicMaterial({ color: post2018 ? Globe.getGoldTrimColor() : GRID_COLOR, side: DoubleSide })));

    this.camera.position.z = post2018 ? VIEW_DISTANCE_2018 : VIEW_DISTANCE;
    this.renderer = new WebGLRenderer({ alpha: true, antialias: true });

    if (this.lastRenderer)
      this.lastRenderer.remove();

    this.rendererHost.appendChild(this.renderer.domElement);
    this.lastRenderer = this.renderer.domElement;
  }

  * generateRotatedGlobe(lon: number, lat: number): Generator<boolean> {
    const post2018 = (this.appearance === Appearance.CURRENT || this.appearance === Appearance.CURRENT_NO_MAP);
    const cameraZ = post2018 ? VIEW_DISTANCE_2018 : VIEW_DISTANCE;
    const fieldOfView = post2018 ? FIELD_OF_VIEW_2018 : FIELD_OF_VIEW;
    const viewRadius = (cameraZ + GLOBE_RADIUS) * tan_deg(fieldOfView / 2);
    const size = this.currentPixelSize;
    let time = processMillis();

    const rt = size / 2;
    const eye = new SphericalPosition3D(0, 0, cameraZ).xyz;
    const signX = (cameraZ > GLOBE_RADIUS ? 1 : -1);
    const yaw = to_radian(lon + (post2018 ? 0 : 180));
    const pitch = to_radian(lat * (post2018 ? -1 : 1));
    const roll = ((post2018 ? -1 : 1) * lat >= 0 ? PI : 0);

    const cose = Math.cos(yaw);
    const sina = Math.sin(yaw);
    const cosb = Math.cos(pitch);
    const sinb = Math.sin(pitch);
    const cosc = Math.cos(roll);
    const sinc = Math.sin(roll);

    const Axx = cose * cosb;
    const Axy = cose * sinb * sinc - sina * cosc;
    const Axz = cose * sinb * cosc + sina * sinc;
    const Ayx = sina * cosb;
    const Ayy = sina * sinb * sinc + cose * cosc;
    const Ayz = sina * sinb * cosc - cose * sinc;
    const Azx = -sinb;
    const Azy = cosb * sinc;
    const Azz = cosb * cosc;

    const pixels = Globe.mapPixels[this.appearance] ?? Globe.mapPixels[Appearance.CURRENT];
    const renderIndex = this.renderIndex2d;

    for (let yt = 0; yt < size; ++yt) {
      if (processMillis() > time + 100) {
        yield;

        if (renderIndex !== this.renderIndex2d)
          return false;

        time = processMillis();
      }

      for (let xt = 0; xt < size; ++xt) {
        const d = sqrt((xt - rt) ** 2 + (yt - rt) ** 2);
        let alpha = 0xFF000000;

        if (d > rt + 0.5)
          continue;
        else if (d > rt - 0.5)
          alpha = floor((rt - d + 0.5) * 255) << 24;

        const x0 = -GLOBE_RADIUS;
        const y0 = ((xt - rt) * signX) / size * viewRadius * 2;
        const z0 = (rt - yt) / size * viewRadius * 2;
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
        const nabla = max(dp ** 2 - eye.x ** 2 + GLOBE_RADIUS ** 2, 0);
        // Distance from eye to globe intersection
        const di = -dp + sqrt(nabla) * signX;
        // Point of intersection with surface of globe
        const xi = eye.x + di * xu;
        const yi = eye.y + di * yu;
        const zi = eye.z + di * zu;
        // Rotate to match lat/long
        const x1 = Axx * xi + Axy * yi + Axz * zi;
        const y1 = Ayx * xi + Ayy * yi + Ayz * zi;
        const z1 = Azx * xi + Azy * yi + Azz * zi;
        const i = SphericalPosition3D.convertRectangular(x1, y1, z1);
        const xs = mod(i.longitude.degrees + 180, 360) / 360 * MAP_WIDTH;
        const ys = (90 - i.latitude.degrees) / 180 * MAP_HEIGHT;
        const pixel = getPixel(pixels, round(xs), round(ys)) & 0xFFFFFF;

        setPixel(this.offscreen, xt, yt, pixel | alpha);
      }
    }

    return true;
  }
}
