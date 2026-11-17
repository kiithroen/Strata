import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { cardLayout } from '../src/widgets/noteCard/cardLayout';
import {
  CardMotion,
  computeFocusPose,
  createPose,
  floatOffset,
  focusScale,
  type Pose,
} from '../src/widgets/noteCard/cardMotion';

const IMAGE_SIZES: [number, number][] = [
  [640, 480],
  [480, 640],
  [560, 560],
  [640, 360],
];
const ASPECTS = [0.42, 0.75, 1, 1.6, 2.2];
const FLOAT = { phase: 0.7, period: (tuning.float.periodMin + tuning.float.periodMax) / 2 };

function makeCamera(aspect: number): PerspectiveCamera {
  const c = tuning.camera;
  const camera = new PerspectiveCamera(c.fovDeg, aspect, c.near, c.far);
  camera.position.set(0.3, -0.2, 0.5);
  camera.quaternion.setFromEuler(new Euler(0.1, -0.2, 0));
  camera.updateMatrixWorld();
  return camera;
}

function makeHome(): Pose {
  return { position: new Vector3(1.2, -0.5, -7), quaternion: new Quaternion().setFromEuler(new Euler(0, 0.3, 0)), scale: 1 };
}

function focusPoseFor(aspect: number): Pose {
  const layout = cardLayout(640, 480);
  return computeFocusPose(makeCamera(aspect), layout.worldWidth, layout.worldHeight, createPose());
}

/** hz 주사율로 seconds 동안 펼친 채 진행한다 */
function runFocused(hz: number, seconds: number, pose: Pose): CardMotion {
  const m = new CardMotion(FLOAT);
  const home = makeHome();
  m.focused = true;
  const dt = 1 / hz;
  const steps = Math.round(seconds * hz);
  let time = 0;
  for (let i = 0; i < steps; i++) {
    time += dt;
    m.step(dt, time, home, pose);
  }
  return m;
}

describe('CardMotion 펼치기', () => {
  it('전환 도중에도 주사율과 상관없이 같은 자세다', () => {
    const pose = focusPoseFor(0.75);
    // 모든 주사율에서 정수 프레임이 되는 시간. 전환이 끝나기 전 시점을 본다
    const seconds = 1 / 6;
    expect(Math.exp(-tuning.focus.rate * seconds)).toBeGreaterThan(0.01);
    const ref = runFocused(60, seconds, pose);
    for (const hz of [30, 90, 120, 144]) {
      const m = runFocused(hz, seconds, pose);
      expect(m.position.distanceTo(ref.position)).toBeLessThan(1e-9);
      expect(m.quaternion.angleTo(ref.quaternion)).toBeLessThan(1e-6);
      expect(m.scale).toBeCloseTo(ref.scale, 9);
      expect(m.focus).toBeCloseTo(ref.focus, 9);
    }
  });

  it('충분히 지나면 펼친 자세에 닿는다', () => {
    const pose = focusPoseFor(0.75);
    const m = runFocused(120, 12 / tuning.focus.rate, pose);
    expect(m.position.distanceTo(pose.position)).toBeLessThan(1e-4);
    expect(m.quaternion.angleTo(pose.quaternion)).toBeLessThan(1e-4);
    expect(m.scale).toBeCloseTo(pose.scale, 4);
    expect(m.focus).toBeCloseTo(1, 4);
  });

  it('닫으면 그 사이 움직인 기본 자리로 돌아간다', () => {
    const pose = focusPoseFor(0.75);
    const hz = 120;
    const dt = 1 / hz;
    const m = runFocused(hz, 1, pose);
    m.focused = false;
    const home = makeHome();
    home.position.set(-2, 0.4, -11);
    let time = 1;
    for (let i = 0; i < Math.round((12 / tuning.focus.rate) * hz); i++) {
      time += dt;
      m.step(dt, time, home, null);
    }
    const idle = m.idlePose(time, home, createPose());
    expect(m.position.distanceTo(idle.position)).toBeLessThan(1e-3);
    expect(m.scale).toBeCloseTo(1, 4);
    expect(m.focus).toBeCloseTo(0, 4);
  });
});

