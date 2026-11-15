import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { GestureRecognizer, type PointerEventRecord } from '../src/input/gesture';

type EventLog =
  | { type: 'touch'; count: number }
  | { type: 'tap'; x: number; y: number }
  | { type: 'dragStart'; x: number; y: number }
  | { type: 'dragMove'; dx: number; dy: number }
  | { type: 'dragEnd'; vx: number; vy: number }
  | { type: 'pinchStart'; x: number; y: number; distance: number }
  | { type: 'pinchMove'; x: number; y: number; distance: number; ratio: number }
  | { type: 'pinchEnd' };

function runSequence(events: readonly PointerEventRecord[]): EventLog[] {
  const log: EventLog[] = [];
  const g = new GestureRecognizer({
    onTouchCountChange: (count) => log.push({ type: 'touch', count }),
    onTap: (e) => log.push({ type: 'tap', x: e.x, y: e.y }),
    onDragStart: (e) => log.push({ type: 'dragStart', x: e.x, y: e.y }),
    onDragMove: (e) => log.push({ type: 'dragMove', dx: e.dx, dy: e.dy }),
    onDragEnd: (e) => log.push({ type: 'dragEnd', vx: e.vx, vy: e.vy }),
    onPinchStart: (e) => log.push({ type: 'pinchStart', x: e.x, y: e.y, distance: e.distance }),
    onPinchMove: (e) => log.push({ type: 'pinchMove', x: e.x, y: e.y, distance: e.distance, ratio: e.ratio }),
    onPinchEnd: () => log.push({ type: 'pinchEnd' }),
  });
  for (const ev of events) g.feed(ev);
  return log;
}

