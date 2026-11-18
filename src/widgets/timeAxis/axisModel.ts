import { tuning } from '../../config';
import { DAY_MS, UNIT_DAYS, UNITS, addUnits, floorTo, type TimeUnit } from '../../core/calendar';
import type { ChecklistItem } from '../../core/checklist';
import { damp } from '../../core/motion';
import type { NoteKind } from '../noteCard/cardLayout';

/**
 * 시간축: 시간을 화면 안쪽 깊이로 펼친다. 카메라는 원점에서 -Z 를 보고,
 * 지금 시점(focusTime)은 axis.focusDepth 깊이에 있다. 과거일수록 멀고 미래일수록 가깝다.
 *
 * 축척은 logScale = ln(하루가 차지하는 깊이)로 둔다. 로그 공간에서 움직여야 확대·축소 속도가 일정하게 느껴진다.
 */
export interface AxisState {
  /** 초점면에 놓인 시각(ms) */
  focusTime: number;
  /** ln(하루가 차지하는 깊이) */
  logScale: number;
}

export type LevelId = 'year' | 'month' | 'day' | 'note';
export const LEVELS: readonly LevelId[] = ['year', 'month', 'day', 'note'];

/** 단계마다 axis.levelDepth 가 정하는 단위 */
export const LEVEL_UNIT: Readonly<Record<LevelId, TimeUnit>> = {
  year: 'year',
  month: 'month',
  day: 'day',
  note: 'hour',
};

export function levelLogScale(level: LevelId): number {
  return Math.log(tuning.axis.levelDepth[level] / UNIT_DAYS[LEVEL_UNIT[level]]);
}

/** 로그 축척이 가장 가까운 단계. 핀치를 놓을 때 이 단계로 붙는다 */
export function nearestLevel(logScale: number): LevelId {
  let best: LevelId = LEVELS[0];
  let bestGap = Infinity;
  for (const level of LEVELS) {
    const gap = Math.abs(levelLogScale(level) - logScale);
    if (gap < bestGap) {
      bestGap = gap;
      best = level;
    }
  }
  return best;
}

export function depthPerDay(state: AxisState): number {
  return Math.exp(state.logScale);
}

export function depthOf(state: AxisState, time: number): number {
  return tuning.axis.focusDepth + ((state.focusTime - time) / DAY_MS) * depthPerDay(state);
}

export function timeAtDepth(state: AxisState, depth: number): number {
  return state.focusTime - ((depth - tuning.axis.focusDepth) / depthPerDay(state)) * DAY_MS;
}

/** 단위 하나가 지금 축척에서 차지하는 깊이 */
export function unitSpacing(state: AxisState, unit: TimeUnit): number {
  return UNIT_DAYS[unit] * depthPerDay(state);
}

// ── 눈금 ──────────────────────────────────────────────

export interface TickUnits {
  major: TimeUnit;
  minor: TimeUnit | null;
  minorLabeled: boolean;
}

/**
 * 큰 눈금은 간격이 axis.majorMinSpacing 이상인 가장 작은 단위, 작은 눈금은 그보다 한 단계 작은 단위다.
 * 단계와 상관없이 축척만 보고 고르므로 확대·축소하는 동안 자연스럽게 바뀐다.
 */
