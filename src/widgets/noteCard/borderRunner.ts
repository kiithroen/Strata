import { tuning } from '../../config';

/** 테두리를 따라 도는 빛의 카드별 변화. speed 는 부호가 방향(음수면 반대로 돈다)이다 */
export interface RunnerVariation {
  speed: number;
  tail: number;
  strength: number;
}

/** 노트 번호와 salt 로 0~1 값을 낸다. 끝자리만 다른 번호끼리도 값이 몰리지 않게 마지막에 비트를 고루 섞는다 */
function hash01(id: string, salt: number): number {
  let h = 0x811c9dc5 ^ Math.imul(salt + 1, 0x9e3779b9);
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * 노트 번호로 정한 도는 빛의 빠르기·꼬리·밝기 배율과 방향. 배율은 card.border.runnerJitter 범위에서 고르고,
 * reverse 비율만큼의 카드는 반대 방향으로 돈다. 같은 번호면 늘 같다
 */
export function runnerVariation(id: string): RunnerVariation {
  const j = tuning.card.border.runnerJitter;
  const pick = (range: readonly [number, number], salt: number) => range[0] + (range[1] - range[0]) * hash01(id, salt);
  const dir = hash01(id, 4) < j.reverse ? -1 : 1;
  return { speed: dir * pick(j.speed, 1), tail: pick(j.tail, 2), strength: pick(j.strength, 3) };
}
