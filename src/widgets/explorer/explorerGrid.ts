/** 가상 스크롤 격자의 열 배치. rowHeight 는 칸 높이, stride 는 줄 하나가 차지하는 높이(칸 높이 + 줄 간격)다 */
export interface GridLayout {
  columns: number;
  rows: number;
  rowHeight: number;
  stride: number;
  /** 모든 줄을 쌓은 높이(마지막 줄 아래 간격은 빼고) */
  height: number;
}

/**
 * width 폭에 minTile 이상 폭의 칸을 gap 간격으로 몇 열 놓는지와 count 칸을 쌓은 높이를 낸다.
 * CSS 의 repeat(auto-fill, minmax(minTile, 1fr)) 와 같은 열 수다. 폭이 칸 하나보다 좁아도 한 열은 둔다
 */
export function gridLayout(width: number, minTile: number, gap: number, rowHeight: number, count: number): GridLayout {
  const columns = Math.max(1, Math.floor((width + gap) / (minTile + gap)));
  const rows = Math.ceil(count / columns);
  const stride = rowHeight + gap;
  return { columns, rows, rowHeight, stride, height: rows > 0 ? rows * stride - gap : 0 };
}

/**
 * scrollTop 에서 viewport 높이만큼 보이는 줄과 위아래 overscan(px) 안의 줄 범위. last 는 포함하지 않는다
 */
export function visibleRows(layout: GridLayout, scrollTop: number, viewport: number, overscan: number): { first: number; last: number } {
  if (layout.rows === 0) return { first: 0, last: 0 };
  const first = Math.max(0, Math.floor((scrollTop - overscan) / layout.stride));
  const last = Math.min(layout.rows, Math.ceil((scrollTop + viewport + overscan) / layout.stride));
  return { first, last: Math.max(first, last) };
}

/** index 칸의 줄이 viewport 안에 다 보이게 하는 scrollTop. 이미 보이면 그대로 낸다 */
export function scrollToShow(layout: GridLayout, index: number, scrollTop: number, viewport: number): number {
  const top = Math.floor(index / layout.columns) * layout.stride;
  const bottom = top + layout.rowHeight;
  if (top < scrollTop) return top;
  if (bottom > scrollTop + viewport) return Math.max(0, bottom - viewport);
  return scrollTop;
}

export type GridKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End' | 'PageUp' | 'PageDown';

/**
 * 격자 커서를 key 방향으로 옮긴 칸 번호. 좌우는 한 칸, 위아래는 한 줄(columns 칸), PageUp·Down 은 pageRows 줄,
 * Home·End 는 처음·끝이다. 끝을 넘으면 처음·끝 칸에 멈춘다. 칸이 없으면 -1 이다
 */
export function moveCursor(index: number, key: GridKey, columns: number, count: number, pageRows: number): number {
  if (count === 0) return -1;
  const step: Record<GridKey, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -columns,
    ArrowDown: columns,
    PageUp: -columns * Math.max(1, pageRows),
    PageDown: columns * Math.max(1, pageRows),
    Home: -Infinity,
    End: Infinity,
  };
  return Math.max(0, Math.min(count - 1, index + step[key]));
}
