import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import {
  PLANET_UNITS,
  RegroupBlend,
  choosePlanetUnit,
  cosmosFade,
  facingQuaternion,
  orbitOffset,
  orbitSpeed,
  planetJitter,
  planetLabel,
  planetRadius,
  ringCapacity,
  ringCount,
  ringLayout,
  ringQuaternion,
  ringRadius,
  spiralAngle,
  spiralPoint,
} from '../src/widgets/cosmos/cosmosModel';
import { LEVELS, levelLogScale, unitSpacing, type AxisState } from '../src/widgets/timeAxis/axisModel';

const c = tuning.cosmos;
const NOW = new Date(2026, 10, 15, 21, 30).getTime();

function sweepStates(): AxisState[] {
  const lo = levelLogScale('year') - 1;
  const hi = levelLogScale('note') + 1;
  const states: AxisState[] = [];
  for (let i = 0; i <= 60; i++) states.push({ focusTime: NOW, logScale: lo + ((hi - lo) * i) / 60 });
  for (const level of LEVELS) states.push({ focusTime: NOW, logScale: levelLogScale(level) });
  return states.sort((p, q) => p.logScale - q.logScale);
}

describe('choosePlanetUnit', () => {
  it('간격 조건을 만족하는 가장 작은 단위이고 확대할수록 촘촘해지기만 한다', () => {
    let prev = -1;
    for (const s of sweepStates()) {
      const unit = choosePlanetUnit(s);
      const i = PLANET_UNITS.indexOf(unit);
      if (i > 0) expect(unitSpacing(s, unit)).toBeGreaterThanOrEqual(c.planetMinSpacing);
      if (i + 1 < PLANET_UNITS.length) expect(unitSpacing(s, PLANET_UNITS[i + 1])).toBeLessThan(c.planetMinSpacing);
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
  });
});

describe('나선팔', () => {
  it('초점면에서는 focusAngle 이고 깊이마다 twist 만큼, 시간마다 spin 만큼 돈다', () => {
    const f = tuning.axis.focusDepth;
    expect(spiralAngle(f, 0)).toBeCloseTo(c.focusAngle, 12);
    expect(spiralAngle(f + 2, 0) - spiralAngle(f, 0)).toBeCloseTo(2 * c.twist, 12);
    expect(spiralAngle(f, 3) - spiralAngle(f, 0)).toBeCloseTo(3 * c.spin, 12);
  });

  it('나선 위 점은 깊이에 놓이고 반지름은 armRadius × 벗어남 비율이다', () => {
    const out = new Vector3();
    for (const key of ['month:1', 'day:2', 'hour:3']) {
      const j = planetJitter(key);
      expect(planetJitter(key)).toEqual(j);
      expect(Math.abs(j.radiusScale - 1)).toBeLessThanOrEqual(c.radiusJitter);
      expect(Math.abs(j.angleOffset)).toBeLessThanOrEqual(c.angleJitter);
      for (const depth of [2, 6, 20]) {
        spiralPoint(depth, 1.5, j, out);
        expect(out.z).toBeCloseTo(-depth, 12);
        expect(Math.hypot(out.x, out.y)).toBeCloseTo(c.armRadius * j.radiusScale, 12);
        expect(Math.atan2(out.y, out.x)).toBeCloseTo(
          Math.atan2(Math.sin(spiralAngle(depth, 1.5) + j.angleOffset), Math.cos(spiralAngle(depth, 1.5) + j.angleOffset)),
          9,
        );
      }
    }
  });
});

describe('행성과 고리', () => {
  it('행성 반지름은 위성이 많을수록 커지되 상한을 넘지 않는다', () => {
    expect(planetRadius(1)).toBeCloseTo(Math.min(c.planetRadius, c.planetMaxRadius), 12);
    let prev = 0;
    for (let n = 1; n < 200; n++) {
      const r = planetRadius(n);
      expect(r).toBeGreaterThanOrEqual(prev);
      expect(r).toBeLessThanOrEqual(c.planetMaxRadius);
      prev = r;
    }
  });

  it('위성을 안쪽 고리부터 채우고 넘치면 바깥 띠에 놓는다', () => {
    for (const max of [1, 2, 3]) {
      for (let n = 0; n < 40; n++) {
        const layout = ringLayout(n, max);
        expect(layout).toHaveLength(n);
        const perRing = new Map<number, number[]>();
        for (const s of layout) {
          expect(s.ring).toBeLessThanOrEqual(max);
          if (!perRing.has(s.ring)) perRing.set(s.ring, []);
          perRing.get(s.ring)?.push(s.slot);
        }
        for (const [ring, slots] of perRing) {
          expect(new Set(slots).size).toBe(slots.length);
          for (const s of layout.filter((l) => l.ring === ring)) expect(s.slots).toBe(slots.length);
          if (ring < max) expect(slots.length).toBeLessThanOrEqual(ringCapacity(ring));
        }
        // 바깥 고리가 차 있으면 안쪽 고리는 다 찼다
        for (let k = 1; k <= max; k++) {
          if (perRing.has(k)) expect(perRing.get(k - 1)?.length).toBe(ringCapacity(k - 1));
        }
        expect(ringCount(layout)).toBe(n === 0 ? 0 : Math.max(...layout.map((l) => l.ring)) + 1);
      }
    }
  });

  it('위성은 고리 반지름의 원 위, 고리 평면 안에서 같은 간격으로 돈다', () => {
    const planetR = planetRadius(9);
    const layout = ringLayout(9, 2);
    const normal = new Vector3();
    const q = new Quaternion();
    for (const time of [0, 1.7, 12]) {
      const byRing = new Map<number, Vector3[]>();
      for (const slot of layout) {
        const off = orbitOffset('day:42', planetR, slot, time, new Vector3());
        expect(off.length()).toBeCloseTo(ringRadius(planetR, slot.ring), 9);
        normal.set(0, 1, 0).applyQuaternion(ringQuaternion('day:42', slot.ring, q));
        expect(off.dot(normal)).toBeCloseTo(0, 9);
        if (!byRing.has(slot.ring)) byRing.set(slot.ring, []);
        byRing.get(slot.ring)?.push(off);
      }
      for (const points of byRing.values()) {
        if (points.length < 3) continue;
        const gaps = points.map((p, i) => p.distanceTo(points[(i + 1) % points.length]));
        for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 9);
      }
    }
  });

  it('고리는 대체로 화면을 마주 본다(기울기는 inclination 안)', () => {
    const q = new Quaternion();
    const normal = new Vector3();
    const minFacing = Math.cos(c.ring.inclination) ** 2;
    for (let i = 0; i < 200; i++) {
      normal.set(0, 1, 0).applyQuaternion(ringQuaternion(`month:${i}`, i % 4, q));
      expect(normal.z).toBeGreaterThanOrEqual(minFacing - 1e-9);
    }
  });

  it('공전 각속도는 반지름의 1.5 제곱에 반비례한다', () => {
    expect(orbitSpeed(2) / orbitSpeed(1)).toBeCloseTo(Math.pow(1 / 2, 1.5), 12);
    expect(orbitSpeed(0.5) / orbitSpeed(1.5)).toBeCloseTo(Math.pow(3, 1.5), 12);
  });
});

