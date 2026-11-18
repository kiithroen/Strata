import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { gridLayout, moveCursor, scrollToShow, visibleRows } from '../src/widgets/explorer/explorerGrid';

const min = tuning.explorer.tileMinPx;
const gap = 10;
const rowH = 200;

describe('가상 스크롤 격자', () => {
  it('칸 최소 폭과 간격으로 열 수를 고르고, 좁아도 한 열은 둔다', () => {
    // 열 n 개가 딱 들어가는 폭: n*min + (n-1)*gap
    for (const n of [1, 3, 7]) {
      const exact = n * min + (n - 1) * gap;
      expect(gridLayout(exact, min, gap, rowH, 100).columns).toBe(n);
      expect(gridLayout(exact - 1, min, gap, rowH, 100).columns).toBe(Math.max(1, n - 1));
    }
    expect(gridLayout(10, min, gap, rowH, 5).columns).toBe(1);
  });

  it('줄 수와 높이는 칸 수에서 나오고 마지막 줄 아래 간격은 뺀다', () => {
    const width = 4 * min + 3 * gap;
    const l = gridLayout(width, min, gap, rowH, 9);
    expect(l.rows).toBe(3);
    expect(l.stride).toBe(rowH + gap);
    expect(l.height).toBe(3 * (rowH + gap) - gap);
    expect(gridLayout(width, min, gap, rowH, 0).height).toBe(0);
  });

  it('보이는 줄 범위는 위아래 여유를 더하고 처음·끝에서 자른다', () => {
    const l = gridLayout(min, min, gap, rowH, 1000);
    const viewport = 3 * l.stride;
    expect(visibleRows(l, 0, viewport, 0)).toEqual({ first: 0, last: 3 });
    expect(visibleRows(l, 10 * l.stride, viewport, l.stride)).toEqual({ first: 9, last: 14 });
    // 줄 중간에 걸치면 그 줄도 넣는다
    expect(visibleRows(l, 10 * l.stride + 1, viewport, 0)).toEqual({ first: 10, last: 14 });
    expect(visibleRows(l, l.height, viewport, 0).last).toBe(l.rows);
    expect(visibleRows(gridLayout(min, min, gap, rowH, 0), 0, viewport, 0)).toEqual({ first: 0, last: 0 });
  });

  it('커서 칸이 가려지면 그 줄이 다 보이게 스크롤하고, 보이면 그대로 둔다', () => {
    const l = gridLayout(4 * min + 3 * gap, min, gap, rowH, 400);
    const viewport = 2.5 * l.stride;
    const row = (i: number) => Math.floor(i / l.columns);
    // 위로 가려진 칸: 그 줄 위 끝으로
    expect(scrollToShow(l, 4 * 5, 10 * l.stride, viewport)).toBe(row(20) * l.stride);
    // 아래로 가려진 칸: 그 줄 아래 끝이 화면 아래 끝에
    const below = 4 * 20;
    expect(scrollToShow(l, below, 0, viewport)).toBe(row(below) * l.stride + rowH - viewport);
    expect(scrollToShow(l, 4, 0, viewport)).toBe(0);
  });

  it('커서는 좌우 한 칸, 위아래 한 줄, 페이지는 여러 줄을 옮기고 끝에서 멈춘다', () => {
    const cols = 4;
    const n = 10;
    expect(moveCursor(5, 'ArrowRight', cols, n, 3)).toBe(6);
    expect(moveCursor(5, 'ArrowLeft', cols, n, 3)).toBe(4);
    expect(moveCursor(5, 'ArrowDown', cols, n, 3)).toBe(9);
    expect(moveCursor(7, 'ArrowDown', cols, n, 3)).toBe(n - 1);
    expect(moveCursor(2, 'ArrowUp', cols, n, 3)).toBe(0);
    expect(moveCursor(0, 'ArrowLeft', cols, n, 3)).toBe(0);
    expect(moveCursor(1, 'PageDown', cols, 100, 3)).toBe(1 + cols * 3);
    expect(moveCursor(50, 'PageUp', cols, 100, 3)).toBe(50 - cols * 3);
    expect(moveCursor(5, 'Home', cols, n, 3)).toBe(0);
    expect(moveCursor(5, 'End', cols, n, 3)).toBe(n - 1);
    expect(moveCursor(0, 'ArrowDown', cols, 0, 3)).toBe(-1);
  });
});
