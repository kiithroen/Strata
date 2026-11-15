import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { flightParams } from '../src/widgets/cosmos/cosmosModel';
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
  it('회전이 없으면 종이 위 (u × 폭, v × 높이) × 배율 자리다', () => {
    const pin = paperPin('0007');
    const pos = new Vector3(1, -2, -6);
    const out = pinPoint(pos, new Quaternion(), 0.5, 1.2, 0.9, pin, new Vector3());
    expect(out.x).toBeCloseTo(1 + pin.u * 1.2 * 0.5, 12);
    expect(out.y).toBeCloseTo(-2 + pin.v * 0.9 * 0.5, 12);
    expect(out.z).toBeCloseTo(-6, 12);
  });

  it('종이가 돌아도 종이 평면 위, 종이 위쪽 절반에 붙어 함께 돈다', () => {
    const pos = new Vector3(0.3, 0.1, -5);
    const w = 1.2;
    const h = 0.9;
    const s = 0.3;
    const out = new Vector3();
    for (const id of ids.slice(0, 20)) {
      const pin = paperPin(id);
      const q = flightParams(id).base;
      pinPoint(pos, q, s, w, h, pin, out);
      const local = out.clone().sub(pos);
      expect(local.length()).toBeCloseTo(s * Math.hypot(pin.u * w, pin.v * h), 9);
      expect(local.dot(new Vector3(0, 0, 1).applyQuaternion(q))).toBeCloseTo(0, 9);
      expect(local.dot(new Vector3(0, 1, 0).applyQuaternion(q))).toBeGreaterThan(0);
    }
  });
});
