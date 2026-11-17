import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { CardField } from '../src/widgets/noteCard/cardField';
import { createPose } from '../src/widgets/noteCard/cardMotion';
import { generateField } from '../src/widgets/noteCard/field';

const f = tuning.field;
const fovDeg = tuning.camera.fovDeg;

describe('CardField', () => {
  it('자리는 가까운 것부터이고, 깊이 범위는 카드 수에 비례하되 최소 범위가 있다', () => {
    const c = tuning.cardField;
    const deepest = (field: CardField) => field.slots[field.slots.length - 1].depth;
    const few = new CardField(3, 1, fovDeg);
    for (const s of few.slots) {
      expect(s.depth).toBeGreaterThanOrEqual(c.depthNear);
      expect(s.depth).toBeLessThanOrEqual(c.depthNear + c.minSpan);
    }
    const count = Math.ceil(c.minSpan * c.cardsPerDepth * 5);
    const many = new CardField(count, 1, fovDeg);
    for (let i = 1; i < many.slots.length; i++) expect(many.slots[i].depth).toBeGreaterThanOrEqual(many.slots[i - 1].depth);
    expect(deepest(many)).toBeLessThanOrEqual(c.depthNear + count / c.cardsPerDepth);
    expect(deepest(many)).toBeGreaterThan(c.depthNear + c.minSpan * 3);
    expect(many.maxOffset).toBeCloseTo(deepest(many) - c.depthNear, 9);
  });

  it('cardField.spreadDepth 보다 깊어도 그 깊이의 폭 안에 퍼진다', () => {
    const c = tuning.cardField;
    const halfTan = Math.tan((fovDeg * Math.PI) / 360);
    const field = new CardField(Math.ceil(c.minSpan * c.cardsPerDepth * 5), 6, fovDeg);
    for (const s of field.slots) {
      const half = Math.min(s.depth, c.spreadDepth) * halfTan;
      expect(Math.abs(s.x)).toBeLessThanOrEqual(f.spreadX * c.spread * half + 1e-9);
      expect(Math.abs(s.y)).toBeLessThanOrEqual(f.spreadY * c.spread * half + 1e-9);
    }
  });

  it('앞뒤 이동 목표는 0~maxOffset 으로 잘린다', () => {
    const field = new CardField(f.count * 2, 2, fovDeg);
    field.dolly(-5);
    expect(field.goalOffset).toBe(0);
    field.dolly(field.maxOffset * 10);
    expect(field.goalOffset).toBe(field.maxOffset);
  });

  it('앞뒤 이동은 주사율과 무관하게 게임 시간만큼 목표에 다가간다', () => {
    const run = (hz: number) => {
      const field = new CardField(f.count * 2, 3, fovDeg);
      field.dolly(field.maxOffset);
      const dt = 1 / hz;
      for (let i = 0; i < Math.round(0.5 * hz); i++) field.step(dt);
      return field.offset;
    };
    expect(run(30)).toBeCloseTo(run(144), 6);
    expect(run(60)).toBeGreaterThan(0);
  });

  it('들어간 만큼 카메라 쪽으로 다가오고, 가까워지면 사라진다', () => {
    const field = new CardField(f.count, 4, fovDeg);
    const [d0, d1] = tuning.cardField.nearFade;
    const pose = createPose();
    const s = field.slots[0];
    expect(field.localPose(0, pose).position.z).toBeCloseTo(-s.depth, 9);
    if (s.depth >= d1) expect(field.fade(0)).toBe(1);
    field.dolly(s.depth - (d0 + d1) / 2);
    for (let i = 0; i < 600; i++) field.step(1 / 60);
    expect(field.localPose(0, pose).position.z).toBeCloseTo(-(d0 + d1) / 2, 3);
    expect(field.fade(0)).toBeGreaterThan(0);
    expect(field.fade(0)).toBeLessThan(1);
    field.dolly(d1);
    for (let i = 0; i < 600; i++) field.step(1 / 60);
    expect(field.fade(0)).toBe(0);
  });

  it('자리 여럿의 가운데는 그 자리들의 카메라 공간 평균이고, 그 깊이에서 가까워지면 사라진다', () => {
    const field = new CardField(f.count, 5, fovDeg);
    const [d0, d1] = tuning.cardField.nearFade;
    const pick = [1, 4, 7];
    const pose = createPose();
    const mean = new Vector3();
    for (const i of pick) mean.add(field.localPose(i, pose).position);
    mean.divideScalar(pick.length);
    const out = new Vector3();
    field.centroid(pick, out);
    expect(out.distanceTo(mean)).toBeLessThan(1e-9);
    // 가운데 깊이를 사라지는 구간 가운데로 데려오면 반쯤 보인다
    field.dolly(-mean.z - (d0 + d1) / 2);
    for (let i = 0; i < 600; i++) field.step(1 / 60);
    const seen = field.centroid(pick, out);
    expect(out.z).toBeCloseTo(-(d0 + d1) / 2, 3);
    expect(seen).toBeGreaterThan(0.2);
    expect(seen).toBeLessThan(0.8);
    expect(field.centroid([], out)).toBe(0);
  });
});

describe('CardField 화면 비율', () => {
  const c = tuning.cardField;
  const halfTan = Math.tan((fovDeg * Math.PI) / 360);

  it('세로로 긴 화면에서는 1/√비율만큼 멀리 두고, 좌우·위아래 퍼짐은 화면 안 상한을 넘지 않는다', () => {
    const aspect = 0.45;
    const tall = 1 / Math.sqrt(aspect);
    const wide = new CardField(40, 7, fovDeg, 1.8);
    const narrow = new CardField(40, 7, fovDeg, aspect);
    expect(narrow.slots[0].depth).toBeGreaterThanOrEqual(c.depthNear * tall - 1e-9);
    expect(wide.slots[0].depth).toBeLessThan(c.depthNear * tall);
    for (const s of narrow.slots) {
      const half = Math.min(s.depth, c.spreadDepth * tall) * halfTan;
      expect(Math.abs(s.x)).toBeLessThanOrEqual(aspect * c.fitWidth * half + 1e-9);
      expect(Math.abs(s.y)).toBeLessThanOrEqual(c.fitHeight * half + 1e-9);
    }
  });
});

describe('generateField 긴 통로', () => {
  it('field.depthFar 보다 깊은 자리는 그 깊이의 폭 안에 퍼진다', () => {
    const halfTan = Math.tan((fovDeg * Math.PI) / 360);
    const far = f.depthFar * 3;
    const slots = generateField(f.count * 3, 5, fovDeg, { depthFar: far, spreadDepth: f.depthFar });
    expect(slots.some((s) => s.depth > f.depthFar)).toBe(true);
    for (const s of slots) {
      expect(s.depth).toBeLessThanOrEqual(far);
      const half = Math.min(s.depth, f.depthFar) * halfTan;
      expect(Math.abs(s.x)).toBeLessThanOrEqual(f.spreadX * half + 1e-9);
      expect(Math.abs(s.y)).toBeLessThanOrEqual(f.spreadY * half + 1e-9);
    }
  });
});
