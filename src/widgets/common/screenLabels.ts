import { Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';
import { facingQuaternion } from '../cosmos/cosmosModel';
import type { LabelCache } from './labelCache';

const WHITE = new Color(1, 1, 1);

/**
 * 화면 크기가 일정한 글자 묶음. 매 프레임 begin() 다음 add() 로 넣고 end() 로 남은 것을 숨긴다.
 * 글자는 카메라를 향하고, 거리와 상관없이 정한 CSS px 높이로 보이며, 화면 오른쪽·위쪽으로 px 만큼 옮겨 놓을 수 있다.
 */
export class ScreenLabels {
  readonly group = new Group();
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly pool: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private count = 0;
  /** 카메라에서 거리 1 인 곳에서 화면 1 CSS px 이 차지하는 월드 길이 */
  private worldPerPx = 0.001;
  private readonly up = new Vector3();
  private readonly right = new Vector3();

  constructor(private readonly labels: LabelCache) {}

  setViewport(height: number, fovDeg: number): void {
    this.worldPerPx = (2 * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(1, height);
  }

  begin(): void {
    this.count = 0;
  }

  add(
    p: Vector3,
    text: string,
    heightPx: number,
    alpha: number,
    cameraPosition: Vector3,
    offsetXPx = 0,
    offsetYPx = 0,
    color: Color = WHITE,
  ): void {
    if (alpha < 0.01) return;
    let mesh = this.pool[this.count];
    if (!mesh) {
      mesh = new Mesh(this.geometry, new MeshBasicMaterial({ transparent: true, depthWrite: false, fog: true }));
      this.pool.push(mesh);
      this.group.add(mesh);
    }
    this.count++;
    const l = this.labels.get(text, 'major');
    if (mesh.material.map !== l.texture) {
      mesh.material.map = l.texture;
      mesh.material.needsUpdate = true;
    }
    const k = p.distanceTo(cameraPosition) * this.worldPerPx;
    const h = heightPx * k;
    mesh.scale.set(h * l.aspect, h, 1);
    facingQuaternion(p, cameraPosition, mesh.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(mesh.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(mesh.quaternion);
    mesh.position.copy(p).addScaledVector(this.right, offsetXPx * k).addScaledVector(this.up, offsetYPx * k);
    mesh.material.opacity = alpha;
    mesh.material.color.copy(color);
    mesh.visible = true;
  }

  end(): void {
    for (let i = this.count; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  dispose(): void {
    this.geometry.dispose();
    for (const m of this.pool) m.material.dispose();
  }
}
