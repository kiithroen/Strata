import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { runnerVariation } from '../src/widgets/noteCard/borderRunner';

describe('runnerVariation', () => {
  const j = tuning.card.border.runnerJitter;
  const ids = Array.from({ length: 400 }, (_, i) => String(i + 1).padStart(4, '0'));

  it('같은 번호면 같고, 배율은 설정 범위 안이다', () => {
    for (const id of ids) {
      const v = runnerVariation(id);
      expect(runnerVariation(id)).toEqual(v);
      expect(Math.abs(v.speed)).toBeGreaterThanOrEqual(j.speed[0]);
      expect(Math.abs(v.speed)).toBeLessThanOrEqual(j.speed[1]);
      expect(v.tail).toBeGreaterThanOrEqual(j.tail[0]);
      expect(v.tail).toBeLessThanOrEqual(j.tail[1]);
      expect(v.strength).toBeGreaterThanOrEqual(j.strength[0]);
      expect(v.strength).toBeLessThanOrEqual(j.strength[1]);
    }
  });

  it('카드마다 고루 다르고, 반대로 도는 카드는 대략 설정 비율이다', () => {
    const vs = ids.map(runnerVariation);
    const reversed = vs.filter((v) => v.speed < 0).length / vs.length;
    expect(Math.abs(reversed - j.reverse)).toBeLessThan(0.08);
    const speeds = vs.map((v) => Math.abs(v.speed));
    const mid = (j.speed[0] + j.speed[1]) / 2;
    expect(speeds.filter((s) => s < mid).length / speeds.length).toBeGreaterThan(0.4);
    expect(speeds.filter((s) => s < mid).length / speeds.length).toBeLessThan(0.6);
    expect(new Set(vs.map((v) => v.tail.toFixed(3))).size).toBeGreaterThan(300);
  });
});
