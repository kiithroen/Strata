import { tuning } from '../../config';

/** 사진 확대·이동 상태. x·y 는 화면 중심 기준 평행 이동(CSS px)이다 */
export interface ZoomState {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** 확대·이동 경계를 정하는 표시 상자(view)와 기본 배율 사진(content)의 CSS px 크기 */
export interface ZoomBounds {
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
}

/** 중심 기준 평면 좌표 또는 이동량(CSS px) */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/** 더블탭 판정에 쓰는 단일 탭 기록(t 는 ms) */
export interface TapRecord {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

const ZERO_POINT: Point2D = { x: 0, y: 0 };

function cleanZero(v: number): number {
  return v === 0 ? 0 : v;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 기본 배율의 초기 상태 */
export function initialZoomState(): ZoomState {
  return { scale: tuning.zoom.minScale, x: 0, y: 0 };
}

/** 배율을 zoom.minScale ~ zoom.maxScale 범위로 자른다 */
export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return tuning.zoom.minScale;
  return clamp(scale, tuning.zoom.minScale, tuning.zoom.maxScale);
}

/**
 * 주어진 배율과 경계에서 중심으로부터 허용되는 최대 팬 오프셋(양수).
 * 확대한 사진이 표시 상자 안에 다 들어오는 축은 0 이다
 */
export function maxPanOffset(scale: number, bounds: ZoomBounds): Point2D {
  if (scale <= tuning.zoom.minScale) return ZERO_POINT;
  const x =
    bounds.viewWidth > 0 && bounds.contentWidth > 0
      ? Math.max(0, (bounds.contentWidth * scale - bounds.viewWidth) / 2)
      : 0;
  const y =
    bounds.viewHeight > 0 && bounds.contentHeight > 0
      ? Math.max(0, (bounds.contentHeight * scale - bounds.viewHeight) / 2)
      : 0;
  return { x, y };
}

/** 배율과 팬 오프셋을 화면 경계 안으로 자른다. 기본 배율이면 오프셋은 (0, 0)이다 */
export function clampZoomState(state: ZoomState, bounds: ZoomBounds): ZoomState {
  const scale = clampScale(state.scale);
  if (scale <= tuning.zoom.minScale) return initialZoomState();
  const max = maxPanOffset(scale, bounds);
  return {
    scale,
    x: cleanZero(clamp(state.x, -max.x, max.x)),
    y: cleanZero(clamp(state.y, -max.y, max.y)),
  };
}

/**
 * focal(표시 중심 기준 CSS px) 아래의 사진 지점이 유지되도록 배율을 targetScale 로 바꾼다.
 * panDelta 는 같은 단계에서 초점이 이동한 양(핀치 중 두 손가락 중심 이동)이다
 */
export function zoomAtPoint(
  state: ZoomState,
  targetScale: number,
  focal: Point2D,
  bounds: ZoomBounds,
  panDelta: Point2D = ZERO_POINT,
): ZoomState {
  const nextScale = clampScale(targetScale);
  if (nextScale <= tuning.zoom.minScale) return initialZoomState();
  const prevScale = clampScale(state.scale);
  const ratio = nextScale / prevScale;
  const x = focal.x - ratio * (focal.x - panDelta.x - state.x);
  const y = focal.y - ratio * (focal.y - panDelta.y - state.y);
  return clampZoomState({ scale: nextScale, x, y }, bounds);
}

/** 확대 상태에서 오프셋을 (dx, dy)만큼 옮기고 경계 안으로 자른다 */
export function panZoomState(state: ZoomState, dx: number, dy: number, bounds: ZoomBounds): ZoomState {
  if (state.scale <= tuning.zoom.minScale) return initialZoomState();
  return clampZoomState({ scale: state.scale, x: state.x + dx, y: state.y + dy }, bounds);
}

/**
 * 더블탭 배율 토글. 기본 배율이면 focal 중심으로 zoom.doubleTapScale 까지 확대하고,
 * 이미 확대 중이면 기본 배율로 되돌린다
 */
export function toggleDoubleTapZoom(state: ZoomState, focal: Point2D, bounds: ZoomBounds): ZoomState {
  if (state.scale > tuning.zoom.minScale) return initialZoomState();
  return zoomAtPoint(state, tuning.zoom.doubleTapScale, focal, bounds);
}

/** 마우스 휠·트랙패드 deltaY(음수가 확대)를 배율 곱으로 바꾼다 */
export function wheelZoomFactor(deltaY: number): number {
  if (!Number.isFinite(deltaY)) return 1;
  return Math.exp((-deltaY / 100) * tuning.zoom.wheelSpeed);
}

/** 핀치 두 손가락 거리의 변화 비율. input.pinchMinDistance 하한으로 급격한 튐을 막는다 */
export function pinchZoomFactor(prevDistance: number, nextDistance: number): number {
  const minDist = tuning.input.pinchMinDistance;
  return Math.max(minDist, nextDistance) / Math.max(minDist, prevDistance);
}

/** 조작이 끝났을 때 배율이 zoom.minScale + zoom.snapEpsilon 이하면 기본 배율로 깔끔히 맞춘다 */
export function settleZoomState(state: ZoomState, bounds: ZoomBounds): ZoomState {
  if (state.scale <= tuning.zoom.minScale + tuning.zoom.snapEpsilon) return initialZoomState();
  return clampZoomState(state, bounds);
}

/** 두 탭이 zoom.doubleTapSeconds·zoom.doubleTapSlop 안의 더블탭인지 판정한다 */
export function isDoubleTap(prev: TapRecord | null, next: TapRecord): boolean {
  if (!prev) return false;
  const dt = next.t - prev.t;
  if (dt < 0 || dt > tuning.zoom.doubleTapSeconds * 1000) return false;
  return Math.hypot(next.x - prev.x, next.y - prev.y) <= tuning.zoom.doubleTapSlop;
}

/** 상태를 CSS transform 문자열로 바꾼다. 기본 배율·무이동이면 빈 문자열이다 */
export function zoomTransformCss(state: ZoomState): string {
  if (state.scale <= tuning.zoom.minScale && state.x === 0 && state.y === 0) return '';
  return `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
}

/** 사진 줌·팬 상태를 들고 있는 순수 컨트롤러 */
export class ImageZoom {
  private _state: ZoomState = initialZoomState();

  get state(): ZoomState {
    return this._state;
  }

  get scale(): number {
    return this._state.scale;
  }

  get x(): number {
    return this._state.x;
  }

  get y(): number {
    return this._state.y;
  }

  get zoomed(): boolean {
    return this._state.scale > tuning.zoom.minScale;
  }

  reset(): ZoomState {
    this._state = initialZoomState();
    return this._state;
  }

  zoomTo(scale: number, focal: Point2D, bounds: ZoomBounds, panDelta: Point2D = ZERO_POINT): ZoomState {
    this._state = zoomAtPoint(this._state, scale, focal, bounds, panDelta);
    return this._state;
  }

  zoomBy(factor: number, focal: Point2D, bounds: ZoomBounds, panDelta: Point2D = ZERO_POINT): ZoomState {
    return this.zoomTo(this._state.scale * factor, focal, bounds, panDelta);
  }

  wheel(deltaY: number, focal: Point2D, bounds: ZoomBounds): ZoomState {
    return this.zoomBy(wheelZoomFactor(deltaY), focal, bounds);
  }

  pinch(prevDistance: number, nextDistance: number, focal: Point2D, bounds: ZoomBounds, panDelta: Point2D = ZERO_POINT): ZoomState {
    return this.zoomBy(pinchZoomFactor(prevDistance, nextDistance), focal, bounds, panDelta);
  }

  pan(dx: number, dy: number, bounds: ZoomBounds): ZoomState {
    this._state = panZoomState(this._state, dx, dy, bounds);
    return this._state;
  }

  doubleTap(focal: Point2D, bounds: ZoomBounds): ZoomState {
    this._state = toggleDoubleTapZoom(this._state, focal, bounds);
    return this._state;
  }

  clamp(bounds: ZoomBounds): ZoomState {
    this._state = clampZoomState(this._state, bounds);
    return this._state;
  }

  settle(bounds: ZoomBounds): ZoomState {
    this._state = settleZoomState(this._state, bounds);
    return this._state;
  }
}
