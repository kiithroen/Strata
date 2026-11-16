import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { FrameStats } from '../src/core/frameStats';

const DROP = tuning.perf.dropRatio;

describe('FrameStats', () => {
  it('비어 있으면 0을 낸다', () => {
    const s = new FrameStats(8, DROP).summary();
    expect(s.frames).toBe(0);
    expect(s.fps).toBe(0);
  });

  it('고른 간격이면 fps 가 간격의 역수이고 끊김이 없다', () => {
    for (const hz of [60, 90, 120]) {
      const stats = new FrameStats(120, DROP);
      for (let i = 0; i < 120; i++) stats.push(1000 / hz, 1, 2);
      const s = stats.summary();
      expect(s.fps).toBeCloseTo(hz, 6);
      expect(s.medianMs).toBeCloseTo(1000 / hz, 9);
      expect(s.dropped).toBe(0);
      expect(s.updateAvgMs).toBeCloseTo(1, 9);
      expect(s.renderAvgMs).toBeCloseTo(2, 9);
    }
  });

  it('중앙값 × dropRatio 를 넘는 간격만 끊김으로 센다', () => {
    const base = 1000 / 60;
    const stats = new FrameStats(100, DROP);
    const long = [base * DROP * 1.01, base * DROP * 2, base * DROP * 3];
    const almost = base * DROP * 0.99;
    for (let i = 0; i < 100 - long.length - 1; i++) stats.push(base, 0, 0);
    stats.push(almost, 0, 0);
    for (const v of long) stats.push(v, 0, 0);
    const s = stats.summary();
    expect(s.dropped).toBe(long.length);
    expect(s.droppedRatio).toBeCloseTo(long.length / 100, 9);
    expect(s.maxMs).toBeCloseTo(Math.max(...long), 9);
  });

  it('용량을 넘으면 오래된 프레임을 버린다', () => {
    const stats = new FrameStats(10, DROP);
    for (let i = 0; i < 10; i++) stats.push(50, 9, 9);
    for (let i = 0; i < 10; i++) stats.push(10, 1, 1);
    const s = stats.summary();
    expect(s.frames).toBe(10);
    expect(s.maxMs).toBe(10);
    expect(s.updateMaxMs).toBe(1);
  });

  it('p95 는 느린 쪽 5% 경계다', () => {
    const stats = new FrameStats(100, DROP);
    for (let i = 1; i <= 100; i++) stats.push(i, 0, 0);
    expect(stats.summary().p95Ms).toBe(95);
  });
});
