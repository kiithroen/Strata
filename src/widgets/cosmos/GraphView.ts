import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
  type InterleavedBufferAttribute,
} from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { tuning } from '../../config';
import type { LabelCache } from '../common/labelCache';
import { facingQuaternion } from './cosmosModel';

/**
 * 우주 보기의 선 그래프: 가지(허브 ↔ 행성, 허브끼리), 살(행성 → 노트 점), 점, 빛 무리, 글자.
 * 매 프레임 begin() 다음 그릴 것을 넣고 end() 로 한 번에 올린다. 모두 가산 합성이라 겹칠수록 밝다.
 */
export class GraphView {
  readonly group = new Group();
  private readonly branches: LineBatch;
  private readonly spokes: LineBatch;
  private readonly dots: PointBatch;
  private readonly glows: PointBatch;
  private readonly labelGeometry = new PlaneGeometry(1, 1);
  private readonly labelPool: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private labelCount = 0;

  constructor(
    private readonly labels: LabelCache,
    maxSegments: number,
    maxPoints: number,
  ) {
    const g = tuning.cosmos.graph;
    this.branches = new LineBatch(maxSegments, g.branchWidth);
    this.spokes = new LineBatch(maxSegments, g.spokeWidth);
    this.dots = new PointBatch(maxPoints, false);
    this.glows = new PointBatch(maxPoints, true);
    this.group.add(this.glows.points, this.branches.line, this.spokes.line, this.dots.points);
  }

  /** 화면 크기(CSS px)와 시야각이 바뀌면 다시 맞춘다 */
  setViewport(width: number, height: number, pixelRatio: number, fovDeg: number): void {
    this.branches.setResolution(width, height);
    this.spokes.setResolution(width, height);
    const scale = (height * pixelRatio) / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.dots.setScale(scale);
    this.glows.setScale(scale);
  }

  begin(): void {
    this.branches.begin();
    this.spokes.begin();
    this.dots.begin();
    this.glows.begin();
    this.labelCount = 0;
  }

  branch(a: Vector3, b: Vector3, color: Color, alpha: number): void {
    this.branches.add(a, b, color, alpha);
  }

  spoke(a: Vector3, b: Vector3, color: Color, alpha: number): void {
    this.spokes.add(a, b, color, alpha);
  }

  dot(p: Vector3, color: Color, size: number, alpha: number): void {
    this.dots.add(p, color, size, alpha);
  }

  glow(p: Vector3, color: Color, size: number, alpha: number): void {
    this.glows.add(p, color, size, alpha);
  }

  label(p: Vector3, text: string, height: number, alpha: number, cameraPosition: Vector3): void {
    if (alpha < 0.01) return;
    let mesh = this.labelPool[this.labelCount];
    if (!mesh) {
      mesh = new Mesh(this.labelGeometry, new MeshBasicMaterial({ transparent: true, depthWrite: false, fog: true }));
      this.labelPool.push(mesh);
      this.group.add(mesh);
    }
    this.labelCount++;
    const l = this.labels.get(text, 'major');
    if (mesh.material.map !== l.texture) {
      mesh.material.map = l.texture;
      mesh.material.needsUpdate = true;
    }
    mesh.scale.set(height * l.aspect, height, 1);
    mesh.position.copy(p);
    facingQuaternion(p, cameraPosition, mesh.quaternion);
    mesh.material.opacity = alpha;
    mesh.visible = true;
  }

  end(): void {
    this.branches.end();
    this.spokes.end();
    this.dots.end();
    this.glows.end();
    for (let i = this.labelCount; i < this.labelPool.length; i++) this.labelPool[i].visible = false;
  }

  dispose(): void {
    this.branches.dispose();
    this.spokes.dispose();
    this.dots.dispose();
    this.glows.dispose();
    this.labelGeometry.dispose();
    for (const m of this.labelPool) m.material.dispose();
  }
}

/** 굵기 있는 선분 묶음. 버퍼를 한 번 잡아 두고 매 프레임 덮어쓴다 */
class LineBatch {
  readonly line: LineSegments2;
  private readonly geometry: LineSegmentsGeometry;
  private readonly material: LineMaterial;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private count = 0;

