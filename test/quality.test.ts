import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { applyQuality, parseQuality } from '../src/core/quality';

const presets = tuning.quality.presets;

describe('parseQuality', () => {
  it('키가 없으면 아무것도 덮어쓰지 않는다', () => {
    expect(parseQuality('?w=cosmos&perf')).toEqual({});
  });

  it('개별 키를 읽는다', () => {
    expect(parseQuality('?pr=1.5&aa=0&dust=1200&stars=300&nebula=256&seg=4&tex=200')).toEqual({
      pr: 1.5, aa: false, dust: 1200, stars: 300, nebula: 256, seg: 4, tex: 200,
    });
    expect(parseQuality('?nebula=off').nebula).toBe('off');
    expect(parseQuality('?nebula=0').nebula).toBe(0);
  });

  it('읽을 수 없는 값은 버린다', () => {
    expect(parseQuality('?pr=0&dust=abc&seg=0&aa=maybe&nebula=-3&tex=')).toEqual({});
  });

  it('프리셋을 깔고 개별 키가 그 위에 덮어쓴다', () => {
    for (const [name, values] of Object.entries(presets)) {
      const base = parseQuality(`?q=${name}`);
      expect(Object.keys(base).sort()).toEqual(Object.keys(values).sort());
      const over = parseQuality(`?q=${name}&dust=7`);
      expect(over).toEqual({ ...base, dust: 7 });
    }
  });

  it('모르는 프리셋은 무시한다', () => {
    expect(parseQuality('?q=ultra')).toEqual({});
  });
});

describe('applyQuality', () => {
  it('덮어쓰기를 튜닝 값의 제자리에 쓴다', () => {
    const t = structuredClone(tuning);
    applyQuality({ pr: 1.25, aa: false, dust: 11, stars: 22, nebula: 64, seg: 3, tex: 99 }, t);
    expect(t.render.maxPixelRatio).toBe(1.25);
    expect(t.render.antialias).toBe(false);
    expect(t.cosmos.dust.count).toBe(11);
    expect(t.cosmos.stars.count).toBe(22);
    expect(t.cosmos.nebula.visible).toBe(true);
    expect(t.cosmos.nebula.bakeSize).toBe(64);
    expect(t.card.segments).toBe(3);
    expect(t.card.textureWidth).toBe(99);
  });

  it('nebula=off 는 성운을 숨기고 굽기 크기는 그대로 둔다', () => {
    const t = structuredClone(tuning);
    applyQuality({ nebula: 'off' }, t);
    expect(t.cosmos.nebula.visible).toBe(false);
    expect(t.cosmos.nebula.bakeSize).toBe(tuning.cosmos.nebula.bakeSize);
  });

  it('빈 덮어쓰기는 아무것도 바꾸지 않는다', () => {
    const t = structuredClone(tuning);
    applyQuality({}, t);
    expect(t).toEqual(tuning);
  });
});
