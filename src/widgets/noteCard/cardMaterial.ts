import { Color, ShaderMaterial, Texture } from 'three';
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
}

export function createCardLook(): CardLook {
  const l = tuning.look;
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
  };
}

const vertexShader = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
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
uniform float uAspect;
uniform float uDim;
uniform float uFocus;
uniform float uFade;
varying vec2 vUv;
varying float vDepth;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec4 color = texture2D(map, vUv);

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
  float n = hash12(gl_FragCoord.xy + floor(uTime * uNoiseFps) * 17.0);
  gl_FragColor.rgb += (n - 0.5) * uNoiseStrength * (1.0 - 0.6 * uFocus);
}
`;

export function createCardMaterial(map: Texture, look: CardLook, aspect: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...look,
      map: { value: map },
      uAspect: { value: aspect },
      uDim: { value: 0 },
      uFocus: { value: 0 },
      uFade: { value: 1 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
  });
}