  constructor(
    private readonly max: number,
    width: number,
  ) {
    this.geometry = new LineSegmentsGeometry();
    this.geometry.setPositions(new Float32Array(max * 6));
    this.geometry.setColors(new Float32Array(max * 6));
    this.positions = (this.geometry.attributes.instanceStart as InterleavedBufferAttribute).data.array as Float32Array;
    this.colors = (this.geometry.attributes.instanceColorStart as InterleavedBufferAttribute).data.array as Float32Array;
    this.material = new LineMaterial({
      linewidth: width,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.material.fog = true;
    this.line = new LineSegments2(this.geometry, this.material);
    this.line.frustumCulled = false;
  }

  setResolution(width: number, height: number): void {
    this.material.resolution.set(width, height);
  }

  begin(): void {
    this.count = 0;
  }

  /** 가산 합성이라 alpha 는 색 밝기로 곱한다 */
  add(a: Vector3, b: Vector3, color: Color, alpha: number): void {
    if (this.count >= this.max || alpha < 0.005) return;
    const i = this.count * 6;
    const p = this.positions;
    p[i] = a.x;
    p[i + 1] = a.y;
    p[i + 2] = a.z;
    p[i + 3] = b.x;
    p[i + 4] = b.y;
    p[i + 5] = b.z;
    const c = this.colors;
    c[i] = c[i + 3] = color.r * alpha;
    c[i + 1] = c[i + 4] = color.g * alpha;
    c[i + 2] = c[i + 5] = color.b * alpha;
    this.count++;
  }

  end(): void {
    (this.geometry.attributes.instanceStart as InterleavedBufferAttribute).data.needsUpdate = true;
    (this.geometry.attributes.instanceColorStart as InterleavedBufferAttribute).data.needsUpdate = true;
    this.geometry.instanceCount = this.count;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** 크기가 깊이에 따라 줄어드는 점 묶음. soft 면 넓게 번지는 빛 무리다 */
class PointBatch {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly position: BufferAttribute;
  private readonly color: BufferAttribute;
  private readonly size: BufferAttribute;
  private readonly alpha: BufferAttribute;
  private count = 0;

  constructor(
    private readonly max: number,
    soft: boolean,
  ) {
    const geometry = new BufferGeometry();
    this.position = new BufferAttribute(new Float32Array(max * 3), 3).setUsage(DynamicDrawUsage);
    this.color = new BufferAttribute(new Float32Array(max * 3), 3).setUsage(DynamicDrawUsage);
    this.size = new BufferAttribute(new Float32Array(max), 1).setUsage(DynamicDrawUsage);
    this.alpha = new BufferAttribute(new Float32Array(max), 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.position);
    geometry.setAttribute('aColor', this.color);
    geometry.setAttribute('aSize', this.size);
    geometry.setAttribute('aAlpha', this.alpha);
    const c = tuning.cosmos;
    const material = new ShaderMaterial({
      uniforms: {
        uScale: { value: 1 },
        uFogNear: { value: c.fogNear },
        uFogFar: { value: c.fogFar },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        uniform float uFogNear;
        uniform float uFogFar;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.5, aSize * uScale / max(-mv.z, 0.1));
          vColor = aColor;
          vAlpha = aAlpha * (1.0 - smoothstep(uFogNear, uFogFar, -mv.z) * 0.85);
        }
      `,
      fragmentShader: soft
        ? /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = exp(-d * d * 4.0) * vAlpha;
          gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }
      `
        : /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = (smoothstep(1.0, 0.55, d) + 0.6 * smoothstep(0.35, 0.0, d)) * vAlpha;
          gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }
      `,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    if (soft) this.points.renderOrder = -1;
  }

  setScale(scale: number): void {
    this.points.material.uniforms.uScale.value = scale;
  }

  begin(): void {
    this.count = 0;
  }

  add(p: Vector3, color: Color, size: number, alpha: number): void {
    if (this.count >= this.max || alpha < 0.005) return;
    const i = this.count;
    this.position.setXYZ(i, p.x, p.y, p.z);
    this.color.setXYZ(i, color.r, color.g, color.b);
    this.size.setX(i, size);
    this.alpha.setX(i, alpha);
    this.count++;
  }

  end(): void {
    this.position.needsUpdate = true;
    this.color.needsUpdate = true;
    this.size.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.points.geometry.setDrawRange(0, this.count);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
