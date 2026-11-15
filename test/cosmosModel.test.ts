import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import {
  PLANET_UNITS,
  RegroupBlend,
  buildHubs,
  burstOffset,
  hourColorIndex,
  hubPoint,
  parentUnit,
  choosePlanetUnit,
  cosmosFade,
  facingQuaternion,
  flightOffset,
  flightParams,
  flightQuaternion,
  flightRadius,
  gust,
  gustTime,
  orbitSpeed,
  planetJitter,
  planetLabel,
  planetRadius,
  spiralAngle,
  spiralPoint,
} from '../src/widgets/cosmos/cosmosModel';
import { floorTo } from '../src/core/calendar';
import { createFakeNotes } from '../src/dev/fakeNotes';
import { LEVELS, clusterNotes, levelLogScale, unitSpacing, type AxisState } from '../src/widgets/timeAxis/axisModel';

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

describe('행성', () => {
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
});

describe('돌풍에 날리는 종이', () => {
  const s = c.swarm;
  const ids = Array.from({ length: 120 }, (_, i) => String(i + 1).padStart(4, '0'));

  it('노트 번호가 같으면 같은 비행 성질이다', () => {
    expect(flightParams('0042')).toEqual(flightParams('0042'));
    expect(flightParams('0042')).not.toEqual(flightParams('0043'));
  });

  it('돌풍 세기는 0~1 이고, 돌풍 시계는 미리 적분한 값과 수치 적분이 맞는다', () => {
    let numeric = 0;
    const h = 1 / 240;
    for (let i = 0; i < 240 * 40; i++) {
      const t = i * h;
      const g0 = gust(t);
      expect(g0).toBeGreaterThanOrEqual(0);
      expect(g0).toBeLessThanOrEqual(1);
      numeric += ((2 + s.gust.boost * (g0 + gust(t + h))) / 2) * h;
    }
    expect(gustTime(0)).toBeCloseTo(0, 12);
    expect(gustTime(40)).toBeCloseTo(numeric, 4);
  });

  it('돌풍 시계는 늘 앞으로 가고 빠르기는 1 ~ 1 + boost 다', () => {
    for (let t = 0; t < 60; t += 0.37) {
      const rate = (gustTime(t + 1e-4) - gustTime(t)) / 1e-4;
      expect(rate).toBeGreaterThanOrEqual(1 - 1e-6);
      expect(rate).toBeLessThanOrEqual(1 + s.gust.boost + 1e-6);
    }
  });

  it('종이는 행성 둘레 띠 안에 머물고 난기류만큼만 벗어난다', () => {
    const planetR = planetRadius(6);
    const out = new Vector3();
    const wobbleMax = s.wobble * (1 + s.gustWobble) * Math.sqrt(3);
    for (const id of ids) {
      const f = flightParams(id);
      const r = flightRadius(planetR, f);
      expect(r).toBeGreaterThanOrEqual(planetR + s.gap - 1e-12);
      expect(r).toBeLessThanOrEqual(planetR + s.gap + s.spread + 1e-12);
      for (let t = 0; t < 30; t += 1.3) {
        const d = flightOffset(f, planetR, gustTime(t), gust(t), out).length();
        expect(d).toBeLessThanOrEqual(r + wobbleMax + 1e-9);
        expect(d).toBeGreaterThanOrEqual(r - wobbleMax - 1e-9);
      }
    }
  });

  it('궤도면은 한쪽으로 쏠리지 않고 아무 방향으로나 기운다', () => {
    const normal = new Vector3();
    const sum = new Vector3();
    let facing = 0;
    let edgeOn = 0;
    for (const id of ids) {
      normal.set(0, 1, 0).applyQuaternion(flightParams(id).orbit);
      sum.add(normal);
      if (Math.abs(normal.z) > 0.8) facing++;
      if (Math.abs(normal.z) < 0.3) edgeOn++;
    }
    // 화면을 마주 보는 궤도와 옆으로 선 궤도가 섞여 있어야 무질서해 보인다
    expect(facing).toBeGreaterThan(0);
    expect(edgeOn).toBeGreaterThan(0);
    expect(sum.length() / ids.length).toBeLessThan(0.35);
  });

  it('종이 앞면은 노드 바깥쪽을 향하고, 팔랑여도 두 기울기를 더한 각도 안이라 뒤집히지 않는다', () => {
    const q = new Quaternion();
    const front = new Vector3();
    const outward = new Vector3();
    const bound = s.flutterAmp + s.flutterAmp2;
    for (const id of ids.slice(0, 30)) {
      const f = flightParams(id);
      let moved = 0;
      let prev: Quaternion | null = null;
      for (let t = 0; t < 40; t += 0.37) {
        flightOffset(f, 0.3, gustTime(t), gust(t), outward);
        flightQuaternion(f, gustTime(t), outward, q);
        expect(q.length()).toBeCloseTo(1, 9);
        front.set(0, 0, 1).applyQuaternion(q);
        expect(front.angleTo(outward)).toBeLessThanOrEqual(bound + 1e-6);
        if (prev) moved = Math.max(moved, q.angleTo(prev));
        prev = q.clone();
      }
      // 제자리에 굳어 있지 않고 빙글 돌며 팔랑인다
      expect(moved).toBeGreaterThan(0);
    }
  });

  it('카메라를 보지 않는다: 노드 뒤쪽으로 나간 종이는 카메라에 뒷면을 보인다', () => {
    const q = new Quaternion();
    const front = new Vector3();
    const away = new Vector3(0, 0, -1);
    const f = flightParams('0042');
    for (let t = 0; t < 20; t += 0.5) {
      flightQuaternion(f, gustTime(t), away, q);
      front.set(0, 0, 1).applyQuaternion(q);
      // 카메라(+Z 쪽)를 향한 성분이 음수면 뒷면이 보인다
      expect(front.z).toBeLessThan(0);
    }
  });

  it('공전 각속도는 반지름의 1.5 제곱에 반비례한다', () => {
    expect(orbitSpeed(2) / orbitSpeed(1)).toBeCloseTo(Math.pow(1 / 2, 1.5), 12);
    expect(orbitSpeed(0.5) / orbitSpeed(1.5)).toBeCloseTo(Math.pow(3, 1.5), 12);
  });
});

