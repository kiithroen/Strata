import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import {
  applyQuality,
  matchPreset,
  presetValues,
  qualityDefaults,
  qualityDiff,
  qualityKeys,
  qualityOptions,
  qualityPresets,
  readQuality,
  sanitizeQuality,
} from '../src/core/quality';

describe('sanitizeQuality', () => {
  it('읽을 수 있는 키만 남긴다', () => {
    expect(sanitizeQuality({ pr: 1.5, aa: false, bloom: false, dust: 12, stars: 3, nebula: 'off', tex: 64 })).toEqual({
      pr: 1.5, aa: false, bloom: false, dust: 12, stars: 3, nebula: 'off', tex: 64,
    });
    expect(sanitizeQuality({ nebula: 0 }).nebula).toBe(0);
  });

  it('깨진 값은 버린다', () => {
    expect(sanitizeQuality(null)).toEqual({});
    expect(sanitizeQuality('x')).toEqual({});
    expect(sanitizeQuality({ pr: 0, aa: 1, bloom: 'on', dust: 'abc', stars: -1, nebula: 1.5, tex: Infinity, extra: 3 })).toEqual({});
  });
});

describe('프리셋', () => {
  it('프리셋에 빠진 키는 기본값이다', () => {
    for (const name of qualityPresets) {
      const values = presetValues(name);
      const own = tuning.quality.presets[name] as Record<string, unknown>;
      for (const k of qualityKeys) {
        if (!(k in own)) expect(values[k]).toBe(qualityDefaults[k]);
        else expect(values[k]).toBe(own[k]);
      }
    }
  });

  it('프리셋 값을 그대로 고르면 그 프리셋으로 알아본다', () => {
    for (const name of qualityPresets) {
      const found = matchPreset(presetValues(name));
      expect(found !== null && presetValues(found)).toEqual(presetValues(name));
    }
  });

  it('하나라도 바꾸면 직접 고른 값이다', () => {
    const used = qualityPresets.map((n) => presetValues(n).dust);
    const free = qualityOptions('dust').find((v) => !used.includes(v as number));
    expect(free).toBeDefined();
    for (const name of qualityPresets) expect(matchPreset({ ...presetValues(name), dust: free as number })).toBeNull();
  });

  it('설정 화면 값 목록에 기본값과 모든 프리셋 값이 들어 있다', () => {
    const all = [qualityDefaults, ...qualityPresets.map(presetValues)];
    for (const values of all) {
      for (const k of qualityKeys) expect(qualityOptions(k)).toContain(values[k]);
    }
  });
});

describe('qualityDiff', () => {
  it('기본값과 다른 키만 남기고, 적용하면 원래 값으로 돌아온다', () => {
    for (const name of qualityPresets) {
      const values = presetValues(name);
      const diff = qualityDiff(values);
      for (const k of Object.keys(diff) as (keyof typeof diff)[]) expect(diff[k]).not.toBe(qualityDefaults[k]);
      const t = structuredClone(tuning);
      applyQuality(diff, t);
      expect(readQuality(t)).toEqual(values);
    }
  });
});

describe('applyQuality', () => {
  it('값을 튜닝 값의 제자리에 쓴다', () => {
    const t = structuredClone(tuning);
    applyQuality({ pr: 1.25, aa: false, bloom: !tuning.render.bloom, dust: 11, stars: 22, nebula: 64, tex: 99 }, t);
    expect(t.render.maxPixelRatio).toBe(1.25);
    expect(t.render.antialias).toBe(false);
    expect(t.render.bloom).toBe(!tuning.render.bloom);
    expect(t.cosmos.dust.count).toBe(11);
    expect(t.cosmos.stars.count).toBe(22);
    expect(t.cosmos.nebula.visible).toBe(true);
    expect(t.cosmos.nebula.bakeSize).toBe(64);
    expect(t.card.textureWidth).toBe(99);
  });

  it('nebula 끄기는 성운을 숨기고 굽기 크기는 그대로 둔다', () => {
    const t = structuredClone(tuning);
    applyQuality({ nebula: 'off' }, t);
    expect(t.cosmos.nebula.visible).toBe(false);
    expect(t.cosmos.nebula.bakeSize).toBe(tuning.cosmos.nebula.bakeSize);
    expect(readQuality(t).nebula).toBe('off');
  });

  it('빈 값은 아무것도 바꾸지 않는다', () => {
    const t = structuredClone(tuning);
    applyQuality({}, t);
    expect(t).toEqual(tuning);
  });
});
