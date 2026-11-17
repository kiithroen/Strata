import { Quaternion, Vector3 } from 'three';
import { tuning } from '../../config';
import type { PlacedWord } from '../cloud/wordCloud';
import type { Pose } from '../noteCard/cardMotion';

/** 층에 깔 노트 창 하나: 기본 월드 크기(배율 1), 관련도(0~1), 자리를 정하는 번호 */
export interface StrataTileInput {
  index: number;
  id: string;
  width: number;
  height: number;
  affinity: number;
}

export interface StrataLayerInput {
  key: string;
  label: string;
  anchorTime: number;
  tiles: readonly StrataTileInput[];
  /** 멀리서 층 위에 보이는 태그 워드 클라우드 */
  words?: readonly PlacedWord[];
}

/** 층 판 위 자리. x 는 판의 오른쪽, z 는 판의 앞쪽(보는 쪽)이다. radius 는 비튼 창이 차지하는 원의 반지름 */
export interface StrataTile {
  index: number;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  radius: number;
}

export interface StrataLayer {
  key: string;
  label: string;
  anchorTime: number;
  /** 고른 층을 0으로 한 높이. 최근 층이 위다 */
  y: number;
  words: readonly PlacedWord[];
  /** 층 원판의 반지름. 모든 창을 감싸고 strata.margin 만큼 여유가 있다 */
  radius: number;
  tiles: StrataTile[];
}

/** 지층 전체가 놓이는 자리: 고른 층 판의 중심과 판이 돌아간 요 */
export interface StrataFrame {
  origin: Vector3;
  yaw: number;
}

/** n 개 창을 원판 중심 기준 동심원 고리 위에 겹치지 않게 배치한다 */
function ringPositions(n: number, step: number): Array<{ x: number; z: number }> {
  if (n <= 0) return [];
  if (n === 1) return [{ x: 0, z: 0 }];
  if (n <= 4) {
    const r = step / (2 * Math.sin(Math.PI / n));
    const start = n === 2 ? 0 : n === 3 ? -Math.PI / 2 : (-Math.PI * 3) / 4;
    return Array.from({ length: n }, (_, k) => {
      const a = start + (k * 2 * Math.PI) / n;
      return { x: r * Math.cos(a), z: r * Math.sin(a) };
    });
  }
  const out: Array<{ x: number; z: number }> = [{ x: 0, z: 0 }];
  let remaining = n - 1;
  let ring = 1;
  while (remaining > 0) {
    const r = ring * step;
    const cap = Math.max(1, Math.floor(Math.PI / Math.asin(Math.min(1, step / (2 * r)))));
    const take = Math.min(remaining, cap);
    const start = ring % 2 === 1 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / take;
    for (let k = 0; k < take; k++) {
      const a = start + (k * 2 * Math.PI) / take;
      out.push({ x: r * Math.cos(a), z: r * Math.sin(a) });
    }
    remaining -= take;
    ring++;
  }
  return out;
}

/**
 * 층들을 쌓고 층마다 노트 창을 동심원 고리 위에 깐다. layers 는 최근 것부터, focusIndex 는 고른 층이다.
 * 고리 간격·창 간격이 그 층에서 가장 큰 창의 대각선에 여백을 더한 것이라 창끼리 겹치지 않는다.
 * 관련도가 높은 창일수록 크고 판 가운데에 놓인다.
 */
export function layoutStrata(layers: readonly StrataLayerInput[], focusIndex: number): StrataLayer[] {
  const s = tuning.strata;
  return layers.map((layer, li) => {
    const sized = layer.tiles.map((t) => {
      const scale = s.cardScale[0] + (s.cardScale[1] - s.cardScale[0]) * Math.min(1, Math.max(0, t.affinity));
      return { t, scale, diag: Math.hypot(t.width, t.height) * scale };
    });
    const maxDiag = sized.reduce((m, v) => Math.max(m, v.diag), 0);
    const step = maxDiag * (1 + s.cellGap);
    const slots = ringPositions(sized.length, step);
    const order = sized.map((_, i) => i).sort((a, b) => sized[b].t.affinity - sized[a].t.affinity || a - b);

    const tiles: StrataTile[] = order.map((si, k) => {
      const { t, scale, diag } = sized[si];
      return {
        index: t.index,
        x: slots[k].x,
        z: slots[k].z,
        yaw: 0,
        scale,
        radius: diag / 2,
      };
    });
    return {
      key: layer.key,
      label: layer.label,
      anchorTime: layer.anchorTime,
      y: (focusIndex - li) * s.layerGap,
      words: layer.words ?? [],
      radius: tiles.reduce((m, t) => Math.max(m, Math.hypot(t.x, t.z) + t.radius), 0) + s.margin,
      tiles,
    };
  });
}

/** 시각이 가장 가까운 층의 번호 */
export function nearestLayer(layers: readonly Pick<StrataLayer, 'anchorTime'>[], time: number): number {
  let best = 0;
  let bestD = Infinity;
  layers.forEach((l, i) => {
    const d = Math.abs(l.anchorTime - time);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * 지층을 내려다보는 카메라 거리. 기본은 strata.distance 이고, 넘긴 층 원판(보통 바라보는 층)이 화면 폭에 안 들어오면 더 물러난다.
 * 원판 앞 가장자리(가운데보다 반지름 × cos(strata.pitch)만큼 가깝다)에서 반지름이 화면 반폭 × strata.fitWidth 안에 들도록 한다.
 * aspect 는 화면 가로/세로 비율이다
 */
export function strataDistance(layers: readonly Pick<StrataLayer, 'radius'>[], fovDeg: number, aspect: number): number {
  const s = tuning.strata;
  const halfTan = Math.tan((fovDeg * Math.PI) / 360) * aspect;
  let need = 0;
  for (const l of layers) need = Math.max(need, l.radius / (halfTan * s.fitWidth) + l.radius * Math.cos(s.pitch));
  return Math.max(s.distance, need);
}

const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Y = new Vector3(0, 1, 0);
const lay = new Quaternion().setFromAxisAngle(AXIS_X, -Math.PI / 2);
const turn = new Quaternion();

/** 판 위 좌표(x, 높이, z)의 월드 위치 */
export function strataPoint(frame: StrataFrame, x: number, y: number, z: number, out: Vector3): Vector3 {
  return out.set(x, y, z).applyAxisAngle(AXIS_Y, frame.yaw).add(frame.origin);
}

/**
 * 층에 눕힌 창의 자세. 앞면이 위를 보고, 창의 위쪽이 판 안쪽(보는 쪽 반대)을 향해 앞에서 내려다보면 글이 바로 읽힌다.
 * spin 은 원판(테이블)이 층 중심 둘레로 돈 각도다. 창은 원판에 놓인 채 함께 돈다
 */
export function strataPose(frame: StrataFrame, layer: StrataLayer, tile: StrataTile, out: Pose, spin = 0): Pose {
  out.position.set(tile.x, layer.y, tile.z).applyAxisAngle(AXIS_Y, frame.yaw + spin).add(frame.origin);
  turn.setFromAxisAngle(AXIS_Y, frame.yaw + spin + tile.yaw);
  out.quaternion.copy(turn).multiply(lay);
  out.scale = tile.scale;
  return out;
}
