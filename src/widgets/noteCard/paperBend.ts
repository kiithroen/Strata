import { tuning } from '../../config';

/**
 * 종이 휨 높이 f(x, y): 카드 좌표(-0.5~0.5)에서 앞(+Z)쪽으로 민 높이를 카드 폭 대비로 낸다.
 * cardMaterial.ts 정점 셰이더의 f 와 같은 식이어야 한다. 셰이더를 고치면 함께 고친다.
 * 실제 높이는 여기에 CardLook.uBend × (1 − 펼침 정도)를 곱한다.
 */
export function bendHeight(x: number, y: number, time: number, phase: number): number {
  const b = tuning.card.bend;
  const ax = b.waveFreq[0] * x + b.waveSpeed[0] * time + phase;
  const ay = b.waveFreq[1] * y + b.waveSpeed[1] * time + phase * 1.7;
  const cs = Math.sin(b.curlSpeed * time + phase * 0.6);
  return b.waveAmp[0] * Math.sin(ax) + b.waveAmp[1] * Math.sin(ay) + b.curl * x * x * cs;
}
