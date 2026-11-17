import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { newestFirst, sequenceOf, stepSequence, swipeStep } from '../src/widgets/noteView/noteNav';

describe('newestFirst', () => {
  it('시각이 늦은 노트부터 놓고 같은 시각은 들어온 순서를 지킨다', () => {
    const times = [10, 30, 20, 30];
    expect(newestFirst([0, 1, 2, 3], (i) => times[i])).toEqual([1, 3, 2, 0]);
  });
});

describe('sequenceOf · stepSequence', () => {
  it('묶음 안에서 앞뒤로 넘기고 끝에서는 멈춘다', () => {
    const seq = sequenceOf([7, 4, 9], 4);
    expect(seq.position).toBe(1);
    const next = stepSequence(seq, 1);
    expect(next && next.members[next.position]).toBe(9);
    expect(next && stepSequence(next, 1)).toBeUndefined();
    const prev = stepSequence(seq, -1);
    expect(prev && prev.members[prev.position]).toBe(7);
    expect(prev && stepSequence(prev, -1)).toBeUndefined();
  });

  it('묶음에 없는 노트는 혼자인 차례가 된다', () => {
    const seq = sequenceOf([1, 2], 5);
    expect(seq).toEqual({ members: [5], position: 0 });
    expect(stepSequence(seq, 1)).toBeUndefined();
  });
});

describe('swipeStep', () => {
  const { swipePx, swipeRatio } = tuning.album;

  it('손가락이 왼쪽으로 가면 다음, 오른쪽이면 이전이다', () => {
    expect(swipeStep(-swipePx, 0)).toBe(1);
    expect(swipeStep(swipePx, 0)).toBe(-1);
  });

  it('짧게 끌면 넘기지 않는다', () => {
    expect(swipeStep(-swipePx * 0.9, 0)).toBe(0);
  });

  it('세로 움직임이 크면 넘기지 않는다', () => {
    const dx = swipePx * 2;
    expect(swipeStep(dx, (dx / swipeRatio) * 1.1)).toBe(0);
    expect(swipeStep(dx, (dx / swipeRatio) * 0.9)).toBe(-1);
  });
});
