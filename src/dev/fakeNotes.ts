import { tuning } from '../config';
import { DAY_MS, floorTo } from '../core/calendar';
import { createRng } from '../core/random';
import type { NoteRef } from '../widgets/timeAxis/axisModel';

const HOUR_MS = 3_600_000;

/**
 * 개발용 가짜 노트 시각. 최근일수록 촘촘하고, 몇몇 날에는 몇 시간 안에 여러 장을 몰아 찍는다.
 * 가장 최근 노트는 newest 이고, 결과는 최근 것부터 정렬된다. 번호는 오래된 것부터 매긴다.
 */
export function createFakeNotes(newest: number): NoteRef[] {
  const d = tuning.dev;
  const rng = createRng(d.noteSeed);
  const daysBack = () => Math.pow(rng(), 1.6) * d.spanDays;
  const clamp = (t: number) => (t > newest ? newest - rng() * HOUR_MS : t);
  const times: number[] = [newest];

  for (let b = 0; b < d.bursts && times.length < d.noteCount; b++) {
    const day = floorTo('day', newest - daysBack() * DAY_MS);
    const start = day + (9 + rng() * 13) * HOUR_MS;
    const n = 2 + Math.floor(rng() * 6);
    for (let i = 0; i < n && times.length < d.noteCount; i++) times.push(clamp(start + rng() * 2 * HOUR_MS));
  }
  while (times.length < d.noteCount) {
    const day = floorTo('day', newest - daysBack() * DAY_MS);
    times.push(clamp(day + (7 + rng() * 16) * HOUR_MS));
  }

  times.sort((p, q) => q - p);
  return times.map((time, i) => ({ id: String(times.length - i).padStart(4, '0'), time }));
}
