import { tuning } from '../config';

export interface PointerInput {
  id: number;
  x: number;
  y: number;
  /** 이벤트 시각(ms). DOM PointerEvent.timeStamp */
  t: number;
  pointerType?: string;
  /** 마우스 누름에서 0이 아니면 무시한다 */
  button?: number;
}

export type PointerEventRecord = PointerInput & {
  type: 'down' | 'move' | 'up' | 'cancel';
};

export interface GestureHandlers {
  onTouchCountChange?: (count: number) => void;
  onTap?: (e: { x: number; y: number; t: number }) => void;
  onDragStart?: (e: { x: number; y: number; t: number }) => void;
  onDragMove?: (e: { x: number; y: number; dx: number; dy: number; t: number }) => void;
  onDragEnd?: (e: { vx: number; vy: number; t: number }) => void;
  onPinchStart?: (e: { x: number; y: number; distance: number; t: number }) => void;
  onPinchMove?: (e: { x: number; y: number; distance: number; ratio: number; t: number }) => void;
  onPinchEnd?: (e: { t: number }) => void;
}

export interface WheelEventData {
  x: number;
  y: number;
  deltaY: number;
}

export type GestureMode = 'idle' | 'pending' | 'drag' | 'pinch';

interface ActivePointer {
  id: number;
  x: number;
  y: number;
  t: number;
}

interface Sample {
  x: number;
  y: number;
  t: number;
}

/**
 * 포인터 이벤트 열을 탭·한 손가락 끌기(관성 속도 포함)·두 손가락 핀치로 해석하는 순수 상태 기계.
 * 두 손가락 이상이 닿았던 조작은 탭이 되지 않는다.
 */
export class GestureRecognizer {
  private readonly pointers = new Map<number, ActivePointer>();
  private readonly samples: Sample[] = [];
  private _mode: GestureMode = 'idle';
  private multiTouch = false;
  private startX = 0;
  private startY = 0;
  private startT = 0;
  private lastX = 0;
  private lastY = 0;
  private pinchPair: [number, number] | null = null;
  private lastPinchDistance = 0;

  constructor(private readonly handlers: GestureHandlers) {}

  get touchCount(): number {
    return this.pointers.size;
  }

  get mode(): GestureMode {
    return this._mode;
  }

  feed(event: PointerEventRecord): void {
    switch (event.type) {
      case 'down':
        this.down(event);
        break;
      case 'move':
        this.move(event);
        break;
      case 'up':
        this.up(event);
        break;
      case 'cancel':
        this.cancel(event);
        break;
    }
  }

  down(p: PointerInput): void {
    if (p.pointerType === 'mouse' && p.button !== undefined && p.button !== 0) return;
    const prevCount = this.pointers.size;
    this.pointers.set(p.id, { id: p.id, x: p.x, y: p.y, t: p.t });
    if (this.pointers.size !== prevCount) this.handlers.onTouchCountChange?.(this.pointers.size);

    if (this.pointers.size === 1) {
      this.multiTouch = false;
      this.resetSingleAnchor(p.x, p.y, p.t);
      this._mode = 'pending';
      return;
    }

    this.multiTouch = true;
    if (this._mode === 'drag') {
      this.samples.length = 0;
      this.handlers.onDragEnd?.({ vx: 0, vy: 0, t: p.t });
    }
    if (this._mode !== 'pinch') {
      const pair = this.pickPair();
      if (pair) this.beginPinch(pair[0], pair[1], p.t);
    }
  }

  move(p: PointerInput): void {
    const active = this.pointers.get(p.id);
    if (!active) return;
    active.x = p.x;
    active.y = p.y;
    active.t = p.t;

    if (this._mode === 'pinch' && this.pinchPair) {
      const a = this.pointers.get(this.pinchPair[0]);
      const b = this.pointers.get(this.pinchPair[1]);
      if (!a || !b) return;
      const dist = this.pinchDistance(a, b);
      const ratio = dist / this.lastPinchDistance;
      this.lastPinchDistance = dist;
      this.handlers.onPinchMove?.({
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        distance: dist,
        ratio,
        t: p.t,
      });
      return;
    }

    if (this._mode === 'pending') {
      const slop = tuning.input.tapSlop;
      const dx = p.x - this.startX;
      const dy = p.y - this.startY;
      if (dx * dx + dy * dy <= slop * slop) return;
      this._mode = 'drag';
      this.handlers.onDragStart?.({ x: this.startX, y: this.startY, t: this.startT });
    }

    if (this._mode === 'drag') {
      const dx = p.x - this.lastX;
      const dy = p.y - this.lastY;
      this.lastX = p.x;
      this.lastY = p.y;
      this.pushSample(p.x, p.y, p.t);
      this.handlers.onDragMove?.({ x: p.x, y: p.y, dx, dy, t: p.t });
    }
  }

  up(p: PointerInput): void {
    this.release(p, false);
  }

  cancel(p: PointerInput): void {
    this.release(p, true);
  }

  reset(): void {
    const had = this.pointers.size > 0;
    this.pointers.clear();
    this.samples.length = 0;
    this.pinchPair = null;
    this.multiTouch = false;
    this._mode = 'idle';
    if (had) this.handlers.onTouchCountChange?.(0);
  }

