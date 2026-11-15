/**
 * 프레임 수와 무관한 지수 접근. 같은 게임 시간이 흐르면 주사율과 상관없이 같은 지점에 닿는다.
 * rate 는 1초에 남은 거리의 얼마를 줄이는지를 정하는 속도(1/초)다.
 */
export function approachFactor(rate: number, dt: number): number {
  if (dt <= 0 || rate <= 0) return 0;
  return 1 - Math.exp(-rate * dt);
}

export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * approachFactor(rate, dt);
}
