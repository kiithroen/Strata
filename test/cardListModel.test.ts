import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { buildCardSections, countItems, photoBoxRatio } from '../src/widgets/cardList/cardListModel';

describe('buildCardSections', () => {
  const t = (d: number, h: number) => new Date(2026, 10, d, h).getTime();
  const notes = [
    { id: '0004', time: t(15, 9), kind: 'memo' as const, title: '메모', tags: ['일상'] },
    { id: '0003', time: t(15, 20) },
    { id: '0002', time: t(14, 8), kind: 'doc' as const, body: '글' },
    { id: '0001', time: t(13, 7) },
  ];
  const photo = { width: 4, height: 3, render: () => { throw new Error('그리지 않는다'); } };
  const photos = [undefined, photo, undefined, photo];

  it('묶음 순서는 그대로, 묶음 안은 최근 것부터 놓고 빈 묶음은 뺀다', () => {
    const sections = buildCardSections(
      [
        { key: 'a', label: '15일', members: [0, 1] },
        { key: 'empty', label: '없음', members: [] },
        { key: 'b', label: '13~14일', members: [3, 2] },
      ],
      notes,
      photos,
    );
    expect(sections.map((s) => s.key)).toEqual(['a', 'b']);
    expect(sections[0].items.map((i) => i.id)).toEqual(['0003', '0004']);
    expect(sections[1].items.map((i) => i.id)).toEqual(['0002', '0001']);
    expect(countItems(sections)).toBe(4);
  });

  it('종류가 없으면 사진이고 태그가 없으면 빈 목록이며, 사진은 같은 번호의 것을 붙인다', () => {
    const [section] = buildCardSections([{ key: 'a', label: '', members: [1, 0] }], notes, photos);
    const [newest, memo] = section.items;
    expect(newest).toMatchObject({ kind: 'photo', tags: [], photo });
    expect(memo).toMatchObject({ kind: 'memo', title: '메모', tags: ['일상'] });
    expect(memo.photo).toBeUndefined();
  });

  it('없는 노트 번호는 건너뛴다', () => {
    const sections = buildCardSections([{ key: 'a', label: '', members: [9, 2] }], notes, photos);
    expect(sections[0].items.map((i) => i.id)).toEqual(['0002']);
  });
});

describe('photoBoxRatio', () => {
  const [lo, hi] = tuning.cardList.photoAspect;

  it('범위 안의 사진은 원래 비율이고 길쭉한 사진은 범위로 자른다', () => {
    const mid = (lo + hi) / 2;
    expect(photoBoxRatio({ width: 1000, height: 1000 * mid }, tuning.cardList.photoAspect)).toBeCloseTo(mid, 6);
    expect(photoBoxRatio({ width: 1000, height: 1000 * hi * 3 }, tuning.cardList.photoAspect)).toBeCloseTo(hi, 6);
    expect(photoBoxRatio({ width: 1000, height: (1000 * lo) / 3 }, tuning.cardList.photoAspect)).toBeCloseTo(lo, 6);
  });
});
