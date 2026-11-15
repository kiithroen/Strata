import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { tuning } from '../../config';
import { damp } from '../../core/motion';
import type { LabelCache } from '../common/labelCache';
import { glowTexture } from '../common/glowTexture';
import { facingQuaternion, hash01, hashString, ringQuaternion, ringRadius } from './cosmosModel';

/** 행성 색 쌍(어두운 바탕, 밝은 띠). 빛 무리와 테두리 빛은 밝은 색을 쓴다 */
const PALETTES: [string, string][] = [
  ['#1d4e89', '#9ad1ff'],
  ['#3c096c', '#e0aaff'],
  ['#7a0b14', '#ffb347'],
  ['#0f3d33', '#8ff0c8'],
  ['#2b2d6e', '#ff8fab'],
  ['#4a2a0a', '#ffd166'],
  ['#0b3b4f', '#7ff6ff'],
  ['#3a0f2e', '#ff6b6b'],
];

/** 행성들이 함께 쓰는 자원과 유니폼 */
export interface PlanetShared {
  sphere: SphereGeometry;
  /** 반지름 1 원(XZ 평면). 궤도 고리 선이 함께 쓴다 */
  circle: BufferGeometry;
  labelGeometry: PlaneGeometry;
  labels: LabelCache;
  uniforms: {
    uTime: { value: number };
    uFogColor: { value: Color };
    uFogNear: { value: number };
    uFogFar: { value: number };
    uAccent: { value: Color };
  };
}

export function createPlanetShared(labels: LabelCache): PlanetShared {
  const look = tuning.look;
  const c = tuning.cosmos;
  const points: number[] = [];
  const segments = 96;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push(Math.cos(a), 0, Math.sin(a));
  }
  const circle = new BufferGeometry();
  circle.setAttribute('position', new Float32BufferAttribute(points, 3));
  return {
    sphere: new SphereGeometry(1, 48, 24),
    circle,
    labelGeometry: new PlaneGeometry(1, 1),
    labels,
    uniforms: {
      uTime: { value: 0 },
      uFogColor: { value: new Color(look.background) },
      uFogNear: { value: c.fogNear },
      uFogFar: { value: c.fogFar },
      uAccent: { value: new Color(look.accent) },
    },
  };
}

const vertexShader = /* glsl */ `
varying vec3 vNormalV;
varying vec3 vLocal;
varying vec3 vViewPos;
void main() {
  vLocal = position;
  vNormalV = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uAccent;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uSeed;
uniform float uTime;
uniform float uFade;
uniform float uHighlight;
varying vec3 vNormalV;
varying vec3 vLocal;
varying vec3 vViewPos;

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 n = normalize(vNormalV);
  vec3 v = normalize(-vViewPos);

  // 천천히 자전한다
  float rot = uTime * 0.06 + uSeed;
  float c = cos(rot);
  float s = sin(rot);
  vec3 p = vec3(c * vLocal.x + s * vLocal.z, vLocal.y, -s * vLocal.x + c * vLocal.z);

  float warp = fbm(p * 2.4 + uSeed);
  float bands = sin(p.y * 9.0 + warp * 5.0);
  vec3 base = mix(uColorA, uColorB, smoothstep(-0.85, 0.85, bands));
  base *= 0.7 + 0.55 * fbm(p * 6.0 + uSeed * 1.7);

  vec3 L = normalize(vec3(-0.45, 0.55, 0.7));
  float diff = max(dot(n, L), 0.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.4);
  vec3 color = base * (0.1 + 0.95 * diff) + uColorB * rim * 0.85 + uAccent * rim * 1.5 * uHighlight;

  float fog = smoothstep(uFogNear, uFogFar, -vViewPos.z);
  gl_FragColor = vec4(mix(color, uFogColor, fog), uFade);
  #include <colorspace_fragment>
}
`;

/** 시간 묶음 하나를 나타내는 행성: 셰이더 구체, 빛 무리, 아래쪽 날짜·위성 수 글자 */
export class PlanetView {
  readonly group = new Group();
  /** 탭 판정용 구체. 장면에 넣지 않고 행성보다 크게 잡는다 */
  readonly hit: Mesh<SphereGeometry, MeshBasicMaterial>;
  fade = 0;
  fadeTarget = 1;
  radius = 0;
  readonly position = new Vector3();

