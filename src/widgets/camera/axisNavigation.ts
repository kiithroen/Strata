import { tuning } from '../../config';
import { DAY_MS } from '../../core/calendar';
import type { GestureHandlers, WheelEventData } from '../../input/gesture';
import {
  AxisController,
  depthOf,
  depthPerDay,
  levelLogScale,
  nearestLevel,
  type LevelId,
} from '../timeAxis/axisModel';

export interface AxisNavigationOptions {
  controller: AxisController;
  minTime: number;
  maxTime: number;
  viewportHeight: () => number;
  /** 한 손가락 끌기로 시간축을 옮길지 여부(기본 true). 360° 카메라 회전에 끌기를 쓸 때는 false 로 둔다 */
  dragTime?: boolean;
  /** 핀치·휠 중심 좌표에서 가장 가까운 노드의 시각(ms). 없으면 초점면을 고정한다 */
  pickAnchorTime?: (x: number, y: number) => number | null;
  /** 펼친 카드가 있는 등 축 조작을 막아야 할 때 true */
  isBlocked?: () => boolean;
  onTap?: (e: { x: number; y: number; t: number }) => void;
  onTouchCountChange?: (count: number) => void;
}

export function clampFocusTime(time: number, minTime: number, maxTime: number): number {
  if (minTime >= maxTime) return minTime;
  return Math.min(maxTime, Math.max(minTime, time));
}

export function clampLogScale(logScale: number): number {
  const overshoot = tuning.gesture.scaleOvershoot;
  const minScale = levelLogScale('year') - overshoot;
  const maxScale = levelLogScale('note') + overshoot;
  return Math.min(maxScale, Math.max(minScale, logScale));
}

/** 시각 anchorTime 이 축척 logScale 에서도 depth anchorDepth 에 남도록 focusTime 을 구한다 */
export function anchoredFocusTime(anchorTime: number, anchorDepth: number, logScale: number): number {
  return anchorTime + ((anchorDepth - tuning.axis.focusDepth) / Math.exp(logScale)) * DAY_MS;
}

interface Anchor {
  time: number;
  depth: number;
}

/**
 * 한 손가락 끌기(시간 이동 + 관성)와 두 손가락 핀치(로그 축척 + 시점 고정 + 단계 스냅)를
 * AxisController 에 연결하는 순수 로직.
 * 끄는 동안에는 controller.current 를 바로 움직이고, 놓을 때만 목표로 붙인다.
 */
export class AxisNavigation {
  readonly controller: AxisController;
  private readonly minTime: number;
  private readonly maxTime: number;
  private isDragging = false;
  private isPinching = false;
  private velocityTime = 0;
  private pinchAnchor: Anchor | null = null;
  private wheelAnchor: Anchor | null = null;
  private wheelSnapRemaining = 0;

  constructor(private readonly options: AxisNavigationOptions) {
    this.controller = options.controller;
    this.minTime = options.minTime;
    this.maxTime = options.maxTime;
  }

  get dragging(): boolean {
    return this.isDragging;
  }

  get pinching(): boolean {
    return this.isPinching;
  }

  /** 진행 중인 관성과 휠 스냅 대기를 멈춘다 */
  cancelMotion(): void {
    this.velocityTime = 0;
    this.wheelSnapRemaining = 0;
    this.wheelAnchor = null;
  }

  focusOn(time: number, level: LevelId): void {
    this.cancelMotion();
    this.controller.focusOn(clampFocusTime(time, this.minTime, this.maxTime), level);
  }

  onTouchCountChange(count: number): void {
    if (count > 0) this.velocityTime = 0;
    this.options.onTouchCountChange?.(count);
  }

  onDragStart(): void {
    if (this.options.dragTime === false || this.options.isBlocked?.()) return;
    this.cancelMotion();
    this.isDragging = true;
  }

  onDragMove(dy: number): void {
    if (!this.isDragging || this.options.isBlocked?.()) return;
    const next = clampFocusTime(this.controller.current.focusTime + this.dyToTime(dy), this.minTime, this.maxTime);
    this.controller.current.focusTime = next;
    this.controller.target.focusTime = next;
  }

