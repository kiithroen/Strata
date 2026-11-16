import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CubeCamera,
  Group,
  LinearFilter,
  Mesh,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  type Vector3,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from 'three';
import { tuning } from '../../config';
import { createRng } from '../../core/random';

/**
 * 우주 배경: 사방 360°를 감싸는 별, 성운, 구면 나선팔을 따라 흐르는 먼지.
 * 먼지는 행성과 같은 3D 구면 나선 위에 놓이고, 시간을 옮긴 만큼 흘러가 비행하는 느낌을 준다.
 * 성운은 cosmos.nebula 설정에 따라 끄거나, 매 프레임 계산하거나, 작은 큐브맵에 구워 둔다.
 */
export class Universe {
  readonly group = new Group();
  private readonly dust: Points<BufferGeometry, ShaderMaterial>;
  private readonly stars: Points<BufferGeometry, ShaderMaterial>;
  /** 화면에 보이는 성운 구. 구울 때는 큐브맵을 읽는 구다 */
  private readonly nebula: Mesh<SphereGeometry, ShaderMaterial> | null;
  private readonly bake: NebulaBake | null;
  private dustOffset = 0;

  constructor(private readonly renderer: WebGLRenderer) {
    const pixelRatio = renderer.getPixelRatio();
    const n = tuning.cosmos.nebula;
    this.bake = n.visible && n.bakeSize > 0 ? new NebulaBake(n.bakeSize) : null;
    this.nebula = !n.visible ? null : this.bake ? this.bake.display : createNebula();
    this.stars = createStars(pixelRatio);
    this.dust = createDust(pixelRatio);
    if (this.nebula) this.group.add(this.nebula);
    this.group.add(this.stars, this.dust);
  }

  /** scrollDepth 는 이번 프레임에 시점이 옮겨간 시간 거리(과거로 가면 음수, 최근으로 가면 양수) */
  update(time: number, scrollDepth: number, cameraPosition?: Vector3): void {
    const c = tuning.cosmos;
    const range = c.dust.maxArc;
    this.dustOffset += scrollDepth * c.spiralKnee;
    this.dustOffset = ((this.dustOffset % range) + range) % range;
    this.dust.material.uniforms.uOffset.value = this.dustOffset;
    this.dust.material.uniforms.uTime.value = time;
    this.stars.material.uniforms.uTime.value = time;
    if (this.bake) this.bake.update(this.renderer, time);
    else if (this.nebula) this.nebula.material.uniforms.uTime.value = time;
    if (cameraPosition) {
      this.stars.position.copy(cameraPosition);
      this.nebula?.position.copy(cameraPosition);
    }
  }

  setPixelRatio(pixelRatio: number): void {
    this.dust.material.uniforms.uPixelRatio.value = pixelRatio;
    this.stars.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  dispose(): void {
    for (const o of [this.dust, this.stars, this.nebula]) {
      if (!o) continue;
      o.geometry.dispose();
      o.material.dispose();
    }
    this.bake?.dispose();
  }
}

/**
 * 성운을 원점에 둔 큐브 카메라로 작은 큐브맵에 구워 두고, 화면에는 그 큐브맵을 읽는 구를 그린다.
 * 성운은 천천히 흐르기만 해서 refreshSeconds 마다 다시 구워도 차이가 드러나지 않는다.
 */
class NebulaBake {
  readonly display: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly source = createNebula();
  private readonly scene = new Scene();
  private readonly target: WebGLCubeRenderTarget;
  private readonly camera: CubeCamera;
  private bakedAt = -Infinity;

