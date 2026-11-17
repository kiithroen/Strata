import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { tuning } from '../../config';
import { damp } from '../../core/motion';
import { glowTexture } from '../common/glowTexture';
import type { LabelCache } from '../common/labelCache';
import { paintOrder, strataPoint, type StrataFrame, type StrataLayer } from './strataLayout';

/** 링 판이 반지름보다 넓게 차지하는 배율(바깥 호 조각과 눈금이 들어갈 자리) */
const RING_EXTENT = 1.18;
/** 날짜 글자를 놓는 반지름 배율(바깥 호 조각 바로 바깥) */
const LABEL_RING = 1.12;
/** 지층의 첫 그리는 차례. 은하 그래프·먼지(1 이하)보다 뒤다. 한 차례에 2 씩 써서 층 판 다음에 그 층 카드를 그린다 */
const ORDER_BASE = 2;

interface LayerMeshes {
  root: Group;
  /** 원판(테이블). 링이 여기에 붙어 창과 함께 돈다. 날짜는 돌지 않는다 */
  table: Group;
  ring: Mesh<PlaneGeometry, ShaderMaterial>;
  label: Mesh<PlaneGeometry, MeshBasicMaterial>;
  labelText: string;
  emphasis: number;
  /** 층 높이(판 좌표)와 층 판·날짜의 그리는 차례(sortForCamera) */
  y: number;
  order: number;
}

/**
 * 원판 HUD 링. 반지름 1 기준 좌표에서 바깥 실선 링과 눈금, 안쪽 점선 링, 바깥 호 조각, 더 안쪽 점 링,
 * 가운데가 밝은 옅은 바탕을 한 번에 그린다. 점선·호·점 링은 게임 시간에 따라 서로 다른 빠르기와 방향으로 돈다.
 */
const ringVertex = /* glsl */ `
varying vec2 vP;
void main() {
  vP = (uv - 0.5) * 2.0 * ${RING_EXTENT.toFixed(3)};
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ringFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uFocus;
uniform float uTime;
uniform float uLine;
uniform float uFill;
uniform float uDashes;
uniform vec3 uSpeed;
varying vec2 vP;

const float TAU = 6.28318530718;

// 반지름 r0 에 굵기 w 인 링. 화면 한 픽셀 정도로 가장자리를 부드럽게 한다
float ring(float rho, float r0, float w, float aa) {
  return 1.0 - smoothstep(w * 0.5, w * 0.5 + aa, abs(rho - r0));
}

// 한 바퀴를 n 칸으로 나눴을 때 칸 안에서 duty 비율만 켠다(점선)
float dashes(float turn, float n, float duty, float aa) {
  float f = fract(turn * n);
  float e = aa * n;
  return smoothstep(0.0, e, f) * (1.0 - smoothstep(duty - e, duty, f));
}

// 한 바퀴 위치 turn 이 [a, b] 구간이면 1(구간 끝은 부드럽게)
float arc(float turn, float a, float b) {
  return smoothstep(a, a + 0.01, turn) * (1.0 - smoothstep(b - 0.01, b, turn));
}

void main() {
  float rho = length(vP);
  float aa = fwidth(rho);
  float turn = atan(vP.y, vP.x) / TAU + 0.5;
  float aaTurn = fwidth(turn) > 0.5 ? 0.0 : fwidth(turn);

  float a = 0.0;
  // 바깥 실선 링(바라보는 층은 더 도드라진다)과 10도·30도 눈금
  float outer = ring(rho, 1.0, uLine * mix(0.85, 1.15, uFocus), aa);
  a += outer;
  float tick10 = dashes(turn, 36.0, 0.08, aaTurn) * step(1.0, rho) * (1.0 - smoothstep(1.035, 1.035 + aa, rho));
  float tick30 = dashes(turn, 12.0, 0.04, aaTurn) * step(1.0, rho) * (1.0 - smoothstep(1.06, 1.06 + aa, rho));
  a += (tick10 * 0.65 + tick30 * 0.55) * mix(0.55, 1.0, uFocus);
  // 안쪽 점선 링
  a += ring(rho, 0.93, uLine * 0.7, aa) * dashes(fract(turn + uTime * uSpeed.x), uDashes, 0.5, aaTurn) * 0.75;
  // 바깥 호 조각 두 개
  float t2 = fract(turn + uTime * uSpeed.y);
  float arcs = max(arc(t2, 0.02, 0.2), arc(t2, 0.52, 0.6));
  float arcRing = ring(rho, 1.09, uLine * 1.5, aa) * arcs * mix(0.5, 1.0, uFocus);
  a += arcRing;
  // 안쪽 점 링과 옅은 내측 링
  a += ring(rho, 0.62, uLine * 0.6, aa) * dashes(fract(turn + uTime * uSpeed.z), 48.0, 0.2, aaTurn) * 0.5;
  a += ring(rho, 0.38, uLine * 0.45, aa) * 0.28;
  // 가운데가 밝은 옅은 바탕
  a += uFill * (1.0 - smoothstep(0.0, 1.0, rho)) * (1.0 - smoothstep(1.0 - aa, 1.0, rho));

  // 바라보는 층의 실선과 호 조각은 조금 더 하얗게 빛난다
  vec3 color = mix(uColor, vec3(1.0), 0.22 * (arcRing + outer * 0.5 * uFocus));
  gl_FragColor = vec4(color, min(a, 1.0) * uOpacity);
  #include <colorspace_fragment>
}
`;

