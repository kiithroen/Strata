import { Matrix4, Quaternion, Vector3 } from 'three';
import { tuning } from '../../config';
import type { TimeUnit } from '../../core/calendar';
import { approachFactor } from '../../core/motion';
import { unitSpacing, type AxisState } from '../timeAxis/axisModel';

/**
 * 우주 보기: 시간 묶음은 행성, 노트는 행성 둘레를 도는 위성이다.
 * 행성은 시간축(깊이)을 따라 화면 안쪽으로 감겨 들어가는 나선팔 위에 흩어져 있어 정면에서 보면 은하처럼 보인다.
 * 나선은 카메라 공간에 고정돼 있고, 시간을 옮기면 행성이 나선을 타고 소용돌이치며 다가오거나 멀어진다.
 */

/** 행성이 될 수 있는 단위. 큰 것부터 */
export const PLANET_UNITS: readonly TimeUnit[] = ['year', 'month', 'day', 'hour'];

/** 간격이 cosmos.planetMinSpacing 이상인 가장 작은 단위. 다 넘으면 가장 작은 단위(시)다 */
export function choosePlanetUnit(state: AxisState): TimeUnit {
  const min = tuning.cosmos.planetMinSpacing;
  let chosen = PLANET_UNITS[0];
  for (const unit of PLANET_UNITS) {
    if (unitSpacing(state, unit) >= min) chosen = unit;
  }
  return chosen;
}

// ── 해시 ──────────────────────────────────────────────

