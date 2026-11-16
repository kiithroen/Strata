import { tuning } from '../../config';
import { estimateTextWidth } from '../noteCard/textWrap';

export interface CloudWord {
  text: string;
  count: number;
}

/** 화면에 놓인 낱말: 글자 높이(px)와 묶음 중심에서 벗어난 자리(px, y 는 위쪽이 +), 쓰인 정도(0~1) */
export interface PlacedWord {
  text: string;
  px: number;
  x: number;
  y: number;
  weight: number;
}

/** 노트들의 태그를 세어 많이 쓰인 순서로 max 개까지 낸다. 같은 수면 글자 순서다 */
export function topTags(tagLists: readonly (readonly string[] | undefined)[], max: number): CloudWord[] {
  const counts = new Map<string, number>();
  for (const tags of tagLists) for (const t of tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
    .slice(0, max);
}

/** 낱말 상자 크기(px). 폭은 글자 폭을 어림한다 */
export function wordBox(text: string, px: number): { w: number; h: number } {
  return { w: estimateTextWidth(text) * px, h: px };
}

/**
 * 워드 클라우드 배치. 많이 쓰인 낱말일수록 크고(cloud.px 범위), 큰 것부터 가운데에서 바깥으로 도는 나선을 따라
 * 다른 낱말과 겹치지 않는(cloud.gapPx 여백) 첫 자리에 놓는다. 같은 입력이면 같은 배치다.
 */
export function layoutCloud(words: readonly CloudWord[]): PlacedWord[] {
  const c = tuning.cloud;
  if (words.length === 0) return [];
  const maxCount = Math.max(...words.map((w) => w.count));
  const minCount = Math.min(...words.map((w) => w.count));
  const sized = words
    .map((w) => {
      const weight = maxCount === minCount ? 1 : (w.count - minCount) / (maxCount - minCount);
      const px = Math.round(c.px[0] + (c.px[1] - c.px[0]) * weight);
      return { text: w.text, px, weight, ...wordBox(w.text, px) };
    })
    .sort((a, b) => b.px - a.px || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));

  const placed: (PlacedWord & { w: number; h: number })[] = [];
  const g = c.gapPx;
  const overlaps = (x: number, y: number, w: number, h: number) =>
    placed.some((p) => Math.abs(p.x - x) * 2 < p.w + w + g * 2 && Math.abs(p.y - y) * 2 < p.h + h + g * 2);
  const step = c.px[0] * 0.25;
  for (const s of sized) {
    let x = 0;
    let y = 0;
    // 가로로 납작한 나선(낱말이 가로로 길어서)
    for (let i = 0; i < 4000; i++) {
      const theta = i * 0.3;
      const r = step * theta;
      x = r * Math.cos(theta) * 1.8;
      y = r * Math.sin(theta);
      if (!overlaps(x, y, s.w, s.h)) break;
    }
    placed.push({ text: s.text, px: s.px, x, y, weight: s.weight, w: s.w, h: s.h });
  }
  return placed.map(({ text, px, x, y, weight }) => ({ text, px, x, y, weight }));
}

/**
 * 멀리서 보일 때의 정도. screen 은 카드 높이가 화면 높이에서 차지하는 비율이다.
 * words 는 낱말이 나타난 정도, cards 는 카드가 사라진 정도(0~1)다. 둘 다 카드가 작아질수록 커진다.
 */
export function cloudVisibility(screen: number): { words: number; cards: number } {
  const c = tuning.cloud;
  return { words: fall(c.show[0], c.show[1], screen), cards: fall(c.hide[0], c.hide[1], screen) };
}

/** from 이상이면 0, to 이하면 1 인 부드러운 내림 계단(from > to) */
function fall(from: number, to: number, x: number): number {
  const t = Math.min(1, Math.max(0, (from - x) / (from - to)));
  return t * t * (3 - 2 * t);
}

/** 거리 distance 에 있는 높이 height 짜리가 화면 높이에서 차지하는 비율. p11 은 투영 행렬의 [1][1](1 / tan(시야각/2)) */
export function screenFraction(height: number, distance: number, p11: number): number {
  return (height * p11) / (2 * Math.max(distance, 1e-3));
}
