import { Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3, type Camera } from 'three';
import { tuning } from '../../config';
import { damp } from '../../core/motion';
import { facingQuaternion } from '../cosmos/cosmosModel';
import type { LabelCache, LabelStyle } from './labelCache';
import { pickVisible, type LabelRect } from './labelLayout';

const WHITE = new Color(1, 1, 1);

export interface LabelOptions {
  /** 화면 오른쪽·위쪽으로 옮기는 거리(CSS px, 음수면 왼쪽·아래) */
  offsetXPx?: number;
  offsetYPx?: number;
  color?: Color;
  style?: LabelStyle;
  /** 다른 글자와 겹칠 때 남길 차례. 클수록 먼저 자리를 잡는다 */
  priority?: number;
  /** 프레임 사이에 같은 글자를 알아보는 열쇠. 겹쳐 숨고 나타나는 것을 부드럽게 잇는다. 없으면 글자 자체다 */
  key?: string;
}

interface Entry extends LabelRect {
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  key: string;
  /** 화면에서 차지하는 반폭·반높이(CSS px) */
  halfW: number;
  halfH: number;
}

/**
 * 화면 크기가 일정한 글자 묶음. 매 프레임 begin() 다음 add() 로 넣고 end() 로 남은 것을 숨긴다.
 * 글자는 카메라를 향하고, 거리와 상관없이 정한 CSS px 높이로 보이며, 화면 오른쪽·위쪽으로 px 만큼 옮겨 놓을 수 있다.
 * end() 는 화면에서 겹치는 글자 가운데 차례가 낮은 것을 옅게 감춘다(look.label.declutter).
 */
export class ScreenLabels {
  readonly group = new Group();
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly pool: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly entries: Entry[] = [];
  private count = 0;
  private width = 1;
  private height = 1;
  /** 카메라에서 거리 1 인 곳에서 화면 1 CSS px 이 차지하는 월드 길이 */
  private worldPerPx = 0.001;
  private readonly up = new Vector3();
  private readonly right = new Vector3();
  private readonly projected = new Vector3();
  /** 열쇠마다 겹침 숨김의 보이는 정도(0~1)와 마지막으로 그린 프레임 */
  private readonly shown = new Map<string, { value: number; frame: number }>();
  private frame = 0;
  private readonly visible: boolean[] = [];
  private readonly order: number[] = [];
  private readonly taken: LabelRect[] = [];

  constructor(private readonly labels: LabelCache) {}

  setViewport(width: number, height: number, fovDeg: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.worldPerPx = (2 * Math.tan((fovDeg * Math.PI) / 360)) / this.height;
  }

  begin(): void {
    this.count = 0;
  }

  add(p: Vector3, text: string, heightPx: number, alpha: number, cameraPosition: Vector3, opts: LabelOptions = {}): void {
    if (alpha < 0.01) return;
    let mesh = this.pool[this.count];
    if (!mesh) {
      mesh = new Mesh(this.geometry, new MeshBasicMaterial({ transparent: true, depthWrite: false, fog: true }));
      this.pool.push(mesh);
      this.group.add(mesh);
    }
    const l = this.labels.get(text, opts.style ?? 'major');
    if (mesh.material.map !== l.texture) {
      mesh.material.map = l.texture;
      mesh.material.needsUpdate = true;
    }
    const offX = opts.offsetXPx ?? 0;
    const offY = opts.offsetYPx ?? 0;
    const k = p.distanceTo(cameraPosition) * this.worldPerPx;
    const h = heightPx * k;
    mesh.scale.set(h * l.aspect, h, 1);
    facingQuaternion(p, cameraPosition, mesh.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(mesh.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(mesh.quaternion);
    mesh.position.copy(p).addScaledVector(this.right, offX * k).addScaledVector(this.up, offY * k);
    mesh.material.opacity = alpha;
    mesh.material.color.copy(opts.color ?? WHITE);
    mesh.visible = true;

    let e = this.entries[this.count];
    if (!e) {
      e = { mesh, key: '', x0: 0, y0: 0, x1: 0, y1: 0, priority: 0, alpha: 0, halfW: 0, halfH: 0 };
      this.entries.push(e);
    }
    e.mesh = mesh;
    e.key = opts.key ?? text;
    e.priority = opts.priority ?? 0;
    e.alpha = alpha;
    // 글자 크기가 화면 고정이라 화면 사각형은 end 에서 중심만 투영해 채운다
    e.halfW = (heightPx * l.aspect) / 2;
    e.halfH = heightPx / 2;
    this.count++;
  }

  /** 겹치는 글자를 정리하고 이번 프레임에 넣지 않은 글자를 숨긴다. dt 는 게임 시간(초)이다 */
  end(camera: Camera, dt: number): void {
    const d = tuning.look.label.declutter;
    this.frame++;
    const rects = this.entries;
    for (let i = 0; i < this.count; i++) {
      const e = rects[i];
      this.projected.copy(e.mesh.position).project(camera);
      const cx = ((this.projected.x + 1) / 2) * this.width;
      const cy = ((1 - this.projected.y) / 2) * this.height;
      e.x0 = cx - e.halfW;
      e.x1 = cx + e.halfW;
      e.y0 = cy - e.halfH;
      e.y1 = cy + e.halfH;
      // 카메라 뒤의 글자는 자리를 막지 않는다
      if (this.projected.z > 1) e.alpha = 0;
    }
    pickVisible(rects, d.padPx, d.blockAlpha, this.count, this.visible, this.order, this.taken);
    for (let i = 0; i < this.count; i++) {
      const e = rects[i];
      const target = this.visible[i] ? 1 : 0;
      let s = this.shown.get(e.key);
      if (!s) {
        s = { value: target, frame: this.frame };
        this.shown.set(e.key, s);
      }
      s.value = damp(s.value, target, d.rate, dt);
      s.frame = this.frame;
      e.mesh.material.opacity *= s.value;
      e.mesh.visible = e.mesh.material.opacity > 0.005;
    }
    for (const [key, s] of this.shown) if (s.frame !== this.frame) this.shown.delete(key);
    for (let i = this.count; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  dispose(): void {
    this.geometry.dispose();
    for (const m of this.pool) m.material.dispose();
  }
}
