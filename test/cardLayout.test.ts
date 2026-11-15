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
  ])('%ix%i 사진의 비율을 지키고 폴라로이드 아래 여백이 사진 아래에 붙는다', (w, h) => {
    const l = cardLayout(w, h);
    expect(l.kind).toBe('photo');
    expect(l.textureWidth).toBe(tuning.card.textureWidth);
    expect(Math.abs(l.photo.height - (l.photo.width * h) / w)).toBeLessThanOrEqual(0.5);
    expect(l.label.y).toBe(l.photo.y + l.photo.height);
    expect(l.textureHeight).toBe(l.padding + l.photo.height + l.label.height);
    expect(l.worldWidth).toBe(tuning.card.width);
    expect(l.worldWidth / l.worldHeight).toBeCloseTo(l.textureWidth / l.textureHeight, 12);
  });
});

describe('faceLayout', () => {
  it('짧은 노트(memo)는 정사각 포스트잇 비율이고 긴 문서(doc)는 A4 비율이다', () => {
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
});

describe('formatStamp', () => {
  it('YYYY.MM.DD HH:mm 로 두 자리를 채운다', () => {
    expect(formatStamp(new Date(2026, 0, 5, 7, 3))).toBe('2026.01.05 07:03');
  });
});
