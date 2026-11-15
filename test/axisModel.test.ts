import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { UNITS, addUnits, floorTo } from '../src/core/calendar';
import { createRng } from '../src/core/random';
import { createFakeNotes } from '../src/dev/fakeNotes';
import {
  AxisController,
  LEVELS,
  LEVEL_UNIT,
  chooseClusterUnit,
  chooseTickUnits,
  clusterNotes,
  depthOf,
  generateTicks,
  levelLogScale,
  nearestLevel,
  timeAtDepth,
  unitSpacing,
  type AxisState,
} from '../src/widgets/timeAxis/axisModel';

const a = tuning.axis;
const NOW = new Date(2026, 10, 15, 21, 30).getTime();

/** 각 단계와 그 사이 축척을 고루 훑는 상태들 */
function sweepStates(): AxisState[] {
  const lo = levelLogScale('year') - 1;
  const hi = levelLogScale('note') + 1;
  const states: AxisState[] = [];
  for (let i = 0; i <= 60; i++) states.push({ focusTime: NOW, logScale: lo + ((hi - lo) * i) / 60 });
  for (const level of LEVELS) states.push({ focusTime: NOW, logScale: levelLogScale(level) });
  return states;
}

describe('시간 ↔ 깊이', () => {
  it('지금 시점은 초점면에 있고 과거일수록 멀다', () => {
    for (const s of sweepStates()) {
      expect(depthOf(s, s.focusTime)).toBeCloseTo(a.focusDepth, 9);
      expect(depthOf(s, s.focusTime - 3_600_000)).toBeGreaterThan(a.focusDepth);
    }
  });

  it('깊이와 시각은 서로 되돌린다', () => {
    const rng = createRng(3);
    for (const s of sweepStates()) {
      const depth = a.nearDepth + rng() * (a.farDepth - a.nearDepth);
      expect(depthOf(s, timeAtDepth(s, depth))).toBeCloseTo(depth, 6);
    }
  });
});

describe('단계', () => {
  it('단계 축척에서 그 단계 단위 하나가 levelDepth 만큼 깊다', () => {
    for (const level of LEVELS) {
      const s = { focusTime: NOW, logScale: levelLogScale(level) };
      expect(unitSpacing(s, LEVEL_UNIT[level])).toBeCloseTo(a.levelDepth[level], 9);
      expect(nearestLevel(s.logScale)).toBe(level);
    }
  });

  it('연 → 월 → 일 → 노트 순서로 확대된다', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(levelLogScale(LEVELS[i])).toBeGreaterThan(levelLogScale(LEVELS[i - 1]));
    }
  });
});

describe('눈금', () => {
  it('큰 눈금은 간격 조건을 만족하는 가장 작은 단위, 작은 눈금은 그 다음 단위다', () => {
    for (const s of sweepStates()) {
      const u = chooseTickUnits(s);
      const mi = UNITS.indexOf(u.major);
      if (u.major !== 'year') expect(unitSpacing(s, u.major)).toBeGreaterThanOrEqual(a.majorMinSpacing);
      if (mi + 1 < UNITS.length) expect(unitSpacing(s, UNITS[mi + 1])).toBeLessThan(a.majorMinSpacing);
      if (u.minor) {
        expect(u.minor).toBe(UNITS[mi + 1]);
        expect(unitSpacing(s, u.minor)).toBeGreaterThanOrEqual(a.minorMinSpacing);
      }
    }
  });

  it('눈금은 보이는 깊이 안의 달력 경계이고, 큰 눈금은 한 단위씩 이어진다', () => {
    for (const s of sweepStates()) {
      const u = chooseTickUnits(s);
      const ticks = generateTicks(s, a.nearDepth, a.farDepth);
      expect(ticks.length).toBeLessThanOrEqual(a.maxTicks);
      for (let i = 0; i < ticks.length; i++) {
        const t = ticks[i];
        expect(t.depth).toBeGreaterThanOrEqual(a.nearDepth - 1e-9);
        expect(t.depth).toBeLessThanOrEqual(a.farDepth + 1e-9);
        if (i > 0) expect(t.depth).toBeGreaterThanOrEqual(ticks[i - 1].depth);
        const unit = t.major ? u.major : (u.minor as NonNullable<typeof u.minor>);
        expect(floorTo(unit, t.time)).toBe(t.time);
      }
      const majors = ticks.filter((t) => t.major);
      for (let i = 1; i < majors.length; i++) expect(addUnits(u.major, majors[i].time, 1)).toBe(majors[i - 1].time);
      const majorTimes = new Set(majors.map((t) => t.time));
      for (const t of ticks) if (!t.major) expect(majorTimes.has(t.time)).toBe(false);
    }
  });

  it('maxTime 보다 미래인 눈금은 내지 않는다', () => {
    let unclippedFuture = 0;
    for (const s of sweepStates()) {
      const ticks = generateTicks(s, a.nearDepth, a.farDepth, s.focusTime);
      for (const t of ticks) expect(t.time).toBeLessThanOrEqual(s.focusTime);
      if (generateTicks(s, a.nearDepth, a.farDepth).some((t) => t.time > s.focusTime)) unclippedFuture++;
    }
    // 자르지 않으면 미래 눈금이 생기는 상태가 있어야 이 검사가 의미 있다
    expect(unclippedFuture).toBeGreaterThan(0);
  });

  it('글자는 화면에서 서로 labelMinGap 이상 떨어진다', () => {
    const drop = Math.abs(a.railY);
    for (const s of sweepStates()) {
      const ys = generateTicks(s, a.nearDepth, a.farDepth)
        .filter((t) => t.label !== null)
        .map((t) => drop / t.depth)
        .sort((p, q) => p - q);
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(a.labelMinGap - 1e-12);
    }
  });
});

