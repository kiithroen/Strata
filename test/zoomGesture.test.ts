import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { clampScale, panZoomState, toggleDoubleTapZoom, type ZoomBounds } from '../src/widgets/common/imageZoom';
import { isTapRelease, wheelDeltaPx, ZoomGesture, type GesturePoint, type ZoomGestureOptions } from '../src/widgets/common/zoomGesture';

const BOUNDS: ZoomBounds = { viewWidth: 800, viewHeight: 600, contentWidth: 800, contentHeight: 600 };
const CENTER = { x: 400, y: 300 };

function makeGesture(options?: ZoomGestureOptions): ZoomGesture {
  return new ZoomGesture({ bounds: () => BOUNDS, focal: (x, y) => ({ x: x - CENTER.x, y: y - CENTER.y }) }, options);
}

function pt(id: number, x: number, y: number, t: number): GesturePoint {
  return { id, x, y, t };
}

const tapMs = tuning.input.tapMaxSeconds * 1000;
const doubleMs = tuning.zoom.doubleTapSeconds * 1000;
const slop = tuning.input.tapSlop;

/** 누르고 바로 떼는 탭 하나. 뗀 결과를 돌려준다 */
function tap(g: ZoomGesture, x: number, y: number, t: number, id = 1) {
  g.down(pt(id, x, y, t));
  return g.end(pt(id, x, y, t + tapMs / 2), false);
}

describe('isTapRelease', () => {
  it('input.tapSlop·tapMaxSeconds 안이면 탭이다', () => {
    expect(isTapRelease({ x: 0, y: 0, t: 0 }, { x: slop, y: 0, t: tapMs })).toBe(true);
    expect(isTapRelease({ x: 0, y: 0, t: 0 }, { x: slop + 1, y: 0, t: 0 })).toBe(false);
    expect(isTapRelease({ x: 0, y: 0, t: 0 }, { x: 0, y: 0, t: tapMs + 1 })).toBe(false);
  });
});

describe('wheelDeltaPx', () => {
  it('줄·쪽 단위와 Ctrl 배수를 tuning.zoom 으로 바꾼다', () => {
    const z = tuning.zoom;
    expect(wheelDeltaPx(3, 0, false)).toBe(3);
    expect(wheelDeltaPx(3, 1, false)).toBe(3 * z.wheelLinePx);
    expect(wheelDeltaPx(3, 2, false)).toBe(3 * z.wheelPagePx);
    expect(wheelDeltaPx(3, 0, true)).toBe(3 * z.wheelCtrlBoost);
  });
});

describe('ZoomGesture 탭', () => {
  it('움직이지 않고 뗀 한 손가락은 확정 전 탭이고, confirmTap 은 한 번만 참이다', () => {
    const g = makeGesture();
    const r = tap(g, 100, 100, 0);
    expect(r.tap).not.toBeNull();
    expect(r.doubleTap).toBe(false);
    expect(g.confirmTap(r.tap!)).toBe(true);
    expect(g.confirmTap(r.tap!)).toBe(false);
  });

  it('input.tapSlop 넘게 움직이면 탭이 아니다', () => {
    const g = makeGesture();
    g.down(pt(1, 100, 100, 0));
    g.move(pt(1, 100 + slop * 2, 100, 10));
    expect(g.end(pt(1, 100, 100, 20), false).tap).toBeNull();
  });

  it('input.tapMaxSeconds 보다 오래 누르면 탭이 아니다', () => {
    const g = makeGesture();
    g.down(pt(1, 100, 100, 0));
    expect(g.end(pt(1, 100, 100, tapMs + 1), false).tap).toBeNull();
  });

  it('취소된 포인터는 탭이 아니고 기다리던 탭도 지운다', () => {
    const g = makeGesture();
    const first = tap(g, 100, 100, 0).tap!;
    g.down(pt(2, 100, 100, 50));
    expect(g.end(pt(2, 100, 100, 60), true).tap).toBeNull();
    expect(g.confirmTap(first)).toBe(false);
  });

  it('누르고 있는 동안에는 기다리던 탭을 확정하지 않는다', () => {
    const g = makeGesture();
    const first = tap(g, 100, 100, 0).tap!;
    g.down(pt(2, 300, 300, doubleMs / 2));
    expect(g.confirmTap(first)).toBe(false);
  });

  it('forgetTap 은 기다리던 탭을 버린다', () => {
    const g = makeGesture();
    const first = tap(g, 100, 100, 0).tap!;
    g.forgetTap();
    expect(g.confirmTap(first)).toBe(false);
  });

  it('두 손가락이 닿았던 조작은 탭이 아니다', () => {
    const g = makeGesture();
    g.down(pt(1, 100, 100, 0));
    g.down(pt(2, 200, 100, 5));
    g.end(pt(2, 200, 100, 10), false);
    expect(g.end(pt(1, 100, 100, 15), false).tap).toBeNull();
  });
});

