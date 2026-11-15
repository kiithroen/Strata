import { Matrix4, Quaternion, Vector3 } from 'three';
import { tuning } from '../../config';
import { floorTo, type TimeUnit } from '../../core/calendar';
import { approachFactor } from '../../core/motion';
import { unitSpacing, type AxisState, type Cluster } from '../timeAxis/axisModel';

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

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

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

// ── 선 그래프 ─────────────────────────────────────────

/** 행성 단위의 한 단계 위 단위. 행성들은 이 단위의 허브에 가지로 이어진다. 연이면 위가 없다 */
export function parentUnit(unit: TimeUnit): TimeUnit | null {
  const i = PLANET_UNITS.indexOf(unit);
  return i > 0 ? PLANET_UNITS[i - 1] : null;
}

export interface Hub {
  key: string;
  /** 허브 칸에서 가장 최근 노트의 시각 */
  anchorTime: number;
  bucket: number;
  /** clusters 안의 번호. 최근 것부터 */
  children: number[];
  notes: number;
}

/** 최근 것부터 정렬된 행성 묶음을 한 단계 위 단위로 다시 묶는다. 위 단위가 없으면 빈 배열이다 */
export function buildHubs(clusters: readonly Cluster[], parent: TimeUnit | null): Hub[] {
  if (parent === null) return [];
  const hubs: Hub[] = [];
  clusters.forEach((c, i) => {
    const bucket = floorTo(parent, c.anchorTime);
    const last = hubs[hubs.length - 1];
    if (last && last.bucket === bucket) {
      last.children.push(i);
      last.notes += c.members.length;
      return;
    }
    hubs.push({ key: `${parent}:${bucket}`, anchorTime: c.anchorTime, bucket, children: [i], notes: c.members.length });
  });
  return hubs;
}

/** 허브 자리: 자식 행성들의 평균 깊이에서, 나선 반지름의 graph.hubRadius 비율인 안쪽 줄기 위 */
export function hubPoint(childDepths: readonly number[], time: number, out: Vector3): Vector3 {
  let sum = 0;
  for (const d of childDepths) sum += d;
  const depth = sum / Math.max(1, childDepths.length);
  return spiralPoint(depth, time, { radiusScale: tuning.cosmos.graph.hubRadius, angleOffset: 0 }, out);
}

/**
 * 노드에서 k 번째 노트 점까지의 자리: 화면을 마주 보는 원판에 해바라기 씨처럼(황금각) 퍼진다.
 * 반지름은 burst.inner + burst.spacing × √(k + ½), 앞뒤로 burst.depthJitter 만큼 흔들리고 원판 전체가 spin 각도만큼 돈다.
 */
export function burstOffset(k: number, spin: number, out: Vector3): Vector3 {
  const b = tuning.cosmos.graph.burst;
  const angle = k * GOLDEN_ANGLE + spin;
  const r = b.inner + b.spacing * Math.sqrt(k + 0.5);
  return out.set(Math.cos(angle) * r, Math.sin(angle) * r, (hash01(k, 77) * 2 - 1) * b.depthJitter);
}

/** 노트가 찍힌 시각(4시간 단위)에 맞춘 점 색 번호 */
export function hourColorIndex(time: number): number {
  const colors = tuning.cosmos.graph.hourColors.length;
  return Math.min(colors - 1, Math.floor((new Date(time).getHours() * colors) / 24));
}

// ── 행성과 위성 ───────────────────────────────────────

export function planetRadius(satellites: number): number {
  const c = tuning.cosmos;
  return Math.min(c.planetMaxRadius, c.planetRadius + c.planetGrowth * Math.sqrt(Math.max(0, satellites - 1)));
}

/** 행성 단위별 큰 카드 수. 축척이 클수록(행성이 촘촘할수록) 적고, 넘친 위성은 작은 종잇조각으로 날린다 */
export function swarmCapacity(unit: TimeUnit): number {
  return tuning.cosmos.swarm.capacityByUnit[unit];
}

// ── 돌풍에 날리는 종이 ────────────────────────────────

const TAU = Math.PI * 2;

function pick(h: number, salt: number, [lo, hi]: readonly [number, number]): number {
  return lo + (hi - lo) * hash01(h, salt);
}

/** 해시로 고른 회전(구면 위 고르게, Shoemake) */
function randomQuaternion(h: number, salt: number, out: Quaternion): Quaternion {
  const u1 = hash01(h, salt);
  const u2 = hash01(h, salt + 1) * TAU;
  const u3 = hash01(h, salt + 2) * TAU;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return out.set(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3));
}

/** 위성(종이) 하나의 비행 성질. 노트 번호로 정해져 같은 노트는 늘 같은 식으로 난다 */
export interface Flight {
  /** XZ 평면의 원을 궤도면으로 돌리는 회전. 궤도면은 아무 방향으로나 기운다 */
  orbit: Quaternion;
  /** 행성 둘레 띠 안의 자리(0이 안쪽, 1이 바깥쪽) */
  band: number;
  phase: number;
  /** 공전 속도 배율. 음수면 반대로 돈다 */
  speed: number;
  wobbleFreq: [number, number, number];
  wobblePhase: [number, number, number];
  /** 제 면 안에서 빙글 도는 처음 각도와 빠르기 */
  roll: number;
  spinRate: number;
  /** 앞면을 기울이는 첫째 축의 방향(종이 면 안의 각도). 둘째 축은 그에 수직이다 */
  rockAxis: number;
  flutterFreq: number;
  flutterPhase: number;
  flutterFreq2: number;
  flutterPhase2: number;
}

