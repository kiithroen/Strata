import { Color, Matrix4, Quaternion, Vector3 } from 'three';
import { tuning } from '../../config';
import { DAY_MS, UNIT_DAYS, floorTo, type TimeUnit } from '../../core/calendar';
import { approachFactor } from '../../core/motion';
import { depthPerDay, unitSpacing, type AxisState, type Cluster, type NoteRef } from '../timeAxis/axisModel';

/**
 * 우주 보기: 시간 묶음은 행성, 노트는 행성 둘레를 도는 위성이다.
 * 행성은 현재 시점을 중심으로 사방 360°를 감싸며 바깥으로 퍼지는 구면 나선 위에 놓인다.
 * 시점을 옮기면 그 시점이 새 중심이 되어 주변 기억들이 다시 사방에 펼쳐진다.
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

// ── 3D 구면 나선 ──────────────────────────────────────

/** 행성이 구면 나선에서 벗어나는 정도. 묶음 키로 정해져 같은 묶음은 늘 같은 자리다 */
export interface PlanetJitter {
  radiusScale: number;
  angleOffset: number;
  elevationOffset: number;
}

export function planetJitter(key: string): PlanetJitter {
  const c = tuning.cosmos;
  const h = hashString(key);
  return {
    radiusScale: 1 + (hash01(h, 1) * 2 - 1) * c.radiusJitter,
    angleOffset: (hash01(h, 2) * 2 - 1) * c.angleJitter,
    elevationOffset: (hash01(h, 3) * 2 - 1) * c.elevationJitter,
  };
}

/** 현재 시점(focusTime)에서 시각 time 까지의 부호 있는 거리(월드 깊이 단위. 양수는 과거, 음수는 미래) */
export function timeOffsetDepth(state: AxisState, time: number): number {
  return ((state.focusTime - time) / DAY_MS) * depthPerDay(state);
}

/** 부호 있는 로그 나선 진행도: s=0 에서 0, 멀어질수록 로그로 완만히 커진다 */
export function spiralArc(s: number): number {
  return Math.sign(s) * Math.log1p(tuning.cosmos.spiralKnee * Math.abs(s));
}

/** 구면 나선 반지름: s=0 이 중심 원점(0,0,0), 과거·미래로 멀어질수록 로그 곡선으로 퍼진다 */
export function spiralRadius(s: number): number {
  return tuning.cosmos.radialScale * Math.abs(spiralArc(s));
}

/** 구면 나선 방위각(0 이 정면 -Z, + 가 오른쪽 +X) */
export function spiralAngle(s: number, time: number): number {
  const c = tuning.cosmos;
  return c.twist * spiralArc(s) + c.spin * time;
}

/**
 * 공전 시계가 dClock 만큼 흐르는 동안 은하 회전(cosmos.spin)이 나선 위 점을 원점 Y축 둘레로 돌리는 각도.
 * three 의 오른손 Y축 회전 각도라 Vector3.applyAxisAngle(+Y, 각도)에 그대로 넣는다.
 */
export function galaxySpinAngle(dClock: number): number {
  return -tuning.cosmos.spin * dClock;
}

/** 구면 나선 고도각(라디안. s=0 에서 0 이고 위아래로 감아 돈다) */
export function spiralElevation(s: number): number {
  const c = tuning.cosmos;
  return c.elevationAmp * Math.sin(c.elevationFreq * spiralArc(s));
}