  /** 보이는 구체. 위성 카드가 행성 뒤에 가려졌는지 판정할 때도 쓴다 */
  readonly body: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly glow: Sprite;
  private readonly label: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private labelText = '';
  private labelAspect = 1;
  private readonly rings: LineLoop<BufferGeometry, LineBasicMaterial>[] = [];
  private readonly ringColor: Color;

  constructor(
    readonly key: string,
    private readonly shared: PlanetShared,
  ) {
    const h = hashString(key);
    const [a, b] = PALETTES[Math.floor(hash01(h, 3) * PALETTES.length)];
    const colorB = new Color(b);
    this.ringColor = colorB;
    this.body = new Mesh(
      shared.sphere,
      new ShaderMaterial({
        uniforms: {
          ...shared.uniforms,
          uColorA: { value: new Color(a) },
          uColorB: { value: colorB },
          uSeed: { value: hash01(h, 4) * 50 },
          uFade: { value: 0 },
          uHighlight: { value: 0 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
      }),
    );
    this.glow = new Sprite(
      new SpriteMaterial({
        map: glowTexture(),
        color: colorB,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    this.label = new Mesh(shared.labelGeometry, new MeshBasicMaterial({ transparent: true, depthWrite: false, fog: true }));
    this.group.add(this.glow, this.body, this.label);
    this.hit = new Mesh(shared.sphere, new MeshBasicMaterial());
    this.hit.userData.planet = this;
  }

  setLabel(text: string): void {
    if (text === this.labelText) return;
    this.labelText = text;
    const l = this.shared.labels.get(text, 'major');
    this.label.material.map = l.texture;
    this.label.material.needsUpdate = true;
    this.labelAspect = l.aspect;
  }

  /**
   * depthFade 는 깊이에 따른 불투명도로, 행성 자체의 나타나고 사라짐(fade)과 곱한다.
   * ringCount 개의 궤도 고리 선을 위성 궤도와 같은 평면에 긋는다
   */
  update(dt: number, position: Vector3, radius: number, depthFade: number, cameraPosition: Vector3, ringCount: number): void {
    const c = tuning.cosmos;
    this.fade = damp(this.fade, this.fadeTarget, c.planetFadeRate, dt);
    this.position.copy(position);
    this.radius = radius;
    const opacity = this.fade * depthFade;

    this.body.position.copy(position);
    this.body.scale.setScalar(radius);
    this.body.material.uniforms.uFade.value = opacity;
    this.body.visible = opacity > 0.002;

    this.glow.position.copy(position);
    this.glow.scale.setScalar(radius * c.glowScale);
    this.glow.material.opacity = opacity * 0.6;
    this.glow.visible = this.body.visible;

    const lh = c.planetLabelHeight;
    this.label.scale.set(lh * this.labelAspect, lh, 1);
    this.label.position.set(position.x, position.y - radius - lh * 1.1, position.z);
    facingQuaternion(this.label.position, cameraPosition, this.label.quaternion);
    this.label.material.opacity = opacity;
    this.label.visible = this.body.visible;

    for (let k = 0; k < Math.max(ringCount, this.rings.length); k++) {
      let ring = this.rings[k];
      if (!ring) {
        ring = new LineLoop(
          this.shared.circle,
          new LineBasicMaterial({ color: this.ringColor, transparent: true, depthWrite: false, fog: true }),
        );
        this.rings.push(ring);
        this.group.add(ring);
      }
      ring.visible = k < ringCount && this.body.visible;
      if (!ring.visible) continue;
      ring.position.copy(position);
      ringQuaternion(this.key, k, ring.quaternion);
      ring.scale.setScalar(ringRadius(radius, k));
      ring.material.opacity = opacity * tuning.cosmos.ringOpacity;
    }

    this.hit.position.copy(position);
    this.hit.scale.setScalar(Math.max(radius * 2.2, radius + 0.25));
    this.hit.updateMatrixWorld();
  }

  /** 충분히 보이는 행성만 탭을 받는다 */
  get tappable(): boolean {
    return this.body.material.uniforms.uFade.value > 0.3;
  }

  dispose(): void {
    this.body.material.dispose();
    this.glow.material.dispose();
    this.label.material.dispose();
    this.hit.material.dispose();
    for (const ring of this.rings) ring.material.dispose();
  }
}
