import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  Mesh,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
  type InterleavedBufferAttribute,
} from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { tuning } from '../../config';
import type { LabelOptions, ScreenLabels } from '../common/screenLabels';

/**
 * 우주 보기의 선 그래프: 가지(연속 발광 곡선 리본), 살(행성 → 카드/점 직선), 점, 노드 구슬, 빛 무리, 글자.
 * 매 프레임 begin() 다음 그릴 것을 넣고 end() 로 한 번에 올린다. 모두 가산 합성이라 겹칠수록 밝다.
 */
export class GraphView {
  readonly group = new Group();
  private readonly branches: RibbonBatch;
  private readonly spokes: LineBatch;
  private readonly dots: PointBatch;
  private readonly orbs: PointBatch;
  private readonly glows: PointBatch;
  /** 모든 선·점·빛·글자의 불투명도에 곱하는 배율. 지층 보기 동안 은하를 옅게 한다 */
  alphaScale = 1;

  /** labels 는 화면 글자 묶음이다. 다른 글자와 함께 겹침을 정리하도록 바깥에서 받고, begin·end·화면 크기는 바깥이 맞춘다 */
  constructor(
    private readonly labels: ScreenLabels,
    maxSegments: number,
    maxPoints: number,
  ) {
    const g = tuning.cosmos.graph;
    this.branches = new RibbonBatch(maxSegments, g.branchSegments, g.branchWidth);
    this.spokes = new LineBatch(maxSegments, g.spokeWidth);
    // 카드를 먼저 그린 뒤 살을 그려 카드 뒤로 들어가는 선 끝은 테두리에서 가려지고 앞의 선은 보인다
    this.spokes.line.renderOrder = 1;
    this.dots = new PointBatch(maxPoints, 'dot');
    this.orbs = new PointBatch(maxPoints, 'orb');
    this.glows = new PointBatch(maxPoints, 'glow');
    this.group.add(this.glows.points, this.branches.mesh, this.spokes.line, this.dots.points, this.orbs.points);
  }

  /** 화면 크기(CSS px)와 시야각이 바뀌면 다시 맞춘다 */
  setViewport(width: number, height: number, pixelRatio: number, fovDeg: number): void {
    this.branches.setViewport(width, height, fovDeg);
    this.spokes.setResolution(width, height);
    const scale = (height * pixelRatio) / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.dots.setScale(scale);
    this.orbs.setScale(scale);
    const [minPx, maxPx] = tuning.cosmos.graph.orbPx;
    this.orbs.setSizeLimits(minPx * pixelRatio, maxPx * pixelRatio);
    this.glows.setScale(scale);
  }

  begin(): void {
    this.branches.begin();
    this.spokes.begin();
    this.dots.begin();
    this.orbs.begin();
    this.glows.begin();
  }

  /** 정점을 공유하는 연속 곡선 가지를 그린다. 앞의 count 개 점을 쓰고, 각 점마다 alpha 를 주면 깊이에 따라 부드럽게 옅어진다 */
  branchCurve(points: readonly Vector3[], alphas: readonly number[], color: Color, count = points.length): void {
    this.branches.addCurve(points, alphas, color, this.alphaScale, count);
  }

  spoke(a: Vector3, b: Vector3, color: Color, alpha: number): void {
    this.spokes.add(a, b, color, alpha * this.alphaScale);
  }

  dot(p: Vector3, color: Color, size: number, alpha: number): void {
    this.dots.add(p, color, size, alpha * this.alphaScale);
  }

  /** 노드 구슬: 흰 코어를 color 테두리가 감싼다 */
  orb(p: Vector3, color: Color, size: number, alpha: number): void {
    this.orbs.add(p, color, size, alpha * this.alphaScale);
  }

  glow(p: Vector3, color: Color, size: number, alpha: number): void {
    this.glows.add(p, color, size, alpha * this.alphaScale);
  }

  /** 카메라를 향한 글자. 거리와 상관없이 화면에서 heightPx(CSS px) 높이로 보인다. 자리 옮김·색·겹칠 때 차례는 opts 로 준다 */
  label(p: Vector3, text: string, heightPx: number, alpha: number, cameraPosition: Vector3, opts: LabelOptions = {}): void {
    this.labels.add(p, text, heightPx, alpha * this.alphaScale, cameraPosition, opts);
  }

  end(): void {
    this.branches.end();
    this.spokes.end();
    this.dots.end();
    this.orbs.end();
    this.glows.end();
  }

  dispose(): void {
    this.branches.dispose();
    this.spokes.dispose();
    this.dots.dispose();
    this.orbs.dispose();
    this.glows.dispose();
  }
}