/** 현재 시점을 중심으로 사방 360° 구면 나선 위의 3D 좌표 */
export function spiralPoint(s: number, time: number, jitter: PlanetJitter, out: Vector3): Vector3 {
  const r = spiralRadius(s) * jitter.radiusScale;
  const alpha = spiralAngle(s, time) + jitter.angleOffset;
  const maxE = tuning.cosmos.maxElevation;
  const phi = Math.max(-maxE, Math.min(maxE, spiralElevation(s) + jitter.elevationOffset));
  const cosPhi = Math.cos(phi);
  return out.set(r * cosPhi * Math.sin(alpha), r * Math.sin(phi), -r * cosPhi * Math.cos(alpha));
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

/** 허브 자리: 자식 행성들의 평균 시간 거리에서, 평균 반지름의 graph.hubRadius 비율인 안쪽 구면 껍질 위 */
export function hubPoint(childOffsets: readonly number[], time: number, out: Vector3): Vector3 {
  let sumS = 0;
  let sumR = 0;
  for (const s of childOffsets) {
    sumS += s;
    sumR += spiralRadius(s);
  }
  const count = Math.max(1, childOffsets.length);
  const sAvg = sumS / count;
  const r = (sumR / count) * tuning.cosmos.graph.hubRadius;
  const alpha = spiralAngle(sAvg, time);
  const maxE = tuning.cosmos.maxElevation;
  const phi = Math.max(-maxE, Math.min(maxE, spiralElevation(sAvg)));
  const cosPhi = Math.cos(phi);
  return out.set(r * cosPhi * Math.sin(alpha), r * Math.sin(phi), -r * cosPhi * Math.cos(alpha));
}

const branchDir = new Vector3();

/** Catmull-Rom 스플라인 위 t(0~1) 자리의 점. p1 에서 p2 까지 앞뒤 점(p0, p3)의 기울기로 매끄럽게 잇는다 */
export function catmullRomPoint(
  p0: Vector3,
  p1: Vector3,
  p2: Vector3,
  p3: Vector3,
  t: number,
  out: Vector3,
): Vector3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const x =
    0.5 *
    (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  const y =
    0.5 *
    (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  const z =
    0.5 *
    (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
  return out.set(x, y, z);
}

/**
 * 허브(hp)에서 척추 접선(tangent) 방향으로 부드럽게 갈라져 나와 자식 행성(child)에 닿는 3차 베지어 제어점 둘을 구한다.
 * 접선 방향은 자식 쪽과 예각이 되도록 고른다.
 */
export function branchCubicControls(
  hp: Vector3,
  tangent: Vector3,
  child: Vector3,
  c1: Vector3,
  c2: Vector3,
): void {
  branchDir.copy(child).sub(hp);
  const d = branchDir.length();
  if (d < 1e-6 || tangent.lengthSq() < 1e-8) {
    c1.copy(hp).lerp(child, 1 / 3);
    c2.copy(hp).lerp(child, 2 / 3);
    return;
  }
  const [out, pull] = tuning.cosmos.graph.branchBend;
  const sign = branchDir.dot(tangent) >= 0 ? 1 : -1;
  c1.copy(hp).addScaledVector(tangent, sign * d * out);
  c2.copy(child).addScaledVector(branchDir, -pull);
}

/** 3차 베지어 곡선 위 t(0~1) 자리의 점 */
export function cubicBezierPoint(a: Vector3, c1: Vector3, c2: Vector3, b: Vector3, t: number, out: Vector3): Vector3 {
  const u = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  return out
    .set(0, 0, 0)
    .addScaledVector(a, u2 * u)
    .addScaledVector(c1, 3 * u2 * t)
    .addScaledVector(c2, 3 * u * t2)
    .addScaledVector(b, t2 * t);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * 묶음 안 각 노트가 그 노드에 끌리는 관련도(0~1, 1이 가장 강함). 묶음 안 순위가 아니라 절대 기준이라
 * 몰아 찍은 노트들은 모두 강하게, 흩어진 노트는 약하게 끌린다.
 * - 시간: 묶음 중앙값 시각과의 거리 dt 로 exp(−|dt| / (행성 단위 길이 × cosmos.affinity.timeScale))
 * - 태그: 묶음에 태그가 하나라도 있으면, 노트 태그마다 그 태그를 가진 묶음 노트 비율의 평균 ÷ √(태그 수)를
 *   cosmos.affinity.timeWeight : (1 − timeWeight) 로 시간 점수와 섞는다
 * notes 는 최근 것부터 정렬돼 있어야 한다(clusterNotes 와 같다).
 */
export function clusterAffinities(notes: readonly NoteRef[], members: readonly number[], unit: TimeUnit): number[] {
  const n = members.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  const a = tuning.cosmos.affinity;
  const mid = Math.floor(n / 2);
  const medianTime =
    n % 2 === 1 ? notes[members[mid]].time : (notes[members[mid - 1]].time + notes[members[mid]].time) / 2;
  const window = UNIT_DAYS[unit] * DAY_MS * a.timeScale;

  const tagCounts = new Map<string, number>();
  for (const m of members) {
    const tags = notes[m].tags;
    if (!tags) continue;
    for (const tag of new Set(tags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  return members.map((m) => {
    const note = notes[m];
    const timeScore = Math.exp(-Math.abs(note.time - medianTime) / window);
    if (tagCounts.size === 0) return timeScore;
    const tags = note.tags;
    let tagScore = 0;
    if (tags && tags.length > 0) {
      let sum = 0;
      for (const tag of tags) sum += (tagCounts.get(tag) ?? 0) / n;
      tagScore = sum / tags.length / Math.sqrt(tags.length);
    }
    return clamp01(a.timeWeight * timeScore + (1 - a.timeWeight) * tagScore);
  });
}

/**
 * 노드에서 k 번째 노트 점까지의 자리: 화면을 마주 보는 원판에 해바라기 씨처럼(황금각) 퍼진다.
 * 관련도(affinity, 0~1)가 높을수록 노드 가까이에 모이고, 낮을수록 긴 살 끝에 놓인다.
 */
export function burstOffset(k: number, spin: number, out: Vector3, affinity = 1): Vector3 {
  const b = tuning.cosmos.graph.burst;
  const angle = k * GOLDEN_ANGLE + spin;
  const pull = Math.pow(1 - clamp01(affinity), b.pullCurve);
  const r = b.inner + b.spacing * Math.sqrt(k + 0.5) + b.pullSpread * pull;
  return out.set(Math.cos(angle) * r, Math.sin(angle) * r, (hash01(k, 77) * 2 - 1) * b.depthJitter);
}

/** 노트가 찍힌 시각(4시간 단위)에 맞춘 점 색 번호 */
export function hourColorIndex(time: number): number {
  const colors = tuning.cosmos.graph.hourColors.length;
  return Math.min(colors - 1, Math.floor((new Date(time).getHours() * colors) / 24));
}

/** 묶음 키로 정한 노드(행성·허브) 색. 같은 키면 늘 같고, 키마다 색상환 전체에서 고르게 고른다 */
export function nodeColor(key: string, out = new Color()): Color {
  const n = tuning.cosmos.graph.nodeColor;
  const h = hashString(key);
  const hue = hash01(h, 101);
  const sat = n.saturation[0] + (n.saturation[1] - n.saturation[0]) * hash01(h, 102);
  const light = n.lightness[0] + (n.lightness[1] - n.lightness[0]) * hash01(h, 103);
  return out.setHSL(hue, sat, light);
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

// ── 노드 둘레를 도는 카드 ────────────────────────────────

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

/** 노드 둘레를 도는 카드 하나의 궤도. 노트 번호로 정해져 같은 노트는 늘 같은 궤도를 돈다 */
export interface Flight {
  /** XZ 평면의 원을 궤도면으로 돌리는 회전. 궤도면은 아무 방향으로나 기운다 */
  orbit: Quaternion;
  phase: number;
  /** 공전 속도 배율. 음수면 반대로 돈다 */
  speed: number;
}

export function flightParams(noteId: string): Flight {
  const s = tuning.cosmos.swarm;
  const h = hashString(noteId);
  const direction = hash01(h, 1) < 0.5 ? -1 : 1;
  return {
    orbit: randomQuaternion(h, 2, new Quaternion()),
    phase: hash01(h, 6) * TAU,
    speed: direction * pick(h, 7, s.speedJitter),
  };
}

/** 행성 중심에서 카드 궤도까지 반지름. 관련도(affinity, 0~1)가 높을수록 행성에 가깝게 당겨진다 */
export function flightRadius(planetR: number, affinity: number): number {
  const s = tuning.cosmos.swarm;
  const pull = Math.pow(1 - clamp01(affinity), s.pullCurve);
  return planetR + s.gap + s.spread * pull;
}

/** 공전 각속도. 케플러 3법칙처럼 반지름의 1.5 제곱에 반비례한다 */
export function orbitSpeed(radius: number): number {
  return tuning.cosmos.swarm.speed / Math.pow(radius, 1.5);
}

/** 행성 중심에서 본 카드 위치: 기운 원 궤도를 일정한 빠르기로 돈다. time 은 공전 시계(초)다 */
export function flightOffset(f: Flight, planetR: number, affinity: number, time: number, out: Vector3): Vector3 {
  const r = flightRadius(planetR, affinity);
  const angle = f.phase + f.speed * orbitSpeed(r) * time;
  return out.set(Math.cos(angle) * r, 0, Math.sin(angle) * r).applyQuaternion(f.orbit);
}

/** 화면 위 탭 후보: 화면 좌표와 판정 반경(CSS px) */
export interface TapTarget {
  x: number;
  y: number;
  radius: number;
}

/**
 * 탭 자리에서 판정 반경 안에 든 후보 가운데 가장 가까운 후보의 번호. 없으면 -1.
 * 움직이는 카드와 작은 노드를 정확히 맞히지 않아도 고를 수 있게 한다
 */
export function pickNearest(targets: readonly TapTarget[], x: number, y: number): number {
  let best = -1;
  let bestDist = Infinity;
  targets.forEach((t, i) => {
    const d = Math.hypot(t.x - x, t.y - y);
    if (d <= t.radius && d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
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

/** 묶음 칸의 날짜 글자(단위에 맞춘 현지 날짜) */
export function bucketLabel(unit: TimeUnit, bucketStart: number): string {
  const d = new Date(bucketStart);
  const mo = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  switch (unit) {
    case 'year':
      return `${d.getFullYear()}`;
    case 'month':
      return `${d.getFullYear()}.${mo}`;
    case 'day':
      return `${mo}.${day}`;
    default:
      return `${mo}.${day} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
}

/** 행성 글자: 행성 단위의 날짜와 위성 수 */
export function planetLabel(unit: TimeUnit, bucketStart: number, count: number): string {
  return `${bucketLabel(unit, bucketStart)} · ${count}`;
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
