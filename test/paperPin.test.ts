import { Euler, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { bendHeight } from '../src/widgets/noteCard/paperBend';
import { pinPoint } from '../src/widgets/noteCard/paperPin';

describe('pinPoint', () => {
  it('회전이 없으면 카드 중심에서 Z 로 (lift × 폭 × 배율) 떨어진 자리다', () => {
    const pos = new Vector3(1, -2, -6);
    const out = pinPoint(pos, new Quaternion(), 0.5, 1.2, -0.03, new Vector3());
    expect(out.x).toBeCloseTo(1, 12);
    expect(out.y).toBeCloseTo(-2, 12);
    expect(out.z).toBeCloseTo(-6 - 0.03 * 1.2 * 0.5, 12);
  });

  it('카드가 돌아도 카드 법선 방향으로 lift 만큼 떨어져 중심에 붙어 함께 돈다', () => {
    const pos = new Vector3(0.3, 0.1, -5);
    const w = 1.2;
    const s = 0.3;
    const lift = -tuning.card.pin.lift;
    const out = new Vector3();
    Array.from({ length: 20 }, (_, i) => i).forEach((i) => {
      const q = new Quaternion().setFromEuler(new Euler(i * 0.7, i * 1.3, i * 0.4));
      pinPoint(pos, q, s, w, lift, out);
      const local = out.clone().sub(pos);
      expect(local.length()).toBeCloseTo(Math.abs(lift) * w * s, 9);
      expect(local.dot(new Vector3(0, 0, 1).applyQuaternion(q))).toBeCloseTo(lift * w * s, 9);
    });
  });
});

describe('bendHeight', () => {
  it('종이 휨 높이는 물결 두 개와 말림의 최대 높이를 넘지 않고 시간에 따라 출렁인다', () => {
    const b = tuning.card.bend;
    const max = b.waveAmp[0] + b.waveAmp[1] + b.curl * 0.25;
    const seen = new Set<number>();
    for (let t = 0; t < 10; t += 0.13) {
      for (const [x, y] of [[-0.5, 0.5], [0, 0], [0.3, -0.2], [0.5, -0.5]]) {
        const z = bendHeight(x, y, t, 1.234);
        expect(Math.abs(z)).toBeLessThanOrEqual(max + 1e-12);
        seen.add(Math.round(z * 1000));
      }
    }
    expect(seen.size).toBeGreaterThan(10);
  });
});
