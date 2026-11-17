import { describe, expect, it } from 'vitest';
import { pickVisible, type LabelRect } from '../src/widgets/common/labelLayout';

const rect = (x: number, y: number, priority: number, alpha = 1, w = 40, h = 12): LabelRect => ({
  x0: x - w / 2,
  x1: x + w / 2,
  y0: y - h / 2,
  y1: y + h / 2,
  priority,
  alpha,
});

describe('pickVisible', () => {
  it('겹치면 차례가 높은 글자가 남고, 차례가 같으면 먼저 넣은 글자가 남는다', () => {
    expect(pickVisible([rect(0, 0, 1), rect(10, 4, 3)], 2, 0.25)).toEqual([false, true]);
    expect(pickVisible([rect(0, 0, 2), rect(10, 4, 2)], 2, 0.25)).toEqual([true, false]);
  });

  it('여백보다 멀리 떨어진 글자는 모두 남고, 여백 안으로 들어오면 겹친 것으로 본다', () => {
    const w = 40;
    const pad = 2;
    expect(pickVisible([rect(0, 0, 1), rect(w + pad + 0.5, 0, 2)], pad, 0.25)).toEqual([true, true]);
    expect(pickVisible([rect(0, 0, 1), rect(w + pad - 0.5, 0, 2)], pad, 0.25)).toEqual([false, true]);
  });

  it('옅은 글자는 보이되 자리를 막지 않는다', () => {
    expect(pickVisible([rect(0, 0, 3, 0.1), rect(5, 0, 1)], 2, 0.25)).toEqual([true, true]);
    expect(pickVisible([rect(0, 0, 3, 0.5), rect(5, 0, 1)], 2, 0.25)).toEqual([true, false]);
  });

  it('count 개만 보고 작업 배열을 다시 써도 같은 결과다', () => {
    const rects = [rect(0, 0, 1), rect(5, 0, 2), rect(200, 0, 1)];
    const out: boolean[] = [];
    const order: number[] = [];
    const taken: LabelRect[] = [];
    expect(pickVisible(rects, 2, 0.25, 2, out, order, taken)).toEqual([false, true]);
    expect(pickVisible(rects, 2, 0.25, 3, out, order, taken)).toEqual([false, true, true]);
  });
});
