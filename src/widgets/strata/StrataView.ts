import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import { tuning } from '../../config';
import { damp } from '../../core/motion';
import type { LabelCache } from '../common/labelCache';
import { strataPoint, type StrataFrame, type StrataLayer } from './strataLayout';

interface LayerMeshes {
  root: Group;
  fill: Mesh<PlaneGeometry, MeshBasicMaterial>;
  grid: LineSegments<BufferGeometry, LineBasicMaterial>;
  frame: LineSegments<BufferGeometry, LineBasicMaterial>;
  label: Mesh<PlaneGeometry, MeshBasicMaterial>;
  emphasis: number;
}

/**
 * 지층 보기의 층 판: 아주 옅은 바탕, 흐린 격자, 테두리와 모서리 꺾쇠, 앞 왼쪽 모서리 밖의 날짜.
 * 배치(strataLayout)가 정한 층마다 하나씩 만들고, 바라보는 층은 밝게 나머지는 옅게 그린다.
 */
export class StrataView {
  readonly group = new Group();
  private layers: LayerMeshes[] = [];
  private readonly labelGeometry = new PlaneGeometry(1, 1);
  private readonly color = new Color(tuning.card.holo.line);

  constructor(private readonly labels: LabelCache) {}

  build(layers: readonly StrataLayer[], frame: StrataFrame): void {
    this.clear();
    const s = tuning.strata;
    for (const layer of layers) {
      const root = new Group();
      strataPoint(frame, 0, layer.y, 0, root.position);
      root.rotation.y = frame.yaw;
      const w = layer.halfWidth;
      const d = layer.halfDepth;

      const fill = new Mesh(
        new PlaneGeometry(w * 2, d * 2),
        new MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0, depthWrite: false }),
      );
      fill.rotation.x = -Math.PI / 2;
      fill.renderOrder = -1;

      const gridPts: number[] = [];
      for (let x = -w + s.gridStep; x < w - 1e-6; x += s.gridStep) gridPts.push(x, 0, -d, x, 0, d);
      for (let z = -d + s.gridStep; z < d - 1e-6; z += s.gridStep) gridPts.push(-w, 0, z, w, 0, z);
      const grid = lines(gridPts, this.color);

      // 테두리와 모서리 꺾쇠(꺾쇠는 테두리 위에 겹쳐 그려 더 밝다)
      const b = Math.min(w, d) * 0.22;
      const framePts = [-w, 0, -d, w, 0, -d, w, 0, -d, w, 0, d, w, 0, d, -w, 0, d, -w, 0, d, -w, 0, -d];
      for (const [cx, cz, dx, dz] of [
        [-w, -d, 1, 1],
        [w, -d, -1, 1],
        [-w, d, 1, -1],
        [w, d, -1, -1],
      ]) {
        framePts.push(cx, 0, cz, cx + dx * b, 0, cz, cx, 0, cz, cx, 0, cz + dz * b);
      }
      const frameLines = lines(framePts, this.color);

      const tex = this.labels.get(layer.label, 'major');
      const label = new Mesh(
        this.labelGeometry,
        new MeshBasicMaterial({ map: tex.texture, transparent: true, opacity: 0, depthWrite: false }),
      );
      const lh = s.labelHeight;
      label.scale.set(lh * tex.aspect, lh, 1);
      label.rotation.x = -Math.PI / 2;
      label.position.set(-w + (lh * tex.aspect) / 2, 0, d + lh * 0.9);

      root.add(fill, grid, frameLines, label);
      this.group.add(root);
      this.layers.push({ root, fill, grid, frame: frameLines, label, emphasis: 0 });
    }
  }

  /** mix 는 지층 보기로 들어간 정도(0~1), focus 는 바라보는 층 번호다 */
  update(dt: number, mix: number, focus: number): void {
    const s = tuning.strata;
    this.group.visible = mix > 0.002 && this.layers.length > 0;
    this.layers.forEach((l, i) => {
      l.emphasis = damp(l.emphasis, i === focus ? 1 : s.otherLayerAlpha, s.transitionRate * 2, dt);
      const a = mix * l.emphasis;
      l.fill.material.opacity = s.fillAlpha * a;
      l.grid.material.opacity = s.gridAlpha * a;
      l.frame.material.opacity = s.frameAlpha * a;
      l.label.material.opacity = a;
    });
  }

  clear(): void {
    for (const l of this.layers) {
      l.fill.geometry.dispose();
      l.fill.material.dispose();
      l.grid.geometry.dispose();
      l.grid.material.dispose();
      l.frame.geometry.dispose();
      l.frame.material.dispose();
      l.label.material.dispose();
      this.group.remove(l.root);
    }
    this.layers = [];
  }

  dispose(): void {
    this.clear();
    this.labelGeometry.dispose();
  }
}

function lines(points: number[], color: Color): LineSegments<BufferGeometry, LineBasicMaterial> {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  const material = new LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
  return new LineSegments(geometry, material);
}
