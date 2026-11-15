import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { approachFactor, damp } from '../src/core/motion';

const RATES = [tuning.focus.rate, tuning.focus.dimRate, tuning.axis.timeRate, tuning.axis.scaleRate, tuning.axis.layoutRate];
const REFRESH = [30, 60, 90, 120, 144];

describe('approachFactor', () => {
  it('두 번 나눠 진행해도 한 번에 진행한 것과 같다', () => {
    for (const rate of RATES) {
      const half = approachFactor(rate, 0.01);
      const full = approachFactor(rate, 0.02);
      expect((1 - half) * (1 - half)).toBeCloseTo(1 - full, 12);
    }
  });

  it('dt 가 0 이하이면 움직이지 않는다', () => {
    expect(approachFactor(RATES[0], 0)).toBe(0);
    expect(approachFactor(RATES[0], -1)).toBe(0);
  });
});

describe('damp', () => {
  it('같은 게임 시간이 흐르면 주사율과 상관없이 같은 값에 닿는다', () => {
    for (const rate of RATES) {
      const results = REFRESH.map((hz) => {
        let v = 0;
        const steps = hz / 2; // 0.5초
        for (let i = 0; i < steps; i++) v = damp(v, 1, rate, 1 / hz);
        return v;
      });
      for (const r of results) expect(r).toBeCloseTo(results[0], 10);
    }
  });
});