/** 문자열 → 32비트 정수(FNV-1a) */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 정수 두 개 → [0, 1) */
export function hash01(a: number, b = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

// ── 나선팔 ────────────────────────────────────────────

/** 행성이 나선에서 벗어나는 정도. 묶음 키로 정해져 같은 묶음은 늘 같은 자리다 */
export interface PlanetJitter {
  radiusScale: number;
  angleOffset: number;
}

export function planetJitter(key: string): PlanetJitter {
  const c = tuning.cosmos;
  const h = hashString(key);
  return {
    radiusScale: 1 + (hash01(h, 1) * 2 - 1) * c.radiusJitter,
    angleOffset: (hash01(h, 2) * 2 - 1) * c.angleJitter,
  };
}

/** 나선 각도: 초점면에서 cosmos.focusAngle, 깊이마다 cosmos.twist 만큼 돌고, 은하 전체가 cosmos.spin 으로 돈다 */
export function spiralAngle(depth: number, time: number): number {
  const c = tuning.cosmos;
  return c.focusAngle + c.twist * (depth - tuning.axis.focusDepth) + c.spin * time;
}

/** 깊이 depth 의 나선팔 위 점. 화면 정면에서 보면 깊어질수록 가운데로 감겨 든다 */
export function spiralPoint(depth: number, time: number, jitter: PlanetJitter, out: Vector3): Vector3 {
  const theta = spiralAngle(depth, time) + jitter.angleOffset;
  const r = tuning.cosmos.armRadius * jitter.radiusScale;
  return out.set(r * Math.cos(theta), r * Math.sin(theta), -depth);
}

// ── 행성과 위성 ───────────────────────────────────────

export function planetRadius(satellites: number): number {
  const c = tuning.cosmos;
  return Math.min(c.planetMaxRadius, c.planetRadius + c.planetGrowth * Math.sqrt(Math.max(0, satellites - 1)));
}

/** 행성 단위별 카드 고리 수. 축척이 클수록(행성이 촘촘할수록) 적다 */
export function maxRings(unit: TimeUnit): number {
  return tuning.cosmos.ring.maxByUnit[unit];
}

export interface RingSlot {
  /** 고리 번호. 카드 고리 수와 같으면 바깥 띠(작게 도는 위성)다 */
  ring: number;
  slot: number;
  slots: number;
}

/** k 번째 고리에 들어가는 위성 수 */
export function ringCapacity(k: number): number {
  const r = tuning.cosmos.ring;
  return r.base + r.grow * k;
}

/** 위성 count 개를 안쪽 고리부터 max 개 고리까지 채운다. 다 못 들어간 위성은 바깥 띠(고리 번호 max)에 고르게 놓는다 */
export function ringLayout(count: number, max: number): RingSlot[] {
  const out: RingSlot[] = [];
  let left = count;
  for (let k = 0; k < max && left > 0; k++) {
    const slots = Math.min(ringCapacity(k), left);
    for (let s = 0; s < slots; s++) out.push({ ring: k, slot: s, slots });
    left -= slots;
  }
  for (let s = 0; s < left; s++) out.push({ ring: max, slot: s, slots: left });
  return out;
}

export function ringRadius(planetR: number, ring: number): number {
  return planetR + tuning.cosmos.ring.gap * (ring + 1);
}

/** 공전 각속도. 케플러 3법칙처럼 반지름의 1.5 제곱에 반비례한다 */
export function orbitSpeed(radius: number): number {
  return tuning.cosmos.ring.speed / Math.pow(radius, 1.5);
}

const axisX = new Vector3(1, 0, 0);
const axisY = new Vector3(0, 1, 0);
const tilt = new Quaternion();
const node = new Quaternion();
const ringQuat = new Quaternion();

/**
 * 고리 평면의 회전. XZ 평면의 원을 화면을 마주 보는 평면(XY) 쪽으로 세운 뒤
 * 묶음 키로 정한 만큼(cosmos.ring.inclination 안에서) 기울인다.
 */
export function ringQuaternion(planetKey: string, ring: number, out: Quaternion): Quaternion {
  const inc = tuning.cosmos.ring.inclination;
  const h = hashString(planetKey);
  tilt.setFromAxisAngle(axisX, Math.PI / 2 - (hash01(h, 20 + ring) * 2 - 1) * inc);
  node.setFromAxisAngle(axisY, (hash01(h, 30 + ring) * 2 - 1) * inc);
  return out.copy(node).multiply(tilt);
}

/** 행성 중심에서 본 위성 위치. 같은 고리의 위성은 같은 간격을 두고 함께 돈다 */
export function orbitOffset(planetKey: string, planetR: number, slot: RingSlot, time: number, out: Vector3): Vector3 {
  const h = hashString(planetKey);
  const radius = ringRadius(planetR, slot.ring);
  const phase0 = hash01(h, 10 + slot.ring) * Math.PI * 2;
  const angle = phase0 + (Math.PI * 2 * slot.slot) / slot.slots + orbitSpeed(radius) * time;
  out.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  return out.applyQuaternion(ringQuaternion(planetKey, slot.ring, ringQuat));
}

/** 고리 배치가 쓰는 고리 수(바깥 띠 포함) */
export function ringCount(layout: readonly RingSlot[]): number {
  return layout.length === 0 ? 0 : layout[layout.length - 1].ring + 1;
}

const lookMatrix = new Matrix4();
const up = new Vector3(0, 1, 0);

/** 앞면(+Z)이 카메라를 향하는 회전 */
export function facingQuaternion(position: Vector3, cameraPosition: Vector3, out: Quaternion): Quaternion {
  lookMatrix.lookAt(cameraPosition, position, up);
  return out.setFromRotationMatrix(lookMatrix);
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** 행성 글자: 행성 단위의 날짜와 위성 수 */
export function planetLabel(unit: TimeUnit, bucketStart: number, count: number): string {
  const d = new Date(bucketStart);
  const mo = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  let date: string;
  switch (unit) {
    case 'year':
      date = `${d.getFullYear()}`;
      break;
    case 'month':
      date = `${d.getFullYear()}.${mo}`;
      break;
    case 'day':
      date = `${mo}.${day}`;
      break;
    default:
      date = `${mo}.${day} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  return `${date} · ${count}`;
}

// ── 묶임이 바뀔 때의 이동 ─────────────────────────────

/**
 * 위성이 다른 행성으로 옮겨 갈 때만 부드럽게 잇는다. 묶음이 그대로면 목표 위치를 지연 없이 그대로 따른다.
 * 묶음이 바뀌는 순간의 어긋남을 residual 로 들고 cosmos.regroupRate 로 줄인다.
 */
export class RegroupBlend {
  readonly position = new Vector3();
  private readonly residual = new Vector3();
  private key: string | null = null;

  step(dt: number, key: string, target: Vector3): Vector3 {
    if (this.key !== null && key !== this.key) this.residual.copy(this.position).sub(target);
    this.key = key;
    this.residual.multiplyScalar(1 - approachFactor(tuning.cosmos.regroupRate, dt));
    return this.position.copy(target).add(this.residual);
  }
}

/** 깊이에 따른 불투명도: 카메라 가까이와 cosmos.farDepth 근처에서 옅어진다 */
export function cosmosFade(depth: number): number {
  const c = tuning.cosmos;
  return smoothstep(c.nearDepth, c.fadeNearStart, depth) * (1 - smoothstep(c.fogFar, c.farDepth, depth));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
