import { Color, Fog, GridHelper, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { tuning } from '../config';

/** 위젯 갤러리가 함께 쓰는 렌더러·장면·카메라. 컨테이너 크기가 바뀌면(접기·펼치기 포함) 맞춰 다시 잡는다. */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  /** 바닥 격자. 자기 바닥을 그리는 위젯 데모는 숨긴다 */
  readonly grid: GridHelper;
  private readonly observer: ResizeObserver;
  private readonly resizeListeners = new Set<() => void>();

  constructor(readonly container: HTMLElement) {
    const c = tuning.camera;
    const l = tuning.look;
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(c.fovDeg, 1, c.near, c.far);
    this.scene.background = new Color(l.background);
    this.scene.fog = new Fog(l.background, l.fogNear, l.fogFar);

    const grid = new GridHelper(80, 80, l.accent, l.textDim);
    this.grid = grid;
    grid.position.y = -3.2;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const m of gridMaterials) {
      m.transparent = true;
      m.opacity = 0.22;
    }
    this.scene.add(grid);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  get anisotropy(): number {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  onResize(listener: () => void): () => void {
    this.resizeListeners.add(listener);
    return () => this.resizeListeners.delete(listener);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.observer.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const listener of this.resizeListeners) listener();
  }
}

/** 갤러리에 올리는 위젯 데모 하나 */
export interface WidgetDemo {
  readonly title: string;
  readonly hint: string;
  update(dt: number, time: number): void;
  dispose(): void;
}

export type WidgetDemoFactory = (stage: Stage) => WidgetDemo;