  onDragEnd(vy: number): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.options.isBlocked?.()) {
      this.velocityTime = 0;
      return;
    }
    const vTime = this.dyToTime(vy);
    const vDepth = Math.abs((vTime / DAY_MS) * depthPerDay(this.controller.current));
    this.velocityTime = vDepth >= tuning.gesture.inertiaStopSpeed ? vTime : 0;
  }

  onPinchStart(x: number, y: number): void {
    if (this.options.isBlocked?.()) return;
    this.cancelMotion();
    this.isPinching = true;
    const anchorTime = this.options.pickAnchorTime?.(x, y) ?? this.controller.current.focusTime;
    this.pinchAnchor = { time: anchorTime, depth: depthOf(this.controller.current, anchorTime) };
  }

  onPinchMove(ratio: number): void {
    if (!this.isPinching || !this.pinchAnchor || ratio <= 0 || this.options.isBlocked?.()) return;
    const nextScale = clampLogScale(this.controller.current.logScale + tuning.gesture.pinchScale * Math.log(ratio));
    this.applyAnchoredScale(this.pinchAnchor, nextScale, true);
  }

  onPinchEnd(): void {
    if (!this.isPinching) return;
    this.isPinching = false;
    const snapped = levelLogScale(nearestLevel(this.controller.current.logScale));
    this.controller.target.logScale = snapped;
    if (this.pinchAnchor) {
      this.controller.target.focusTime = clampFocusTime(
        anchoredFocusTime(this.pinchAnchor.time, this.pinchAnchor.depth, snapped),
        this.minTime,
        this.maxTime,
      );
    }
    this.pinchAnchor = null;
  }

  onWheel(e: WheelEventData): void {
    if (this.options.isBlocked?.() || this.isPinching) return;
    this.velocityTime = 0;
    const anchorTime = this.options.pickAnchorTime?.(e.x, e.y) ?? this.controller.current.focusTime;
    const anchor: Anchor = { time: anchorTime, depth: depthOf(this.controller.current, anchorTime) };
    const nextScale = clampLogScale(
      this.controller.current.logScale - (e.deltaY / 100) * tuning.gesture.wheelScalePer100,
    );
    this.applyAnchoredScale(anchor, nextScale, true);
    this.wheelAnchor = anchor;
    this.wheelSnapRemaining = tuning.gesture.wheelSnapDelay;
  }

  step(dt: number): void {
    if (dt > 0) {
      if (!this.isDragging && !this.isPinching && this.velocityTime !== 0) {
        const decayRate = tuning.gesture.inertiaDecay;
        const decay = Math.exp(-decayRate * dt);
        const delta = this.velocityTime * ((1 - decay) / decayRate);
        const rawNext = this.controller.current.focusTime + delta;
        const next = clampFocusTime(rawNext, this.minTime, this.maxTime);
        this.controller.current.focusTime = next;
        this.controller.target.focusTime = next;
        if (next !== rawNext) {
          this.velocityTime = 0;
        } else {
          this.velocityTime *= decay;
          const vDepth = Math.abs((this.velocityTime / DAY_MS) * depthPerDay(this.controller.current));
          if (vDepth < tuning.gesture.inertiaStopSpeed) this.velocityTime = 0;
        }
      }

      if (!this.isPinching && this.wheelSnapRemaining > 0) {
        this.wheelSnapRemaining = Math.max(0, this.wheelSnapRemaining - dt);
        if (this.wheelSnapRemaining === 0) {
          const snapped = levelLogScale(nearestLevel(this.controller.current.logScale));
          this.controller.target.logScale = snapped;
          if (this.wheelAnchor) {
            this.controller.target.focusTime = clampFocusTime(
              anchoredFocusTime(this.wheelAnchor.time, this.wheelAnchor.depth, snapped),
              this.minTime,
              this.maxTime,
            );
          }
          this.wheelAnchor = null;
        }
      }
    }

    this.controller.step(dt);
  }

  handlers(): GestureHandlers & { onWheel: (e: WheelEventData) => void } {
    return {
      onTouchCountChange: (count) => this.onTouchCountChange(count),
      onTap: (e) => this.options.onTap?.(e),
      onDragStart: () => this.onDragStart(),
      onDragMove: (e) => this.onDragMove(e.dy),
      onDragEnd: (e) => this.onDragEnd(e.vy),
      onPinchStart: (e) => this.onPinchStart(e.x, e.y),
      onPinchMove: (e) => this.onPinchMove(e.ratio),
      onPinchEnd: () => this.onPinchEnd(),
      onWheel: (e) => this.onWheel(e),
    };
  }

  private dyToTime(dy: number): number {
    const h = Math.max(1, this.options.viewportHeight());
    const dDepth = (dy / h) * tuning.gesture.dragDepthPerScreen;
    return -(dDepth / depthPerDay(this.controller.current)) * DAY_MS;
  }

  private applyAnchoredScale(anchor: Anchor, logScale: number, immediateTarget: boolean): void {
    const nextTime = clampFocusTime(
      anchoredFocusTime(anchor.time, anchor.depth, logScale),
      this.minTime,
      this.maxTime,
    );
    this.controller.current.logScale = logScale;
    this.controller.current.focusTime = nextTime;
    if (immediateTarget) {
      this.controller.target.logScale = logScale;
      this.controller.target.focusTime = nextTime;
    }
  }
}