describe('CardMotion 떠 있기', () => {
  it('펼치지 않은 카드는 움직이는 기본 자세를 지연 없이 따라간다', () => {
    const m = new CardMotion(FLOAT);
    const home = makeHome();
    const idle = createPose();
    let time = 0;
    for (const dt of [1 / 30, 1 / 144, 1 / 60, 0.1]) {
      time += dt;
      home.position.x += 3;
      home.position.z -= 5;
      m.step(dt, time, home, null);
      m.idlePose(time, home, idle);
      expect(m.position.distanceTo(idle.position)).toBeLessThan(1e-12);
      expect(m.quaternion.angleTo(idle.quaternion)).toBeLessThan(1e-6);
    }
  });

  it('흔들림 배율이 0이면 기본 자세 그대로다', () => {
    const m = new CardMotion(FLOAT);
    m.floatScale = 0;
    const home = makeHome();
    home.position.set(1, 2, -3);
    for (const time of [0.3, 1.7, 4.1]) {
      const idle = m.idlePose(time, home, createPose());
      expect(idle.position.distanceTo(home.position)).toBeLessThan(1e-12);
      expect(idle.quaternion.angleTo(home.quaternion)).toBeLessThan(1e-6);
    }
  });

  it('흔들림이 설정한 진폭을 넘지 않는다', () => {
    const fl = tuning.float;
    for (let i = 0; i < 2000; i++) {
      const s = floatOffset(i * 0.0137, { phase: i * 0.31, period: fl.periodMin });
      expect(Math.abs(s.y)).toBeLessThanOrEqual(fl.amplitude + 1e-12);
      expect(Math.abs(s.pitch)).toBeLessThanOrEqual(fl.tiltAmplitude + 1e-12);
      expect(Math.abs(s.roll)).toBeLessThanOrEqual(fl.tiltAmplitude + 1e-12);
    }
  });
});

describe('focusScale', () => {
  it('어떤 화면비에서도 펼친 카드가 화면 폭과 높이 안에 들어가고 한쪽은 꽉 찬다', () => {
    const { fovDeg } = tuning.camera;
    const { distance, fill } = tuning.focus;
    const visibleHeight = 2 * distance * Math.tan((fovDeg * Math.PI) / 360);
    for (const aspect of ASPECTS) {
      for (const [w, h] of IMAGE_SIZES) {
        const layout = cardLayout(w, h);
        const s = focusScale(fovDeg, aspect, distance, layout.worldWidth, layout.worldHeight);
        const widthRatio = (layout.worldWidth * s) / (visibleHeight * aspect);
        const heightRatio = (layout.worldHeight * s) / visibleHeight;
        expect(widthRatio).toBeLessThanOrEqual(fill + 1e-9);
        expect(heightRatio).toBeLessThanOrEqual(fill + 1e-9);
        expect(Math.max(widthRatio, heightRatio)).toBeCloseTo(fill, 9);
      }
    }
  });
});

describe('computeFocusPose', () => {
  it('카메라 정면 focus.distance 에 놓이고 앞면이 카메라를 향한다', () => {
    const camera = makeCamera(0.75);
    const layout = cardLayout(480, 640);
    const pose = computeFocusPose(camera, layout.worldWidth, layout.worldHeight, createPose());
    const camPos = camera.getWorldPosition(new Vector3());
    expect(pose.position.distanceTo(camPos)).toBeCloseTo(tuning.focus.distance, 9);

    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new Quaternion()));
    const toCard = pose.position.clone().sub(camPos).normalize();
    expect(toCard.dot(forward)).toBeCloseTo(1, 9);

    const normal = new Vector3(0, 0, 1).applyQuaternion(pose.quaternion);
    expect(normal.dot(forward)).toBeCloseTo(-1, 9);
  });
});
