import { Color, DoubleSide, ShaderMaterial, type Texture, Vector2 } from 'three';
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
  uFogColor: { value: Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  /** 0이면 각도와 상관없이 같은 밝기, 1이면 비스듬히 볼수록 홀로그램 가장자리가 밝아진다(card.lod.glint 배) */
  uShade: { value: number };
  /** 0이면 평평한 카드, 1이면 바람에 휘고 출렁이는 종이 */
  uBend: { value: number };
  uWaveFreq: { value: Vector2 };
  uWaveAmp: { value: Vector2 };
  uWaveSpeed: { value: Vector2 };
  uCurl: { value: number };
  uCurlSpeed: { value: number };
  /** 홀로그램 선 색의 기본값. 재질마다 노트 종류 색(CardMaterialOptions.tint)으로 바꿔 쓴다 */
  uHoloTint: { value: Color };
  uDetailRange: { value: Vector2 };
  uColorRange: { value: Vector2 };
  uFarAlpha: { value: number };
  uFocusAlpha: { value: number };
  uGlint: { value: number };
  uFlicker: { value: Vector2 };
  uFlickerDepth: { value: number };
  uSweep: { value: Vector2 };
}

export function createCardLook(): CardLook {
  const l = tuning.look;
  const b = tuning.card.bend;
  const lod = tuning.card.lod;
  const f = tuning.card.flicker;
  return {
    uTime: { value: 0 },
    uScanDensity: { value: l.scanlineDensity },
    uScanSpeed: { value: l.scanlineSpeed },
    uScanStrength: { value: l.scanlineStrength },
    uNoiseStrength: { value: l.noiseStrength },
    uNoiseFps: { value: l.noiseFps },
    uEdgeWidth: { value: l.focusEdgeWidth },
    uDimFloor: { value: l.dimFloor },
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
    uHoloTint: { value: new Color(l.accent) },
    uDetailRange: { value: new Vector2(...lod.detail) },
    uColorRange: { value: new Vector2(...lod.color) },
    uFarAlpha: { value: lod.farAlpha },
    uFocusAlpha: { value: lod.focusAlpha },
    uGlint: { value: lod.glint },
    uFlicker: { value: new Vector2(f.rate, f.chance) },
    uFlickerDepth: { value: f.depth },
    uSweep: { value: new Vector2(f.sweepSpeed, f.sweepStrength) },
  };
}

