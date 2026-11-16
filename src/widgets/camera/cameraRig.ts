import { Vector3, type PerspectiveCamera } from 'three';
import { tuning } from '../../config';
import { approachFactor, damp } from '../../core/motion';

export interface CameraRigOptions {
  fovDeg: () => number;
  viewportHeight: () => number;
  initialYaw?: number;
  initialPitch?: number;
  initialDistance?: number;
  initialTarget?: Vector3;
}

const WORLD_Y = new Vector3(0, 1, 0);

export function wrapAngle(a: number): number {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

export function shortestAngleDiff(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function clampPitch(pitch: number): number {
  const max = tuning.gesture.maxPitch;
  return Math.max(-max, Math.min(max, pitch));
}

export function clampDistance(d: number): number {
  const c = tuning.cosmos;
  return Math.max(c.minDistance, Math.min(c.maxDistance, d));
}

/**
 * 표준 3D 궤도 카메라(yaw·pitch·distance·target) 제어기.
 * 한 손가락 끌기로 회전, 핀치·휠로 연속 거리 줌, 보조 드래그·두 손가락 이동으로 화면 팬,
 * 노드 탭 시 그 위치로 부드럽게 포커스 이동한다.
 */
export class CameraRig {
  yaw: number;
  pitch: number;
  distance: number;
  goalDistance: number;
  readonly target = new Vector3();
  readonly goalTarget = new Vector3();
  private isDragging = false;
  private yawVel = 0;
  private pitchVel = 0;
  /** orbitTo 로 정한 목표 시선 각도. 손가락으로 돌리기 시작하면 버린다 */
  private goalYaw: number | null = null;
  private goalPitch: number | null = null;

  constructor(private readonly options: CameraRigOptions) {
    this.yaw = wrapAngle(options.initialYaw ?? 0);
    this.pitch = clampPitch(options.initialPitch ?? 0);
    this.distance = clampDistance(options.initialDistance ?? tuning.cosmos.initialDistance);
    this.goalDistance = this.distance;
    if (options.initialTarget) {
      this.target.copy(options.initialTarget);
      this.goalTarget.copy(options.initialTarget);
    }
  }

  get dragging(): boolean {
    return this.isDragging;
  }

  cancelInertia(): void {
    this.yawVel = 0;
    this.pitchVel = 0;
  }

  /** 궤도 중심(target)을 지정 3D 좌표로 부드럽게 옮기고 필요하면 거리를 좁힌다 */
  focusPoint(point: Vector3, maxDistance?: number): void {
    this.goalTarget.copy(point);
    if (maxDistance !== undefined) {
      this.goalDistance = clampDistance(Math.min(this.goalDistance, maxDistance));
    }
  }

  /**
   * 궤도 중심(target)과 목표 중심(goalTarget)을 원점 Y축 둘레로 angle 만큼 돌린다.
   * 장면이 원점 둘레로 돌 때 피벗이 보던 자리를 따라가게 한다. 시선 각도(yaw·pitch)는 그대로 둔다.
   */
  rotateTargetsAroundY(angle: number): void {
    if (angle === 0) return;
    this.target.applyAxisAngle(WORLD_Y, angle);
    this.goalTarget.applyAxisAngle(WORLD_Y, angle);
  }

  /** 시선 각도를 목표 각도로 부드럽게 돌린다(focusRate). yaw 를 생략하면 좌우는 그대로 둔다 */
  orbitTo(pitch: number, yaw?: number): void {
    this.cancelInertia();
    this.goalPitch = clampPitch(pitch);
    this.goalYaw = yaw === undefined ? null : wrapAngle(yaw);
  }

  /** 목표 거리를 그대로 정한다(focusPoint 는 줄이기만 한다) */
  setGoalDistance(distance: number): void {
    this.goalDistance = clampDistance(distance);
  }

  /** 현재 목표 거리에 배율을 곱해 연속 줌한다 */
  zoomByFactor(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.goalDistance = clampDistance(this.goalDistance * factor);
  }

  /** 화면 좌표 이동량(CSS px)만큼 카메라 평면 위에서 피벗을 평행 이동한다 */
  pan(dx: number, dy: number): void {
    const h = Math.max(1, this.options.viewportHeight());
    const fovRad = (this.options.fovDeg() * Math.PI) / 180;
    const worldPerPx = (2 * this.distance * Math.tan(fovRad / 2)) / h;
    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);

    // 카메라 오른쪽 벡터 = (cosY, 0, -sinY), 위쪽 벡터 = (-sinP*sinY, cosP, -sinP*cosY)
    const sx = -dx * worldPerPx;
    const sy = dy * worldPerPx;
    const ox = cosY * sx + -sinP * sinY * sy;
    const oy = cosP * sy;
    const oz = -sinY * sx + -sinP * cosY * sy;

    this.target.x += ox;
    this.target.y += oy;
    this.target.z += oz;
    this.goalTarget.copy(this.target);
  }

  onDragStart(): void {
    this.isDragging = true;
    this.cancelInertia();
    this.goalYaw = null;
    this.goalPitch = null;
  }

  onDragMove(dx: number, dy: number): void {
    if (!this.isDragging) return;
    const k = this.radPerPx();
    this.yaw = wrapAngle(this.yaw - dx * k);
    this.pitch = clampPitch(this.pitch + dy * k);
  }

  onDragEnd(vx: number, vy: number): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    const k = this.radPerPx();
    const vyaw = -vx * k;
    const vpitch = vy * k;
    if (Math.hypot(vyaw, vpitch) >= tuning.gesture.lookStopSpeed) {
      this.yawVel = vyaw;
      this.pitchVel = vpitch;
    } else {
      this.cancelInertia();
    }
  }

  step(dt: number): void {
    if (dt <= 0) return;

    const g = tuning.gesture;
    this.distance = damp(this.distance, this.goalDistance, g.zoomRate, dt);
    const fFocus = approachFactor(g.focusRate, dt);
    this.target.lerp(this.goalTarget, fFocus);

    if (this.isDragging) return;

    if (this.goalPitch !== null) {
      this.pitch += (this.goalPitch - this.pitch) * fFocus;
      if (Math.abs(this.goalPitch - this.pitch) < 1e-5) this.goalPitch = null;
    }
    if (this.goalYaw !== null) {
      const diff = shortestAngleDiff(this.yaw, this.goalYaw);
      this.yaw = wrapAngle(this.yaw + diff * fFocus);
      if (Math.abs(diff) < 1e-5) this.goalYaw = null;
    }

    if (this.yawVel === 0 && this.pitchVel === 0) return;
    const r = g.lookInertiaDecay;
    const decay = Math.exp(-r * dt);
    const k = (1 - decay) / r;
    this.yaw = wrapAngle(this.yaw + this.yawVel * k);
    const rawPitch = this.pitch + this.pitchVel * k;
    const clamped = clampPitch(rawPitch);
    this.pitch = clamped;
    this.yawVel *= decay;
    this.pitchVel = clamped !== rawPitch ? 0 : this.pitchVel * decay;
    if (Math.hypot(this.yawVel, this.pitchVel) < g.lookStopSpeed) {
      this.cancelInertia();
    }
  }

  applyTo(camera: PerspectiveCamera): void {
    const cosP = Math.cos(this.pitch);
    camera.position.set(
      this.target.x + this.distance * cosP * Math.sin(this.yaw),
      this.target.y + this.distance * Math.sin(this.pitch),
      this.target.z + this.distance * cosP * Math.cos(this.yaw),
    );
    camera.lookAt(this.target);
    camera.updateMatrixWorld();
  }

  private radPerPx(): number {
    const h = Math.max(1, this.options.viewportHeight());
    const fovRad = (this.options.fovDeg() * Math.PI) / 180;
    return (fovRad / h) * tuning.gesture.lookDragScale;
  }
}
