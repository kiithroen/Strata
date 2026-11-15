import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { CameraRig, shortestAngleDiff } from '../src/widgets/camera/cameraRig';

function makeRig(opts?: { yaw?: number; pitch?: number }) {
  return new CameraRig({
    fovDeg: () => tuning.camera.fovDeg,
    viewportHeight: () => 800,
    initialYaw: opts?.yaw,
    initialPitch: opts?.pitch,
  });
}

describe('CameraRig', () => {
  it('한 손가락 끌기로 360° 좌우 회전하고 상하 각도는 maxPitch 안으로 제한된다', () => {
    const rig = makeRig();
    rig.onDragStart();
    for (let i = 0; i < 40; i++) rig.onDragMove(100, 0);
    // 360° 넘게 돌려도 [-π, π] 범위로 감싸지며 자유롭게 돈다
    expect(Math.abs(rig.yaw)).toBeLessThanOrEqual(Math.PI);

    rig.onDragMove(0, 10_000);
    expect(rig.pitch).toBe(tuning.gesture.maxPitch);
    rig.onDragMove(0, -20_000);
    expect(rig.pitch).toBe(-tuning.gesture.maxPitch);
  });

  it('관성 회전은 같은 게임 시간이면 주사율과 상관없이 같은 방향에 닿는다', () => {
    const run = (hz: number) => {
      const rig = makeRig();
      rig.onDragStart();
      rig.onDragEnd(1400, 500);
      for (let i = 0; i < 0.5 * hz; i++) rig.step(1 / hz);
      return { yaw: rig.yaw, pitch: rig.pitch };
    };
    const ref = run(60);
    expect(ref.yaw).not.toBe(0);
    expect(ref.pitch).not.toBe(0);
    for (const hz of [30, 120, 144]) {
      const other = run(hz);
      expect(shortestAngleDiff(ref.yaw, other.yaw)).toBeCloseTo(0, 9);
      expect(other.pitch).toBeCloseTo(ref.pitch, 9);
    }
  });

  it('faceDirection 은 최단 각도로 부드럽게 목표 방향을 향한다', () => {
    const run = (hz: number) => {
      const rig = makeRig({ yaw: Math.PI - 0.2, pitch: 0.5 });
      rig.faceDirection(-Math.PI + 0.2, 0);
      for (let i = 0; i < hz / 3; i++) rig.step(1 / hz);
      return { yaw: rig.yaw, pitch: rig.pitch };
    };
    const ref = run(60);
    // +π-0.2 에서 -π+0.2 로 최단 경로(±π 경계)를 넘어 간다
    expect(Math.abs(ref.yaw)).toBeGreaterThan(Math.PI - 0.25);
    for (const hz of [30, 120, 144]) {
      const other = run(hz);
      expect(shortestAngleDiff(ref.yaw, other.yaw)).toBeCloseTo(0, 9);
      expect(other.pitch).toBeCloseTo(ref.pitch, 9);
    }
  });

  it('applyTo 는 카메라 전방 벡터를 yaw·pitch 방향으로 돌린다', () => {
    const cam = new PerspectiveCamera(tuning.camera.fovDeg, 1, 0.1, 60);
    const rig = makeRig({ yaw: Math.PI / 2, pitch: 0 });
    rig.applyTo(cam);
    const forward = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    expect(forward.x).toBeCloseTo(-1, 6);
    expect(forward.z).toBeCloseTo(0, 6);
  });
});
