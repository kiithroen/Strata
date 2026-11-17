/** 겹쳐 여는 2D 화면 하나(노트 보기·입력). hide 는 방문 기록을 건드리지 않고 닫는다 */
export interface OverlayLayer {
  hide(): void;
}

/** 기록 상태에 적는 열린 화면 수 */
function depthOf(state: unknown): number {
  if (typeof state !== 'object' || state === null) return 0;
  const n = (state as { noteLayer?: unknown }).noteLayer;
  return typeof n === 'number' && n > 0 ? n : 0;
}

/**
 * 겹쳐 여는 2D 화면들과 방문 기록을 맞춘다. 열 때마다 지금 기록 상태에 열린 화면 수(noteLayer)를 더해 하나 쌓으므로
 * 브라우저·안드로이드 뒤로는 맨 위 화면만 닫고 그 아래(카드 보기·지층 보기)는 그대로 둔다.
 */
export class OverlayStack {
  private readonly layers: OverlayLayer[] = [];
  private waiters: Array<() => void> = [];
  private readonly onPop = (e: PopStateEvent) => {
    // 화면을 닫다가 새로 기다리기 시작한 되돌리기(rewind)는 이 popstate 가 아니라 다음 것을 기다려야 하므로 먼저 떼어 둔다
    const waiters = this.waiters;
    this.waiters = [];
    const depth = depthOf(e.state);
    while (this.layers.length > depth) this.layers.pop()?.hide();
    for (const w of waiters) w();
  };

  constructor() {
    window.addEventListener('popstate', this.onPop);
  }

  get depth(): number {
    return this.layers.length;
  }

  get top(): OverlayLayer | null {
    return this.layers[this.layers.length - 1] ?? null;
  }

  has(layer: OverlayLayer): boolean {
    return this.layers.includes(layer);
  }

  /** 화면을 하나 열었다고 기록을 쌓는다 */
  push(layer: OverlayLayer): void {
    const state = typeof history.state === 'object' && history.state !== null ? history.state : {};
    this.layers.push(layer);
    history.pushState({ ...state, noteLayer: this.layers.length }, '');
  }

  /** 맨 위 화면을 닫고 그 기록을 되돌린다 */
  back(): void {
    const layer = this.layers.pop();
    if (!layer) return;
    layer.hide();
    history.back();
  }

  /** 열린 화면을 모두 닫는다(기록은 그대로). 부르는 쪽이 extra 와 함께 기록을 되돌릴 때 쓴다 */
  hideAll(): number {
    const n = this.layers.length;
    while (this.layers.length > 0) this.layers.pop()?.hide();
    return n;
  }

  /**
   * 기록을 count 칸 되돌리고 그 popstate 가 올 때까지 기다린다. 오지 않으면(기록이 없을 때) 잠시 뒤 그냥 끝낸다.
   * 되돌리는 동안 다른 화면이 새 기록을 쌓지 않게, 다음 화면을 띄우기 전에 기다린다
   */
  rewind(count: number): Promise<void> {
    if (count <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      this.waiters.push(finish);
      // 기록 이동은 브라우저 일이라 게임 시간이 아니라 벽시계로 기다린다
      window.setTimeout(finish, 400);
      history.go(-count);
    });
  }

  dispose(): void {
    window.removeEventListener('popstate', this.onPop);
    this.waiters = [];
    this.hideAll();
  }
}
