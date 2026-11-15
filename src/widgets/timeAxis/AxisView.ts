import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import { tuning } from '../../config';
import type { LabelCache } from '../common/labelCache';
import type { Tick } from './axisModel';
import { depthFade } from './placement';

/**
 * 바닥의 시간 레일: 양옆 레일, 눈금 선, 눈금 글자, 지금 시점 표시.
 * 눈금은 axisModel.generateTicks 가 정하고 이 뷰는 그리기만 한다.
 */
export class AxisView {
  readonly group = new Group();
  private readonly lines: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly labelGeometry = new PlaneGeometry(1, 1);
  private readonly labelPool: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly colorMajor: Color;
  private readonly colorMinor: Color;
  private readonly colorRail: Color;
  private readonly colorFocus: Color;

  constructor(private readonly labels: LabelCache) {
    const look = tuning.look;
    const maxSegments = tuning.axis.maxTicks + 3;
    this.positions = new Float32Array(maxSegments * 2 * 3);
    this.colors = new Float32Array(maxSegments * 2 * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    this.lines = new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true, fog: true }));
    this.lines.frustumCulled = false;
    this.group.add(this.lines);

    this.colorMajor = new Color(look.text).multiplyScalar(0.55);
    this.colorMinor = new Color(look.textDim).multiplyScalar(0.3);
    this.colorRail = new Color(look.textDim).multiplyScalar(0.45);
    this.colorFocus = new Color(look.accent);
  }

  /** railStartDepth 는 레일이 시작하는 깊이(가장 최근 노트의 깊이)다. 그보다 가까운 곳은 미래라 레일을 깔지 않는다 */
  update(ticks: readonly Tick[], railStartDepth: number): void {
    const a = tuning.axis;
    let v = 0;
    const seg = (x0: number, z0: number, x1: number, z1: number, c: Color) => {
      const p = this.positions;
      const col = this.colors;
      p[v * 3] = x0;
      p[v * 3 + 1] = a.railY;
      p[v * 3 + 2] = z0;
      col[v * 3] = c.r;
      col[v * 3 + 1] = c.g;
      col[v * 3 + 2] = c.b;
      v++;
      p[v * 3] = x1;
      p[v * 3 + 1] = a.railY;
      p[v * 3 + 2] = z1;
      col[v * 3] = c.r;
      col[v * 3 + 1] = c.g;
      col[v * 3 + 2] = c.b;
      v++;
    };

    const w = a.railHalfWidth;
    const start = Math.min(Math.max(a.nearDepth, railStartDepth), a.farDepth);
    seg(-w, -start, -w, -a.farDepth, this.colorRail);
    seg(w, -start, w, -a.farDepth, this.colorRail);
    const o = a.majorTickOverhang;
    seg(-w - o * 2, -a.focusDepth, w + o * 2, -a.focusDepth, this.colorFocus);

    let labelIndex = 0;
    for (const tick of ticks) {
      if (tick.major) seg(-w - o, -tick.depth, w + o, -tick.depth, this.colorMajor);
      else seg(-w, -tick.depth, w, -tick.depth, this.colorMinor);
      if (tick.label !== null) this.placeLabel(labelIndex++, tick);
    }
    for (let i = labelIndex; i < this.labelPool.length; i++) this.labelPool[i].visible = false;

    const geometry = this.lines.geometry;
    geometry.setDrawRange(0, v);
    (geometry.attributes.position as BufferAttribute).needsUpdate = true;
    (geometry.attributes.color as BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
    this.labelGeometry.dispose();
    for (const m of this.labelPool) m.material.dispose();
  }

  private placeLabel(index: number, tick: Tick): void {
    const a = tuning.axis;
    let mesh = this.labelPool[index];
    if (!mesh) {
      mesh = new Mesh(this.labelGeometry, new MeshBasicMaterial({ transparent: true, depthWrite: false, fog: true }));
      this.labelPool.push(mesh);
      this.group.add(mesh);
    }
    const label = this.labels.get(tick.label as string, tick.major ? 'major' : 'minor');
    if (mesh.material.map !== label.texture) {
      mesh.material.map = label.texture;
      mesh.material.needsUpdate = true;
    }
    const h = tick.major ? a.labelHeight : a.minorLabelHeight;
    const w = h * label.aspect;
    mesh.scale.set(w, h, 1);
    mesh.position.set(-a.railHalfWidth + h * 0.4 + w / 2, a.railY + h * 0.62, -tick.depth);
    mesh.material.opacity = depthFade(tick.depth);
    mesh.visible = true;
  }
}