describe('묶음', () => {
  it('묶음 단위는 간격 조건을 만족하는 가장 작은 단위이고, 다 넘으면 묶지 않는다', () => {
    const smallest = UNITS[UNITS.length - 1];
    for (const s of sweepStates()) {
      const unit = chooseClusterUnit(s);
      if (unit === null) {
        expect(unitSpacing(s, smallest)).toBeGreaterThanOrEqual(a.clusterMinSpacing);
        continue;
      }
      const i = UNITS.indexOf(unit);
      if (unit !== 'year') expect(unitSpacing(s, unit)).toBeGreaterThanOrEqual(a.clusterMinSpacing);
      expect(unitSpacing(s, UNITS[i + 1])).toBeLessThan(a.clusterMinSpacing);
    }
  });

  it('확대할수록 묶음 단위는 촘촘해지기만 한다', () => {
    const rank = (s: AxisState) => {
      const u = chooseClusterUnit(s);
      return u === null ? UNITS.length : UNITS.indexOf(u);
    };
    const states = sweepStates().sort((p, q) => p.logScale - q.logScale);
    for (let i = 1; i < states.length; i++) expect(rank(states[i])).toBeGreaterThanOrEqual(rank(states[i - 1]));
  });

  it('모든 노트가 정확히 한 묶음에 들고, 대표는 묶음에서 가장 최근 노트다', () => {
    const notes = createFakeNotes(NOW);
    for (const unit of [...UNITS, null]) {
      const clusters = clusterNotes(notes, unit);
      const seen = new Set<number>();
      for (let ci = 0; ci < clusters.length; ci++) {
        const c = clusters[ci];
        expect(c.anchorTime).toBe(notes[c.members[0]].time);
        if (ci > 0) expect(c.anchorTime).toBeLessThan(clusters[ci - 1].anchorTime + 1);
        for (const m of c.members) {
          expect(seen.has(m)).toBe(false);
          seen.add(m);
          if (unit) expect(floorTo(unit, notes[m].time)).toBe(floorTo(unit, c.anchorTime));
          else expect(c.members).toHaveLength(1);
        }
      }
      expect(seen.size).toBe(notes.length);
      if (unit) {
        const buckets = new Set(notes.map((n) => floorTo(unit, n.time)));
        expect(clusters).toHaveLength(buckets.size);
      }
    }
  });
});

describe('AxisController', () => {
  it('같은 게임 시간이면 주사율과 상관없이 같은 상태에 닿는다', () => {
    const run = (hz: number) => {
      const c = new AxisController({ focusTime: NOW, logScale: levelLogScale('month') });
      c.focusOn(NOW - 40 * 86_400_000, 'day');
      for (let i = 0; i < hz / 3; i++) c.step(1 / hz);
      return c.current;
    };
    const ref = run(60);
    for (const hz of [30, 120, 144]) {
      const s = run(hz);
      expect(Math.abs(s.focusTime - ref.focusTime)).toBeLessThan(1);
      expect(s.logScale).toBeCloseTo(ref.logScale, 9);
    }
  });

  it('옮기기는 주어진 범위를 넘지 않는다', () => {
    const min = NOW - 10 * 86_400_000;
    const c = new AxisController({ focusTime: NOW, logScale: levelLogScale('year') });
    c.shift(-1, min, NOW);
    expect(c.target.focusTime).toBe(min);
    c.shift(1, min, NOW);
    c.shift(1, min, NOW);
    expect(c.target.focusTime).toBe(NOW);
  });
});
