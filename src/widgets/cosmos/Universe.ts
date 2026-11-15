import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import { tuning } from '../../config';
import { createRng } from '../../core/random';
import { glowTexture } from '../common/glowTexture';

/**
 * 우주 배경: 먼 별, 성운, 나선팔을 따라 흐르는 먼지, 은하 중심의 빛.
 * 먼지는 나선팔과 같은 식으로 놓이고, 시간을 옮긴 만큼(깊이로 환산) 흘러가 비행하는 느낌을 준다.
 */
export class Universe {
  readonly group = new Group();
  private readonly dust: Points<BufferGeometry, ShaderMaterial>;
  private readonly stars: Points<BufferGeometry, ShaderMaterial>;
  private readonly nebula: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly core: Sprite;
  private dustOffset = 0;

  constructor(pixelRatio: number) {
    this.nebula = createNebula();
    this.stars = createStars(pixelRatio);
    this.dust = createDust(pixelRatio);
    this.core = new Sprite(
      new SpriteMaterial({
        map: glowTexture(),
        color: new Color('#ffcf9a'),
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        fog: false,
        opacity: 0.55,
      }),
    );
    const c = tuning.cosmos;
    this.core.position.set(0, 0, -c.fogFar);
    this.core.scale.setScalar(c.coreSize);
    this.group.add(this.nebula, this.stars, this.core, this.dust);
  }

  /** scrollDepth 는 이번 프레임에 시간축이 움직인 깊이(최근 쪽으로 가면 양수) */
  update(time: number, scrollDepth: number): void {
    this.dustOffset += scrollDepth;
    const range = tuning.cosmos.farDepth - tuning.cosmos.nearDepth;
    this.dustOffset = ((this.dustOffset % range) + range) % range;
    this.dust.material.uniforms.uOffset.value = this.dustOffset;
    this.dust.material.uniforms.uTime.value = time;
    this.stars.material.uniforms.uTime.value = time;
    this.nebula.material.uniforms.uTime.value = time;
  }

