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
import { strataPoint, type StrataFrame, type StrataLayer } from './strataLayout';

/** 링 판이 반지름보다 넓게 차지하는 배율(바깥 호 조각과 눈금이 들어갈 자리) */
const RING_EXTENT = 1.18;

interface LayerMeshes {
  root: Group;
  ring: Mesh<PlaneGeometry, ShaderMaterial>;
  label: Mesh<PlaneGeometry, MeshBasicMaterial>;
  labelText: string;
  emphasis: number;
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
  // 바깥 실선 링과 10도마다 눈금
  a += ring(rho, 1.0, uLine, aa);
  float tick = dashes(turn, 36.0, 0.08, aaTurn) * step(1.0, rho) * (1.0 - smoothstep(1.04, 1.04 + aa, rho));
  a += tick * 0.8;
  // 안쪽 점선 링
  a += ring(rho, 0.93, uLine * 0.7, aa) * dashes(fract(turn + uTime * uSpeed.x), uDashes, 0.5, aaTurn) * 0.8;
  // 바깥 호 조각 두 개
  float t2 = fract(turn + uTime * uSpeed.y);
  float arcs = max(arc(t2, 0.02, 0.2), arc(t2, 0.52, 0.6));
  a += ring(rho, 1.09, uLine * 1.6, aa) * arcs;
  // 더 안쪽 점 링
  a += ring(rho, 0.62, uLine * 0.6, aa) * dashes(fract(turn + uTime * uSpeed.z), 48.0, 0.2, aaTurn) * 0.5;
  // 가운데가 밝은 옅은 바탕
  a += uFill * (1.0 - smoothstep(0.0, 1.0, rho)) * (1.0 - smoothstep(1.0 - aa, 1.0, rho));

  // 호 조각은 조금 더 하얗게 빛난다
  vec3 color = mix(uColor, vec3(1.0), 0.2 * arcs * ring(rho, 1.09, uLine * 1.6, aa));
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
varying float vH;
varying float vAngle;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  vH = position.y / uHeight + 0.5;
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
  float rays = 0.7 + 0.3 * sin(vAngle * 14.0 + uTime * 0.6) * sin(vAngle * 5.0 - uTime * 0.35);
  float a = pow(1.0 - vH, 1.6) * pow(facing, 1.5) * rays;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.25 * (1.0 - vH)), a * uOpacity);
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
  private beam: Mesh<CylinderGeometry, ShaderMaterial> | null = null;
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
      ring.renderOrder = -1;

      // 날짜는 원판 앞쪽 바깥(앞에서 조금 왼쪽)에 눕힌다
      const tex = this.labels.get(layer.label, 'major');
      const label = new Mesh(
        this.labelGeometry,
        new MeshBasicMaterial({ map: tex.texture, transparent: true, opacity: 0, depthWrite: false }),
      );
      const lh = s.labelHeight;
      label.scale.set(lh * tex.aspect, lh, 1);
      label.rotation.x = -Math.PI / 2;
      const at = (Math.PI * 2) / 3;
      label.position.set(Math.cos(at) * r * RING_EXTENT, 0, Math.sin(at) * r * RING_EXTENT + lh);

      root.add(ring, label);
      this.group.add(root);
      this.layers.push({ root, ring, label, labelText: layer.label, emphasis: 0 });
    }

    // 빛기둥: 가장 아래층 밑의 발광부에서 가장 위층 위까지
    const b = s.beam;
    const bottom = Math.min(...layers.map((l) => l.y)) - s.layerGap * b.emitterGap;
    const top = Math.max(...layers.map((l) => l.y)) + s.layerGap * b.topGap;
    const maxR = Math.max(...layers.map((l) => l.radius));
    const height = top - bottom;
    const beamMaterial = new ShaderMaterial({
      uniforms: { uColor: { value: this.color }, uOpacity: { value: 0 }, uTime: this.time, uHeight: { value: height } },
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    this.beam = new Mesh(new CylinderGeometry(maxR * b.spread, b.base, height, 64, 1, true), beamMaterial);
    strataPoint(frame, 0, (top + bottom) / 2, 0, this.beam.position);
    this.beam.renderOrder = -2;

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
    this.group.add(this.beam, this.base);
  }

  /** mix 는 지층 보기로 들어간 정도(0~1), focus 는 바라보는 층 번호다 */
  update(dt: number, mix: number, focus: number): void {
    const s = tuning.strata;
    this.time.value += dt;
    this.group.visible = mix > 0.002 && this.layers.length > 0;
    this.layers.forEach((l, i) => {
      l.emphasis = damp(l.emphasis, i === focus ? 1 : s.otherLayerAlpha, s.transitionRate * 2, dt);
      const a = mix * l.emphasis;
      l.ring.material.uniforms.uOpacity.value = s.ring.alpha * a;
      l.label.material.opacity = a;
      if (this.group.visible) {
        const tex = this.labels.get(l.labelText, 'major');
        if (l.label.material.map !== tex.texture) {
          l.label.material.map = tex.texture;
          l.label.material.needsUpdate = true;
        }
      }
    });
    if (this.beam) this.beam.material.uniforms.uOpacity.value = s.beam.alpha * mix;
    if (this.base) this.base.material.uniforms.uOpacity.value = s.ring.alpha * mix;
    this.glow.material.opacity = mix;
  }

  clear(): void {
    for (const l of this.layers) {
      l.ring.material.dispose();
      l.label.material.dispose();
      this.group.remove(l.root);
    }
    this.layers = [];
    if (this.beam) {
      this.beam.geometry.dispose();
      this.beam.material.dispose();
      this.group.remove(this.beam);
      this.beam = null;
    }
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