  constructor(size: number) {
    const r = tuning.cosmos.stars.radius + 2;
    // sRGB 로 저장해야 어두운 그러데이션이 8비트에서 띠지지 않는다
    this.target = new WebGLCubeRenderTarget(size, { generateMipmaps: false, minFilter: LinearFilter, colorSpace: SRGBColorSpace });
    this.camera = new CubeCamera(1, r * 2, this.target);
    this.scene.add(this.source);
    const material = new ShaderMaterial({
      uniforms: { uMap: { value: this.target.texture } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform samplerCube uMap;
        varying vec3 vDir;
        void main() {
          gl_FragColor = vec4(textureCube(uMap, vDir).rgb, 1.0);
          #include <colorspace_fragment>
        }
      `,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    this.display = new Mesh(new SphereGeometry(r, 32, 16), material);
    this.display.renderOrder = -3;
  }

  update(renderer: WebGLRenderer, time: number): void {
    if (Math.abs(time - this.bakedAt) < tuning.cosmos.nebula.refreshSeconds) return;
    this.bakedAt = time;
    this.source.material.uniforms.uTime.value = time;
    this.camera.update(renderer, this.scene);
  }

  dispose(): void {
    this.source.geometry.dispose();
    this.source.material.dispose();
    this.target.dispose();
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
  const elev = new Float32Array(n);
  const size = new Float32Array(n);
  const tint = new Float32Array(n);
  const gauss = () => (rng() + rng() + rng() - 1.5) / 1.5;
  for (let i = 0; i < n; i++) {
    base[i] = rng();
    arm[i] = i % 2 === 0 ? 1 : -1;
    const halo = rng() < d.halo;
    // 구면 나선팔 먼지는 팔 둘레에 모이고, 일부는 구 전체에 흩어진다
    rad[i] = halo
      ? d.haloRadius[0] + rng() * (d.haloRadius[1] - d.haloRadius[0])
      : Math.max(d.armRadiusFloor, 1 + gauss() * d.spread);
    ang[i] = halo ? (rng() * 2 - 1) * Math.PI : gauss() * d.angleSpread;
    elev[i] = halo ? (rng() * 2 - 1) * d.haloElevation : gauss() * d.angleSpread;
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
  geometry.setAttribute('aElev', new BufferAttribute(elev, 1));
  geometry.setAttribute('aSize', new BufferAttribute(size, 1));
  geometry.setAttribute('aTint', new BufferAttribute(tint, 1));

  const material = new ShaderMaterial({
    uniforms: {
      uOffset: { value: 0 },
      uTime: { value: 0 },
      uRadialScale: { value: c.radialScale },
      uMaxArc: { value: d.maxArc },
      uTwist: { value: c.twist },
      uElevAmp: { value: c.elevationAmp },
      uElevFreq: { value: c.elevationFreq },
      uMaxElev: { value: c.maxElevation },
      uCoreRadius: { value: d.coreRadius },
      uSpin: { value: c.spin },
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
      attribute float aElev;
      attribute float aSize;
      attribute float aTint;
      uniform float uOffset;
      uniform float uTime;
      uniform float uRadialScale;
      uniform float uMaxArc;
      uniform float uTwist;
      uniform float uElevAmp;
      uniform float uElevFreq;
      uniform float uMaxElev;
      uniform float uCoreRadius;
      uniform float uSpin;
      uniform float uPixelRatio;
      uniform float uSize;
      varying float vFade;
      varying float vTint;
      void main() {
        float t = fract(aBase + (aArm * uOffset) / uMaxArc);
        float arc = aArm * t * uMaxArc;
        float r = max(uCoreRadius, uRadialScale * abs(arc) * aRad);
        float alpha = uTwist * arc + uSpin * uTime + aAng;
        float phi = clamp(uElevAmp * sin(uElevFreq * arc) + aElev, -uMaxElev, uMaxElev);
        float cosPhi = cos(phi);
        vec3 pos = vec3(r * cosPhi * sin(alpha), r * sin(phi), -r * cosPhi * cos(alpha));
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = max(-mv.z, 0.25);
        gl_PointSize = min(aSize * uSize * uPixelRatio * (6.0 / dist), 8.0 * uPixelRatio);
        vFade = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.78, 1.0, t));
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
        gl_FragColor = vec4(col * 0.45, 1.0);
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