/**
 * 이음매 겹침 없이 곡선을 그리는 화면 공간 빌보드 리본 묶음.
 * 각 샘플점의 양쪽(±side) 정점을 공유해 가산 합성에서도 연결점마다 점이 찍히지 않고, 중심 코어에서 바깥으로 부드럽게 번진다.
 */
class RibbonBatch {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  private readonly position: BufferAttribute;
  private readonly prev: BufferAttribute;
  private readonly next: BufferAttribute;
  private readonly side: BufferAttribute;
  private readonly color: BufferAttribute;
  private readonly alpha: BufferAttribute;
  private readonly index: BufferAttribute;
  private readonly maxVertices: number;
  private readonly maxIndices: number;
  private vertCount = 0;
  private indexCount = 0;

  constructor(maxCurves: number, segmentsPerCurve: number, width: number) {
    this.maxVertices = Math.max(4, maxCurves * (segmentsPerCurve + 1) * 2);
    this.maxIndices = Math.max(6, maxCurves * segmentsPerCurve * 6);
    const geometry = new BufferGeometry();
    this.position = new BufferAttribute(new Float32Array(this.maxVertices * 3), 3).setUsage(DynamicDrawUsage);
    this.prev = new BufferAttribute(new Float32Array(this.maxVertices * 3), 3).setUsage(DynamicDrawUsage);
    this.next = new BufferAttribute(new Float32Array(this.maxVertices * 3), 3).setUsage(DynamicDrawUsage);
    this.side = new BufferAttribute(new Float32Array(this.maxVertices), 1).setUsage(DynamicDrawUsage);
    this.color = new BufferAttribute(new Float32Array(this.maxVertices * 3), 3).setUsage(DynamicDrawUsage);
    this.alpha = new BufferAttribute(new Float32Array(this.maxVertices), 1).setUsage(DynamicDrawUsage);
    this.index = new BufferAttribute(new Uint32Array(this.maxIndices), 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.position);
    geometry.setAttribute('aPrev', this.prev);
    geometry.setAttribute('aNext', this.next);
    geometry.setAttribute('aSide', this.side);
    geometry.setAttribute('aColor', this.color);
    geometry.setAttribute('aAlpha', this.alpha);
    geometry.setIndex(this.index);

    const c = tuning.cosmos;
    const material = new ShaderMaterial({
      uniforms: {
        uResolution: { value: new Vector2(1, 1) },
        uWidth: { value: width },
        uTanHalfFov: { value: Math.tan((tuning.camera.fovDeg * Math.PI) / 360) },
        uFogNear: { value: c.fogNear },
        uFogFar: { value: c.fogFar },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aPrev;
        attribute vec3 aNext;
        attribute float aSide;
        attribute vec3 aColor;
        attribute float aAlpha;
        uniform vec2 uResolution;
        uniform float uWidth;
        uniform float uTanHalfFov;
        uniform float uFogNear;
        uniform float uFogFar;
        varying float vSide;
        varying vec3 vColor;
        varying float vAlpha;

        vec2 toViewPlane(vec4 mv) {
          return mv.xy / max(-mv.z, 0.05);
        }

        void main() {
          vec4 mvCurr = modelViewMatrix * vec4(position, 1.0);
          vec4 mvPrev = modelViewMatrix * vec4(aPrev, 1.0);
          vec4 mvNext = modelViewMatrix * vec4(aNext, 1.0);
          vec2 sCurr = toViewPlane(mvCurr);
          vec2 sPrev = toViewPlane(mvPrev);
          vec2 sNext = toViewPlane(mvNext);
          vec2 d1 = sCurr - sPrev;
          vec2 d2 = sNext - sCurr;
          float l1 = length(d1);
          float l2 = length(d2);
          vec2 t = vec2(1.0, 0.0);
          if (l1 > 1e-6 && l2 > 1e-6) {
            vec2 sum = d1 / l1 + d2 / l2;
            t = length(sum) > 1e-5 ? normalize(sum) : d2 / l2;
          } else if (l2 > 1e-6) {
            t = d2 / l2;
          } else if (l1 > 1e-6) {
            t = d1 / l1;
          }
          vec2 perp = vec2(-t.y, t.x);
          float worldPerPx = (2.0 * max(-mvCurr.z, 0.05) * uTanHalfFov) / max(uResolution.y, 1.0);
          mvCurr.xy += perp * (uWidth * 0.5 * aSide * worldPerPx);
          gl_Position = projectionMatrix * mvCurr;
          vSide = aSide;
          vColor = aColor;
          vAlpha = aAlpha * (1.0 - smoothstep(uFogNear, uFogFar, -mvCurr.z) * 0.85);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vSide;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = abs(vSide);
          float glow = exp(-d * d * 4.5);
          float core = smoothstep(0.6, 0.0, d);
          float a = (0.45 * glow + 0.55 * core) * vAlpha;
          vec3 col = mix(vColor, vec3(1.0), 0.22 * core);
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }
      `,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  setViewport(width: number, height: number, fovDeg: number): void {
    this.mesh.material.uniforms.uResolution.value.set(width, height);
    this.mesh.material.uniforms.uTanHalfFov.value = Math.tan((fovDeg * Math.PI) / 360);
  }

  begin(): void {
    this.vertCount = 0;
    this.indexCount = 0;
  }

  addCurve(points: readonly Vector3[], alphas: readonly number[], color: Color, alphaScale: number, count: number): void {
    const n = count;
    if (n < 2 || alphaScale < 0.005) return;
    const needVerts = n * 2;
    const needIndices = (n - 1) * 6;
    if (this.vertCount + needVerts > this.maxVertices || this.indexCount + needIndices > this.maxIndices) return;
    let anyVisible = false;
    for (let i = 0; i < n; i++) {
      if (alphas[i] * alphaScale >= 0.005) {
        anyVisible = true;
        break;
      }
    }
    if (!anyVisible) return;

    const baseVert = this.vertCount;
    for (let i = 0; i < n; i++) {
      const curr = points[i];
      const pPrev = i > 0 ? points[i - 1] : curr;
      const pNext = i < n - 1 ? points[i + 1] : curr;
      const a = alphas[i] * alphaScale;
      for (let s = -1; s <= 1; s += 2) {
        const vi = this.vertCount++;
        this.position.setXYZ(vi, curr.x, curr.y, curr.z);
        this.prev.setXYZ(vi, pPrev.x, pPrev.y, pPrev.z);
        this.next.setXYZ(vi, pNext.x, pNext.y, pNext.z);
        this.side.setX(vi, s);
        this.color.setXYZ(vi, color.r, color.g, color.b);
        this.alpha.setX(vi, a);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const v0 = baseVert + i * 2;
      const v1 = v0 + 1;
      const v2 = v0 + 2;
      const v3 = v0 + 3;
      this.index.setX(this.indexCount++, v0);
      this.index.setX(this.indexCount++, v1);
      this.index.setX(this.indexCount++, v2);
      this.index.setX(this.indexCount++, v1);
      this.index.setX(this.indexCount++, v3);
      this.index.setX(this.indexCount++, v2);
    }
  }

  end(): void {
    this.position.needsUpdate = true;
    this.prev.needsUpdate = true;
    this.next.needsUpdate = true;
    this.side.needsUpdate = true;
    this.color.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.index.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, this.indexCount);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
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
    kind: 'dot' | 'orb' | 'glow',
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
        uSizeLimits: { value: new Vector2(1.5, 4096) },
        uFogNear: { value: c.fogNear },
        uFogFar: { value: c.fogFar },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        uniform vec2 uSizeLimits;
        uniform float uFogNear;
        uniform float uFogFar;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), uSizeLimits.x, uSizeLimits.y);
          vColor = aColor;
          vAlpha = aAlpha * (1.0 - smoothstep(uFogNear, uFogFar, -mv.z) * 0.85);
        }
      `,
      fragmentShader:
        kind === 'glow'
          ? /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          // 넓은 번짐도 원 가장자리에서 0 으로 끊어 점 사각형 경계가 드러나지 않게 한다
          float a = (exp(-d * d * 5.2) + 0.35 * exp(-d * d * 1.8)) * (1.0 - smoothstep(0.7, 1.0, d)) * vAlpha;
          gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }
      `
          : kind === 'orb'
            ? /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          // 흰 코어, 노드 색 테두리, 가장자리는 부드럽게 끊는다
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float core = smoothstep(0.42, 0.22, d);
          float a = smoothstep(1.0, 0.82, d) * vAlpha;
          gl_FragColor = vec4(mix(vColor, vec3(1.0), core), a);
          #include <colorspace_fragment>
        }
      `
            : /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = (smoothstep(0.95, 0.45, d) + 0.85 * smoothstep(0.38, 0.0, d)) * vAlpha;
          gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }
      `,
      // 구슬은 일반 합성이라 겹친 빛에 하얗게 포화되지 않고 테두리 색이 남는다. 나머지는 가산 합성이다
      blending: kind === 'orb' ? NormalBlending : AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    if (kind === 'glow') this.points.renderOrder = -1;
  }

  setScale(scale: number): void {
    this.points.material.uniforms.uScale.value = scale;
  }

  /** 화면에 그리는 점 지름의 하한·상한(기기 px) */
  setSizeLimits(min: number, max: number): void {
    this.points.material.uniforms.uSizeLimits.value.set(min, max);
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