describe('GestureRecognizer', () => {
  const slop = tuning.input.tapSlop;
  const maxMs = tuning.input.tapMaxSeconds * 1000;

  it('짧게 누르고 tapSlop 안에서 떼면 탭으로 판정한다', () => {
    const log = runSequence([
      { type: 'down', id: 1, x: 100, y: 200, t: 10 },
      { type: 'move', id: 1, x: 100 + slop * 0.5, y: 200, t: 60 },
      { type: 'up', id: 1, x: 100 + slop * 0.5, y: 200, t: 10 + maxMs * 0.5 },
    ]);
    expect(log).toEqual([
      { type: 'touch', count: 1 },
      { type: 'touch', count: 0 },
      { type: 'tap', x: 100 + slop * 0.5, y: 200 },
    ]);
  });

  it('오래 눌렀다 떼면 탭이 되지 않는다', () => {
    const log = runSequence([
      { type: 'down', id: 1, x: 100, y: 200, t: 0 },
      { type: 'up', id: 1, x: 100, y: 200, t: maxMs + 10 },
    ]);
    expect(log.some((e) => e.type === 'tap' || e.type === 'dragStart')).toBe(false);
  });

  it('마우스 보조 버튼과 누르지 않은 이동은 무시한다', () => {
    const log = runSequence([
      { type: 'move', id: 1, x: 50, y: 50, t: 0, pointerType: 'mouse' },
      { type: 'down', id: 1, x: 50, y: 50, t: 10, pointerType: 'mouse', button: 2 },
      { type: 'move', id: 1, x: 100, y: 100, t: 20, pointerType: 'mouse' },
      { type: 'up', id: 1, x: 100, y: 100, t: 30, pointerType: 'mouse', button: 2 },
    ]);
    expect(log).toEqual([]);
  });

  it('tapSlop 을 넘게 움직이면 끌기로 들어가고 뗄 때 속도를 계산한다', () => {
    const stepMove = slop + 20;
    const log = runSequence([
      { type: 'down', id: 1, x: 100, y: 100, t: 0 },
      { type: 'move', id: 1, x: 100, y: 100 + stepMove, t: 20 },
      { type: 'move', id: 1, x: 100, y: 100 + stepMove + 30, t: 40 },
      { type: 'move', id: 1, x: 100, y: 100 + stepMove + 60, t: 60 },
      { type: 'up', id: 1, x: 100, y: 100 + stepMove + 60, t: 60 },
    ]);
    expect(log.some((e) => e.type === 'tap')).toBe(false);
    expect(log.filter((e) => e.type === 'dragStart')).toEqual([{ type: 'dragStart', x: 100, y: 100 }]);
    const totalDy = log.filter((e) => e.type === 'dragMove').reduce((s, e) => s + e.dy, 0);
    expect(totalDy).toBe(stepMove + 60);
    const end = log.find((e) => e.type === 'dragEnd');
    expect(end?.type).toBe('dragEnd');
    if (end?.type === 'dragEnd') {
      expect(end.vx).toBeCloseTo(0, 6);
      expect(end.vy).toBeGreaterThan(0);
    }
  });

  it('끌다가 멈춰 기다린 뒤 떼면 관성 속도가 0 이다', () => {
    const holdMs = tuning.input.velocityStopSeconds * 1000 + 30;
    const log = runSequence([
      { type: 'down', id: 1, x: 0, y: 0, t: 0 },
      { type: 'move', id: 1, x: 0, y: slop + 40, t: 30 },
      { type: 'up', id: 1, x: 0, y: slop + 40, t: 30 + holdMs },
    ]);
    const end = log.find((e) => e.type === 'dragEnd');
    expect(end).toEqual({ type: 'dragEnd', vx: 0, vy: 0 });
  });

  it('포인터 취소는 탭이나 관성을 내지 않는다', () => {
    const log = runSequence([
      { type: 'down', id: 1, x: 0, y: 0, t: 0 },
      { type: 'move', id: 1, x: 0, y: slop + 30, t: 20 },
      { type: 'cancel', id: 1, x: 0, y: slop + 30, t: 30 },
    ]);
    expect(log.some((e) => e.type === 'tap')).toBe(false);
    expect(log.find((e) => e.type === 'dragEnd')).toEqual({ type: 'dragEnd', vx: 0, vy: 0 });
  });

  it('두 손가락 핀치는 중심·거리 비율을 내고, 한 손가락을 떼어도 탭이 되지 않는다', () => {
    const log = runSequence([
      { type: 'down', id: 1, x: 100, y: 200, t: 0 },
      { type: 'down', id: 2, x: 200, y: 200, t: 10 },
      { type: 'move', id: 2, x: 300, y: 200, t: 30 },
      { type: 'up', id: 2, x: 300, y: 200, t: 40 },
      { type: 'up', id: 1, x: 100, y: 200, t: 60 },
    ]);
    expect(log.some((e) => e.type === 'tap')).toBe(false);
    expect(log.find((e) => e.type === 'pinchStart')).toEqual({ type: 'pinchStart', x: 150, y: 200, distance: 100 });
    expect(log.find((e) => e.type === 'pinchMove')).toEqual({
      type: 'pinchMove',
      x: 200,
      y: 200,
      distance: 200,
      ratio: 2,
    });
    expect(log.some((e) => e.type === 'pinchEnd')).toBe(true);
    expect(log[log.length - 1]).toEqual({ type: 'touch', count: 0 });
  });

  it('한 손가락 끌기 중에 둘째 손가락이 닿으면 끌기를 관성 없이 끝내고 핀치로 넘긴다', () => {
    const log = runSequence([
      { type: 'down', id: 1, x: 100, y: 100, t: 0 },
      { type: 'move', id: 1, x: 100, y: 100 + slop + 20, t: 20 },
      { type: 'down', id: 2, x: 200, y: 100 + slop + 20, t: 30 },
      { type: 'move', id: 2, x: 250, y: 100 + slop + 20, t: 50 },
      { type: 'up', id: 1, x: 100, y: 100 + slop + 20, t: 60 },
      { type: 'up', id: 2, x: 250, y: 100 + slop + 20, t: 70 },
    ]);
    const dragEnd = log.findIndex((e) => e.type === 'dragEnd');
    const pinchStart = log.findIndex((e) => e.type === 'pinchStart');
    expect(dragEnd).toBeGreaterThan(-1);
    expect(pinchStart).toBeGreaterThan(dragEnd);
    expect(log[dragEnd]).toEqual({ type: 'dragEnd', vx: 0, vy: 0 });
  });
});