describe('ZoomGesture 더블탭', () => {
  it('zoom.doubleTapSeconds 안의 두 번째 탭은 배율을 토글하고 첫 탭을 무효로 한다', () => {
    const g = makeGesture();
    const first = tap(g, 500, 400, 0).tap!;
    const second = tap(g, 500, 400, doubleMs / 2);
    expect(second.doubleTap).toBe(true);
    expect(second.tap).toBeNull();
    expect(second.redraw && second.animate).toBe(true);
    const expected = toggleDoubleTapZoom({ scale: tuning.zoom.minScale, x: 0, y: 0 }, { x: 100, y: 100 }, BOUNDS);
    expect(g.zoom.state).toEqual(expected);
    expect(g.confirmTap(first)).toBe(false);
  });

  it('zoom.doubleTapSeconds 가 지나서 온 탭은 새 단일 탭이다', () => {
    const g = makeGesture();
    tap(g, 500, 400, 0);
    const late = tap(g, 500, 400, doubleMs + tapMs);
    expect(late.doubleTap).toBe(false);
    expect(late.tap).not.toBeNull();
    expect(g.zoom.zoomed).toBe(false);
  });

  it('확대하지 않는 제스처는 더블탭만 알리고 배율은 그대로다', () => {
    const g = makeGesture({ zoomable: false });
    tap(g, 500, 400, 0);
    const second = tap(g, 500, 400, doubleMs / 2);
    expect(second.doubleTap).toBe(true);
    expect(second.redraw).toBe(false);
    expect(g.zoom.zoomed).toBe(false);
  });
});

