import {
  CanvasTexture, CylinderGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, SphereGeometry, WebGLRenderer
} from 'three';
import { isSafari, isString } from '@tubular/util';
import { cos, floor, PI, sin, to_radian } from '@tubular/math';

const MAP_HEIGHT = 500;
const MAP_WIDTH = 1000;
const DEFAULT_GLOBE_PIXEL_SIZE = 500;
const GLOBE_RADIUS = 5;
const FIELD_OF_VIEW = 19.3;
const VIEW_DISTANCE = 30;
const LINE_THICKNESS = 0.03;
const HAG = 0.01; // Sleight distance above globe that longitude/latitude lines are drawn.

const GRID_COLOR = '#262F36';

const SAFARI = isSafari();

export class Globe {
  private static mapCanvas: HTMLCanvasElement;
  private static mapFailed = false;
  private static mapImage: HTMLImageElement;
  private static mapLoading = false;
  private static waitList: { resolve: () => void, reject: (reason: any) => void }[] = [];

  private camera: PerspectiveCamera;
  private globeMesh: Mesh;
  private imageHost: SVGImageElement;
  private initialized = false;
  private lastPixelSize = DEFAULT_GLOBE_PIXEL_SIZE;
  private offscreen: HTMLDivElement;
  private renderer: WebGLRenderer;
  private rendererHost: HTMLElement;
  private scene: Scene;

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
      this.mapCanvas = document.createElement('canvas');
      this.mapCanvas.width = MAP_WIDTH;
      this.mapCanvas.height = MAP_HEIGHT;
      this.mapCanvas.getContext('2d').drawImage(image, 0, 0, MAP_WIDTH, MAP_HEIGHT);
      this.waitList.forEach(cb => cb.resolve());
    }, reason => {
      this.mapLoading = false;
      this.mapFailed = true;
      this.waitList.forEach(cb => cb.reject(reason instanceof Error ? reason : new Error(reason)));
      console.error(reason);
    });
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
    else if (!Globe.mapImage)
      await new Promise<void>((resolve, reject) => Globe.waitList.push({ resolve, reject }));

    if (!this.initialized) {
      this.camera = new PerspectiveCamera(FIELD_OF_VIEW, 1);
      this.scene = new Scene();
      const globe = new SphereGeometry(GLOBE_RADIUS, 50, 50);
      globe.rotateY(-PI / 2);
      this.globeMesh = new Mesh(globe, new MeshBasicMaterial({ map: new CanvasTexture(Globe.mapCanvas) }));
      this.scene.add(this.globeMesh);

      // Lines of longitude
      for (let n = 0; n < 24; ++n) {
        const line = new CylinderGeometry(GLOBE_RADIUS + HAG, GLOBE_RADIUS + HAG, LINE_THICKNESS, 50, 1, true);
        line.translate(0, -LINE_THICKNESS / 2, 0);
        line.rotateX(PI / 2);
        line.rotateY(n * PI / 12);
        const mesh = new Mesh(line, new MeshBasicMaterial({ color: GRID_COLOR }));
        this.globeMesh.add(mesh);
      }

      // Lines of latitude
      for (let n = 1; n < 12; ++n) {
        const lat = (n - 6) * PI / 12;
        const r = GLOBE_RADIUS * cos(lat);
        const y = GLOBE_RADIUS * sin(lat);
        const r1 = r - LINE_THICKNESS * sin(lat) / 2;
        const r2 = r + LINE_THICKNESS * sin(lat) / 2;
        const line = new CylinderGeometry(r1 + HAG, r2 + HAG, cos(lat) * LINE_THICKNESS, 50, 8, true);
        line.translate(0, -cos(lat) * LINE_THICKNESS / 2 + y, 0);
        const mesh = new Mesh(line, new MeshBasicMaterial({ color: GRID_COLOR }));
        this.globeMesh.add(mesh);
      }

      this.camera.position.z = VIEW_DISTANCE;
      this.renderer = new WebGLRenderer({ alpha: true, antialias: true });

      if (SAFARI) {
        this.offscreen = document.createElement('div');
        this.offscreen.style.height = '100%';
        this.offscreen.style.width = '100%';
        this.imageHost = document.getElementById(this.rendererHost.id + '-image') as any;
        this.offscreen.appendChild(this.renderer.domElement);
      }
      else
        this.rendererHost.appendChild(this.renderer.domElement);
    }

    const currentPixelSize = floor(
      (SAFARI ? this.imageHost : this.renderer.domElement).getBoundingClientRect().width * 2) || DEFAULT_GLOBE_PIXEL_SIZE;

    if (!this.initialized || this.lastPixelSize !== currentPixelSize) {
      this.renderer.setSize(currentPixelSize, currentPixelSize);
      this.lastPixelSize = currentPixelSize;
      this.initialized = true;
    }

    this.globeMesh.rotation.y = -to_radian(lon);
    this.globeMesh.rotation.x = to_radian(lat);
    this.camera.rotation.z = (lat >= 0 ? PI : 0);

    requestAnimationFrame(() => {
      this.renderer.render(this.scene, this.camera);

      // Much slower rendering on Safari due to the need to convert the image to a data URL.
      if (SAFARI)
        this.imageHost.setAttribute('href', this.offscreen.querySelector('canvas').toDataURL());
    });
  }
}
