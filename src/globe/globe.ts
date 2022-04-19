import { BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, SphereGeometry, WebGLRenderer } from 'three';
import { isString } from '@tubular/util';
import { cos, PI, sin, to_radian } from '@tubular/math';
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
  private globeMesh: Mesh;
  private initialized = false;
  private lastLatitude: number;
  private lastLongitude: number;
  private lastPixelSize = DEFAULT_GLOBE_PIXEL_SIZE;
  private lastRenderer: HTMLElement;
  private renderer: WebGLRenderer;
  private rendererHost: HTMLElement;
  private scene: Scene;

  static loadMap(): void {
    this.mapLoading = true;

    let map = 0;

    const loadOneMap = (): void => {
      const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();

        image.onload = (): void => {
          requestAnimationFrame(() => {
            let checkCount = 0;
            const renderCheck = setInterval(() => {
              console.log({ renderCheck: checkCount + 1 });
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

        image.src = map ? 'assets/world-p2018.jpg' : 'assets/world.jpg';
      });

      imagePromise.then(image => {
        const canvas = document.createElement('canvas');

        canvas.width = MAP_WIDTH;
        canvas.height = MAP_HEIGHT;
        canvas.getContext('2d').drawImage(image, 0, 0, MAP_WIDTH, MAP_HEIGHT);

        if (map) {
          this.mapImage2018 = image;
          this.mapCanvas2018 = canvas;
          this.mapLoading = false;
          this.waitList.forEach(cb => cb.resolve());
        }
        else {
          this.mapImage = image;
          this.mapCanvas = canvas;
          ++map;
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

  constructor(rendererHost: string | HTMLElement) {
    if (isString(rendererHost))
      this.rendererHost = document.getElementById(rendererHost);
    else
      this.rendererHost = rendererHost;

    if (!Globe.mapImage && !Globe.mapFailed && !Globe.mapLoading)
      Globe.loadMap();
  }

  async orient(lon: number, lat: number): Promise<void> {
    if (Globe.mapFailed)
      throw new Error('Map not available');
    else if (!Globe.mapImage2018)
      await new Promise<void>((resolve, reject) => Globe.waitList.push({ resolve, reject }));

    if (!this.initialized)
      this.setUpRenderer();

    const currentPixelSize = (this.renderer.domElement.getBoundingClientRect().width * 2) || DEFAULT_GLOBE_PIXEL_SIZE;

    if (!this.initialized || this.lastPixelSize !== currentPixelSize) {
      this.renderer.setSize(currentPixelSize, currentPixelSize);
      this.lastPixelSize = currentPixelSize;
      this.initialized = true;
    }

    this.globeMesh.rotation.y = -to_radian(lon);
    this.globeMesh.rotation.x = to_radian(lat);
    this.camera.rotation.z = (lat >= 0 || this.appearance === Appearance.CURRENT ||
      this.appearance === Appearance.CURRENT_NO_MAP ? PI : 0);
    this.lastLatitude = lat;
    this.lastLongitude = lon;

    requestAnimationFrame(() => this.renderer.render(this.scene, this.camera));
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

    this.setUpRenderer();
    this.renderer.setSize(this.lastPixelSize, this.lastPixelSize);
    this.orient(this.lastLongitude, this.lastLatitude).finally();
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
}
