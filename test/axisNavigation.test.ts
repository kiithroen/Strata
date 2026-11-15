import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { DAY_MS } from '../src/core/calendar';
import { AxisNavigation } from '../src/widgets/camera/axisNavigation';
import { AxisController, depthOf, levelLogScale, nearestLevel } from '../src/widgets/timeAxis/axisModel';

const NOW = new Date(2026, 10, 15, 21, 30).getTime();
const OLDEST = NOW - 600 * DAY_MS;

function makeNav(opts?: {
  focusTime?: number;
  level?: 'year' | 'month' | 'day' | 'note';
  pickAnchorTime?: (x: number, y: number) => number | null;
  isBlocked?: () => boolean;
}) {
  const controller = new AxisController({
    focusTime: opts?.focusTime ?? NOW - 100 * DAY_MS,
    logScale: levelLogScale(opts?.level ?? 'month'),
  });
  const nav = new AxisNavigation({
    controller,
    minTime: OLDEST,
    maxTime: NOW,
    viewportHeight: () => 800,
    pickAnchorTime: opts?.pickAnchorTime,
    isBlocked: opts?.isBlocked,
  });
  return { controller, nav };
}

describe('AxisNavigation 끌기·관성', () => {
  it('끄는 동안에는 current 를 바로 옮기고 아래로 끌면 과거로, 위로 끌면 최근으로 간다', () => {
    const start = NOW - 100 * DAY_MS;
    const { controller, nav } = makeNav({ focusTime: start });
    nav.onDragStart();
    nav.onDragMove(120);
    expect(controller.current.focusTime).toBeLessThan(start);
    expect(controller.target.focusTime).toBe(controller.current.focusTime);
    const afterDown = controller.current.focusTime;
    nav.onDragMove(-120);
    expect(controller.current.focusTime).toBeCloseTo(start, 6);
    expect(controller.current.focusTime).toBeGreaterThan(afterDown);
  });

  it('관성 이동은 같은 게임 시간이면 주사율과 상관없이 같은 시각에 닿는다', () => {
    const run = (hz: number) => {
      const { controller, nav } = makeNav({ focusTime: NOW - 100 * DAY_MS });
      nav.onDragStart();
      nav.onDragEnd(1200);
      for (let i = 0; i < 0.5 * hz; i++) nav.step(1 / hz);
      return controller.current.focusTime;
    };
    const ref = run(60);
    expect(ref).toBeLessThan(NOW - 100 * DAY_MS);
    for (const hz of [30, 120, 144]) {
      expect(Math.abs(run(hz) - ref)).toBeLessThan(1);
    }
  });

  it('손가락이 닿거나 시간 범위에 닿으면 관성이 멈춘다', () => {
    const { controller, nav } = makeNav({ focusTime: NOW - 2 * DAY_MS, level: 'month' });
    nav.onDragStart();
    nav.onDragEnd(-4000);
    for (let i = 0; i < 60; i++) nav.step(1 / 60);
    expect(controller.current.focusTime).toBe(NOW);

    const { controller: c2, nav: n2 } = makeNav({ focusTime: NOW - 100 * DAY_MS });
    n2.onDragStart();
    n2.onDragEnd(1500);
    n2.step(1 / 60);
    const stoppedAt = c2.current.focusTime;
    n2.onTouchCountChange(1);
    for (let i = 0; i < 30; i++) n2.step(1 / 60);
    expect(c2.current.focusTime).toBe(stoppedAt);
  });
});

