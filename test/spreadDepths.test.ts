import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { depthWarp, planetJitter, spiralPoint, spreadDepths, type PlanetJitter } from '../src/widgets/cosmos/cosmosModel';

const NONE: PlanetJitter = { radiusScale: 1, angleOffset: 0, elevationOffset: 0 };
const GAP = 2.5;

function points(depths: readonly number[], jitters?: readonly PlanetJitter[]): Vector3[] {
  return depths.map((d, i) => spiralPoint(d, 0, jitters?.[i] ?? NONE, new Vector3()));
}

function minDistance(ps: readonly Vector3[]): number {
  let min = Infinity;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) min = Math.min(min, ps[i].distanceTo(ps[j]));
  return min;
}

/** 같은 때 몰린 노드(폴더 축)와 로그로 눌려 붙은 옛 노드가 섞인 깊이 */
const crowded = [0, 0.01, 0.02, 0.02, 0.5, 3, 3.1, 40, 41, 42, 43, 44, 300, 301];

describe('spreadDepths', () => {
  it('가까운 노드를 밀어 모든 노드가 minGap 이상 떨어진다', () => {
    expect(minDistance(points(crowded))).toBeLessThan(GAP);
    expect(minDistance(points(spreadDepths(crowded, GAP)))).toBeGreaterThanOrEqual(GAP - 1e-6);
  });

  it('노드마다의 편차를 넘기면 편차까지 넣어 떨어진다', () => {
    const jitters = crowded.map((_, i) => planetJitter(`k${i}`));
    expect(minDistance(points(spreadDepths(crowded, GAP, jitters), jitters))).toBeGreaterThanOrEqual(GAP - 1e-6);
  });

  it('촘촘한 노드가 많아도 하나 건너 노드와도 붙지 않는다', () => {
    const dense = Array.from({ length: 80 }, (_, i) => i * 0.05);
    const jitters = dense.map((_, i) => planetJitter(`dense${i}`));
    expect(minDistance(points(spreadDepths(dense, GAP, jitters), jitters))).toBeGreaterThanOrEqual(GAP - 1e-6);
  });

  it('순서를 지키고 바깥으로만 밀며, 이미 떨어진 노드는 그대로 둔다', () => {
    const out = spreadDepths(crowded, GAP);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBeGreaterThanOrEqual(crowded[i] - 1e-9);
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1] - 1e-9);
    expect(out[0]).toBe(crowded[0]);
    const sparse = [0, 5, 60, 900];
    expect(minDistance(points(sparse))).toBeGreaterThan(GAP);
    expect(spreadDepths(sparse, GAP)).toEqual(sparse);
  });

  it('미래(음수) 쪽도 원점에서 바깥으로 따로 민다', () => {
    const both = [0.01, -0.01, 0.02, -0.02];
    const out = spreadDepths(both, GAP);
    expect(Math.sign(out[1])).toBe(-1);
    expect(Math.sign(out[3])).toBe(-1);
    expect(out[3]).toBeLessThan(out[1]);
    expect(points([out[0], out[2]])[0].distanceTo(points([out[2]])[0])).toBeGreaterThanOrEqual(GAP - 1e-6);
    expect(points([out[1]])[0].distanceTo(points([out[3]])[0])).toBeGreaterThanOrEqual(GAP - 1e-6);
  });

  it('minGap 이 0이면 그대로다', () => {
    expect(spreadDepths(crowded, 0)).toEqual(crowded);
  });
});

describe('depthWarp', () => {
  const times = [1000, 800, 600];
  const base = [0, 1, 2];
  const spread = [0, 3, 7];
  const warp = depthWarp(times, base, spread);

  it('노드 시각에서는 그 노드가 민 깊이가 된다', () => {
    times.forEach((t, i) => expect(warp(t, base[i])).toBeCloseTo(spread[i], 12));
  });

  it('노드 사이는 민 양을 시각으로 선형 보간하고, 바깥은 끝 노드가 민 양을 쓴다', () => {
    // 700 은 800(민 양 2)과 600(민 양 5)의 가운데다
    expect(warp(700, 1.5)).toBeCloseTo(1.5 + 3.5, 12);
    expect(warp(2000, -5)).toBeCloseTo(-5, 12);
    expect(warp(100, 4.5)).toBeCloseTo(4.5 + 5, 12);
  });

  it('노드가 없으면 그대로다', () => {
    expect(depthWarp([], [], [])(5, 3)).toBe(3);
  });
});