/**
 * 아래에서 위로 퍼지는 빛기둥. 아래가 밝고 위로 갈수록 옅어지며, 시선과 마주 보는 면이 밝아 부피가 있어 보인다.
 * 둘레를 따라 천천히 도는 빛줄기 무늬가 있다
 */
const beamVertex = /* glsl */ `
uniform float uHeight;
uniform float uBase;
varying float vH;
varying float vAngle;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  vH = (position.y + uBase) / uHeight;
  vAngle = atan(position.z, position.x);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;

const beamFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying float vH;
varying float vAngle;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  float facing = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
  float rays = 0.72 + 0.28 * sin(vAngle * 18.0 + uTime * 0.5) * sin(vAngle * 7.0 - uTime * 0.3);
  float a = pow(1.0 - vH, 1.45) * pow(facing, 1.5) * rays;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.14 * (1.0 - vH)), a * uOpacity);
  #include <colorspace_fragment>
}
`;

/**
 * 지층 보기의 층과 빛: 층마다 도는 원판 HUD 링과 날짜, 가장 아래층 밑의 발광부에서 위로 퍼지는 빛기둥.
 * 배치(strataLayout)가 정한 층마다 하나씩 만들고, 바라보는 층은 밝게 나머지는 옅게 그린다. 모두 가산 합성이라 블룸이 걸린다.
 */
export class StrataView {
  readonly group = new Group();
  private layers: LayerMeshes[] = [];
  private readonly labelGeometry = new PlaneGeometry(1, 1);
  private readonly ringGeometry = new PlaneGeometry(1, 1);
  private readonly color = new Color(tuning.look.accent);
  private readonly time = { value: 0 };
  /** 빛기둥 조각(발광부 → 층 → 층 → 꼭대기)과 각 조각 가운데 높이(판 좌표) */
  private beams: { mesh: Mesh<CylinderGeometry, ShaderMaterial>; y: number }[] = [];
  private readonly beamOpacity = { value: 0 };
  private bottomY = 0;
  private base: Mesh<PlaneGeometry, ShaderMaterial> | null = null;
  private readonly glow: Sprite;

  constructor(private readonly labels: LabelCache) {
    this.glow = new Sprite(
      new SpriteMaterial({ map: glowTexture(), color: this.color, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }),
    );
    this.glow.visible = false;
    this.group.add(this.glow);
  }

