/** 달력 단위. 모든 계산은 현지 시각 기준이다. */
export type TimeUnit = 'year' | 'month' | 'day' | 'hour6' | 'hour' | 'min15';

/** 큰 단위부터 작은 단위 순서 */
export const UNITS: readonly TimeUnit[] = ['year', 'month', 'day', 'hour6', 'hour', 'min15'];

export const DAY_MS = 86_400_000;

/** 단위의 평균 길이(일). 간격 비교에만 쓰고, 눈금 위치는 달력으로 정한다. */
export const UNIT_DAYS: Readonly<Record<TimeUnit, number>> = {
  year: 365.2425,
  month: 365.2425 / 12,
  day: 1,
  hour6: 1 / 4,
  hour: 1 / 24,
  min15: 1 / 96,
};

/** t 를 포함하는 단위 칸의 시작 시각 */
export function floorTo(unit: TimeUnit, t: number): number {
  const d = new Date(t);
  const y = d.getFullYear();
  const mo = d.getMonth();
  const day = d.getDate();
  const h = d.getHours();
  switch (unit) {
    case 'year':
      return new Date(y, 0, 1).getTime();
    case 'month':
      return new Date(y, mo, 1).getTime();
    case 'day':
      return new Date(y, mo, day).getTime();
    case 'hour6':
      return new Date(y, mo, day, h - (h % 6)).getTime();
    case 'hour':
      return new Date(y, mo, day, h).getTime();
    case 'min15': {
      const mi = d.getMinutes();
      return new Date(y, mo, day, h, mi - (mi % 15)).getTime();
    }
  }
}

/** 칸 시작 시각 t 에서 단위 n 칸만큼 옮긴 시각 */
export function addUnits(unit: TimeUnit, t: number, n: number): number {
  const d = new Date(t);
  switch (unit) {
    case 'year':
      d.setFullYear(d.getFullYear() + n);
      break;
    case 'month':
      d.setMonth(d.getMonth() + n);
      break;
    case 'day':
      d.setDate(d.getDate() + n);
      break;
    case 'hour6':
      d.setHours(d.getHours() + 6 * n);
      break;
    case 'hour':
      d.setHours(d.getHours() + n);
      break;
    case 'min15':
      d.setMinutes(d.getMinutes() + 15 * n);
      break;
  }
  return d.getTime();
}
