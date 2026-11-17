import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { CardField } from '../src/widgets/noteCard/cardField';
import { createPose } from '../src/widgets/noteCard/cardMotion';
import { generateField } from '../src/widgets/noteCard/field';

const f = tuning.field;
const fovDeg = tuning.camera.fovDeg;

describe('CardField', () => {
  it('자리는 가까운 것부터이고 카드가 많으면 그만큼 깊어진다', () => {
    const few = new CardField(f.count, 1, fovDeg);
    const many = new CardField(f.count * 4, 1, fovDeg);
    for (let i = 1; i < many.slots.length; i++) expect(many.slots[i].depth).toBeGreaterThanOrEqual(many.slots[i - 1].depth);
    const deepest = (c: CardField) => c.slots[c.slots.length - 1].depth;
    expect(deepest(few)).toBeLessThanOrEqual(f.depthFar);
    expect(deepest(many)).toBeGreaterThan(f.depthFar * 2);
    expect(many.maxOffset).toBeCloseTo(deepest(many) - f.depthNear, 9);
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
});

describe('generateField 긴 통로', () => {
  it('field.depthFar 보다 깊은 자리는 그 깊이의 폭 안에 퍼진다', () => {
    const halfTan = Math.tan((fovDeg * Math.PI) / 360);
    const far = f.depthFar * 3;
    const slots = generateField(f.count * 3, 5, fovDeg, far);
    expect(slots.some((s) => s.depth > f.depthFar)).toBe(true);
    for (const s of slots) {
      expect(s.depth).toBeLessThanOrEqual(far);
      const half = Math.min(s.depth, f.depthFar) * halfTan;
      expect(Math.abs(s.x)).toBeLessThanOrEqual(f.spreadX * half + 1e-9);
      expect(Math.abs(s.y)).toBeLessThanOrEqual(f.spreadY * half + 1e-9);
    }
  });
});