export function chooseTickUnits(state: AxisState): TickUnits {
  const a = tuning.axis;
  let majorIndex = 0;
  for (let i = 0; i < UNITS.length; i++) {
    if (unitSpacing(state, UNITS[i]) >= a.majorMinSpacing) majorIndex = i;
  }
  const major = UNITS[majorIndex];
  const next = UNITS[majorIndex + 1];
  const minorSpacing = next ? unitSpacing(state, next) : 0;
  const minor = next && minorSpacing >= a.minorMinSpacing ? next : null;
  return { major, minor, minorLabeled: minor !== null && minorSpacing >= a.minorLabelMinSpacing };
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** 눈금 글자. 큰 눈금은 맥락이 드러나게 길게, 작은 눈금은 짧게 쓴다 */
export function formatTick(unit: TimeUnit, time: number, major: boolean): string {
  const d = new Date(time);
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const midnight = d.getHours() === 0 && d.getMinutes() === 0;
  switch (unit) {
    case 'year':
      return `${y}`;
    case 'month':
      return major ? `${y}.${mo}` : mo;
    case 'day':
      return major ? `${mo}.${day}` : day;
    case 'hour6':
    case 'hour':
      if (midnight) return `${mo}.${day}`;
      return major ? hm : pad2(d.getHours());
    case 'min15':
      if (midnight) return `${mo}.${day}`;
      return major ? hm : `:${pad2(d.getMinutes())}`;
  }
}

export interface Tick {
  time: number;
  depth: number;
  major: boolean;
  /** 글자가 겹쳐 생략했거나 작은 눈금 글자를 쓰지 않을 때는 null */
  label: string | null;
}

/**
 * nearDepth ~ farDepth 사이의 눈금을 가까운 것부터 낸다. 위치는 달력 경계다.
 * maxTime(보통 가장 최근 노트)보다 미래인 눈금은 내지 않는다.
 * 글자는 화면에서 이웃 글자와 axis.labelMinGap 보다 가까우면 생략한다(먼 곳은 원근으로 촘촘해진다).
 */
export function generateTicks(state: AxisState, nearDepth: number, farDepth: number, maxTime = Infinity): Tick[] {
  const a = tuning.axis;
  const units = chooseTickUnits(state);
  const tNear = Math.min(timeAtDepth(state, nearDepth), maxTime);
  const tFar = timeAtDepth(state, farDepth);
  const ticks: Tick[] = [];
  const majorTimes = new Set<number>();

  const collect = (unit: TimeUnit, major: boolean) => {
    let t = floorTo(unit, tNear);
    while (t >= tFar && ticks.length < a.maxTicks) {
      if (t <= tNear && !(major === false && majorTimes.has(t))) {
        if (major) majorTimes.add(t);
        const labeled = major || units.minorLabeled;
        ticks.push({ time: t, depth: depthOf(state, t), major, label: labeled ? formatTick(unit, t, major) : null });
      }
      t = addUnits(unit, t, -1);
    }
  };
  collect(units.major, true);
  if (units.minor) collect(units.minor, false);

  ticks.sort((p, q) => p.depth - q.depth);

  // 큰 눈금 글자를 먼저 자리 잡게 하고, 작은 눈금 글자는 남는 자리에만 둔다
  const railDrop = Math.abs(a.railY);
  const screenY = (depth: number) => railDrop / depth;
  const placed: number[] = [];
  const fits = (y: number) => placed.every((p) => Math.abs(p - y) >= a.labelMinGap);
  for (const pass of [true, false]) {
    for (const tick of ticks) {
      if (tick.major !== pass || tick.label === null) continue;
      const y = screenY(tick.depth);
      if (fits(y)) placed.push(y);
      else tick.label = null;
    }
  }
  return ticks;
}

// ── 묶음 ──────────────────────────────────────────────

/**
 * 묶음 단위: 간격이 axis.clusterMinSpacing 이상인 가장 작은 단위.
 * 가장 작은 단위도 그 간격을 넘으면 묶지 않는다(null).
 */
export function chooseClusterUnit(state: AxisState): TimeUnit | null {
  const min = tuning.axis.clusterMinSpacing;
  const smallest = UNITS[UNITS.length - 1];
  if (unitSpacing(state, smallest) >= min) return null;
  for (let i = UNITS.length - 1; i >= 0; i--) {
    if (unitSpacing(state, UNITS[i]) >= min) return UNITS[i];
  }
  return UNITS[0];
}

export interface NoteRef {
  id: string;
  time: number;
  tags?: readonly string[];
  kind?: NoteKind;
  title?: string;
  /** 카드·목록에 쓰는 글. 체크리스트 노트는 항목을 줄마다 적은 글이다(checklistText) */
  body?: string;
  /** 지금 글로 만든 AI 요약. 카드가 중간 거리에서 본문 대신 쓴다 */
  summary?: string;
  /** tags 가운데 AI 가 붙인 태그. 노트 보기가 다른 색으로 보인다 */
  autoTags?: readonly string[];
  /** 체크리스트 노트의 항목. 노트 보기가 체크 칸으로 그린다 */
  checklist?: readonly ChecklistItem[];
  /** 메모 포스트잇 색 번호(card.holo.memoColors). 없으면 노트 번호로 고른다 */
  tint?: number;
}

export interface Cluster {
  key: string;
  /** 대표(가장 최근) 노트의 시각 */
  anchorTime: number;
  /** notes 안의 번호. 최근 것부터 */
  members: number[];
}

/** notes 는 최근 것부터 정렬돼 있어야 한다. 같은 단위 칸의 노트를 하나로 묶는다 */
export function clusterNotes(notes: readonly NoteRef[], unit: TimeUnit | null): Cluster[] {
  const clusters: Cluster[] = [];
  let current: Cluster | null = null;
  let currentBucket = NaN;
  notes.forEach((note, index) => {
    if (unit === null) {
      clusters.push({ key: `n:${note.id}`, anchorTime: note.time, members: [index] });
      return;
    }
    const bucket = floorTo(unit, note.time);
    if (current && bucket === currentBucket) {
      current.members.push(index);
      return;
    }
    current = { key: `${unit}:${bucket}`, anchorTime: note.time, members: [index] };
    currentBucket = bucket;
    clusters.push(current);
  });
  return clusters;
}

// ── 조종 ──────────────────────────────────────────────

/**
 * 시간축 상태를 목표로 부드럽게 옮긴다. 지금 시점은 axis.timeRate, 축척은 axis.scaleRate 로 지수 접근한다.
 * 제스처 위젯이 생기면 끄는 동안에는 current 를 바로 쓰고 놓을 때만 목표로 붙인다.
 */
export class AxisController {
  readonly current: AxisState;
  readonly target: AxisState;

  constructor(initial: AxisState) {
    this.current = { ...initial };
    this.target = { ...initial };
  }

  get level(): LevelId {
    return nearestLevel(this.target.logScale);
  }

  setLevel(level: LevelId): void {
    this.target.logScale = levelLogScale(level);
  }

  /** 지금 단계 단위의 평균 길이만큼 과거(-1) 또는 미래(+1)로 옮긴다 */
  shift(direction: -1 | 1, minTime: number, maxTime: number): void {
    const days = UNIT_DAYS[LEVEL_UNIT[this.level]];
    const t = this.target.focusTime + direction * days * DAY_MS;
    this.target.focusTime = Math.min(maxTime, Math.max(minTime, t));
  }

  focusOn(time: number, level: LevelId): void {
    this.target.focusTime = time;
    this.setLevel(level);
  }

  step(dt: number): void {
    const a = tuning.axis;
    this.current.focusTime = damp(this.current.focusTime, this.target.focusTime, a.timeRate, dt);
    this.current.logScale = damp(this.current.logScale, this.target.logScale, a.scaleRate, dt);
  }
}

/** 한 단계 더 촘촘한 단계. 가장 촘촘하면 그대로 */
export function finerLevel(level: LevelId): LevelId {
  const i = LEVELS.indexOf(level);
  return LEVELS[Math.min(LEVELS.length - 1, i + 1)];
}
