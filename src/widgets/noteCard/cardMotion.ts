import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { tuning } from '../../config';
import { damp } from '../../core/motion';

export interface Pose {
  position: Vector3;
  quaternion: Quaternion;
  scale: number;
}

export interface FloatParams {
  /** 흔들림 위상(라디안) */
  phase: number;
  /** 흔들림 한 바퀴에 걸리는 시간(초) */
  period: number;
}

export interface FloatSample {
  y: number;
  pitch: number;
  roll: number;
}

const TAU = Math.PI * 2;

/** 떠 있는 카드의 흔들림. 게임 시간의 함수라서 주사율과 상관없이 같은 값을 낸다. */
export function floatOffset(time: number, p: FloatParams, out: FloatSample = { y: 0, pitch: 0, roll: 0 }): FloatSample {
  const w = (TAU * time) / p.period + p.phase;
  out.y = tuning.float.amplitude * Math.sin(w);
  out.pitch = tuning.float.tiltAmplitude * Math.sin(w * 0.5 + 1.3);
  out.roll = tuning.float.tiltAmplitude * Math.cos(w * 0.7 + 0.4);
  return out;
}

/** 시야각·화면비가 주어졌을 때 펼친 카드가 화면 폭과 높이 안에 들어가는 배율. */
export function focusScale(fovDeg: number, aspect: number, distance: number, cardWidth: number, cardHeight: number): number {
  const visibleHeight = 2 * distance * Math.tan((fovDeg * Math.PI) / 360);
  const visibleWidth = visibleHeight * aspect;
  const fill = tuning.focus.fill;
  return Math.min((visibleWidth * fill) / cardWidth, (visibleHeight * fill) / cardHeight);
}

const forward = new Vector3();

/** 카메라 정면 focus.distance 지점에서 카메라를 바라보는 자세. 화면비가 바뀌면 다시 계산한다. */
export function computeFocusPose(camera: PerspectiveCamera, cardWidth: number, cardHeight: number, out: Pose): Pose {
  camera.getWorldPosition(out.position);
  camera.getWorldQuaternion(out.quaternion);
  forward.set(0, 0, -1).applyQuaternion(out.quaternion);
  out.position.addScaledVector(forward, tuning.focus.distance);
  out.scale = focusScale(camera.fov, camera.aspect, tuning.focus.distance, cardWidth, cardHeight);
  return out;
}

export function createPose(): Pose {
  return { position: new Vector3(), quaternion: new Quaternion(), scale: 1 };
}

export function copyPose(from: Pose, to: Pose): Pose {
  to.position.copy(from.position);
  to.quaternion.copy(from.quaternion);
  to.scale = from.scale;
  return to;
}

const tiltQuat = new Quaternion();
const rollQuat = new Quaternion();
const axisX = new Vector3(1, 0, 0);
const axisZ = new Vector3(0, 0, 1);

/**
 * 카드 하나의 움직임. 렌더링과 분리해 두어 노드 환경에서도 시험할 수 있다.
 *
 * 떠 있는 자세는 배치(필드·시간축)가 매 프레임 넘기는 기본 자세에 흔들림을 더한 것이고, 지연 없이 그대로 따라간다.
 * 펼치기는 떠 있는 자세와 펼친 자세를 focus(0~1)로 섞는다. focus 는 게임 시간 기반 지수 접근이라
 * 같은 게임 시간이면 주사율과 무관하게 같은 자세가 나온다.
 */
export class CardMotion {
  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  scale = 1;
  /** 0이면 원래 밝기, 1이면 가장 어둡다 */
  dim = 0;
  /** 0이면 떠 있는 상태, 1이면 다 펼친 상태 */
  focus = 0;

  focused = false;
  dimTarget = 0;

  private readonly sample: FloatSample = { y: 0, pitch: 0, roll: 0 };
  private readonly idle = createPose();
  /** 닫히는 동안에도 섞을 수 있게 마지막 펼친 자세를 기억한다 */
  private readonly lastFocus = createPose();

  constructor(readonly float: FloatParams) {}

  /** 기본 자세에 흔들림을 더한 떠 있는 자세 */
  idlePose(time: number, home: Pose, out: Pose): Pose {
    const s = floatOffset(time, this.float, this.sample);
    out.position.copy(home.position);
    out.position.y += s.y * home.scale;
    tiltQuat.setFromAxisAngle(axisX, s.pitch);
    rollQuat.setFromAxisAngle(axisZ, s.roll).premultiply(tiltQuat);
    out.quaternion.copy(home.quaternion).multiply(rollQuat);
    out.scale = home.scale;
    return out;
  }

  step(dt: number, time: number, home: Pose, focusPose: Pose | null): void {
    const f = tuning.focus;
    const toFocus = this.focused && focusPose !== null;
    if (toFocus) copyPose(focusPose, this.lastFocus);
    this.focus = damp(this.focus, toFocus ? 1 : 0, f.rate, dt);
    this.dim = damp(this.dim, this.dimTarget, f.dimRate, dt);

    const idle = this.idlePose(time, home, this.idle);
    const w = this.focus;
    this.position.copy(idle.position).lerp(this.lastFocus.position, w);
    this.quaternion.copy(idle.quaternion).slerp(this.lastFocus.quaternion, w);
    this.scale = idle.scale + (this.lastFocus.scale - idle.scale) * w;
  }
}