describe('AxisNavigation 핀치·시점 고정·스냅', () => {
  it('핀치 중심에 노드가 있으면 축척이 바뀌는 동안 그 노드 시각의 깊이가 변하지 않는다', () => {
    const anchorTime = NOW - 150 * DAY_MS;
    const { controller, nav } = makeNav({
      focusTime: NOW - 100 * DAY_MS,
      level: 'month',
      pickAnchorTime: () => anchorTime,
    });
    const initialDepth = depthOf(controller.current, anchorTime);

    nav.onPinchStart(300, 400);
    nav.onPinchMove(2.2);
    expect(controller.current.logScale).toBeGreaterThan(levelLogScale('month'));
    expect(depthOf(controller.current, anchorTime)).toBeCloseTo(initialDepth, 6);

    nav.onPinchMove(0.6);
    expect(depthOf(controller.current, anchorTime)).toBeCloseTo(initialDepth, 6);
  });

  it('핀치 중심에 노드가 없으면 초점면(focusTime)이 그대로 머문다', () => {
    const start = NOW - 100 * DAY_MS;
    const { controller, nav } = makeNav({
      focusTime: start,
      level: 'month',
      pickAnchorTime: () => null,
    });
    nav.onPinchStart(300, 400);
    nav.onPinchMove(2.0);
    expect(controller.current.focusTime).toBeCloseTo(start, 6);
    nav.onPinchMove(0.4);
    expect(controller.current.focusTime).toBeCloseTo(start, 6);
  });

  it('핀치를 놓으면 nearestLevel 로 스냅 목표를 잡고 주사율과 무관하게 수렴한다', () => {
    const anchorTime = NOW - 130 * DAY_MS;
    const run = (hz: number) => {
      const { controller, nav } = makeNav({
        focusTime: NOW - 100 * DAY_MS,
        level: 'month',
        pickAnchorTime: () => anchorTime,
      });
      const initialDepth = depthOf(controller.current, anchorTime);
      nav.onPinchStart(300, 400);
      nav.onPinchMove(3.2);
      const expectedLevel = nearestLevel(controller.current.logScale);
      nav.onPinchEnd();
      expect(controller.target.logScale).toBe(levelLogScale(expectedLevel));
      for (let i = 0; i < Math.round(1.5 * hz); i++) nav.step(1 / hz);
      return { state: { ...controller.current }, expectedLevel, initialDepth };
    };

    const ref = run(60);
    expect(ref.state.logScale).toBeCloseTo(levelLogScale(ref.expectedLevel), 3);
    expect(depthOf(ref.state, anchorTime)).toBeCloseTo(ref.initialDepth, 2);
    for (const hz of [30, 120, 144]) {
      const other = run(hz);
      expect(other.state.logScale).toBeCloseTo(ref.state.logScale, 6);
      expect(Math.abs(other.state.focusTime - ref.state.focusTime)).toBeLessThan(1);
    }
  });

  it('휠 확대·축소는 대기 시간 뒤 nearestLevel 로 스냅한다', () => {
    const anchorTime = NOW - 120 * DAY_MS;
    const { controller, nav } = makeNav({
      focusTime: NOW - 100 * DAY_MS,
      level: 'month',
      pickAnchorTime: () => anchorTime,
    });
    const initialDepth = depthOf(controller.current, anchorTime);
    nav.onWheel({ x: 300, y: 400, deltaY: -400 });
    expect(controller.current.logScale).toBeGreaterThan(levelLogScale('month'));
    expect(depthOf(controller.current, anchorTime)).toBeCloseTo(initialDepth, 6);

    const expectedLevel = nearestLevel(controller.current.logScale);
    const delay = tuning.gesture.wheelSnapDelay;
    const steps = Math.ceil((delay + 0.05) * 60);
    for (let i = 0; i < steps; i++) nav.step(1 / 60);
    expect(controller.target.logScale).toBe(levelLogScale(expectedLevel));
  });

  it('막힘 상태에서는 끌기·핀치·휠이 동작하지 않는다', () => {
    const start = NOW - 100 * DAY_MS;
    const { controller, nav } = makeNav({ focusTime: start, level: 'month', isBlocked: () => true });
    nav.onDragStart();
    nav.onDragMove(200);
    nav.onDragEnd(1000);
    nav.onPinchStart(100, 100);
    nav.onPinchMove(2);
    nav.onPinchEnd();
    nav.onWheel({ x: 100, y: 100, deltaY: -300 });
    nav.step(0.5);
    expect(controller.current.focusTime).toBe(start);
    expect(controller.current.logScale).toBe(levelLogScale('month'));
  });
});
