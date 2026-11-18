import { Color, DoubleSide, SRGBColorSpace, ShaderMaterial, type Texture, Vector2, Vector3, Vector4 } from 'three';
import { tuning } from '../../config';
import type { RunnerVariation } from './borderRunner';

/** 모든 카드가 함께 쓰는 유니폼. 같은 객체를 각 재질에 넘겨 한 번만 갱신한다. */
export interface CardLook {
  uTime: { value: number };
  uEdgeWidth: { value: number };
  uDimFloor: { value: number };
  uFogColor: { value: Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  /** 홀로그램 선 색의 기본값. 재질마다 노트 종류 색(CardMaterialOptions.tint)으로 바꿔 쓴다 */
  uHoloTint: { value: Color };
  uDetailRange: { value: Vector2 };
  uColorRange: { value: Vector2 };
  /** 읽는 크기 범위. 이 범위에서 글자를 가리는 홀로그램 효과가 걷히고 사진 선이 원래 사진으로 돌아온다 */
  uReadRange: { value: Vector2 };
  /** 요약 텍스처가 본문 텍스처로 바뀌는 크기 범위 */
  uBodyRange: { value: Vector2 };
  uFarAlpha: { value: number };
  uFocusAlpha: { value: number };
  /** 가로 줄무늬: 빈도, 세기, 흐르는 속도 */
  uStripe: { value: Vector3 };
  uIris: { value: number };
  uIrisShift: { value: number };
  uChroma: { value: number };
  /** 유리 표면 광택: 대각선 반사 세기, 내측 베벨 하이라이트 세기 */
  uGlass: { value: Vector2 };
  /** 테두리 빛: 폭, 밝기 / 도는 빛: 밝기, 빠르기, 꼬리 길이 */
  uBorder: { value: Vector2 };
  uRunner: { value: Vector3 };
  /** 그림 밝기 누르기의 무릎·천장(선형 밝기) */
  uHighlight: { value: Vector2 };
  /** 사진 홀로그램: 선 수, 휨, 어두운 곳·밝은 곳 굵기 / 바탕 비율, 밝기, 흐림, 흐르는 빠르기 */
  uPhotoLines: { value: Vector4 };
  uPhotoTone: { value: Vector4 };
  /** 사진 선화: 윤곽 범위, 먹 범위 / 둘레 흐림, 이웃 거리, 바탕 불투명도, 밝기 */
  uSketchRange: { value: Vector4 };
  uSketchTone: { value: Vector4 };
}

/** 사진 카드의 사진 칸을 그리는 방식: 원래 사진, 홀로그램 가로 선(card.photoFx), 선화(card.photoSketch) */
export const PHOTO_STYLES = ['off', 'lines', 'sketch'] as const;
export type PhotoStyle = (typeof PHOTO_STYLES)[number];

/** 지금 사진 표현(PHOTO_STYLES 의 번호). 모든 카드 재질이 같은 객체를 써서 바꾸면 바로 모든 카드에 적용된다 */
const photoStyleUniform = { value: 1 };

export function setPhotoStyle(style: PhotoStyle): void {
  photoStyleUniform.value = PHOTO_STYLES.indexOf(style);
}

/** 화면(sRGB) 밝기를 셰이더가 다루는 선형 밝기로 바꾼다 */
function linearOf(srgb: number): number {
  return new Color().setRGB(srgb, srgb, srgb, SRGBColorSpace).r;
}

export function createCardLook(): CardLook {
  const l = tuning.look;
  const lod = tuning.card.lod;
  const h = tuning.card.holoFx;
  return {
    uTime: { value: 0 },
    uEdgeWidth: { value: l.focusEdgeWidth },
    uDimFloor: { value: l.dimFloor },
    uFogColor: { value: new Color(l.background) },
    uFogNear: { value: l.fogNear },
    uFogFar: { value: l.fogFar },
    uHoloTint: { value: new Color(l.accent) },
    uDetailRange: { value: new Vector2(...lod.detail) },
    uColorRange: { value: new Vector2(...lod.color) },
    uReadRange: { value: new Vector2(...lod.read) },
    uBodyRange: { value: new Vector2(...lod.body) },
    uFarAlpha: { value: lod.farAlpha },
    uFocusAlpha: { value: lod.focusAlpha },
    uStripe: { value: new Vector3(h.stripeFreq, h.stripeStrength, h.stripeSpeed) },
    uIris: { value: h.iridescence },
    uIrisShift: { value: h.irisShift },
    uChroma: { value: h.chroma },
    uGlass: { value: new Vector2(h.glassSheen, h.bevel) },
    uBorder: { value: new Vector2(tuning.card.border.width, tuning.card.border.strength) },
    uRunner: { value: new Vector3(tuning.card.border.runnerStrength, tuning.card.border.runnerSpeed, tuning.card.border.runnerTail) },
    uHighlight: {
      value: new Vector2(linearOf(tuning.bloom.threshold * tuning.card.highlight.knee), linearOf(tuning.bloom.threshold * tuning.card.highlight.ceiling)),
    },
    uPhotoLines: { value: new Vector4(tuning.card.photoFx.lines, tuning.card.photoFx.warp, ...tuning.card.photoFx.width) },
    uPhotoTone: { value: new Vector4(tuning.card.photoFx.base, tuning.card.photoFx.gain, tuning.card.photoFx.blur, tuning.card.photoFx.speed) },
    uSketchRange: { value: new Vector4(...tuning.card.photoSketch.edge, ...tuning.card.photoSketch.ink) },
    uSketchTone: {
      value: new Vector4(tuning.card.photoSketch.inkBlur, tuning.card.photoSketch.spread, tuning.card.photoSketch.bgAlpha, tuning.card.photoSketch.gain),
    },
  };
}

/**
 * 카드는 평평한 유리판이다. 카드 높이가 화면 높이에서 차지하는 비율로 단순한 모양 ↔ 제대로 된 모양(vDetail), 흑백 ↔ 제 색(vColor),
 * 훑는 크기 ↔ 읽는 크기(vRead), 요약 ↔ 본문(vBody)을 정한다. 카드 중심 하나로 재서 한 장 안에서는 같다.
 */
const vertexShader = /* glsl */ `
uniform float uFocus;
uniform vec2 uCardSize;
uniform vec2 uDetailRange;
uniform vec2 uColorRange;
uniform vec2 uReadRange;
uniform vec2 uBodyRange;
varying vec2 vUv;
varying float vDepth;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying float vDetail;
varying float vColor;
varying float vRead;
varying float vBody;
void main() {
  vUv = uv;
  vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float scaleY = length(modelViewMatrix[1].xyz);
  float screen = uCardSize.y * scaleY * projectionMatrix[1][1] * 0.5 / max(-center.z, 1e-3);
  vDetail = max(smoothstep(uDetailRange.x, uDetailRange.y, screen), uFocus);
  vColor = max(smoothstep(uColorRange.x, uColorRange.y, screen), uFocus);
  vRead = max(smoothstep(uReadRange.x, uReadRange.y, screen), uFocus);
  vBody = max(smoothstep(uBodyRange.x, uBodyRange.y, screen), uFocus);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  vViewPos = mv.xyz;
  vNormalV = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform sampler2D mapSimple;
/** 중간 거리의 요약 텍스처. 요약이 없는 카드는 map 과 같은 텍스처다 */
uniform sampler2D mapSummary;
uniform float uTime;
uniform float uEdgeWidth;
uniform float uDimFloor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uHoloTint;
uniform float uFarAlpha;
uniform float uFocusAlpha;
uniform vec3 uStripe;
uniform float uIris;
uniform float uIrisShift;
uniform float uChroma;
uniform vec2 uGlass;
uniform vec2 uBorder;
uniform vec3 uRunner;
uniform vec2 uHighlight;
uniform vec4 uPhotoLines;
uniform vec4 uPhotoTone;
uniform float uPhotoOn;
uniform vec4 uSketchRange;
uniform vec4 uSketchTone;
/** 사진 칸의 uv 사각형 [왼쪽, 아래, 오른쪽, 위]. 사진 카드가 아니면 오른쪽이 왼쪽보다 작다 */
uniform vec4 uPhotoRect;
/** 이 카드의 도는 빛 배율: 빠르기(부호가 방향), 꼬리, 밝기 */
uniform vec3 uRunnerVar;
/** 카드 겉모양(둥근 사각형)의 모서리 반지름(카드 높이 단위) */
uniform float uCorner;
uniform float uPhase;
uniform float uAspect;
uniform float uDim;
uniform float uFocus;
uniform float uFade;
varying vec2 vUv;
varying float vDepth;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying float vDetail;
varying float vColor;
varying float vRead;
varying float vBody;

// 빨강·파랑을 옆으로 split 만큼 갈라 읽는다
vec4 splitSample(sampler2D tex, vec2 uv, vec2 split) {
  vec4 c = texture2D(tex, uv);
  c.r = texture2D(tex, uv + split).r;
  c.b = texture2D(tex, uv - split).b;
  return c;
}

// 감마 밝기(사람 눈에 고르게). bias 는 밉맵 단계를 더 흐리게 고른다
float gammaLum(vec2 p, float bias) {
  return sqrt(max(dot(texture2D(map, p, bias).rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0));
}

// 카드 겉모양(둥근 사각형) 선까지의 거리(카드 높이 단위). 가로는 uAspect 를 곱해 네 변의 거리 단위를 맞춘다
float outlineDistance(vec2 uv) {
  vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5);
  vec2 q = abs(p) - vec2(uAspect * 0.5, 0.5) + uCorner;
  return abs(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uCorner);
}

// 얇은 막의 무지개빛: 위상 t 에 따라 색상이 돈다
vec3 iris(float t) {
  return 0.5 + 0.5 * cos(6.28318530718 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  float live = 1.0 - uFocus;
  // 글자·사진 위에 얹히는 효과(색 갈라짐, 무지개빛, 줄무늬, 광택, 사진 선)의 세기. 읽는 크기로 다가오면 걷힌다. 테두리 빛은 live 를 그대로 쓴다
  float veil = live * (1.0 - vRead);
  vec3 nrm = normalize(vNormalV);
  vec3 viewDir = normalize(-vViewPos);
  float facing = abs(dot(nrm, viewDir));
  float graze = 1.0 - facing;

  // 양면 홀로그램: 뒤에서 봐도 글자가 바로 읽히게 가로를 뒤집는다
  vec2 uv = vec2(gl_FrontFacing ? vUv.x : 1.0 - vUv.x, vUv.y);
  // 선의 빨강·파랑이 옆으로 살짝 갈라진다(비스듬할수록 더). 읽는 크기의 카드는 글이 또렷하게 갈라지지 않는다.
  // 멀면 단순한 모양, 중간 거리는 요약, 가까우면 본문이다
  vec2 split = vec2(uChroma * (0.4 + graze) * veil, 0.0);
  vec4 detail = mix(splitSample(mapSummary, uv, split), splitSample(map, uv, split), vBody);
  vec4 color = mix(texture2D(mapSimple, uv), detail, vDetail);
  // 겉모양 밖(메모의 깎은 모서리, 문서 탭 옆)은 비어 있다. 아래 효과들도 그 자리는 건드리지 않는다
  float body = smoothstep(0.0, 0.25, color.a);

  // 멀면 흑백으로 물들고 가까울수록 제 색이 돌아온다
  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(uHoloTint * gray, color.rgb, vColor);
  color.a *= mix(uFarAlpha, 1.0, vDetail);
  // 펼친 카드는 바탕을 거의 불투명하게 해 뒤 카드가 글을 가리지 않게 한다
  color.a = mix(color.a, max(color.a, uFocusAlpha * body), uFocus);

  // 사진 홀로그램: 사진 칸을 카드 색 가로 선으로 다시 그린다. 선은 흐린 사진 밝기만큼 휘고 굵어지며 천천히 흐른다.
  // 선이 화면에서 너무 촘촘하면(멀리 있는 카드) 물결무늬가 생기지 않게 선이 덮는 평균 밝기로 칠한다. 읽는 크기로 다가오면 원래 사진으로 돌아온다
  if (uPhotoOn > 0.5 && uPhotoOn < 1.5 && uPhotoRect.z > uPhotoRect.x && veil > 0.0) {
    vec2 lo = uPhotoRect.xy;
    vec2 hi = uPhotoRect.zw;
    float inside = step(lo.x, uv.x) * step(uv.x, hi.x) * step(lo.y, uv.y) * step(uv.y, hi.y);
    float py = (hi.y - uv.y) / (hi.y - lo.y);
    float l = sqrt(max(dot(texture2D(map, uv, uPhotoTone.z).rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0));
    float ly = py * uPhotoLines.x + uPhotoLines.y * l - uTime * uPhotoTone.w;
    float fromCenter = abs(fract(ly) - 0.5) * 2.0;
    float thick = mix(uPhotoLines.z, uPhotoLines.w, l);
    float aa = fwidth(ly) * 2.0;
    float line = 1.0 - smoothstep(thick - aa, thick + aa, fromCenter);
    line = mix(line, thick, smoothstep(0.25, 0.5, fwidth(ly)));
    vec3 holo = uHoloTint * (uPhotoTone.x * l + (1.0 - uPhotoTone.x) * line * (0.35 + 0.65 * l)) * uPhotoTone.y;
    color.rgb = mix(color.rgb, holo, inside * veil);
  }

  // 사진 선화: 둘레 평균보다 어두운 획(흰 바탕의 글자)과 밝기가 갑자기 바뀌는 윤곽만 카드 색 선으로 남기고 나머지는 비운다.
  // 이웃 거리를 화면 px 로 잡아(fwidth) 카드가 멀어도 가까워도 선 굵기가 비슷하다. 읽는 크기로 다가오면 원래 사진으로 돌아온다
  if (uPhotoOn > 1.5 && uPhotoRect.z > uPhotoRect.x && veil > 0.0) {
    vec2 lo = uPhotoRect.xy;
    vec2 hi = uPhotoRect.zw;
    float inside = step(lo.x, uv.x) * step(uv.x, hi.x) * step(lo.y, uv.y) * step(uv.y, hi.y);
    vec2 d = fwidth(uv) * uSketchTone.y;
    float tl = gammaLum(uv + vec2(-d.x, d.y), 0.0);
    float tc = gammaLum(uv + vec2(0.0, d.y), 0.0);
    float tr = gammaLum(uv + vec2(d.x, d.y), 0.0);
    float ml = gammaLum(uv + vec2(-d.x, 0.0), 0.0);
    float mr = gammaLum(uv + vec2(d.x, 0.0), 0.0);
    float bl = gammaLum(uv + vec2(-d.x, -d.y), 0.0);
    float bc = gammaLum(uv + vec2(0.0, -d.y), 0.0);
    float br = gammaLum(uv + vec2(d.x, -d.y), 0.0);
    float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
    float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
    float edge = smoothstep(uSketchRange.x, uSketchRange.y, length(vec2(gx, gy)) * 0.25);
    float here = gammaLum(uv, 0.0);
    float around = gammaLum(uv, uSketchTone.x);
    float ink = smoothstep(uSketchRange.z, uSketchRange.w, around - here);
    float stroke = max(edge, ink);
    color.rgb = mix(color.rgb, uHoloTint * uSketchTone.w * stroke, inside * veil);
    color.a = mix(color.a, color.a * mix(uSketchTone.z, 1.0, stroke), inside * veil);
  }

  // 그림 밝기 누르기: 무릎 위 밝기는 천장에 다가갈 뿐 넘지 않아 흰 바탕 사진이 블룸에 번지지 않는다. 펼친 카드는 제 밝기다
  float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  float room = max(uHighlight.y - uHighlight.x, 1e-4);
  float pressed = lum <= uHighlight.x ? lum : uHighlight.x + room * (1.0 - exp(-(lum - uHighlight.x) / room));
  color.rgb *= mix(1.0, pressed / max(lum, 1e-4), live);

  // 보는 각도(면의 기울기와 시선)에 따라 미끄러지는 위상. 카드가 돌거나 시점이 움직이면 빛이 흐른다
  float phase = dot(nrm.xy, vec2(0.8, 0.6)) * uIrisShift + dot(viewDir.xy, vec2(-0.6, 0.8)) * uIrisShift * 0.5 + uPhase;
  vec3 rainbow = iris(phase + (vUv.x + vUv.y) * 0.35);

  // 비스듬히 볼수록 무지개빛 막이 짙다
  color.rgb += rainbow * uIris * (0.15 + graze) * body * veil;

  // 가는 가로 줄무늬가 천천히 위로 흐르고 줄 사이는 조금 투명해진다. 빛을 더하지 않아 하얗게 뜨지 않는다.
  // 줄이 화면에서 너무 촘촘해지면(멀리 있는 카드) 물결무늬가 생기지 않게 옅어진다
  float sy = (vUv.y - uTime * uStripe.z) * uStripe.x;
  float stripe = pow(0.5 + 0.5 * sin(sy * 6.28318530718), 2.0);
  float fine = 1.0 - smoothstep(0.3, 0.6, fwidth(sy));
  color.a *= 1.0 - uStripe.y * (1.0 - stripe) * fine * veil;

  // 테두리 빛: 겉모양 선을 따라 종류 색을 더해 블룸이 걸리게 하고, 그 위로 꼬리 달린 빛이 테두리를 따라 돈다.
  // 도는 위치는 카드 가운데에서 본 각도로 잰다. 카드마다 출발점이 다르다
  float edgeD = outlineDistance(vUv);
  float rim = exp(-edgeD / uBorder.x) * live;
  vec2 fromCenter = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
  float around = atan(fromCenter.y, fromCenter.x) / 6.28318530718 + 0.5;
  float dir = sign(uRunnerVar.x);
  float behind = fract(uTime * uRunner.y * abs(uRunnerVar.x) + uPhase - around * dir);
  float runner = exp(-behind / (uRunner.z * uRunnerVar.y)) * smoothstep(1.0, 0.97, behind);
  float lit = rim * (uBorder.y + uRunner.x * uRunnerVar.z * runner) * body;
  color.rgb += uHoloTint * lit;
  color.a = max(color.a, min(1.0, lit));

  // 유리 표면 광택: 시선 각도에 따른 은은한 대각선 반사와 윗변·왼쪽 안쪽 베벨 하이라이트
  float diag = (vUv.x * 0.65 + vUv.y * 0.85) + dot(viewDir.xy, vec2(0.45, 0.55));
  float sheenBand = pow(max(0.0, 1.0 - abs(fract(diag * 0.45) - 0.5) * 2.4), 3.0);
  float sheen = sheenBand * uGlass.x * (0.45 + graze * 0.85) * body * veil;
  float topLeft = smoothstep(-0.3, 0.7, vUv.y - vUv.x * 0.7);
  float bevel = exp(-abs(edgeD - uBorder.x * 1.4) / max(uBorder.x * 0.9, 0.002)) * uGlass.y * (0.35 + 0.65 * topLeft) * body * live;
  color.rgb += mix(uHoloTint, vec3(1.0), 0.55) * (sheen + bevel * 0.5);
  color.a = min(1.0, color.a + sheen * 0.4);

  // 펼친 카드의 테두리 빛. 둥근 겉모양 선을 따라 같은 두께로 두른다
  float edge = (1.0 - smoothstep(0.0, uEdgeWidth, edgeD)) * body;
  color.rgb = mix(color.rgb, uHoloTint, edge * uFocus);
  color.a = max(color.a, edge * uFocus);

  color.rgb *= mix(1.0, uDimFloor, uDim);

  float fog = smoothstep(uFogNear, uFogFar, vDepth);
  color.rgb = mix(color.rgb, uFogColor, fog);
  color.a *= (1.0 - fog * 0.6) * uFade;
  // 둥근 모서리 밖과 거의 사라진 카드는 깊이를 쓰지 않아 뒤의 그래프 선·배경이 잘리지 않는다
  if (body <= 0.001 || color.a <= 0.02) discard;

  gl_FragColor = color;
  #include <colorspace_fragment>
}
`;

export interface CardMaterialOptions {
  map: Texture;
  /** 멀리서 쓰는 단순한 텍스처 */
  mapSimple: Texture;
  /** 중간 거리의 요약 텍스처. 없으면 map 을 쓴다 */
  mapSummary?: Texture | null;
  look: CardLook;
  width: number;
  height: number;
  /** 카드마다 어긋낸 위상. 테두리를 도는 빛의 출발점과 무지개빛 위상을 어긋낸다 */
  phase: number;
  /** 카드 겉모양의 모서리 반지름(카드 높이 단위, cornerUv). 테두리 빛이 이 선을 따른다 */
  corner: number;
  /** 테두리를 따라 도는 빛의 카드별 배율(runnerVariation) */
  runner: RunnerVariation;
  /** 사진 칸의 uv 사각형(photoUvRect). 있으면 펼치지 않은 동안 그 칸을 홀로그램 선으로 다시 그린다 */
  photoRect?: readonly [number, number, number, number] | null;
  /** 홀로그램 선 색(노트 종류 색). 멀리서 흑백으로 바꿀 때 이 색으로 물들고, 테두리 빛·반짝임·훑는 띠도 이 색을 바탕으로 한다 */
  tint: string;
}

export function createCardMaterial(o: CardMaterialOptions): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...o.look,
      map: { value: o.map },
      mapSimple: { value: o.mapSimple },
      mapSummary: { value: o.mapSummary ?? o.map },
      uHoloTint: { value: new Color(o.tint) },
      uAspect: { value: o.width / o.height },
      uCardSize: { value: new Vector2(o.width, o.height) },
      uPhase: { value: o.phase },
      uCorner: { value: o.corner },
      uRunnerVar: { value: new Vector3(o.runner.speed, o.runner.tail, o.runner.strength) },
      uDim: { value: 0 },
      uFocus: { value: 0 },
      uFade: { value: 1 },
      uPhotoRect: { value: o.photoRect ? new Vector4(...o.photoRect) : new Vector4(0, 0, -1, 0) },
      uPhotoOn: photoStyleUniform,
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    side: DoubleSide,
  });
}
