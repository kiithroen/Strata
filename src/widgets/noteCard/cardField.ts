import { Quaternion, Vector3 } from 'three';
import { tuning } from '../../config';
import { damp } from '../../core/motion';
import type { Pose } from './cardMotion';
import { generateField, type FieldSlot } from './field';

const AXIS_Y = new Vector3(0, 1, 0);
const yawQuat = new Quaternion();

/**
 * 카드 공간 보기의 배치: 카메라 앞 시야 원뿔에 카드를 흩고(generateField), 앞뒤로 날아 들어가며 훑는다.
 * 깊이 범위는 cardField.depthNear 부터 카드 수 / cardField.cardsPerDepth(최소 cardField.minSpan)만큼이라 카드가 적으면 얕고 촘촘하다.
 * cardField.spreadDepth 보다 깊은 자리는 그 깊이의 폭으로 퍼져 긴 통로가 된다. 자리는 가까운 것부터 정렬돼 있어 번호가 작을수록 앞이다.
 * 세로로 긴 화면(가로/세로 비율 a < 1)에서는 깊이를 1/√a 배로 늘려 카드가 화면 폭에 비해 너무 크지 않게 하고,
 * 위아래 퍼짐도 1/√a 배로 늘리되 cardField.fitHeight 를, 좌우 퍼짐은 화면 반폭 × cardField.fitWidth 를 넘지 않게 한다.
 * 자세는 카메라 공간(카메라가 원점에서 -z 를 봄)이다. 앞뒤 이동(offset)은 게임 시간 지수 접근으로 목표를 따라간다.
 */
export class CardField {
  readonly slots: FieldSlot[];
  /** 앞으로 들어갈 수 있는 최대 거리 */
  readonly maxOffset: number;
  /** 지금 앞으로 들어간 거리 */
  offset = 0;
  private goal = 0;
  /** 가장 가까운 자리가 놓일 수 있는 깊이(세로 화면 배율 포함). 앞뒤 이동의 기준이다 */
  private readonly near: number;

  /** aspect 는 화면 가로/세로 비율이다 */
  constructor(count: number, seed: number, fovDeg: number, aspect = 1) {
    const c = tuning.cardField;
    const f = tuning.field;
    // 크기가 0인 순간처럼 비율을 알 수 없으면 정사각형으로 본다
    if (!(aspect > 0 && Number.isFinite(aspect))) aspect = 1;
    const tall = 1 / Math.sqrt(Math.min(1, aspect));
    const near = c.depthNear * tall;
    this.near = near;
    const far = near + Math.max(c.minSpan, count / c.cardsPerDepth) * tall;
    this.slots = generateField(count, seed, fovDeg, {
      depthNear: near,
      depthFar: far,
      spreadDepth: c.spreadDepth * tall,
      spreadX: Math.min(f.spreadX * c.spread, aspect * c.fitWidth),
      spreadY: Math.min(f.spreadY * c.spread * tall, c.fitHeight),
    }).sort((a, b) => a.depth - b.depth);
    const deepest = this.slots.length > 0 ? this.slots[this.slots.length - 1].depth : near;
    this.maxOffset = Math.max(0, deepest - near);
  }

  get goalOffset(): number {
    return this.goal;
  }

  /** 목표를 delta 만큼 앞(+)·뒤(-)로 옮긴다. 0~maxOffset 으로 자른다 */
  dolly(delta: number): void {
    this.goal = Math.min(this.maxOffset, Math.max(0, this.goal + delta));
  }

  step(dt: number): void {
    this.offset = damp(this.offset, this.goal, tuning.cardField.dollyRate, dt);
  }

  /** i 번째 자리의 카메라 공간 자세 */
  localPose(i: number, out: Pose): Pose {
    const s = this.slots[i];
    out.position.set(s.x, s.y, -(s.depth - this.offset));
    out.quaternion.copy(yawQuat.setFromAxisAngle(AXIS_Y, s.yaw));
    out.scale = 1;
    return out;
  }

  /** i 번째 자리의 보이는 정도. 카메라에 너무 가까워지거나 지나치면 사라진다 */
  fade(i: number): number {
    return this.fadeAt(this.slots[i].depth);
  }

  /**
   * 지금 훑는 자리: 카메라에서 거리가 가장 가까운 자리가 놓이는 깊이(cardField.depthNear 기준)에 가장 가까운 자리 번호.
   * 처음에는 첫 자리, 끝까지 들어가면 마지막 자리다. 자리가 없으면 -1 이다. 카드 공간 머리에 지금 훑는 층을 적을 때 쓴다.
   */
  frontSlot(): number {
    let best = -1;
    let bestGap = Infinity;
    for (let i = 0; i < this.slots.length; i++) {
      const gap = Math.abs(this.slots[i].depth - this.offset - this.near);
      if (gap < bestGap) {
        best = i;
        bestGap = gap;
      }
    }
    return best;
  }

  private fadeAt(depth: number): number {
    const [d0, d1] = tuning.cardField.nearFade;
    const t = (depth - this.offset - d0) / (d1 - d0);
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  }
}