export function flightParams(noteId: string): Flight {
  const s = tuning.cosmos.swarm;
  const h = hashString(noteId);
  const direction = hash01(h, 1) < 0.5 ? -1 : 1;
  return {
    orbit: randomQuaternion(h, 2, new Quaternion()),
    band: hash01(h, 5),
    phase: hash01(h, 6) * TAU,
    speed: direction * pick(h, 7, s.speedJitter),
    wobbleFreq: [pick(h, 8, s.wobbleFreq), pick(h, 9, s.wobbleFreq), pick(h, 10, s.wobbleFreq)],
    wobblePhase: [hash01(h, 11) * TAU, hash01(h, 12) * TAU, hash01(h, 13) * TAU],
    roll: hash01(h, 14) * TAU,
    spinRate: (hash01(h, 19) < 0.5 ? -1 : 1) * pick(h, 20, s.spinRate),
    rockAxis: hash01(h, 21) * TAU,
    flutterFreq: pick(h, 23, s.flutterFreq),
    flutterPhase: hash01(h, 24) * TAU,
    flutterFreq2: pick(h, 25, s.flutterFreq),
    flutterPhase2: hash01(h, 26) * TAU,
  };
}

/**
 * 은하 전체에 부는 돌풍의 세기(0~1). 느린 사인 둘의 합이라 미리 적분할 수 있다.
 * 종이의 움직임은 gustTime 으로 잰다. 돌풍이 셀수록 시간이 빨리 흐르는 셈이라 빨라지고 더 뒹군다.
 */
export function gust(time: number): number {
  const g = tuning.cosmos.swarm.gust;
  return 0.5 + 0.25 * Math.sin(g.freq[0] * time + g.phase[0]) + 0.25 * Math.sin(g.freq[1] * time + g.phase[1]);
}

/** 1 + gust.boost × gust(t) 를 0부터 적분한 값. 프레임 간격과 상관없이 게임 시간만으로 정해진다 */
export function gustTime(time: number): number {
  const g = tuning.cosmos.swarm.gust;
  const integral =
    0.5 * time -
    (0.25 * (Math.cos(g.freq[0] * time + g.phase[0]) - Math.cos(g.phase[0]))) / g.freq[0] -
    (0.25 * (Math.cos(g.freq[1] * time + g.phase[1]) - Math.cos(g.phase[1]))) / g.freq[1];
  return time + g.boost * integral;
}

/** 행성 중심에서 종이 궤도까지 반지름. 행성 표면에서 swarm.gap 떨어진 곳부터 swarm.spread 두께의 띠다 */
export function flightRadius(planetR: number, f: Flight): number {
  const s = tuning.cosmos.swarm;
  return planetR + s.gap + s.spread * f.band;
}

/** 공전 각속도. 케플러 3법칙처럼 반지름의 1.5 제곱에 반비례한다 */
export function orbitSpeed(radius: number): number {
  return tuning.cosmos.swarm.speed / Math.pow(radius, 1.5);
}

/**
 * 행성 중심에서 본 종이 위치: 기운 궤도를 돌면서 난기류에 흔들린다.
 * tau 는 gustTime(공전 시계), g 는 그때의 돌풍 세기다. 흔들림 크기는 swarm.wobble × (1 + swarm.gustWobble × g)다.
 */
export function flightOffset(f: Flight, planetR: number, tau: number, g: number, out: Vector3): Vector3 {
  const s = tuning.cosmos.swarm;
  const r = flightRadius(planetR, f);
  const angle = f.phase + f.speed * orbitSpeed(r) * tau;
  out.set(Math.cos(angle) * r, 0, Math.sin(angle) * r).applyQuaternion(f.orbit);
  const w = s.wobble * (1 + s.gustWobble * g);
  out.x += w * Math.sin(f.wobbleFreq[0] * tau + f.wobblePhase[0]);
  out.y += w * Math.sin(f.wobbleFreq[1] * tau + f.wobblePhase[1]);
  out.z += w * Math.sin(f.wobbleFreq[2] * tau + f.wobblePhase[2]);
  return out;
}

const FRONT = new Vector3(0, 0, 1);
const outwardDir = new Vector3();
const alignQuat = new Quaternion();
const rollQuat = new Quaternion();
const rockQuat = new Quaternion();
const rockQuat2 = new Quaternion();
const rockAxis = new Vector3();

/**
 * 종이 자세. 사진·테이프·압정이 있는 앞면(+Z)이 노드 바깥쪽(outward: 노드에서 종이로 향하는 방향)을 향하고,
 * 제 면 안에서 빙글 돌며(swarm.spinRate) 두 축으로 팔랑인다(swarm.flutterAmp, swarm.flutterAmp2).
 * 앞면은 바깥 방향에서 두 각도를 더한 만큼까지만 기울어 뒤집히지 않는다. 노드 뒤쪽 종이는 카메라에 뒷면을 보인다.
 */
export function flightQuaternion(f: Flight, tau: number, outward: Vector3, out: Quaternion): Quaternion {
  const s = tuning.cosmos.swarm;
  outwardDir.copy(outward).normalize();
  alignQuat.setFromUnitVectors(FRONT, outwardDir);
  rollQuat.setFromAxisAngle(FRONT, f.roll + f.spinRate * tau);
  rockAxis.set(Math.cos(f.rockAxis), Math.sin(f.rockAxis), 0);
  rockQuat.setFromAxisAngle(rockAxis, s.flutterAmp * Math.sin(f.flutterFreq * tau + f.flutterPhase));
  rockAxis.set(-Math.sin(f.rockAxis), Math.cos(f.rockAxis), 0);
  rockQuat2.setFromAxisAngle(rockAxis, s.flutterAmp2 * Math.sin(f.flutterFreq2 * tau + f.flutterPhase2));
  return out.copy(alignQuat).multiply(rollQuat).multiply(rockQuat).multiply(rockQuat2);
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
