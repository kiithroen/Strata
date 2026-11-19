import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import {
  clampScale,
  clampZoomState,
  ImageZoom,
  initialZoomState,
  isDoubleTap,
  maxPanOffset,
  panZoomState,
  pinchZoomFactor,
  settleZoomState,
  toggleDoubleTapZoom,
  wheelZoomFactor,
  zoomAtPoint,
  zoomTransformCss,
  type ZoomBounds,
} from '../src/widgets/common/imageZoom';

const FULL_BOUNDS: ZoomBounds = {
  viewWidth: 800,
  viewHeight: 600,
  contentWidth: 800,
  contentHeight: 600,
};

const PORTRAIT_IN_WIDE: ZoomBounds = {
  viewWidth: 1200,
  viewHeight: 800,
  contentWidth: 400,
  contentHeight: 800,
};

describe('clampScale', () => {
  const { minScale, maxScale } = tuning.zoom;

  it('배율을 tuning.zoom.minScale~maxScale 안으로 자른다', () => {
    expect(clampScale(minScale - 0.5)).toBe(minScale);
    expect(clampScale(maxScale + 3)).toBe(maxScale);
    const mid = (minScale + maxScale) / 2;
    expect(clampScale(mid)).toBe(mid);
  });

  it('비정상 숫자는 최소 배율로 돌린다', () => {
    expect(clampScale(Number.NaN)).toBe(minScale);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(minScale);
  });
});