  setPixelRatio(pixelRatio: number): void {
    this.dust.material.uniforms.uPixelRatio.value = pixelRatio;
    this.stars.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  dispose(): void {
    for (const o of [this.dust, this.stars, this.nebula]) {
      o.geometry.dispose();
      o.material.dispose();
    }
    this.core.material.dispose();
  }
}

function createDust(pixelRatio: number): Points<BufferGeometry, ShaderMaterial> {
  const c = tuning.cosmos;
  const d = c.dust;
  const rng = createRng(4242);
  const n = d.count;
  const base = new Float32Array(n);
  const arm = new Float32Array(n);
  const rad = new Float32Array(n);
  const ang = new Float32Array(n);
  const size = new Float32Array(n);
  const tint = new Float32Array(n);
  const gauss = () => (rng() + rng() + rng() - 1.5) / 1.5;
  for (let i = 0; i < n; i++) {
    base[i] = rng();
    arm[i] = Math.floor(rng() * d.arms);
    const halo = rng() < d.halo;
    // 나선팔 먼지는 팔 둘레에 모이고, 일부는 은하 원반 전체에 흩어진다
    rad[i] = halo ? 0.15 + rng() * 2.2 : Math.max(0.05, 1 + gauss() * d.spread);
    ang[i] = halo ? rng() * Math.PI * 2 : gauss() * d.angleSpread;
    size[i] = 0.4 + Math.pow(rng(), 3) * 1.6;
    tint[i] = rng();
  }
  const geometry = new BufferGeometry();
  // 위치는 셰이더가 계산한다. position 은 그리기 범위용 자리 표시다
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
  geometry.setAttribute('aBase', new BufferAttribute(base, 1));
  geometry.setAttribute('aArm', new BufferAttribute(arm, 1));
  geometry.setAttribute('aRad', new BufferAttribute(rad, 1));
  geometry.setAttribute('aAng', new BufferAttribute(ang, 1));
  geometry.setAttribute('aSize', new BufferAttribute(size, 1));
  geometry.setAttribute('aTint', new BufferAttribute(tint, 1));

  const material = new ShaderMaterial({
    uniforms: {
      uOffset: { value: 0 },
      uTime: { value: 0 },
      uNear: { value: c.nearDepth },
      uFar: { value: c.farDepth },
      uFocusDepth: { value: tuning.axis.focusDepth },
      uFocusAngle: { value: c.focusAngle },
      uTwist: { value: c.twist },
      uSpin: { value: c.spin },
      uArmRadius: { value: c.armRadius },
      uArms: { value: d.arms },
      uFogNear: { value: c.fogNear },
      uPixelRatio: { value: pixelRatio },
      uSize: { value: d.size },
      uOpacity: { value: d.opacity },
      uColorA: { value: new Color('#9fb8ff') },
      uColorB: { value: new Color('#ff9fc4') },
    },
    vertexShader: /* glsl */ `
      attribute float aBase;
      attribute float aArm;
      attribute float aRad;
      attribute float aAng;
      attribute float aSize;
      attribute float aTint;
      uniform float uOffset;
      uniform float uTime;
      uniform float uNear;
      uniform float uFar;
      uniform float uFocusDepth;
      uniform float uFocusAngle;
      uniform float uTwist;
      uniform float uSpin;
      uniform float uArmRadius;
      uniform float uArms;
      uniform float uFogNear;
      uniform float uPixelRatio;
      uniform float uSize;
      varying float vFade;
      varying float vTint;
      void main() {
        float range = uFar - uNear;
        float depth = uNear + mod(aBase * range + uOffset, range);
        float theta = uFocusAngle + uTwist * (depth - uFocusDepth) + uSpin * uTime + aArm * 6.2831853 / uArms + aAng;
        float r = uArmRadius * aRad;
        vec4 mv = modelViewMatrix * vec4(r * cos(theta), r * sin(theta), -depth, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(aSize * uSize * uPixelRatio * (6.0 / depth), 7.0 * uPixelRatio);
        vFade = smoothstep(uNear, uNear + 2.5, depth) * (1.0 - smoothstep(uFar - 6.0, uFar, depth));
        vTint = aTint;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying float vFade;
      varying float vTint;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vFade * uOpacity;
        gl_FragColor = vec4(mix(uColorA, uColorB, vTint), a);
        #include <colorspace_fragment>
      }
    `,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function createStars(pixelRatio: number): Points<BufferGeometry, ShaderMaterial> {
  const s = tuning.cosmos.stars;
  const rng = createRng(777);
  const n = s.count;
  const position = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  const tint = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = rng() * 2 - 1;
    const t = rng() * Math.PI * 2;
    const k = Math.sqrt(1 - u * u);
    position[i * 3] = s.radius * k * Math.cos(t);
    position[i * 3 + 1] = s.radius * k * Math.sin(t);
    position[i * 3 + 2] = s.radius * u;
    size[i] = 0.5 + Math.pow(rng(), 4) * 2.5;
    phase[i] = rng() * Math.PI * 2;
    tint[i] = rng();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('aSize', new BufferAttribute(size, 1));
  geometry.setAttribute('aPhase', new BufferAttribute(phase, 1));
  geometry.setAttribute('aTint', new BufferAttribute(tint, 1));
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uSize: { value: s.size },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      attribute float aTint;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uSize;
      varying float vAlpha;
      varying float vTint;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uSize * uPixelRatio;
        vAlpha = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase * 0.25) + aPhase * 7.0);
        vTint = aTint;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying float vTint;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vAlpha;
        vec3 cool = vec3(0.75, 0.85, 1.0);
        vec3 warm = vec3(1.0, 0.85, 0.7);
        vec3 c = mix(cool, warm, step(0.7, vTint));
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }
    `,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -2;
  return points;
}

function createNebula(): Mesh<SphereGeometry, ShaderMaterial> {
  const r = tuning.cosmos.stars.radius + 2;
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new Color('#3a1460') },
      uColorB: { value: new Color('#0e4a5a') },
      uColorC: { value: new Color('#5a0f22') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uColorC;
      varying vec3 vDir;
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
          p *= 2.1;
          a *= 0.5;
        }
        return s;
      }
      void main() {
        vec3 p = vDir * 2.2 + vec3(0.0, 0.0, uTime * 0.004);
        float a = smoothstep(0.45, 0.85, fbm(p));
        float b = smoothstep(0.5, 0.9, fbm(p * 1.7 + 11.0));
        float c = smoothstep(0.55, 0.95, fbm(p * 1.3 + 23.0));
        vec3 col = uColorA * a + uColorB * b * 0.8 + uColorC * c * 0.7;
        // 정면 안쪽(은하 중심 쪽)을 조금 더 밝힌다
        col *= 0.55 + 0.45 * smoothstep(0.2, 1.0, -vDir.z);
        gl_FragColor = vec4(col * 0.55, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new Mesh(new SphereGeometry(r, 48, 24), material);
  mesh.renderOrder = -3;
  return mesh;
}
