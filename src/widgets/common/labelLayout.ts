/** 화면 글자 하나의 자리(CSS px 사각형)와 겹칠 때 남길 차례 */
export interface LabelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 클수록 먼저 자리를 잡는다. 같으면 먼저 넣은 것이 먼저다 */
  priority: number;
  /** 지금 불투명도. 이보다 옅은 글자는 자리를 막지 않는다(blockAlpha) */
  alpha: number;
}

/**
 * 겹치는 글자 가운데 남길 것을 고른다. 차례가 높은 글자부터 자리를 잡고, 이미 잡힌 자리와 pad(px) 안으로 겹치면 숨긴다.
 * blockAlpha 보다 옅은 글자는 남기되 자리를 잡지 않는다. 앞의 count 개만 본다.
 * out·order·taken 은 결과와 작업 배열이다(매 프레임 새로 만들지 않게 넘긴다). 반환 배열의 i 번째가 rects[i] 를 보일지다
 */
export function pickVisible(
  rects: readonly LabelRect[],
  pad: number,
  blockAlpha: number,
  count = rects.length,
  out: boolean[] = [],
  order: number[] = [],
  taken: LabelRect[] = [],
): boolean[] {
  const n = count;
  out.length = n;
  order.length = n;
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => rects[b].priority - rects[a].priority || a - b);
  taken.length = 0;
  for (const i of order) {
    const r = rects[i];
    let free = true;
    for (const t of taken) {
      if (r.x0 < t.x1 + pad && r.x1 + pad > t.x0 && r.y0 < t.y1 + pad && r.y1 + pad > t.y0) {
        free = false;
        break;
      }
    }
    out[i] = free;
    if (free && r.alpha >= blockAlpha) taken.push(r);
  }
  return out;
}
