import { tuning } from '../../config';
import { ImageZoom, isDoubleTap, type Point2D, type TapRecord, type ZoomBounds } from './imageZoom';

/** 제스처가 재는 표시 영역. 보기 쪽이 DOM 을 재서 넘긴다 */
export interface ZoomFrame {
  bounds(): ZoomBounds;
  /** 화면 좌표(clientX·clientY)를 표시 중심 기준 좌표(CSS px)로 바꾼다 */
  focal(x: number, y: number): Point2D;
}

/** 포인터 입력 하나. x·y 는 화면 좌표(CSS px), t 는 이벤트 시각(ms)이다 */
export interface GesturePoint {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

/** PointerEvent 를 제스처 입력으로 바꾼다 */
export function gesturePoint(e: { pointerId: number; clientX: number; clientY: number; timeStamp: number }): GesturePoint {
  return { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
}

/** 휠 입력 하나. deltaMode 는 WheelEvent 의 단위(0 px, 1 줄, 2 쪽)다 */
export interface GestureWheel {
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly ctrlKey: boolean;
  readonly x: number;
  readonly y: number;
}

export interface ZoomGestureOptions {
  /** 핀치·더블탭·휠로 확대한다. false 면 탭과 더블탭만 판정한다(동영상) */
  zoomable?: boolean;
  /**
   * 스크롤되는 문서 안의 사진이다. 기본 배율의 일반 휠은 문서 스크롤로 넘기고,
   * Ctrl 휠(트랙패드 핀치)이나 확대 중일 때만 배율을 바꾼다
   */
  inScroll?: boolean;
}

/** 입력 하나를 처리한 결과 */
export interface GestureStep {
  /** 확대 상태가 바뀌었다. 다시 그린다 */
  readonly redraw: boolean;
  /** 더블탭처럼 전환 효과를 넣어 그린다 */
  readonly animate: boolean;
  /** 이 입력을 확대 이동·핀치가 썼다. 보기 쪽은 넘기기·문서 스크롤로 넘기지 않는다 */
  readonly consumed: boolean;
  /** 보기 쪽이 잡아야(setPointerCapture) 할 포인터들 */
  readonly capture: readonly number[];
  /** 확정 전 단일 탭. 보기 쪽은 zoom.doubleTapSeconds 뒤 confirmTap 으로 아직 유효한지 묻는다 */
  readonly tap: TapRecord | null;
  /** 더블탭이 들어왔다(확대할 수 있으면 배율도 토글했다) */
  readonly doubleTap: boolean;
}

const IDLE: GestureStep = { redraw: false, animate: false, consumed: false, capture: [], tap: null, doubleTap: false };

function step(fields: Partial<GestureStep>): GestureStep {
  return { ...IDLE, ...fields };
}

/** 휠 deltaY 를 px 로 바꾼다. 줄·쪽 단위는 zoom.wheelLinePx·wheelPagePx, Ctrl 이면 zoom.wheelCtrlBoost 를 곱한다 */
export function wheelDeltaPx(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
  const z = tuning.zoom;
  const unit = deltaMode === 1 ? z.wheelLinePx : deltaMode === 2 ? z.wheelPagePx : 1;
  return deltaY * unit * (ctrlKey ? z.wheelCtrlBoost : 1);
}

/** 누른 자리·시각에서 뗀 자리·시각까지가 탭(input.tapSlop·input.tapMaxSeconds 안)인지 */
export function isTapRelease(start: TapRecord, end: TapRecord): boolean {
  if (end.t - start.t > tuning.input.tapMaxSeconds * 1000) return false;
  return Math.hypot(end.x - start.x, end.y - start.y) <= tuning.input.tapSlop;
}

/**
 * 사진 확대 제스처 판정. 한 손가락은 확대 중일 때 팬, 두 손가락은 핀치, 움직이지 않고 뗀 한 손가락은 탭이다.
 * 탭은 더블탭을 기다리는 동안 확정 전으로 두고, 더블탭이면 배율을 토글한다. 끌기·멀티터치·휠·forgetTap 은 기다리던 탭을 지운다.
 * DOM 은 모르고, 영역 크기와 초점은 frame 으로 받는다
 */
export class ZoomGesture {
  readonly zoom = new ImageZoom();
  zoomable: boolean;
  private readonly inScroll: boolean;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch: { ids: [number, number]; midX: number; midY: number; dist: number } | null = null;
  private pan: { id: number; lastX: number; lastY: number } | null = null;
  private press: { id: number; x: number; y: number; t: number; moved: boolean } | null = null;
  private lastTap: TapRecord | null = null;
  private wasMulti = false;

  constructor(
    private readonly frame: ZoomFrame,
    options: ZoomGestureOptions = {},
  ) {
    this.zoomable = options.zoomable ?? true;
    this.inScroll = options.inScroll ?? false;
  }

  /** 닿아 있는 포인터 수 */
  get pointerCount(): number {
    return this.pointers.size;
  }

  /** 확대한 사진을 한 손가락으로 끌고 있다 */
  get panning(): boolean {
    return this.pan !== null;
  }

  /** 이 포인터를 따라가고 있다 */
  tracks(id: number): boolean {
    return this.pointers.has(id);
  }

  down(p: GesturePoint): GestureStep {
    this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.pointers.size === 1) {
      this.wasMulti = false;
      this.press = { id: p.id, x: p.x, y: p.y, t: p.t, moved: false };
      if (this.zoomable && this.zoom.zoomed) {
        this.pan = { id: p.id, lastX: p.x, lastY: p.y };
        return step({ consumed: true, capture: [p.id] });
      }
      return IDLE;
    }
    this.wasMulti = true;
    this.press = null;
    this.lastTap = null;
    this.pan = null;
    if (!this.zoomable) return IDLE;
    if (!this.pinch) return step({ consumed: true, capture: this.beginPinch() });
    return step({ consumed: true });
  }

  move(p: GesturePoint): GestureStep {
    const active = this.pointers.get(p.id);
    if (!active) return IDLE;
    active.x = p.x;
    active.y = p.y;

    if (this.press && this.press.id === p.id && Math.hypot(p.x - this.press.x, p.y - this.press.y) > tuning.input.tapSlop) {
      this.press.moved = true;
      this.lastTap = null;
    }

    if (this.pinch) {
      const a = this.pointers.get(this.pinch.ids[0]);
      const b = this.pointers.get(this.pinch.ids[1]);
      if (!a || !b) return IDLE;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const panDelta = { x: midX - this.pinch.midX, y: midY - this.pinch.midY };
      this.zoom.pinch(this.pinch.dist, dist, this.frame.focal(midX, midY), this.frame.bounds(), panDelta);
      this.pinch.midX = midX;
      this.pinch.midY = midY;
      this.pinch.dist = dist;
      return step({ redraw: true, consumed: true });
    }

    if (this.pan && this.pan.id === p.id) {
      const dx = p.x - this.pan.lastX;
      const dy = p.y - this.pan.lastY;
      this.pan.lastX = p.x;
      this.pan.lastY = p.y;
      this.zoom.pan(dx, dy, this.frame.bounds());
      return step({ redraw: true, consumed: true });
    }
    return IDLE;
  }

  /** 포인터를 뗐다(cancelled 면 브라우저가 가져갔거나 창 밖에서 끝났다) */
  end(p: GesturePoint, cancelled: boolean): GestureStep {
    if (!this.pointers.delete(p.id)) return IDLE;

    if (this.pinch && (p.id === this.pinch.ids[0] || p.id === this.pinch.ids[1])) {
      this.pinch = null;
      if (this.pointers.size >= 2) return step({ consumed: true, capture: this.beginPinch() });
      if (this.pointers.size === 1 && this.zoom.zoomed) {
        const [remId, rem] = this.pointers.entries().next().value as [number, { x: number; y: number }];
        this.pan = { id: remId, lastX: rem.x, lastY: rem.y };
        return step({ consumed: true });
      }
      if (this.pointers.size === 0) {
        this.wasMulti = false;
        this.zoom.settle(this.frame.bounds());
        return step({ redraw: true, consumed: true });
      }
      return step({ consumed: true });
    }

    let redraw = false;
    let consumed = false;
    if (this.pan && this.pan.id === p.id) {
      this.pan = null;
      consumed = true;
      if (this.pointers.size === 0) {
        this.zoom.settle(this.frame.bounds());
        redraw = true;
      }
    }

    let tap: TapRecord | null = null;
    let doubleTap = false;
    let animate = false;
    const press = this.press;
    if (!cancelled && this.pointers.size === 0 && !this.wasMulti && press && press.id === p.id && !press.moved) {
      const release: TapRecord = { x: p.x, y: p.y, t: p.t };
      if (isTapRelease(press, release)) {
        if (isDoubleTap(this.lastTap, release)) {
          this.lastTap = null;
          doubleTap = true;
          if (this.zoomable) {
            this.zoom.doubleTap(this.frame.focal(release.x, release.y), this.frame.bounds());
            redraw = true;
            animate = true;
          }
        } else {
          this.lastTap = release;
          tap = release;
        }
      }
    }

    if (this.pointers.size === 0) {
      this.wasMulti = false;
      this.press = null;
      if (cancelled) this.lastTap = null;
    }
    return step({ redraw, animate, consumed, tap, doubleTap });
  }

  /** 휠 입력. 제스처가 받지 않으면(문서 스크롤로 넘긴다) null 이다 */
  wheel(w: GestureWheel): GestureStep | null {
    if (!this.zoomable) return null;
    if (this.inScroll && !w.ctrlKey && !this.zoom.zoomed) return null;
    this.lastTap = null;
    const bounds = this.frame.bounds();
    this.zoom.wheel(wheelDeltaPx(w.deltaY, w.deltaMode, w.ctrlKey), this.frame.focal(w.x, w.y), bounds);
    if (w.deltaY > 0) this.zoom.settle(bounds);
    return step({ redraw: true });
  }

  /** 기다리던 단일 탭이 아직 유효한지 묻고 지운다. 그사이 더블탭·끌기·새 누름이 있었으면 false 다 */
  confirmTap(tap: TapRecord): boolean {
    if (this.lastTap !== tap) return false;
    this.lastTap = null;
    return this.pointers.size === 0;
  }

  /** 기다리던 단일 탭을 버린다(그 탭이 다른 조작이었다고 판단했을 때) */
  forgetTap(): void {
    this.lastTap = null;
  }

  /** 창이 초점을 잃어 뗀 소식이 오지 않을 포인터를 모두 버리고 배율을 정리한다 */
  blur(): GestureStep {
    if (this.pointers.size === 0) return IDLE;
    this.clearPointers();
    this.zoom.settle(this.frame.bounds());
    return step({ redraw: true });
  }

  /** 영역 크기가 바뀌었을 때 확대 상태를 경계 안으로 다시 자른다 */
  fit(): GestureStep {
    if (!this.zoom.zoomed) return IDLE;
    this.zoom.clamp(this.frame.bounds());
    return step({ redraw: true });
  }

  /** 포인터·탭·배율을 모두 처음으로 */
  reset(): void {
    this.clearPointers();
    this.zoom.reset();
  }

  private clearPointers(): void {
    this.pointers.clear();
    this.pinch = null;
    this.pan = null;
    this.press = null;
    this.lastTap = null;
    this.wasMulti = false;
  }

  /** 닿아 있는 앞의 두 포인터로 핀치를 시작하고 그 둘을 돌려준다 */
  private beginPinch(): number[] {
    const it = this.pointers.entries();
    const first = it.next();
    const second = it.next();
    if (first.done || second.done) return [];
    const [idA, a] = first.value;
    const [idB, b] = second.value;
    this.pinch = { ids: [idA, idB], midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, dist: Math.hypot(b.x - a.x, b.y - a.y) };
    return [idA, idB];
  }
}