describe('선 그래프', () => {
  const g = c.graph;

  it('허브 단위는 행성 단위의 한 단계 위이고, 연에는 위가 없다', () => {
    expect(parentUnit('year')).toBeNull();
    for (let i = 1; i < PLANET_UNITS.length; i++) expect(parentUnit(PLANET_UNITS[i])).toBe(PLANET_UNITS[i - 1]);
  });

  it('허브는 행성을 위 단위 칸으로 빠짐없이 묶고 노트 수를 더한다', () => {
    const notes = createFakeNotes(NOW);
    for (const unit of PLANET_UNITS) {
      const clusters = clusterNotes(notes, unit);
      const parent = parentUnit(unit);
      const hubs = buildHubs(clusters, parent);
      if (parent === null) {
        expect(hubs).toHaveLength(0);
        continue;
      }
      const seen = new Set<number>();
      let total = 0;
      for (const hub of hubs) {
        expect(hub.anchorTime).toBe(clusters[hub.children[0]].anchorTime);
        let count = 0;
        for (const ci of hub.children) {
          expect(seen.has(ci)).toBe(false);
          seen.add(ci);
          expect(floorTo(parent, clusters[ci].anchorTime)).toBe(hub.bucket);
          count += clusters[ci].members.length;
        }
        expect(hub.notes).toBe(count);
        total += count;
      }
      expect(seen.size).toBe(clusters.length);
      expect(total).toBe(notes.length);
      expect(new Set(hubs.map((h) => h.key)).size).toBe(hubs.length);
    }
  });

  it('허브는 자식들의 평균 깊이에서 안쪽 줄기 위에 놓인다', () => {
    const out = new Vector3();
    hubPoint([4, 8, 12], 2, out);
    expect(out.z).toBeCloseTo(-8, 12);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(c.armRadius * g.hubRadius, 12);
    expect(Math.atan2(out.y, out.x)).toBeCloseTo(Math.atan2(Math.sin(spiralAngle(8, 2)), Math.cos(spiralAngle(8, 2))), 9);
  });

  it('노트 점은 노드 둘레 원판에 퍼지고 순서가 뒤일수록 바깥이며 서로 겹치지 않는다', () => {
    const b = g.burst;
    const pts: Vector3[] = [];
    let prevR = 0;
    for (let k = 0; k < 40; k++) {
      const o = burstOffset(k, 0.3, new Vector3());
      const r = Math.hypot(o.x, o.y);
      expect(r).toBeCloseTo(b.inner + b.spacing * Math.sqrt(k + 0.5), 12);
      expect(r).toBeGreaterThan(prevR);
      expect(Math.abs(o.z)).toBeLessThanOrEqual(b.depthJitter);
      prevR = r;
      pts.push(o);
    }
    let minGap = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) minGap = Math.min(minGap, pts[i].distanceTo(pts[j]));
    // 해바라기 씨 배치는 이웃 점 사이가 간격의 절반보다 가까워지지 않는다
    expect(minGap).toBeGreaterThan(b.spacing * 0.5);
  });

  it('점 색은 노트가 찍힌 시각을 하루를 나눈 칸으로 고른다', () => {
    const n = g.hourColors.length;
    for (let h = 0; h < 24; h++) {
      const i = hourColorIndex(new Date(2026, 10, 15, h, 30).getTime());
      expect(i).toBe(Math.floor((h * n) / 24));
      expect(i).toBeLessThan(n);
    }
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
