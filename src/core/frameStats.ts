/** 최근 프레임 묶음의 성능 요약. 시간은 모두 밀리초다 */
export interface FrameSummary {
  frames: number;
  fps: number;
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  /**
   * 끊긴 프레임 수와 비율. 앞뒤 이웃 간격 중 짧은 쪽 × dropRatio 를 넘으면 끊김으로 센다.
   * 화면 주사율이 바뀌어도(적응형 주사율의 60↔120Hz 전환) 전환 지점 하나만 걸린다
   */
  dropped: number;
  droppedRatio: number;
  updateAvgMs: number;
  updateMaxMs: number;
  renderAvgMs: number;
  renderMaxMs: number;
}

/**
 * 프레임 간격과 CPU 시간(갱신·그리기 명령)을 최근 capacity 개만 고리 버퍼에 모아 요약한다.
 * 실제 기기 성능을 재는 도구라 게임 시간이 아니라 벽시계 간격을 받는다.
 */
export class FrameStats {
  private readonly frame: Float64Array;
  private readonly update: Float64Array;
  private readonly render: Float64Array;
  private count = 0;
  private next = 0;

  constructor(
    readonly capacity: number,
    readonly dropRatio: number,
  ) {
    this.frame = new Float64Array(capacity);
    this.update = new Float64Array(capacity);
    this.render = new Float64Array(capacity);
  }

  push(frameMs: number, updateMs: number, renderMs: number): void {
    this.frame[this.next] = frameMs;
    this.update[this.next] = updateMs;
    this.render[this.next] = renderMs;
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  /** 들어온 순서대로 훑으며 이웃 간격과 견준다 */
  private countDropped(): number {
    const n = this.count;
    if (n < 2) return 0;
    const start = n < this.capacity ? 0 : this.next;
    const at = (i: number) => this.frame[(start + i) % this.capacity];
    let dropped = 0;
    for (let i = 0; i < n; i++) {
      const prev = i > 0 ? at(i - 1) : Infinity;
      const next = i < n - 1 ? at(i + 1) : Infinity;
      if (at(i) > Math.min(prev, next) * this.dropRatio) dropped++;
    }
    return dropped;
  }

  reset(): void {
    this.count = 0;
    this.next = 0;
  }

  summary(): FrameSummary {
    const n = this.count;
    if (n === 0) {
      return {
        frames: 0, fps: 0, avgMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0, dropped: 0, droppedRatio: 0,
        updateAvgMs: 0, updateMaxMs: 0, renderAvgMs: 0, renderMaxMs: 0,
      };
    }
    const sorted = Array.from(this.frame.subarray(0, n)).sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);
    const median = quantile(sorted, 0.5);
    const dropped = this.countDropped();
    const upd = stats(this.update.subarray(0, n));
    const ren = stats(this.render.subarray(0, n));
    return {
      frames: n,
      fps: sum > 0 ? (n * 1000) / sum : 0,
      avgMs: sum / n,
      medianMs: median,
      p95Ms: quantile(sorted, 0.95),
      maxMs: sorted[n - 1],
      dropped,
      droppedRatio: dropped / n,
      updateAvgMs: upd.avg,
      updateMaxMs: upd.max,
      renderAvgMs: ren.avg,
      renderMaxMs: ren.max,
    };
  }
}

/** 정렬된 배열의 q 분위값(가장 가까운 순위) */
function quantile(sorted: readonly number[], q: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

function stats(values: Float64Array): { avg: number; max: number } {
  let sum = 0;
  let max = 0;
  for (const v of values) {
    sum += v;
    if (v > max) max = v;
  }
  return { avg: sum / values.length, max };
}
