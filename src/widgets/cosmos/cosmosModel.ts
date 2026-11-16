import { Matrix4, Quaternion, Vector3 } from 'three';
import { tuning } from '../../config';
import { DAY_MS, floorTo, type TimeUnit } from '../../core/calendar';
import { approachFactor } from '../../core/motion';
import { depthPerDay, LEVELS, levelLogScale, unitSpacing, type AxisState, type Cluster, type NoteRef } from '../timeAxis/axisModel';

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

/** 로그 축척에 대응하는 궤도 카메라 거리(단계 사이를 연속 선형 보간, 양끝 여유는 바깥 구간 기울기로 외삽) */
export function orbitDistanceForScale(logScale: number): number {
  const dists = tuning.cosmos.orbitDistance;
  const scales = LEVELS.map((lvl) => levelLogScale(lvl));
  const values = LEVELS.map((lvl) => dists[lvl]);
  const last = LEVELS.length - 1;
  let seg = 0;
  if (logScale >= scales[last]) {
    seg = last - 1;
  } else if (logScale > scales[0]) {
    for (let i = 0; i < last; i++) {
      if (logScale <= scales[i + 1]) {
        seg = i;
        break;
      }
    }
  }
  const t = (logScale - scales[seg]) / (scales[seg + 1] - scales[seg]);
  return Math.max(1.5, values[seg] + (values[seg + 1] - values[seg]) * t);
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

const MAX_ELEVATION = 1.45;

/** 현재 시점을 중심으로 사방 360° 구면 나선 위의 3D 좌표 */
export function spiralPoint(s: number, time: number, jitter: PlanetJitter, out: Vector3): Vector3 {
  const r = spiralRadius(s) * jitter.radiusScale;
  const alpha = spiralAngle(s, time) + jitter.angleOffset;
  const phi = Math.max(-MAX_ELEVATION, Math.min(MAX_ELEVATION, spiralElevation(s) + jitter.elevationOffset));
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
  const phi = Math.max(-MAX_ELEVATION, Math.min(MAX_ELEVATION, spiralElevation(sAvg)));
  const cosPhi = Math.cos(phi);
  return out.set(r * cosPhi * Math.sin(alpha), r * Math.sin(phi), -r * cosPhi * Math.cos(alpha));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * 묶음 안 각 노트가 그 노드에 끌리는 관련도(0~1, 1이 가장 강함).
 * 날짜 축에서는 묶음 중앙 시각과의 근접성과 태그 주제 집중도를 합쳐 계산한다.
 */
export function clusterAffinities(notes: readonly NoteRef[], members: readonly number[]): number[] {
  const n = members.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  const medianTime = n === 2 ? notes[members[0]].time : notes[members[Math.floor(n / 2)]].time;
  const dts = members.map((m) => Math.abs(notes[m].time - medianTime));
  const nonZero = dts.filter((d) => d > 0).sort((a, b) => a - b);
  const scale = nonZero.length > 0 ? nonZero[Math.floor(nonZero.length / 2)] : 1;

  const tagCounts = new Map<string, number>();
  for (const m of members) {
    const tags = notes[m].tags;
    if (!tags) continue;
    for (const tag of new Set(tags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  const metrics = new Float64Array(n);
  let minMetric = Infinity;
  let maxMetric = -Infinity;
  for (let i = 0; i < n; i++) {
    const note = notes[members[i]];
    const timeScore = Math.exp(-dts[i] / (scale * 1.5));
    let metric = timeScore;
    if (tagCounts.size > 0) {
      const tags = note.tags;
      let tagScore = 0;
      if (tags && tags.length > 0) {
        let sum = 0;
        for (const tag of tags) sum += (tagCounts.get(tag) ?? 0) / n;
        tagScore = (sum / tags.length) * (1 / Math.sqrt(tags.length));
      }
      metric = 0.6 * timeScore + 0.4 * tagScore;
    }
    metric += hash01(hashString(note.id), 99) * 1e-6;
    metrics[i] = metric;
    if (metric < minMetric) minMetric = metric;
    if (metric > maxMetric) maxMetric = metric;
  }

  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => metrics[b] - metrics[a]);
  const span = maxMetric - minMetric;
  const result = new Array<number>(n);
  order.forEach((idx, rank) => {
    const normMetric = span > 1e-9 ? (metrics[idx] - minMetric) / span : 1;
    const rankScore = 1 - rank / (n - 1);
    result[idx] = clamp01(0.55 * normMetric + 0.45 * rankScore);
  });
  return result;
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
  phase: number;
  /** 공전 속도 배율. 음수면 반대로 돈다 */
  speed: number;
  wobbleFreq: [number, number, number];
  wobblePhase: [number, number, number];
  /** 제 면 안에서 좌우로 기우는 기본 각도와 흔들림 빈도 */
  roll: number;
  rollFreq: number;
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
    phase: hash01(h, 6) * TAU,
    speed: direction * pick(h, 7, s.speedJitter),
    wobbleFreq: [pick(h, 8, s.wobbleFreq), pick(h, 9, s.wobbleFreq), pick(h, 10, s.wobbleFreq)],
    wobblePhase: [hash01(h, 11) * TAU, hash01(h, 12) * TAU, hash01(h, 13) * TAU],
    roll: (hash01(h, 14) * 2 - 1) * s.rollAmp,
    rollFreq: pick(h, 20, s.rollFreq),
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

/** 행성 중심에서 종이 궤도까지 반지름. 관련도(affinity, 0~1)가 높을수록 행성에 가깝게 당겨진다 */
export function flightRadius(planetR: number, affinity: number): number {
  const s = tuning.cosmos.swarm;
  const pull = Math.pow(1 - clamp01(affinity), s.pullCurve);
  return planetR + s.gap + s.spread * pull;
}

/** 공전 각속도. 케플러 3법칙처럼 반지름의 1.5 제곱에 반비례한다 */
export function orbitSpeed(radius: number): number {
  return tuning.cosmos.swarm.speed / Math.pow(radius, 1.5);
}

/**
 * 행성 중심에서 본 종이 위치: 기운 궤도를 돌면서 난기류에 흔들린다.
 * tau 는 gustTime(공전 시계), g 는 그때의 돌풍 세기다. 흔들림 크기는 swarm.wobble × (1 + swarm.gustWobble × g)다.
 */
export function flightOffset(
  f: Flight,
  planetR: number,
  affinity: number,
  tau: number,
  g: number,
  out: Vector3,
): Vector3 {
  const s = tuning.cosmos.swarm;
  const r = flightRadius(planetR, affinity);
  const angle = f.phase + f.speed * orbitSpeed(r) * tau;
  out.set(Math.cos(angle) * r, 0, Math.sin(angle) * r).applyQuaternion(f.orbit);
  const w = s.wobble * (1 + s.gustWobble * g);
  out.x += w * Math.sin(f.wobbleFreq[0] * tau + f.wobblePhase[0]);
  out.y += w * Math.sin(f.wobbleFreq[1] * tau + f.wobblePhase[1]);
  out.z += w * Math.sin(f.wobbleFreq[2] * tau + f.wobblePhase[2]);
  return out;
}

const FRONT = new Vector3(0, 0, 1);
const ORIGIN = new Vector3(0, 0, 0);
const ALT_UP = new Vector3(0, 0, 1);
const outwardDir = new Vector3();
const alignMatrix = new Matrix4();
const alignQuat = new Quaternion();
const rollQuat = new Quaternion();
const rockQuat = new Quaternion();
const rockQuat2 = new Quaternion();
const rockAxis = new Vector3();

/**
 * 종이 자세. 사진·테이프·압정이 있는 앞면(+Z)이 노드 바깥쪽(outward: 노드에서 종이로 향하는 방향)을 향하고,
 * 위아래가 크게 뒤집히지 않도록 바로 선 상태에서 제 면 안 좌우 흔들림(swarm.rollAmp, rollFreq)과
 * 두 축 팔랑임(swarm.flutterAmp, swarm.flutterAmp2)으로 잔잔하게 흔들린다. 노드 뒤쪽 종이는 카메라에 뒷면을 보인다.
 */
export function flightQuaternion(f: Flight, tau: number, outward: Vector3, out: Quaternion): Quaternion {
  const s = tuning.cosmos.swarm;
  outwardDir.copy(outward).normalize();
  alignMatrix.lookAt(outwardDir, ORIGIN, Math.abs(outwardDir.y) > 0.99 ? ALT_UP : up);
  alignQuat.setFromRotationMatrix(alignMatrix);
  rollQuat.setFromAxisAngle(FRONT, f.roll + s.rollAmp * Math.sin(f.rollFreq * tau + f.flutterPhase));
  rockAxis.set(Math.cos(f.rockAxis), Math.sin(f.rockAxis), 0);
  rockQuat.setFromAxisAngle(rockAxis, s.flutterAmp * Math.sin(f.flutterFreq * tau + f.flutterPhase));
  rockAxis.set(-Math.sin(f.rockAxis), Math.cos(f.rockAxis), 0);
  rockQuat2.setFromAxisAngle(rockAxis, s.flutterAmp2 * Math.sin(f.flutterFreq2 * tau + f.flutterPhase2));
  return out.copy(alignQuat).multiply(rollQuat).multiply(rockQuat).multiply(rockQuat2);
}

/** 화면 위 탭 후보: 화면 좌표와 판정 반경(CSS px) */
export interface TapTarget {
  x: number;
  y: number;
  radius: number;
}

/**
 * 탭 자리에서 판정 반경 안에 든 후보 가운데 가장 가까운 후보의 번호. 없으면 -1.
 * 움직이는 종이와 작은 노드를 정확히 맞히지 않아도 고를 수 있게 한다
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
