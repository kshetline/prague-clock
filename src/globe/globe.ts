import { CanvasTexture, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, SphereGeometry, WebGLRenderer } from 'three';
import { isString, strokeLine } from '@tubular/util';
import { PI, to_radian } from '@tubular/math';

const MAP_HEIGHT = 500;
const MAP_WIDTH = 1000;
const GLOBE_PIXEL_SIZE = 500;
const GLOBE_RADIUS = 5;
const FIELD_OF_VIEW = 40;
const VIEW_DISTANCE = 15;

const GRID_COLOR = '#262F36';

export class Globe {
  private static mapCanvas: HTMLCanvasElement;
  private static mapFailed = false;
  private static mapImage: HTMLImageElement;
  private static mapLoading = false;
  private static waitList: { resolve: () => void, reject: (reason: any) => void }[] = [];

  private camera: PerspectiveCamera;
  private globe: SphereGeometry;
  private globeMesh: Mesh;
  private initialized = false;
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

      const context = this.mapCanvas.getContext('2d');

      context.drawImage(image, 0, 0, MAP_WIDTH, MAP_HEIGHT);
      context.strokeStyle = GRID_COLOR;
      context.lineWidth = 1.5;

      // Draw lines of latitude
      for (let lat = -75; lat < 90; lat += 15) {
        const y = (lat + 90) / 180 * MAP_HEIGHT;

        strokeLine(context, 0, y - 1, MAP_WIDTH, y - 1);
      }

      // Draw lines of longitude
      for (let lon = 0; lon < 360; lon += 15) {
        const x = lon / 360 * MAP_WIDTH;

        strokeLine(context, x - 1, 0, x - 1, MAP_HEIGHT);
      }

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
      this.globe = new SphereGeometry(GLOBE_RADIUS, 50, 50);
      this.globe.rotateY(-PI / 2);
      this.globeMesh = new Mesh(
        this.globe,
        new MeshBasicMaterial({
          map: new CanvasTexture(Globe.mapCanvas)
        })
      );

      this.renderer = new WebGLRenderer({ alpha: true });
      this.renderer.setSize(GLOBE_PIXEL_SIZE, GLOBE_PIXEL_SIZE);
      this.rendererHost.appendChild(this.renderer.domElement);
      this.scene.add(this.globeMesh);
      this.camera.position.z = VIEW_DISTANCE;
      this.initialized = true;
    }

    this.globeMesh.rotation.y = -to_radian(lon);
    this.globeMesh.rotation.x = to_radian(lat);

    this.camera.rotation.z = (lat >= 0 ? PI : 0);
    requestAnimationFrame(() => this.renderer.render(this.scene, this.camera));
  }
}
