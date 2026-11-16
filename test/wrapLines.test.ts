import { describe, expect, it } from 'vitest';
import { wrapLines } from '../src/widgets/noteCard/textWrap';

// 글자 하나가 폭 1 인 가짜 측정기
const ctx = { measureText: (s: string) => ({ width: [...s].length }) as TextMetrics };

describe('wrapLines', () => {
  it('폭을 넘으면 글자 단위로 줄을 나누고, 다 들어가면 말줄임표를 붙이지 않는다', () => {
    expect(wrapLines(ctx, 'abcdefg', 3, 5)).toEqual(['abc', 'def', 'g']);
    expect(wrapLines(ctx, 'ab\ncd', 3, 2)).toEqual(['ab', 'cd']);
  });

  it('문단 중간에서 줄이 다 차면 마지막 줄을 말줄임표로 끝낸다', () => {
    const lines = wrapLines(ctx, 'abcdefgh', 3, 2);
    expect(lines).toEqual(['abc', 'de…']);
  });

  it('문단 끝에서 줄이 다 차도 뒤 문단이 남았으면 말줄임표로 끝내고 폭을 넘지 않는다', () => {
    const lines = wrapLines(ctx, 'ab\ncd\nef', 3, 2);
    expect(lines).toEqual(['ab', 'cd…']);
    const full = wrapLines(ctx, 'ab\ncde\nf', 3, 2);
    expect(full[1].endsWith('…')).toBe(true);
    for (const line of full) expect(ctx.measureText(line).width).toBeLessThanOrEqual(3);
  });

  it('뒤에 빈 문단만 남았으면 잘린 것이 아니다', () => {
    expect(wrapLines(ctx, 'ab\ncd\n\n', 3, 2)).toEqual(['ab', 'cd']);
  });
});
