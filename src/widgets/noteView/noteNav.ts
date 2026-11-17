import { tuning } from '../../config';

/** 노트 보기에서 넘길 차례: 노트 번호들(앞이 최근 것)과 그 안의 지금 자리 */
export interface NoteSequence {
  members: readonly number[];
  position: number;
}

/** 노트 번호들을 최근 것부터 정렬한다. 같은 시각이면 들어온 순서를 지킨다 */
export function newestFirst(members: readonly number[], timeOf: (index: number) => number): number[] {
  return [...members].sort((a, b) => timeOf(b) - timeOf(a));
}

/** current 를 품은 넘길 차례. members 에 없으면 current 하나짜리다 */
export function sequenceOf(members: readonly number[], current: number): NoteSequence {
  const position = members.indexOf(current);
  return position >= 0 ? { members, position } : { members: [current], position: 0 };
}

/** dir 쪽(1 = 다음 = 더 오래된 노트, -1 = 이전) 자리. 끝이면 undefined 다(되감지 않는다) */
export function stepSequence(seq: NoteSequence, dir: 1 | -1): NoteSequence | undefined {
  const position = seq.position + dir;
  return position >= 0 && position < seq.members.length ? { members: seq.members, position } : undefined;
}

/**
 * 가로 끌기를 넘길 방향으로 바꾼다. 손가락이 왼쪽으로 가면(dx < 0) 다음(1), 오른쪽이면 이전(-1)이다.
 * 가로로 album.swipePx 이상, 세로의 album.swipeRatio 배 이상 움직여야 하고, 아니면 0 이다
 */
export function swipeStep(dx: number, dy: number): 1 | -1 | 0 {
  const { swipePx, swipeRatio } = tuning.album;
  if (Math.abs(dx) < swipePx || Math.abs(dx) < Math.abs(dy) * swipeRatio) return 0;
  return dx < 0 ? 1 : -1;
}