  private release(p: PointerInput, cancelled: boolean): void {
    const active = this.pointers.get(p.id);
    if (!active) return;
    this.pointers.delete(p.id);
    this.handlers.onTouchCountChange?.(this.pointers.size);

    if (this._mode === 'pinch' && this.pinchPair && (p.id === this.pinchPair[0] || p.id === this.pinchPair[1])) {
      this.pinchPair = null;
      this.handlers.onPinchEnd?.({ t: p.t });
      const nextPair = this.pickPair();
      if (nextPair) {
        this.beginPinch(nextPair[0], nextPair[1], p.t);
        return;
      }
      const rem = this.firstPointer();
      if (rem) {
        this.resetSingleAnchor(rem.x, rem.y, p.t);
        this._mode = 'pending';
        return;
      }
      this._mode = 'idle';
      this.multiTouch = false;
      return;
    }

    if (this.pointers.size > 0) return;

    const prevMode = this._mode;
    const wasMulti = this.multiTouch;
    this._mode = 'idle';
    this.multiTouch = false;

    if (prevMode === 'drag') {
      if (cancelled) {
        this.samples.length = 0;
        this.handlers.onDragEnd?.({ vx: 0, vy: 0, t: p.t });
        return;
      }
      this.pushSample(p.x, p.y, p.t);
      const v = this.computeVelocity(p.t);
      this.samples.length = 0;
      this.handlers.onDragEnd?.({ vx: v.vx, vy: v.vy, t: p.t });
      return;
    }

    this.samples.length = 0;
    if (!cancelled && prevMode === 'pending' && !wasMulti) {
      const maxMs = tuning.input.tapMaxSeconds * 1000;
      const dx = p.x - this.startX;
      const dy = p.y - this.startY;
      const slop = tuning.input.tapSlop;
      if (p.t - this.startT <= maxMs && dx * dx + dy * dy <= slop * slop) {
        this.handlers.onTap?.({ x: p.x, y: p.y, t: p.t });
      }
    }
  }

  private resetSingleAnchor(x: number, y: number, t: number): void {
    this.startX = x;
    this.startY = y;
    this.startT = t;
    this.lastX = x;
    this.lastY = y;
    this.samples.length = 0;
    this.pushSample(x, y, t);
  }

  private pickPair(): [ActivePointer, ActivePointer] | null {
    if (this.pointers.size < 2) return null;
    const it = this.pointers.values();
    return [it.next().value as ActivePointer, it.next().value as ActivePointer];
  }

  private firstPointer(): ActivePointer | null {
    const first = this.pointers.values().next();
    return first.done ? null : first.value;
  }

  private beginPinch(a: ActivePointer, b: ActivePointer, t: number): void {
    this._mode = 'pinch';
    this.pinchPair = [a.id, b.id];
    const dist = this.pinchDistance(a, b);
    this.lastPinchDistance = dist;
    this.handlers.onPinchStart?.({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      distance: dist,
      t,
    });
  }

  private pinchDistance(a: ActivePointer, b: ActivePointer): number {
    return Math.max(tuning.input.pinchMinDistance, Math.hypot(b.x - a.x, b.y - a.y));
  }

  private pushSample(x: number, y: number, t: number): void {
    this.samples.push({ x, y, t });
    const cutoff = t - tuning.input.velocityWindowSeconds * 1000;
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift();
  }

  private computeVelocity(now: number): { vx: number; vy: number } {
    if (this.samples.length < 2) return { vx: 0, vy: 0 };
    const stopMs = tuning.input.velocityStopSeconds * 1000;
    // 마지막 실제 이동 뒤 한참 멈춰 있다가 떼면 관성을 주지 않는다
    const last = this.samples[this.samples.length - 1];
    const prev = this.samples[this.samples.length - 2];
    const lastMoved = last.x !== prev.x || last.y !== prev.y ? last.t : prev.t;
    if (now - lastMoved > stopMs) return { vx: 0, vy: 0 };

    const cutoff = now - tuning.input.velocityWindowSeconds * 1000;
    let first = this.samples[0];
    for (const s of this.samples) {
      if (s.t >= cutoff) {
        first = s;
        break;
      }
    }
    const dtSec = (last.t - first.t) / 1000;
    if (dtSec <= 0) return { vx: 0, vy: 0 };
    return { vx: (last.x - first.x) / dtSec, vy: (last.y - first.y) / dtSec };
  }
}

/** DOM 요소의 Pointer Events(와 선택적 휠 이벤트)를 GestureRecognizer 에 잇는다 */
export function listenGestures(
  el: HTMLElement,
  handlers: GestureHandlers & { onWheel?: (e: WheelEventData) => void },
): () => void {
  const recognizer = new GestureRecognizer(handlers);

  const toInput = (e: PointerEvent): PointerInput => ({
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    t: e.timeStamp,
    pointerType: e.pointerType,
    button: e.button,
  });

  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // 합성 PointerEvent 등 활성 포인터가 없을 때는 캡처를 건너뛴다
    }
    recognizer.down(toInput(e));
  };
  const move = (e: PointerEvent) => recognizer.move(toInput(e));
  const up = (e: PointerEvent) => recognizer.up(toInput(e));
  const cancel = (e: PointerEvent) => recognizer.cancel(toInput(e));
  const wheel = (e: WheelEvent) => {
    if (!handlers.onWheel) return;
    e.preventDefault();
    // 트랙패드 핀치(ctrlKey)는 작은 deltaY 를 보내므로 감도를 높인다
    const scale = (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1) * (e.ctrlKey ? 4 : 1);
    handlers.onWheel({ x: e.clientX, y: e.clientY, deltaY: e.deltaY * scale });
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  if (handlers.onWheel) el.addEventListener('wheel', wheel, { passive: false });

  return () => {
    recognizer.reset();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    if (handlers.onWheel) el.removeEventListener('wheel', wheel);
  };
}
