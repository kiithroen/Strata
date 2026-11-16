import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { formatStamp } from '../src/core/format';
import { cardLayout, faceLayout } from '../src/widgets/noteCard/cardLayout';

describe('cardLayout', () => {
  it.each([
    [640, 480],
    [480, 640],
    [560, 560],
    [640, 360],
  ])('%ix%i 사진의 비율을 지키고 제목 줄·사진·상태 줄이 위에서부터 이어진다', (w, h) => {
    const l = cardLayout(w, h);
    expect(l.kind).toBe('photo');
    expect(l.textureWidth).toBe(tuning.card.textureWidth);
    expect(Math.abs(l.content.height - (l.content.width * h) / w)).toBeLessThanOrEqual(0.5);
    expect(l.titleBar.y).toBe(0);
    expect(l.content.y).toBe(l.titleBar.height + l.padding);
    expect(l.footer.y).toBe(l.content.y + l.content.height);
    expect(l.footer.y + l.footer.height).toBe(l.textureHeight);
    expect(l.worldWidth).toBe(tuning.card.width);
    expect(l.worldWidth / l.worldHeight).toBeCloseTo(l.textureWidth / l.textureHeight, 12);
  });

  it('텍스처 폭을 바꿔도 칸의 비율은 같다', () => {
    const tw = [tuning.card.simpleTextureWidth, tuning.card.textureWidth, tuning.card.detailTextureWidth];
    for (const kind of ['photo', 'memo', 'doc'] as const) {
      const [a, b, c] = tw.map((t) => faceLayout(kind, { width: 640, height: 480 }, t));
      for (const l of [a, c]) {
        // 픽셀로 반올림하므로 가장 작은 텍스처의 한 칸 정도는 어긋날 수 있다
        const tol = 1.5 / Math.min(l.textureWidth, b.textureWidth);
        expect(l.content.y / l.textureHeight).toBeCloseTo(b.content.y / b.textureHeight, 1);
        expect(Math.abs(l.ring.x / l.textureWidth - b.ring.x / b.textureWidth)).toBeLessThanOrEqual(tol);
        expect(l.worldWidth).toBe(b.worldWidth);
      }
    }
  });
});

describe('faceLayout', () => {
  it('짧은 노트(memo)는 정사각이고 긴 문서(doc)는 A4 비율이다', () => {
    const memo = faceLayout('memo');
    expect(memo.kind).toBe('memo');
    expect(memo.textureHeight).toBe(memo.textureWidth);
    expect(memo.worldWidth).toBeCloseTo(tuning.card.width * tuning.card.memo.widthScale, 12);
    expect(memo.worldHeight).toBeCloseTo(memo.worldWidth, 12);

    const doc = faceLayout('doc');
    expect(doc.kind).toBe('doc');
    expect(doc.worldWidth).toBeCloseTo(tuning.card.width * tuning.card.doc.widthScale, 12);
    expect(doc.worldHeight / doc.worldWidth).toBeCloseTo(Math.SQRT2, 2);
  });

  it('고리는 제목 줄 안 왼쪽에 있다', () => {
    for (const kind of ['photo', 'memo', 'doc'] as const) {
      const l = faceLayout(kind);
      expect(l.ring.y).toBeCloseTo(l.titleBar.height / 2, 9);
      expect(l.ring.x - l.ring.size / 2).toBeGreaterThanOrEqual(0);
      expect(l.ring.x + l.ring.size / 2).toBeLessThan(l.textureWidth / 2);
      expect(l.ring.size).toBeLessThan(l.titleBar.height);
    }
  });
});

describe('formatStamp', () => {
  it('YYYY.MM.DD HH:mm 로 두 자리를 채운다', () => {
    expect(formatStamp(new Date(2026, 0, 5, 7, 3))).toBe('2026.01.05 07:03');
  });
});