describe('facingQuaternion', () => {
  it('앞면이 카메라를 향한다', () => {
    const cam = new Vector3(0, 0, 0);
    const q = new Quaternion();
    for (const p of [new Vector3(1, -0.5, -6), new Vector3(-2, 1.4, -15), new Vector3(0.1, 0.2, -2)]) {
      facingQuaternion(p, cam, q);
      const front = new Vector3(0, 0, 1).applyQuaternion(q);
      const toCam = cam.clone().sub(p).normalize();
      expect(front.dot(toCam)).toBeCloseTo(1, 9);
    }
  });
});

describe('RegroupBlend', () => {
  it('묶음이 그대로면 움직이는 목표를 지연 없이 따른다', () => {
    const b = new RegroupBlend();
    const target = new Vector3(1, 2, -5);
    for (const dt of [1 / 30, 1 / 144, 0.1]) {
      target.x += 3;
      expect(b.step(dt, 'month:1', target).distanceTo(target)).toBeLessThan(1e-12);
    }
  });

  it('묶음이 바뀌면 그 순간 자리에서 이어 출발해 새 목표로 옮겨 간다', () => {
    const b = new RegroupBlend();
    const from = new Vector3(1, 0, -5);
    const to = new Vector3(-2, 1, -9);
    b.step(1 / 60, 'month:1', from);
    const first = b.step(0, 'day:7', to).clone();
    expect(first.distanceTo(from)).toBeLessThan(1e-12);
    let p = first;
    for (let i = 0; i < 60 * (12 / c.regroupRate); i++) p = b.step(1 / 60, 'day:7', to);
    expect(p.distanceTo(to)).toBeLessThan(1e-4);
  });

  it('옮겨 가는 도중에도 주사율과 상관없이 같은 자리다', () => {
    const run = (hz: number) => {
      const b = new RegroupBlend();
      b.step(1 / hz, 'a', new Vector3(3, 0, -4));
      const to = new Vector3(-1, 1, -8);
      let p = b.step(0, 'b', to);
      for (let i = 0; i < hz / 6; i++) p = b.step(1 / hz, 'b', to);
      return p.clone();
    };
    const ref = run(60);
    for (const hz of [30, 120, 144]) expect(run(hz).distanceTo(ref)).toBeLessThan(1e-9);
  });
});

describe('cosmosFade', () => {
  it('가까이와 먼 끝에서 사라지고 그 사이에서는 다 보인다', () => {
    expect(cosmosFade(c.nearDepth)).toBe(0);
    expect(cosmosFade(c.fadeNearStart)).toBe(1);
    expect(cosmosFade((c.fadeNearStart + c.fogFar) / 2)).toBe(1);
    expect(cosmosFade(c.farDepth)).toBe(0);
  });
});

describe('planetLabel', () => {
  it('행성 단위에 맞춘 날짜와 위성 수를 쓴다', () => {
    expect(planetLabel('year', new Date(2026, 0, 1).getTime(), 40)).toBe('2026 · 40');
    expect(planetLabel('month', new Date(2026, 10, 1).getTime(), 6)).toBe('2026.11 · 6');
    expect(planetLabel('day', new Date(2026, 10, 5).getTime(), 3)).toBe('11.05 · 3');
    expect(planetLabel('hour', new Date(2026, 10, 5, 9).getTime(), 1)).toBe('11.05 09:00 · 1');
  });
});
