import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { CameraRig, shortestAngleDiff } from '../src/widgets/camera/cameraRig';
import { galaxySpinAngle, hubPoint, planetJitter, spiralPoint } from '../src/widgets/cosmos/cosmosModel';

function makeRig(opts?: { yaw?: number; pitch?: number; distance?: number }) {
  return new CameraRig({
    fovDeg: () => tuning.camera.fovDeg,
    viewportHeight: () => 800,
    initialYaw: opts?.yaw,
    initialPitch: opts?.pitch,
    initialDistance: opts?.distance ?? 10,
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

  it('applyTo 는 distance 구면 위에 카메라를 놓고 원점(0,0,0)을 바라본다', () => {
    const cam = new PerspectiveCamera(tuning.camera.fovDeg, 1, 0.1, 60);
    const rig = makeRig({ yaw: Math.PI / 2, pitch: 0, distance: 12 });
    rig.applyTo(cam);
    expect(cam.position.x).toBeCloseTo(12, 6);
    expect(cam.position.y).toBeCloseTo(0, 6);
    expect(cam.position.z).toBeCloseTo(0, 6);
    const forward = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    expect(forward.x).toBeCloseTo(-1, 6);
    expect(forward.z).toBeCloseTo(0, 6);
  });

  it('zoomByFactor 는 goalDistance 를 min~max 안에서 연속 조절하고 스냅백하지 않는다', () => {
    const rig = makeRig({ distance: 12 });
    rig.zoomByFactor(0.5);
    expect(rig.goalDistance).toBeCloseTo(6, 6);
    for (let i = 0; i < 60; i++) rig.step(1 / 60);
    expect(rig.distance).toBeCloseTo(6, 2);

    rig.zoomByFactor(0.01);
    expect(rig.goalDistance).toBe(tuning.cosmos.minDistance);
    rig.zoomByFactor(100);
    expect(rig.goalDistance).toBe(tuning.cosmos.maxDistance);
  });

  it('pan 과 focusPoint 는 궤도 중심(target)을 이동하고 applyTo 시선이 함께 따라간다', () => {
    const cam = new PerspectiveCamera(tuning.camera.fovDeg, 1, 0.1, 60);
    const rig = makeRig({ yaw: 0, pitch: 0, distance: 10 });
    rig.pan(80, -40);
    expect(rig.target.x).toBeLessThan(0);
    expect(rig.target.y).toBeLessThan(0);

    const dest = new Vector3(4, -2, -5);
    rig.focusPoint(dest, 5);
    for (let i = 0; i < 90; i++) rig.step(1 / 60);
    expect(rig.target.distanceTo(dest)).toBeLessThan(1e-2);
    expect(rig.distance).toBeCloseTo(5, 2);
    rig.applyTo(cam);
    expect(cam.position.distanceTo(rig.target)).toBeCloseTo(rig.distance, 5);
  });

  it('은하 회전만큼 피벗을 돌리면 포커스한 노드·허브 자리를 계속 따라간다', () => {
    const jitter = planetJitter('month:test');
    const t0 = 3;
    const seconds = 40;
    const node = spiralPoint(18, t0, jitter, new Vector3());
    const hub = hubPoint([12, 18, 26], t0, new Vector3());
    for (const [start, at] of [
      [node, (t: number) => spiralPoint(18, t, jitter, new Vector3())],
      [hub, (t: number) => hubPoint([12, 18, 26], t, new Vector3())],
    ] as const) {
      const rig = makeRig();
      rig.target.copy(start);
      rig.goalTarget.copy(start);
      const dt = 1 / 60;
      for (let i = 0; i < seconds * 60; i++) {
        rig.rotateTargetsAroundY(galaxySpinAngle(dt));
        rig.step(dt);
      }
      const expected = at(t0 + seconds);
      // 회전이 실제로 일어나 자리가 바뀌었는지와, 그 자리를 따라갔는지를 함께 본다
      expect(expected.distanceTo(start)).toBeGreaterThan(0.1);
      expect(rig.target.distanceTo(expected)).toBeLessThan(1e-6);
      expect(rig.goalTarget.distanceTo(expected)).toBeLessThan(1e-6);
    }
  });
});
