import { Euler } from 'three';
import { tuning } from '../../config';
import { damp } from '../../core/motion';
import type { Pose } from '../noteCard/cardMotion';
import { depthOf, type AxisState, type Cluster } from './axisModel';

/**
 * 시간축 위 카드 자리. 축 공간(시각, 고리 위 x·y, 쌓인 순번)으로 들고 있다가 매 프레임 월드 자세로 바꾼다.
 * 축이 움직이면 모든 카드가 지연 없이 함께 움직이고, 묶임이 바뀔 때만 축 공간에서 부드럽게 옮겨 간다.
 */
export interface Placement {
  /** 카드가 놓일 시각(ms). 묶이면 묶음 대표의 시각이다 */
  time: number;
  x: number;
  y: number;
  /** 묶음 안에서 뒤로 쌓인 순번(0이 맨 앞) */
  stack: number;
  /** 묶음에서 보이는 장수를 넘으면 0 */
  visible: number;
}

export function createPlacement(): Placement {
  return { time: 0, x: 0, y: 0, stack: 0, visible: 1 };
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function hash01(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** 초점면에서 카드 중심이 움직일 수 있는 반폭·반높이. 시간축 카드 반폭만큼 빼서 비율 1이면 카드가 화면 안에 다 들어온다 */
export function laneRoom(aspect: number, fovDeg: number): { halfWidth: number; halfHeight: number; screenHalfHeight: number } {
  const screenHalfHeight = tuning.axis.focusDepth * Math.tan((fovDeg * Math.PI) / 360);
  const margin = (tuning.card.width * tuning.axis.cardScale) / 2;
  return {
    halfWidth: Math.max(0, screenHalfHeight * aspect - margin),
    halfHeight: Math.max(0, screenHalfHeight - margin),
    screenHalfHeight,
  };
}

/**
 * 오래된 것부터 센 ordinal 번째 노트의 고리 위 자리. 황금각으로 돌려 시간이 이웃한 노트끼리 멀리 놓인다.
 * 새 노트가 생겨도 기존 노트의 자리는 바뀌지 않는다.
 */
export function laneSpot(ordinal: number, aspect: number, fovDeg: number): { x: number; y: number } {
  const l = tuning.axis.lane;
  const room = laneRoom(aspect, fovDeg);
  const angle = ordinal * GOLDEN_ANGLE;
  const r = l.innerRatio + (1 - l.innerRatio) * Math.sqrt(hash01(ordinal));
  return {
    x: Math.cos(angle) * r * l.halfWidth * room.halfWidth,
    y: l.centerY * room.screenHalfHeight + Math.sin(angle) * r * l.halfHeight * room.halfHeight,
  };
}

/** 묶음을 보고 노트마다 목표 자리를 정한다. 묶음 안 카드는 대표 노트의 고리 자리에 뒤로 쌓인다 */
export function placementTargets(
  clusters: readonly Cluster[],
  spots: readonly { x: number; y: number }[],
  out: Placement[],
): void {
  const visible = tuning.axis.stack.visible;
  for (const c of clusters) {
    const spot = spots[c.members[0]];
    c.members.forEach((m, i) => {
      const t = out[m];
      t.time = c.anchorTime;
      t.x = spot.x;
      t.y = spot.y;
      t.stack = Math.min(i, visible - 1);
      t.visible = i < visible ? 1 : 0;
    });
  }
}

/** 축 공간의 현재 자리를 목표로 axis.layoutRate 만큼 옮긴다 */
export function stepPlacement(current: Placement, target: Placement, dt: number): void {
  const rate = tuning.axis.layoutRate;
  current.time = damp(current.time, target.time, rate, dt);
  current.x = damp(current.x, target.x, rate, dt);
  current.y = damp(current.y, target.y, rate, dt);
  current.stack = damp(current.stack, target.stack, rate, dt);
  current.visible = damp(current.visible, target.visible, rate, dt);
}

const euler = new Euler(0, 0, 0, 'YXZ');

/** 축 공간 자리를 월드 자세로 바꾸고 깊이를 돌려준다. 카드는 axis.faceCamera 만큼 카메라 쪽으로 몸을 튼다 */
export function placementPose(p: Placement, state: AxisState, out: Pose): number {
  const s = tuning.axis.stack;
  const depth = depthOf(state, p.time) + p.stack * s.dz;
  const x = p.x + p.stack * s.dx;
  const y = p.y + p.stack * s.dy;
  out.position.set(x, y, -depth);
  const face = tuning.axis.faceCamera;
  const d = Math.max(depth, 1e-3);
  euler.set(Math.atan2(y, d) * face, Math.atan2(-x, d) * face, 0);
  out.quaternion.setFromEuler(euler);
  out.scale = tuning.axis.cardScale;
  return depth;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 깊이에 따른 불투명도: 카메라 가까이와 axis.farDepth 근처에서 옅어진다 */
export function depthFade(depth: number): number {
  const a = tuning.axis;
  return smoothstep(a.nearDepth, a.fadeNearStart, depth) * (1 - smoothstep(a.fogFar, a.farDepth, depth));
}
