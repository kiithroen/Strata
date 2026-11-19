import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { lockSwipeAxis, newestFirst, sequenceOf, stepSequence, swipeStep } from '../src/widgets/noteView/noteNav';

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

  it('탐색기 기준 거리(minPx)를 넘기면 그 거리로 판정한다', () => {
    const minPx = tuning.explorer.swipePx;
    expect(swipeStep(-minPx, 0, minPx)).toBe(1);
    expect(swipeStep(-minPx * 0.9, 0, minPx)).toBe(0);
  });
});

describe('lockSwipeAxis', () => {
  const threshold = tuning.input.tapSlop;
  const ratio = tuning.album.swipeRatio;

  it('판정 거리 미만에서는 축을 잠그지 않는다', () => {
    expect(lockSwipeAxis('none', threshold * 0.5, 0)).toBe('none');
    expect(lockSwipeAxis('none', 0, threshold * 0.5)).toBe('none');
  });

  it('가로가 세로의 swipeRatio 배 이상이면 x, 아니면 y 로 잠근다', () => {
    expect(lockSwipeAxis('none', threshold * 1.5, 0)).toBe('x');
    expect(lockSwipeAxis('none', -threshold * 2, threshold / ratio)).toBe('x');
    expect(lockSwipeAxis('none', 0, threshold * 1.5)).toBe('y');
    // 대각선(가로가 약간 커도 swipeRatio 미만)은 세로 스크롤 보호를 위해 y 로 잠근다
    expect(lockSwipeAxis('none', threshold, threshold * 0.9)).toBe('y');
  });

  it('한번 잠긴 축은 이후 다른 방향으로 크게 흔들려도 유지된다', () => {
    const lockedY = lockSwipeAxis('none', 2, threshold * 2);
    expect(lockedY).toBe('y');
    expect(lockSwipeAxis(lockedY, threshold * 10, threshold * 2)).toBe('y');

    const lockedX = lockSwipeAxis('none', -threshold * 2, 1);
    expect(lockedX).toBe('x');
    expect(lockSwipeAxis(lockedX, -threshold * 2, threshold * 10)).toBe('x');
  });
});
