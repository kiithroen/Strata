import { Euler, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { bendHeight } from '../src/widgets/noteCard/paperBend';
import { paperPin, pinPoint } from '../src/widgets/noteCard/paperPin';

const ids = Array.from({ length: 80 }, (_, i) => String(i + 1).padStart(4, '0'));

describe('paperPin', () => {
  it('압정은 윗변에서 pin.inset 아래, 가운데에서 pin.jitter 안쪽에 꽂히고 노트마다 자리가 다르다', () => {
    const p = tuning.card.pin;
    const us = new Set<number>();
    for (const id of ids) {
      const pin = paperPin(id);
      expect(paperPin(id)).toEqual(pin);
      expect(pin.v).toBeCloseTo(0.5 - p.inset, 12);
      expect(Math.abs(pin.u)).toBeLessThanOrEqual(p.jitter);
      expect(Math.abs(pin.tilt)).toBeLessThanOrEqual(tuning.card.tape.tilt);
      us.add(Math.round(pin.u * 1000));
    }
    expect(us.size).toBeGreaterThan(ids.length / 2);
  });
});

describe('pinPoint', () => {
  it('회전이 없으면 종이 위 (u × 폭, v × 높이, lift × 폭) × 배율 자리다', () => {
    const pin = paperPin('0007');
    const pos = new Vector3(1, -2, -6);
    const out = pinPoint(pos, new Quaternion(), 0.5, 1.2, 0.9, pin, 0.03, new Vector3());
    expect(out.x).toBeCloseTo(1 + pin.u * 1.2 * 0.5, 12);
    expect(out.y).toBeCloseTo(-2 + pin.v * 0.9 * 0.5, 12);
    expect(out.z).toBeCloseTo(-6 + 0.03 * 1.2 * 0.5, 12);
  });

  it('종이가 돌아도 앞면 위로 lift 만큼 떠서 종이 위쪽 절반에 붙어 함께 돈다', () => {
    const pos = new Vector3(0.3, 0.1, -5);
    const w = 1.2;
    const h = 0.9;
    const s = 0.3;
    const lift = tuning.card.pin.lift;
    const out = new Vector3();
    ids.slice(0, 20).forEach((id, i) => {
      const pin = paperPin(id);
      const q = new Quaternion().setFromEuler(new Euler(i * 0.7, i * 1.3, i * 0.4));
      pinPoint(pos, q, s, w, h, pin, lift, out);
      const local = out.clone().sub(pos);
      expect(local.length()).toBeCloseTo(s * Math.hypot(pin.u * w, pin.v * h, lift * w), 9);
      expect(local.dot(new Vector3(0, 0, 1).applyQuaternion(q))).toBeCloseTo(lift * w * s, 9);
      expect(local.dot(new Vector3(0, 1, 0).applyQuaternion(q))).toBeGreaterThan(0);
    });
  });
});

describe('bendHeight', () => {
  it('종이 휨 높이는 물결 두 개와 말림의 최대 높이를 넘지 않고 시간에 따라 출렁인다', () => {
    const b = tuning.card.bend;
    const max = b.waveAmp[0] + b.waveAmp[1] + b.curl * 0.25;
    const seen = new Set<number>();
    for (let t = 0; t < 10; t += 0.13) {
      for (const [x, y] of [[-0.5, 0.5], [0, 0.44], [0.3, -0.2], [0.5, -0.5]]) {
        const z = bendHeight(x, y, t, 1.234);
        expect(Math.abs(z)).toBeLessThanOrEqual(max + 1e-12);
        seen.add(Math.round(z * 1000));
      }
    }
    expect(seen.size).toBeGreaterThan(10);
  });
});
