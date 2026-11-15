import type { PerspectiveCamera } from 'three';
import { tuning } from '../../config';
import { approachFactor } from '../../core/motion';

export interface CameraRigOptions {
  fovDeg: () => number;
  viewportHeight: () => number;
  initialYaw?: number;
  initialPitch?: number;
}

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

/**
 * 360° 전방위 카메라 시선(yaw·pitch) 제어기.
 * 한 손가락 끌기로 상하좌우를 둘러보고 관성으로 흐르며, 노드 이동 시 정면 방향으로 부드럽게 돌아온다.
 */
export class CameraRig {
  yaw: number;
  pitch: number;
  private targetYaw: number;
  private targetPitch: number;
  private turning = false;
  private isDragging = false;
  private yawVel = 0;
  private pitchVel = 0;

  constructor(private readonly options: CameraRigOptions) {
    this.yaw = wrapAngle(options.initialYaw ?? 0);
    this.pitch = clampPitch(options.initialPitch ?? 0);
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
  }

  get dragging(): boolean {
    return this.isDragging;
  }

  cancelInertia(): void {
    this.yawVel = 0;
    this.pitchVel = 0;
  }

  /** 시선을 목표 각도(기본 정면 0, 0)로 부드럽게 돌린다 */
  faceDirection(yaw = 0, pitch = 0): void {
    this.targetYaw = wrapAngle(yaw);
    this.targetPitch = clampPitch(pitch);
    this.turning = true;
    this.cancelInertia();
  }

  onDragStart(): void {
    this.isDragging = true;
    this.turning = false;
    this.cancelInertia();
  }

  onDragMove(dx: number, dy: number): void {
    if (!this.isDragging) return;
    const k = this.radPerPx();
    this.yaw = wrapAngle(this.yaw + dx * k);
    this.pitch = clampPitch(this.pitch + dy * k);
  }

  onDragEnd(vx: number, vy: number): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    const k = this.radPerPx();
    const vyaw = vx * k;
    const vpitch = vy * k;
    if (Math.hypot(vyaw, vpitch) >= tuning.gesture.lookStopSpeed) {
      this.yawVel = vyaw;
      this.pitchVel = vpitch;
    } else {
      this.cancelInertia();
    }
  }

  step(dt: number): void {
    if (dt <= 0 || this.isDragging) return;

    if (this.turning) {
      const f = approachFactor(tuning.gesture.lookTurnRate, dt);
      const dyaw = shortestAngleDiff(this.yaw, this.targetYaw);
      const dpitch = this.targetPitch - this.pitch;
      this.yaw = wrapAngle(this.yaw + dyaw * f);
      this.pitch = clampPitch(this.pitch + dpitch * f);
      if (Math.abs(dyaw) < 1e-4 && Math.abs(dpitch) < 1e-4) {
        this.yaw = this.targetYaw;
        this.pitch = this.targetPitch;
        this.turning = false;
      }
      return;
    }

    if (this.yawVel === 0 && this.pitchVel === 0) return;
    const r = tuning.gesture.lookInertiaDecay;
    const decay = Math.exp(-r * dt);
    const k = (1 - decay) / r;
    this.yaw = wrapAngle(this.yaw + this.yawVel * k);
    const rawPitch = this.pitch + this.pitchVel * k;
    const clamped = clampPitch(rawPitch);
    this.pitch = clamped;
    this.yawVel *= decay;
    this.pitchVel = clamped !== rawPitch ? 0 : this.pitchVel * decay;
    if (Math.hypot(this.yawVel, this.pitchVel) < tuning.gesture.lookStopSpeed) {
      this.cancelInertia();
    }
  }

  applyTo(camera: PerspectiveCamera): void {
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.pitch, this.yaw, 0);
    camera.updateMatrixWorld();
  }

  private radPerPx(): number {
    const h = Math.max(1, this.options.viewportHeight());
    const fovRad = (this.options.fovDeg() * Math.PI) / 180;
    return (fovRad / h) * tuning.gesture.lookDragScale;
  }
}