describe('maxPanOffset · clampZoomState', () => {
  const { minScale } = tuning.zoom;

  it('기본 배율에서는 이동 여유가 0 이고 오프셋도 원점이다', () => {
    expect(maxPanOffset(minScale, FULL_BOUNDS)).toEqual({ x: 0, y: 0 });
    expect(clampZoomState({ scale: minScale, x: 50, y: -30 }, FULL_BOUNDS)).toEqual({
      scale: minScale,
      x: 0,
      y: 0,
    });
  });

  it('표시 상자보다 큰 축만 넘친 폭의 절반만큼 팬을 허용한다', () => {
    const scale = 2;
    expect(maxPanOffset(scale, PORTRAIT_IN_WIDE)).toEqual({
      x: 0,
      y: (PORTRAIT_IN_WIDE.contentHeight * scale - PORTRAIT_IN_WIDE.viewHeight) / 2,
    });
    const wideScale = 4;
    expect(maxPanOffset(wideScale, PORTRAIT_IN_WIDE)).toEqual({
      x: (PORTRAIT_IN_WIDE.contentWidth * wideScale - PORTRAIT_IN_WIDE.viewWidth) / 2,
      y: (PORTRAIT_IN_WIDE.contentHeight * wideScale - PORTRAIT_IN_WIDE.viewHeight) / 2,
    });
  });

  it('크기가 0 이하인 경계에서도 안전하게 0 을 낸다', () => {
    expect(maxPanOffset(2, { viewWidth: 0, viewHeight: 0, contentWidth: 0, contentHeight: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('오프셋을 경계 안으로 자른다', () => {
    const scale = 2;
    const max = maxPanOffset(scale, FULL_BOUNDS);
    expect(clampZoomState({ scale, x: max.x + 200, y: -(max.y + 150) }, FULL_BOUNDS)).toEqual({
      scale,
      x: max.x,
      y: -max.y,
    });
  });
});

describe('zoomAtPoint · panZoomState', () => {
  it('확대할 때 초점 아래의 사진 지점을 같은 화면 좌표에 유지한다', () => {
    const focal = { x: 120, y: -80 };
    const s1 = 2;
    const next = zoomAtPoint(initialZoomState(), s1, focal, FULL_BOUNDS);
    const max = maxPanOffset(s1, FULL_BOUNDS);
    expect(Math.abs(next.x)).toBeLessThanOrEqual(max.x);
    expect(Math.abs(next.y)).toBeLessThanOrEqual(max.y);
    // 기본 배율에서 (focal.x, focal.y) 에 있던 원본 좌표 u = focal.x 는 확대 후 u * s1 + next.x = focal.x 여야 한다
    expect(focal.x * next.scale + next.x).toBeCloseTo(focal.x, 6);
    expect(focal.y * next.scale + next.y).toBeCloseTo(focal.y, 6);
  });

  it('핀치 중 두 손가락 중심 이동(panDelta)을 함께 반영해 사진이 손가락을 따른다', () => {
    const start = zoomAtPoint(initialZoomState(), 2, { x: 0, y: 0 }, FULL_BOUNDS);
    const prevFocal = { x: 40, y: -20 };
    const panDelta = { x: 30, y: 15 };
    const nextFocal = { x: prevFocal.x + panDelta.x, y: prevFocal.y + panDelta.y };
    const u = (prevFocal.x - start.x) / start.scale;
    const v = (prevFocal.y - start.y) / start.scale;
    const next = zoomAtPoint(start, 3, nextFocal, FULL_BOUNDS, panDelta);
    expect(u * next.scale + next.x).toBeCloseTo(nextFocal.x, 6);
    expect(v * next.scale + next.y).toBeCloseTo(nextFocal.y, 6);
  });

  it('기본 배율에서는 팬해도 움직이지 않고, 확대 중에는 경계 안에서 팬한다', () => {
    expect(panZoomState(initialZoomState(), 100, -50, FULL_BOUNDS)).toEqual(initialZoomState());
    const zoomed = zoomAtPoint(initialZoomState(), 2, { x: 0, y: 0 }, FULL_BOUNDS);
    const panned = panZoomState(zoomed, 120, -90, FULL_BOUNDS);
    expect(panned).toEqual({ scale: 2, x: 120, y: -90 });
    const clamped = panZoomState(panned, 10000, -10000, FULL_BOUNDS);
    const max = maxPanOffset(2, FULL_BOUNDS);
    expect(clamped).toEqual({ scale: 2, x: max.x, y: -max.y });
  });
});

describe('toggleDoubleTapZoom · isDoubleTap', () => {
  const { minScale, doubleTapScale, doubleTapSeconds, doubleTapSlop } = tuning.zoom;

  it('기본 배율에서 더블탭하면 초점 중심으로 확대하고, 다시 더블탭하면 1 배로 복귀한다', () => {
    const focal = { x: 100, y: 50 };
    const zoomed = toggleDoubleTapZoom(initialZoomState(), focal, FULL_BOUNDS);
    expect(zoomed.scale).toBe(clampScale(doubleTapScale));
    expect(focal.x * zoomed.scale + zoomed.x).toBeCloseTo(focal.x, 6);
    expect(focal.y * zoomed.scale + zoomed.y).toBeCloseTo(focal.y, 6);

    const reset = toggleDoubleTapZoom(zoomed, { x: -50, y: 20 }, FULL_BOUNDS);
    expect(reset).toEqual({ scale: minScale, x: 0, y: 0 });
  });

  it('더블탭은 시간·거리 기준 안에서만 성립한다', () => {
    const first = { x: 200, y: 300, t: 1000 };
    const maxMs = doubleTapSeconds * 1000;
    expect(isDoubleTap(null, first)).toBe(false);
    expect(isDoubleTap(first, { x: 200 + doubleTapSlop * 0.5, y: 300, t: 1000 + maxMs * 0.5 })).toBe(true);
    expect(isDoubleTap(first, { x: 200, y: 300, t: 1000 + maxMs + 1 })).toBe(false);
    expect(isDoubleTap(first, { x: 200 + doubleTapSlop + 1, y: 300, t: 1000 + 50 })).toBe(false);
    expect(isDoubleTap(first, { x: 200, y: 300, t: 999 })).toBe(false);
  });
});

describe('wheelZoomFactor · pinchZoomFactor · settleZoomState', () => {
  const { minScale, wheelSpeed, snapEpsilon } = tuning.zoom;
  const { pinchMinDistance } = tuning.input;

  it('휠 위(음수)는 확대, 아래(양수)는 축소이며 크기가 같으면 역수다', () => {
    const up = wheelZoomFactor(-100);
    const down = wheelZoomFactor(100);
    expect(up).toBeCloseTo(Math.exp(wheelSpeed), 6);
    expect(up * down).toBeCloseTo(1, 6);
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(Number.NaN)).toBe(1);
  });

  it('핀치 거리는 최소 거리 하한으로 보호된다', () => {
    expect(pinchZoomFactor(100, 150)).toBeCloseTo(1.5, 6);
    expect(pinchZoomFactor(0, pinchMinDistance * 2)).toBeCloseTo(2, 6);
    expect(pinchZoomFactor(2, 3)).toBe(1);
  });

  it('settleZoomState 는 최소 배율에 아주 가까운 배율을 1 배로 정리한다', () => {
    const near = { scale: minScale + snapEpsilon * 0.5, x: 5, y: -3 };
    expect(settleZoomState(near, FULL_BOUNDS)).toEqual(initialZoomState());
    const far = { scale: minScale + snapEpsilon * 2, x: 5, y: -3 };
    expect(settleZoomState(far, FULL_BOUNDS).scale).toBeCloseTo(far.scale, 6);
  });
});

describe('ImageZoom · zoomTransformCss', () => {
  it('컨트롤러로 휠·팬·핀치·화면 크기 변경·초기화를 일관되게 처리한다', () => {
    const zoom = new ImageZoom();
    expect(zoom.zoomed).toBe(false);
    expect(zoomTransformCss(zoom.state)).toBe('');

    zoom.wheel(-200, { x: 80, y: -40 }, FULL_BOUNDS);
    expect(zoom.zoomed).toBe(true);
    expect(zoomTransformCss(zoom.state)).toContain(`scale(${zoom.scale})`);

    const prevX = zoom.x;
    zoom.pan(40, 0, FULL_BOUNDS);
    expect(zoom.x).toBeGreaterThan(prevX);

    // 창이 넓어져 사진이 들어가면 오프셋을 새 경계 안으로 재정렬한다
    const wider: ZoomBounds = { viewWidth: 4000, viewHeight: 3000, contentWidth: 800, contentHeight: 600 };
    zoom.clamp(wider);
    expect(zoom.x).toBe(0);
    expect(zoom.y).toBe(0);

    zoom.pinch(100, 200, { x: 0, y: 0 }, FULL_BOUNDS);
    expect(zoom.scale).toBeGreaterThan(tuning.zoom.minScale);

    zoom.reset();
    expect(zoom.zoomed).toBe(false);
    expect(zoom.state).toEqual(initialZoomState());
  });
});
