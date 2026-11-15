import { describe, expect, it } from 'vitest';
import { UNITS, addUnits, floorTo } from '../src/core/calendar';
import { createRng } from '../src/core/random';

describe('floorTo', () => {
  it('단위 칸의 시작 시각을 낸다', () => {
    const t = new Date(2026, 10, 15, 21, 37, 12).getTime();
    expect(floorTo('year', t)).toBe(new Date(2026, 0, 1).getTime());
    expect(floorTo('month', t)).toBe(new Date(2026, 10, 1).getTime());
    expect(floorTo('day', t)).toBe(new Date(2026, 10, 15).getTime());
    expect(floorTo('hour6', t)).toBe(new Date(2026, 10, 15, 18).getTime());
    expect(floorTo('hour', t)).toBe(new Date(2026, 10, 15, 21).getTime());
    expect(floorTo('min15', t)).toBe(new Date(2026, 10, 15, 21, 30).getTime());
  });

  it('칸 시작은 t 이하이고 다음 칸 시작은 t 보다 크다', () => {
    const rng = createRng(7);
    const base = new Date(2024, 0, 1).getTime();
    for (let i = 0; i < 500; i++) {
      const t = base + Math.floor(rng() * 3 * 365 * 86_400_000);
      for (const unit of UNITS) {
        const start = floorTo(unit, t);
        expect(start).toBeLessThanOrEqual(t);
        expect(addUnits(unit, start, 1)).toBeGreaterThan(t);
        expect(floorTo(unit, start)).toBe(start);
      }
    }
  });
});

describe('addUnits', () => {
  it('달과 해의 경계를 넘는다', () => {
    expect(addUnits('month', new Date(2026, 11, 1).getTime(), 1)).toBe(new Date(2027, 0, 1).getTime());
    expect(addUnits('day', new Date(2026, 10, 30).getTime(), 1)).toBe(new Date(2026, 11, 1).getTime());
    expect(addUnits('hour6', new Date(2026, 10, 30, 18).getTime(), 1)).toBe(new Date(2026, 11, 1).getTime());
    expect(addUnits('year', new Date(2026, 0, 1).getTime(), -2)).toBe(new Date(2024, 0, 1).getTime());
    expect(addUnits('min15', new Date(2026, 10, 15, 23, 45).getTime(), 1)).toBe(new Date(2026, 10, 16).getTime());
  });
});
