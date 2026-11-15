import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { createFakeNotes } from '../src/dev/fakeNotes';
import { createPose } from '../src/widgets/noteCard/cardMotion';
import { clusterNotes, depthOf, levelLogScale } from '../src/widgets/timeAxis/axisModel';
import {
  createPlacement,
  depthFade,
  laneRoom,
  laneSpot,
  placementPose,
  placementTargets,
  stepPlacement,
} from '../src/widgets/timeAxis/placement';

const a = tuning.axis;
const { fovDeg } = tuning.camera;
const NOW = new Date(2026, 10, 15, 21, 30).getTime();

describe('laneSpot', () => {
  it('고리 안쪽 반지름과 바깥 반지름 사이에 놓이고 화면비를 따른다', () => {
    const l = a.lane;
    for (const aspect of [0.45, 1, 1.8]) {
      const room = laneRoom(aspect, fovDeg);
      for (let i = 0; i < 300; i++) {
        const s = laneSpot(i, aspect, fovDeg);
        const u = s.x / (l.halfWidth * room.halfWidth);
        const v = (s.y - l.centerY * room.screenHalfHeight) / (l.halfHeight * room.halfHeight);
        const r2 = u * u + v * v;
        expect(r2).toBeLessThanOrEqual(1 + 1e-9);
        expect(r2).toBeGreaterThanOrEqual(l.innerRatio * l.innerRatio - 1e-9);
        expect(laneSpot(i, aspect, fovDeg)).toEqual(s);
      }
    }
  });
});

describe('laneRoom', () => {
  it('비율 1 고리 끝에 놓인 카드도 초점면에서 화면 폭 안에 들어온다', () => {
    for (const aspect of [0.42, 0.75, 1, 1.6]) {
      const room = laneRoom(aspect, fovDeg);
      const screenHalfWidth = room.screenHalfHeight * aspect;
      expect(room.halfWidth + (tuning.card.width * a.cardScale) / 2).toBeLessThanOrEqual(screenHalfWidth + 1e-9);
    }
  });
});

describe('placementTargets', () => {
  it('묶음 안 카드는 대표 자리와 시각을 함께 쓰고 정해진 장수까지만 보인다', () => {
    const notes = createFakeNotes(NOW);
    const clusters = clusterNotes(notes, 'month');
    const spots = notes.map((_, i) => laneSpot(i, 0.5, fovDeg));
    const out = notes.map(createPlacement);
    placementTargets(clusters, spots, out);
    for (const c of clusters) {
      const top = spots[c.members[0]];
      c.members.forEach((m, k) => {
        expect(out[m].time).toBe(c.anchorTime);
        expect(out[m].x).toBe(top.x);
        expect(out[m].y).toBe(top.y);
        expect(out[m].stack).toBe(Math.min(k, a.stack.visible - 1));
        expect(out[m].visible).toBe(k < a.stack.visible ? 1 : 0);
      });
    }
  });
});

describe('placementPose', () => {
  it('깊이는 시각의 깊이에 쌓인 만큼 더한 값이고 카드는 카메라 쪽을 향한다', () => {
    const state = { focusTime: NOW, logScale: levelLogScale('day') };
    const pose = createPose();
    for (const stack of [0, 1, 2.5]) {
      const p = { time: NOW - 5 * 3_600_000, x: 1.1, y: -0.6, stack, visible: 1 };
      const depth = placementPose(p, state, pose);
      expect(depth).toBeCloseTo(depthOf(state, p.time) + stack * a.stack.dz, 9);
      expect(pose.position.z).toBeCloseTo(-depth, 9);
      const normal = new Vector3(0, 0, 1).applyQuaternion(pose.quaternion);
      const toCamera = pose.position.clone().negate().normalize();
      if (a.faceCamera > 0) expect(normal.dot(toCamera)).toBeGreaterThan(new Vector3(0, 0, 1).dot(toCamera));
    }
  });
});

describe('stepPlacement', () => {
  it('같은 게임 시간이면 주사율과 상관없이 같은 자리에 닿는다', () => {
    const target = { time: NOW, x: 1, y: -1, stack: 2, visible: 0 };
    const run = (hz: number) => {
      const p = { time: NOW - 30 * 86_400_000, x: -1, y: 1, stack: 0, visible: 1 };
      for (let i = 0; i < hz / 6; i++) stepPlacement(p, target, 1 / hz);
      return p;
    };
    const ref = run(60);
    for (const hz of [30, 120, 144]) {
      const p = run(hz);
      expect(Math.abs(p.time - ref.time)).toBeLessThan(1);
      expect(p.x).toBeCloseTo(ref.x, 9);
      expect(p.stack).toBeCloseTo(ref.stack, 9);
      expect(p.visible).toBeCloseTo(ref.visible, 9);
    }
  });
});

describe('depthFade', () => {
  it('가까이와 먼 끝에서 사라지고 그 사이에서는 다 보인다', () => {
    expect(depthFade(a.nearDepth * 0.5)).toBe(0);
    expect(depthFade(a.nearDepth)).toBe(0);
    expect(depthFade(a.fadeNearStart)).toBe(1);
    expect(depthFade((a.fadeNearStart + a.fogFar) / 2)).toBe(1);
    expect(depthFade(a.farDepth)).toBe(0);
    let prev = 0;
    for (let d = a.nearDepth; d <= a.fadeNearStart; d += 0.05) {
      const f = depthFade(d);
      expect(f).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = f;
    }
  });
});
