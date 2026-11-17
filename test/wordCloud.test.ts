import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { farCardHide, layoutCloud, screenFraction, topTags, wordBox } from '../src/widgets/cloud/wordCloud';

const c = tuning.cloud;

describe('topTags', () => {
  it('많이 쓰인 순서로 max 개까지, 같은 수면 글자 순서로 낸다', () => {
    const lists = [['여행', '음식'], ['여행'], undefined, ['산책', '음식', '여행'], ['카페']];
    expect(topTags(lists, 3)).toEqual([
      { text: '여행', count: 3 },
      { text: '음식', count: 2 },
      { text: '산책', count: 1 },
    ]);
    expect(topTags([], 3)).toEqual([]);
  });
});

describe('layoutCloud', () => {
  const words = topTags(
    [['여행', '음식', '산책'], ['여행', '음식'], ['여행', '아이디어'], ['여행', 'receipt'], ['일상']],
    c.maxWords,
  );

  it('가장 많이 쓰인 낱말이 가장 크고 가운데에 놓인다', () => {
    const placed = layoutCloud(words);
    expect(placed[0].text).toBe('여행');
    expect(placed[0].px).toBe(c.px[1]);
    expect(placed[0].x).toBe(0);
    expect(placed[0].y).toBe(0);
    for (const p of placed) {
      expect(p.px).toBeGreaterThanOrEqual(c.px[0]);
      expect(p.px).toBeLessThanOrEqual(c.px[1]);
    }
  });

  it('낱말 상자끼리 여백을 두고 겹치지 않는다', () => {
    const placed = layoutCloud(words);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const ab = wordBox(a.text, a.px);
        const bb = wordBox(b.text, b.px);
        const apartX = Math.abs(a.x - b.x) * 2 >= ab.w + bb.w + c.gapPx * 2 - 1e-9;
        const apartY = Math.abs(a.y - b.y) * 2 >= ab.h + bb.h + c.gapPx * 2 - 1e-9;
        expect(apartX || apartY).toBe(true);
      }
    }
  });

  it('같은 입력이면 같은 배치다', () => {
    expect(layoutCloud(words)).toEqual(layoutCloud(words));
    expect(layoutCloud([])).toEqual([]);
  });
});

describe('farCardHide', () => {
  it('카드가 cloud.hide 범위로 작아질수록 사라진다', () => {
    expect(farCardHide(c.hide[0] * 1.5)).toBe(0);
    expect(farCardHide(c.hide[1] * 0.5)).toBe(1);
    const mid = farCardHide((c.hide[0] + c.hide[1]) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    let prev = farCardHide(1);
    for (let s = 0.2; s > 0.001; s *= 0.9) {
      const v = farCardHide(s);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('screenFraction', () => {
  it('거리가 두 배면 화면 비율이 절반이다', () => {
    const p11 = 1 / Math.tan((tuning.camera.fovDeg * Math.PI) / 360);
    expect(screenFraction(1, 4, p11)).toBeCloseTo(screenFraction(1, 2, p11) / 2, 12);
  });
});
