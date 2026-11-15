import { tuning } from '../../config';
import { createRng, range } from '../../core/random';

/** 위젯 갤러리에서 카드를 흩어 놓는 자리. 시간축 위젯이 생기면 그쪽 배치로 바뀐다. */
export interface FieldSlot {
  x: number;
  y: number;
  /** 카메라에서 떨어진 거리(양수). 월드 z 는 -depth 다 */
  depth: number;
  yaw: number;
  floatPhase: number;
  floatPeriod: number;
}

/**
 * 시야 원뿔 안에 카드 자리를 고르게 흩는다. 화면 좌표(깊이로 나눈 x, y)에서
 * 기존 자리와 가장 먼 후보를 고르는 방식이라 화면에서 겹침이 적다.
 * 시드가 같으면 같은 배치가 나온다.
 */
export function generateField(count: number, seed: number, fovDeg: number): FieldSlot[] {
  const f = tuning.field;
  const fl = tuning.float;
  const rng = createRng(seed);
  const halfTan = Math.tan((fovDeg * Math.PI) / 360);
  const picked: { u: number; v: number }[] = [];
  const slots: FieldSlot[] = [];

  for (let i = 0; i < count; i++) {
    let bestU = 0;
    let bestV = 0;
    let bestScore = -1;
    for (let c = 0; c < f.candidates; c++) {
      const u = range(rng, -1, 1);
      const v = range(rng, -1, 1);
      let nearest = Infinity;
      for (const p of picked) {
        const du = (u - p.u) * f.spreadX;
        const dv = (v - p.v) * f.spreadY;
        nearest = Math.min(nearest, du * du + dv * dv);
      }
      if (nearest > bestScore) {
        bestScore = nearest;
        bestU = u;
        bestV = v;
      }
    }
    picked.push({ u: bestU, v: bestV });

    const depth = range(rng, f.depthNear, f.depthFar);
    const half = depth * halfTan;
    slots.push({
      x: bestU * f.spreadX * half,
      y: bestV * f.spreadY * half,
      depth,
      yaw: range(rng, -f.yawMax, f.yawMax),
      floatPhase: range(rng, 0, Math.PI * 2),
      floatPeriod: range(rng, fl.periodMin, fl.periodMax),
    });
  }
  return slots;
}