describe('ZoomGesture 핀치·팬', () => {
  it('두 손가락 거리 비율만큼 확대하고 두 포인터를 잡게 한다', () => {
    const g = makeGesture();
    g.down(pt(1, 350, 300, 0));
    const second = g.down(pt(2, 450, 300, 5));
    expect(second.consumed).toBe(true);
    expect(second.capture).toEqual([1, 2]);
    const r = g.move(pt(2, 550, 300, 20));
    expect(r.redraw && r.consumed).toBe(true);
    expect(g.zoom.scale).toBeCloseTo(clampScale(tuning.zoom.minScale * 2), 6);
  });

  it('확대하지 않는 제스처는 핀치를 가져가지 않는다', () => {
    const g = makeGesture({ zoomable: false });
    g.down(pt(1, 350, 300, 0));
    expect(g.down(pt(2, 450, 300, 5)).consumed).toBe(false);
    expect(g.move(pt(2, 550, 300, 20)).redraw).toBe(false);
    expect(g.zoom.zoomed).toBe(false);
  });

  it('확대 중 핀치에서 한 손가락을 떼면 남은 손가락으로 팬을 잇는다', () => {
    const g = makeGesture();
    g.down(pt(1, 350, 300, 0));
    g.down(pt(2, 450, 300, 5));
    g.move(pt(2, 650, 300, 20));
    expect(g.end(pt(2, 650, 300, 30), false).consumed).toBe(true);
    expect(g.panning).toBe(true);
    const before = g.zoom.state;
    g.move(pt(1, 330, 290, 40));
    expect(g.zoom.state).toEqual(panZoomState(before, -20, -10, BOUNDS));
  });

  it('확대 중 한 손가락은 팬이고 떼면 놓아 준다', () => {
    const g = makeGesture();
    tap(g, 400, 300, 0);
    tap(g, 400, 300, doubleMs / 2);
    expect(g.zoom.zoomed).toBe(true);
    const down = g.down(pt(3, 400, 300, 1000));
    expect(down.consumed).toBe(true);
    expect(down.capture).toEqual([3]);
    const before = g.zoom.state;
    const move = g.move(pt(3, 430, 320, 1010));
    expect(move.redraw && move.consumed).toBe(true);
    expect(g.zoom.state).toEqual(panZoomState(before, 30, 20, BOUNDS));
    expect(g.end(pt(3, 430, 320, 1020), false).consumed).toBe(true);
    expect(g.panning).toBe(false);
  });

  it('기본 배율의 한 손가락은 가져가지 않는다(넘기기·스크롤 몫)', () => {
    const g = makeGesture();
    expect(g.down(pt(1, 100, 100, 0)).consumed).toBe(false);
    expect(g.move(pt(1, 100, 200, 10)).consumed).toBe(false);
  });

  it('blur 는 남은 포인터를 버리고 배율을 정리한다(zoom.snapEpsilon 안이면 기본 배율)', () => {
    const g = makeGesture();
    g.down(pt(1, 350, 300, 0));
    g.down(pt(2, 450, 300, 5));
    // 거리 100 을 snapEpsilon 의 절반만큼 늘려 붙임 여유 안에서 확대한다
    g.move(pt(2, 450 + (100 * tuning.zoom.snapEpsilon) / 2, 300, 10));
    expect(g.zoom.zoomed).toBe(true);
    expect(g.blur().redraw).toBe(true);
    expect(g.pointerCount).toBe(0);
    expect(g.tracks(1)).toBe(false);
    expect(g.zoom.zoomed).toBe(false);
    expect(g.blur().redraw).toBe(false);
  });
});

describe('ZoomGesture 휠', () => {
  const up = { deltaY: -100, deltaMode: 0, ctrlKey: false, x: 400, y: 300 };
  const down = { ...up, deltaY: 100 };

  it('전체 화면 사진은 일반 휠을 위로 굴리면 확대한다', () => {
    const g = makeGesture();
    expect(g.wheel(up)?.redraw).toBe(true);
    expect(g.zoom.zoomed).toBe(true);
  });

  it('문서 안 사진은 기본 배율의 일반 휠을 받지 않아 스크롤로 넘긴다', () => {
    const g = makeGesture({ inScroll: true });
    expect(g.wheel(up)).toBeNull();
    expect(g.wheel(down)).toBeNull();
    expect(g.zoom.zoomed).toBe(false);
  });

  it('문서 안 사진도 Ctrl 휠(트랙패드 핀치)은 확대하고, 확대 중에는 일반 휠로 배율을 바꾼다', () => {
    const g = makeGesture({ inScroll: true });
    expect(g.wheel({ ...up, ctrlKey: true })?.redraw).toBe(true);
    expect(g.zoom.zoomed).toBe(true);
    const zoomedScale = g.zoom.scale;
    expect(g.wheel(down)).not.toBeNull();
    expect(g.zoom.scale).toBeLessThan(zoomedScale);
  });

  it('휠은 기다리던 탭을 지운다', () => {
    const g = makeGesture();
    const first = tap(g, 100, 100, 0).tap!;
    g.wheel(up);
    expect(g.confirmTap(first)).toBe(false);
  });

  it('확대하지 않는 제스처는 휠을 받지 않는다', () => {
    expect(makeGesture({ zoomable: false }).wheel(up)).toBeNull();
  });
});