  build(layers: readonly StrataLayer[], frame: StrataFrame): void {
    this.clear();
    if (layers.length === 0) return;
    const s = tuning.strata;
    for (const layer of layers) {
      const root = new Group();
      strataPoint(frame, 0, layer.y, 0, root.position);
      root.rotation.y = frame.yaw;
      const r = layer.radius;

      const ring = new Mesh(this.ringGeometry, this.ringMaterial());
      ring.scale.set(r * 2 * RING_EXTENT, r * 2 * RING_EXTENT, 1);
      ring.rotation.x = -Math.PI / 2;

      // 날짜는 원판 앞쪽 바깥 가운데에 눕힌다
      const tex = this.labels.get(layer.label, 'major');
      const label = new Mesh(
        this.labelGeometry,
        new MeshBasicMaterial({ map: tex.texture, transparent: true, opacity: 0, depthWrite: false }),
      );
      const lh = s.labelHeight;
      label.scale.set(lh * tex.aspect, lh, 1);
      label.rotation.x = -Math.PI / 2;
      label.position.set(0, 0, r * LABEL_RING + lh * 0.5);

      const table = new Group();
      table.add(ring);
      root.add(table, label);
      this.group.add(root);
      this.layers.push({ root, table, ring, label, labelText: layer.label, emphasis: 0, y: layer.y, order: 0 });
    }

    // 빛기둥: 가장 아래층 밑의 발광부에서 가장 위층 위까지. 층 사이마다 조각을 나눠 층 판과 번갈아 그린다
    const b = s.beam;
    const bottom = Math.min(...layers.map((l) => l.y)) - s.layerGap * b.emitterGap;
    const top = Math.max(...layers.map((l) => l.y)) + s.layerGap * b.topGap;
    const maxR = Math.max(...layers.map((l) => l.radius));
    const height = top - bottom;
    const topR = maxR * b.spread;
    const radiusAt = (y: number) => b.base + ((topR - b.base) * (y - bottom)) / height;
    const levels = [bottom, ...layers.map((l) => l.y).sort((a, c) => a - c), top];
    for (let i = 0; i + 1 < levels.length; i++) {
      const y0 = levels[i];
      const y1 = levels[i + 1];
      const mid = (y0 + y1) / 2;
      const material = new ShaderMaterial({
        uniforms: { uColor: { value: this.color }, uOpacity: this.beamOpacity, uTime: this.time, uHeight: { value: height }, uBase: { value: mid - bottom } },
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(new CylinderGeometry(radiusAt(y1), radiusAt(y0), y1 - y0, 64, 1, true), material);
      strataPoint(frame, 0, mid, 0, mesh.position);
      this.beams.push({ mesh, y: mid });
      this.group.add(mesh);
    }
    this.bottomY = bottom;

    // 발광부: 작은 링 판과 빛 무리
    this.base = new Mesh(this.ringGeometry, this.ringMaterial());
    const baseR = b.base * 3;
    this.base.scale.set(baseR * 2 * RING_EXTENT, baseR * 2 * RING_EXTENT, 1);
    this.base.rotation.x = -Math.PI / 2;
    strataPoint(frame, 0, bottom, 0, this.base.position);
    this.base.rotation.z = frame.yaw;
    strataPoint(frame, 0, bottom, 0, this.glow.position);
    this.glow.scale.setScalar(b.glow);
    this.glow.visible = true;
    this.group.add(this.base);
    this.sortForCamera(top + s.distance);
  }

  /**
   * 카메라 높이(eyeY, 고른 층을 0으로 한 판 좌표)에 맞춰 층 판·빛기둥 조각·발광부의 그리는 차례를 정한다.
   * 카메라에서 먼 높이의 것부터 그려, 위에서 내려다보면 아래층과 그 카드가 먼저 깔리고 위층 판과 카드가 그 위를 덮는다
   */
  sortForCamera(eyeY: number): void {
    const n = this.layers.length;
    const heights = [...this.layers.map((l) => l.y), ...this.beams.map((b) => b.y), this.bottomY];
    const rank = paintOrder(heights, eyeY);
    this.layers.forEach((l, i) => {
      l.order = ORDER_BASE + rank[i] * 2;
      l.ring.renderOrder = l.order;
      l.label.renderOrder = l.order;
    });
    this.beams.forEach((b, i) => (b.mesh.renderOrder = ORDER_BASE + rank[n + i] * 2));
    const baseOrder = ORDER_BASE + rank[heights.length - 1] * 2;
    if (this.base) this.base.renderOrder = baseOrder;
    this.glow.renderOrder = baseOrder;
  }

  /** 층(번호)에 놓인 카드가 쓸 그리는 차례. 그 층 판 바로 다음이다 */
  cardOrder(layer: number): number {
    const l = this.layers[layer];
    return l ? l.order + 1 : 0;
  }

  /** mix 는 지층 보기로 들어간 정도(0~1), focus 는 바라보는 층 번호, spin 은 원판이 돈 각도다 */
  update(dt: number, mix: number, focus: number, spin = 0): void {
    const s = tuning.strata;
    this.time.value += dt;
    this.group.visible = mix > 0.002 && this.layers.length > 0;
    this.layers.forEach((l, i) => {
      l.table.rotation.y = spin;
      l.emphasis = damp(l.emphasis, i === focus ? 1 : s.otherLayerAlpha, s.transitionRate * 2, dt);
      const a = mix * l.emphasis;
      const focusAmt = s.otherLayerAlpha < 1 ? Math.min(1, Math.max(0, (l.emphasis - s.otherLayerAlpha) / (1 - s.otherLayerAlpha))) : 1;
      l.ring.material.uniforms.uOpacity.value = s.ring.alpha * a;
      l.ring.material.uniforms.uFocus.value = focusAmt;
      l.label.material.opacity = a;
      if (this.group.visible) {
        const tex = this.labels.get(l.labelText, 'major');
        if (l.label.material.map !== tex.texture) {
          l.label.material.map = tex.texture;
          l.label.material.needsUpdate = true;
        }
      }
    });
    this.beamOpacity.value = s.beam.alpha * mix;
    if (this.base) {
      this.base.material.uniforms.uOpacity.value = s.ring.alpha * mix;
      this.base.material.uniforms.uFocus.value = 1;
    }
    this.glow.material.opacity = s.beam.glowAlpha * mix;
  }

  clear(): void {
    for (const l of this.layers) {
      l.ring.material.dispose();
      l.label.material.dispose();
      this.group.remove(l.root);
    }
    this.layers = [];
    for (const b of this.beams) {
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
      this.group.remove(b.mesh);
    }
    this.beams = [];
    if (this.base) {
      this.base.material.dispose();
      this.group.remove(this.base);
      this.base = null;
    }
    this.glow.visible = false;
  }

  dispose(): void {
    this.clear();
    this.labelGeometry.dispose();
    this.ringGeometry.dispose();
    this.glow.material.dispose();
  }

  private ringMaterial(): ShaderMaterial {
    const r = tuning.strata.ring;
    return new ShaderMaterial({
      uniforms: {
        uColor: { value: this.color },
        uOpacity: { value: 0 },
        uFocus: { value: 1 },
        uTime: this.time,
        uLine: { value: r.line },
        uFill: { value: r.fillAlpha },
        uDashes: { value: r.dashes },
        uSpeed: { value: new Vector3(r.dashSpeed, r.arcSpeed, r.dotSpeed) },
      },
      vertexShader: ringVertex,
      fragmentShader: ringFragment,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
  }
}
