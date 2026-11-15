import { Color, DoubleSide, ShaderMaterial, Texture, Vector2 } from 'three';
import { tuning } from '../../config';

/** 모든 카드가 함께 쓰는 유니폼. 같은 객체를 각 재질에 넘겨 한 번만 갱신한다. */
export interface CardLook {
  uTime: { value: number };
  uScanDensity: { value: number };
  uScanSpeed: { value: number };
  uScanStrength: { value: number };
  uNoiseStrength: { value: number };
  uNoiseFps: { value: number };
  uEdgeWidth: { value: number };
  uDimFloor: { value: number };
  uAccent: { value: Color };
  uFogColor: { value: Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  /** 0이면 조명 없이 텍스처 그대로, 1이면 종이가 돌고 휠 때 빛을 받아 밝기가 바뀐다 */
  uShade: { value: number };
  /** 0이면 평평한 카드, 1이면 바람에 휘고 출렁이는 종이 */
  uBend: { value: number };
  uWaveFreq: { value: Vector2 };
  uWaveAmp: { value: Vector2 };
  uWaveSpeed: { value: Vector2 };
  uCurl: { value: number };
  uCurlSpeed: { value: number };
  uPaperBack: { value: Color };
}

export function createCardLook(): CardLook {
  const l = tuning.look;
  const b = tuning.card.bend;
  return {
    uTime: { value: 0 },
    uScanDensity: { value: l.scanlineDensity },
    uScanSpeed: { value: l.scanlineSpeed },
    uScanStrength: { value: l.scanlineStrength },
    uNoiseStrength: { value: l.noiseStrength },
    uNoiseFps: { value: l.noiseFps },
    uEdgeWidth: { value: l.focusEdgeWidth },
    uDimFloor: { value: l.dimFloor },
    uAccent: { value: new Color(l.accent) },
    uFogColor: { value: new Color(l.background) },
    uFogNear: { value: l.fogNear },
    uFogFar: { value: l.fogFar },
    uShade: { value: 0 },
    uBend: { value: 0 },
    uWaveFreq: { value: new Vector2(...b.waveFreq) },
    uWaveAmp: { value: new Vector2(...b.waveAmp) },
    uWaveSpeed: { value: new Vector2(...b.waveSpeed) },
    uCurl: { value: b.curl },
    uCurlSpeed: { value: b.curlSpeed },
    uPaperBack: { value: new Color(tuning.card.paperBack) },
  };
}

/**
 * 종이 휨: 카드 좌표(-0.5~0.5)의 가로·세로 물결과 가로 말림을 더한 높이 f(x, y)를 앞뒤로 민다.
 * 법선은 f 의 편미분으로 구해 휜 면을 따라 빛이 바뀌게 한다. 펼치는 동안(uFocus)에는 평평해진다.
 */
const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uBend;
uniform float uBendPhase;
uniform float uFocus;
uniform vec2 uCardSize;
uniform vec2 uWaveFreq;
uniform vec2 uWaveAmp;
uniform vec2 uWaveSpeed;
uniform float uCurl;
uniform float uCurlSpeed;
varying vec2 vUv;
varying float vDepth;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  vUv = uv;
  vec3 p = position;
  float x = p.x / uCardSize.x;
  float y = p.y / uCardSize.y;
  float amt = uBend * (1.0 - uFocus);
  float ax = uWaveFreq.x * x + uWaveSpeed.x * uTime + uBendPhase;
  float ay = uWaveFreq.y * y + uWaveSpeed.y * uTime + uBendPhase * 1.7;
  float cs = sin(uCurlSpeed * uTime + uBendPhase * 0.6);
  float f = uWaveAmp.x * sin(ax) + uWaveAmp.y * sin(ay) + uCurl * x * x * cs;
  float fx = uWaveAmp.x * uWaveFreq.x * cos(ax) + 2.0 * uCurl * x * cs;
  float fy = uWaveAmp.y * uWaveFreq.y * cos(ay);
  p.z += f * uCardSize.x * amt;
  vec3 nLocal = normalize(vec3(-fx * amt, -fy * amt * uCardSize.x / uCardSize.y, 1.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  vViewPos = mv.xyz;
  vNormalV = normalize(normalMatrix * nLocal);
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform float uTime;
uniform float uScanDensity;
uniform float uScanSpeed;
uniform float uScanStrength;
uniform float uNoiseStrength;
uniform float uNoiseFps;
uniform float uEdgeWidth;
uniform float uDimFloor;
uniform vec3 uAccent;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uPaperBack;
uniform float uAspect;
uniform float uDim;
uniform float uFocus;
uniform float uFade;
uniform float uShade;
varying vec2 vUv;
varying float vDepth;
varying vec3 vNormalV;
varying vec3 vViewPos;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec4 color = texture2D(map, vUv);

  // 뒷면은 인쇄 없는 종이다. 종이결 정도만 보인다
  if (!gl_FrontFacing) {
    float grain = hash12(floor(vUv * vec2(160.0 * uAspect, 160.0)));
    color = vec4(uPaperBack * (0.96 + 0.06 * grain), 1.0);
  }

  // 돌고 휠 때 빛을 받는다: 보는 쪽을 향한 법선으로 밝기를 낸다. 종이라 반짝임은 약하다
  vec3 nrm = normalize(vNormalV) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 v = normalize(-vViewPos);
  vec3 L = normalize(vec3(-0.4, 0.6, 0.7));
  float lambert = 0.3 + 0.7 * max(dot(nrm, L), 0.0);
  float sheen = pow(max(dot(reflect(-L, nrm), v), 0.0), 10.0) * 0.18;
  float shade = uShade * (1.0 - uFocus);
  color.rgb = color.rgb * mix(1.0, lambert, shade) + sheen * shade;

  // 주사선: 펼칠수록 옅어진다
  float scan = 0.5 + 0.5 * sin((vUv.y * uScanDensity - uTime * uScanSpeed) * 6.28318530718);
  color.rgb *= 1.0 - uScanStrength * scan * (1.0 - 0.7 * uFocus);

  // 펼친 카드의 테두리 빛. 가로 거리를 높이 단위로 맞춰 네 변의 두께를 같게 한다
  vec2 edgeDist = min(vUv, 1.0 - vUv);
  edgeDist.x *= uAspect;
  float edge = 1.0 - smoothstep(0.0, uEdgeWidth, min(edgeDist.x, edgeDist.y));
  color.rgb = mix(color.rgb, uAccent, edge * uFocus);
  color.a = max(color.a, edge * uFocus);

  color.rgb *= mix(1.0, uDimFloor, uDim);

  float fog = smoothstep(uFogNear, uFogFar, vDepth);
  color.rgb = mix(color.rgb, uFogColor, fog);
  color.a *= (1.0 - fog * 0.6) * uFade;

  gl_FragColor = color;
  #include <colorspace_fragment>

  // 화면 고정 잡음. 출력 색공간으로 바꾼 뒤에 더해야 어두운 곳에서 튀지 않는다
  float noise = hash12(gl_FragCoord.xy + floor(uTime * uNoiseFps) * 17.0);
  gl_FragColor.rgb += (noise - 0.5) * uNoiseStrength * (1.0 - 0.6 * uFocus);
}
`;

export interface CardMaterialOptions {
  map: Texture;
  look: CardLook;
  width: number;
  height: number;
  /** 종이마다 다르게 출렁이도록 휨 위상을 어긋낸다 */
  bendPhase: number;
}

export function createCardMaterial(o: CardMaterialOptions): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...o.look,
      map: { value: o.map },
      uAspect: { value: o.width / o.height },
      uCardSize: { value: new Vector2(o.width, o.height) },
      uBendPhase: { value: o.bendPhase },
      uDim: { value: 0 },
      uFocus: { value: 0 },
      uFade: { value: 1 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    side: DoubleSide,
  });
}