/**
 * 종이 휨: 카드 좌표(-0.5~0.5)의 가로·세로 물결과 가로 말림을 더한 높이 f(x, y)를 앞뒤로 민다.
 * 법선은 f 의 편미분으로 구해 휜 면을 따라 빛이 바뀌게 한다. 펼치는 동안(uFocus)에는 평평해진다.
 * 카드 높이가 화면 높이에서 차지하는 비율로 단순한 모양 ↔ 제대로 된 모양(vDetail), 흑백 ↔ 제 색(vColor)을 정한다.
 * 카드 중심 하나로 재서 한 장 안에서는 같다.
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
uniform vec2 uDetailRange;
uniform vec2 uColorRange;
varying vec2 vUv;
varying float vDepth;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying float vDetail;
varying float vColor;
void main() {
  vUv = uv;
  vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float scaleY = length(modelViewMatrix[1].xyz);
  float screen = uCardSize.y * scaleY * projectionMatrix[1][1] * 0.5 / max(-center.z, 1e-3);
  vDetail = max(smoothstep(uDetailRange.x, uDetailRange.y, screen), uFocus);
  vColor = max(smoothstep(uColorRange.x, uColorRange.y, screen), uFocus);
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
uniform sampler2D mapSimple;
uniform float uTime;
uniform float uScanDensity;
uniform float uScanSpeed;
uniform float uScanStrength;
uniform float uNoiseStrength;
uniform float uNoiseFps;
uniform float uEdgeWidth;
uniform float uDimFloor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uHoloTint;
uniform float uFarAlpha;
uniform float uFocusAlpha;
uniform float uGlint;
uniform vec2 uFlicker;
uniform float uFlickerDepth;
uniform vec2 uSweep;
uniform float uBendPhase;
uniform float uAspect;
uniform float uDim;
uniform float uFocus;
uniform float uFade;
uniform float uShade;
varying vec2 vUv;
varying float vDepth;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying float vDetail;
varying float vColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  // 양면 홀로그램: 뒤에서 봐도 글자가 바로 읽히게 가로를 뒤집는다
  vec2 uv = vec2(gl_FrontFacing ? vUv.x : 1.0 - vUv.x, vUv.y);
  vec4 color = mix(texture2D(mapSimple, uv), texture2D(map, uv), vDetail);
  // 겉모양 밖(메모의 깎은 모서리, 문서 탭 옆)은 비어 있다. 아래 효과들도 그 자리는 건드리지 않는다
  float body = smoothstep(0.0, 0.25, color.a);

  // 멀면 흑백으로 물들고 가까울수록 제 색이 돌아온다
  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(uHoloTint * gray, color.rgb, vColor);
  color.a *= mix(uFarAlpha, 1.0, vDetail);
  // 펼친 카드는 바탕을 거의 불투명하게 해 뒤 카드가 글을 가리지 않게 한다
  color.a = mix(color.a, max(color.a, uFocusAlpha * body), uFocus);

  float live = 1.0 - uFocus;
  // 비스듬히 볼수록 가장자리가 밝아진다
  vec3 nrm = normalize(vNormalV);
  float facing = abs(dot(nrm, normalize(-vViewPos)));
  float glint = pow(1.0 - facing, 3.0) * uGlint * uShade * live;
  color.rgb += uHoloTint * glint;
  color.a = min(1.0, color.a + glint * 0.5 * body);

  // 위에서 아래로 훑는 밝은 띠
  float sweep = fract(vUv.y + uTime * uSweep.x + uBendPhase);
  color.rgb += uHoloTint * smoothstep(0.03, 0.0, abs(sweep - 0.5)) * uSweep.y * live;

  // 주사선: 펼칠수록 옅어진다
  float scan = 0.5 + 0.5 * sin((vUv.y * uScanDensity - uTime * uScanSpeed) * 6.28318530718);
  color.rgb *= 1.0 - uScanStrength * scan * (1.0 - 0.7 * uFocus);

  // 가끔 전원이 흔들리듯 깜빡인다. 카드마다 때가 다르다
  float tick = floor(uTime * uFlicker.x);
  float flick = step(1.0 - uFlicker.y, hash12(vec2(tick, uBendPhase * 97.0)));
  color.a *= 1.0 - flick * (1.0 - uFlickerDepth) * live;

  // 펼친 카드의 테두리 빛. 가로 거리를 높이 단위로 맞춰 네 변의 두께를 같게 한다
  vec2 edgeDist = min(vUv, 1.0 - vUv);
  edgeDist.x *= uAspect;
  float edge = (1.0 - smoothstep(0.0, uEdgeWidth, min(edgeDist.x, edgeDist.y))) * body;
  color.rgb = mix(color.rgb, uHoloTint, edge * uFocus);
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
  /** 멀리서 쓰는 단순한 텍스처 */
  mapSimple: Texture;
  look: CardLook;
  width: number;
  height: number;
  /** 종이마다 다르게 출렁이도록 휨 위상을 어긋낸다. 깜빡임·훑는 띠의 때도 어긋낸다 */
  bendPhase: number;
  /** 홀로그램 선 색(노트 종류 색). 멀리서 흑백으로 바꿀 때, 테두리 빛·반짝임·훑는 띠도 이 색이다 */
  tint: string;
}

export function createCardMaterial(o: CardMaterialOptions): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...o.look,
      map: { value: o.map },
      mapSimple: { value: o.mapSimple },
      uHoloTint: { value: new Color(o.tint) },
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
