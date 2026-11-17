import { Quaternion, Vector3 } from 'three';
import { tuning } from '../../config';
import { damp } from '../../core/motion';
import type { Pose } from './cardMotion';
import { generateField, type FieldSlot } from './field';

const AXIS_Y = new Vector3(0, 1, 0);
const yawQuat = new Quaternion();

/**
 * 카드 공간 보기의 배치: 카메라 앞 시야 원뿔에 카드를 흩고(generateField), 앞뒤로 날아 들어가며 훑는다.
 * 카드 수가 field.count 보다 많으면 그만큼 깊게 늘어난다. 자리는 가까운 것부터 정렬돼 있어 번호가 작을수록 앞이다.
 * 자세는 카메라 공간(카메라가 원점에서 -z 를 봄)이다. 앞뒤 이동(offset)은 게임 시간 지수 접근으로 목표를 따라간다.
 */
export class CardField {
  readonly slots: FieldSlot[];
  /** 앞으로 들어갈 수 있는 최대 거리 */
  readonly maxOffset: number;
  /** 지금 앞으로 들어간 거리 */
  offset = 0;
  private goal = 0;

  constructor(count: number, seed: number, fovDeg: number) {
    const f = tuning.field;
    const far = f.depthNear + (f.depthFar - f.depthNear) * Math.max(1, count / f.count);
    this.slots = generateField(count, seed, fovDeg, far).sort((a, b) => a.depth - b.depth);
    const deepest = this.slots.length > 0 ? this.slots[this.slots.length - 1].depth : f.depthNear;
    this.maxOffset = Math.max(0, deepest - f.depthNear);
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
    const [d0, d1] = tuning.cardField.nearFade;
    const t = (this.slots[i].depth - this.offset - d0) / (d1 - d0);
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  }
}
