import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { generateField } from '../src/widgets/noteCard/field';

const { fovDeg } = tuning.camera;
const f = tuning.field;

describe('generateField', () => {
  it('시드가 같으면 같은 배치, 다르면 다른 배치다', () => {
    expect(generateField(f.count, f.seed, fovDeg)).toEqual(generateField(f.count, f.seed, fovDeg));
    expect(generateField(f.count, f.seed + 1, fovDeg)).not.toEqual(generateField(f.count, f.seed, fovDeg));
  });

  it('모든 자리가 설정한 깊이와 퍼짐 안에 있다', () => {
    const halfTan = Math.tan((fovDeg * Math.PI) / 360);
    const slots = generateField(f.count, f.seed, fovDeg);
    expect(slots).toHaveLength(f.count);
    for (const s of slots) {
      expect(s.depth).toBeGreaterThanOrEqual(f.depthNear);
      expect(s.depth).toBeLessThanOrEqual(f.depthFar);
      const half = s.depth * halfTan;
      expect(Math.abs(s.x)).toBeLessThanOrEqual(f.spreadX * half + 1e-9);
      expect(Math.abs(s.y)).toBeLessThanOrEqual(f.spreadY * half + 1e-9);
      expect(Math.abs(s.yaw)).toBeLessThanOrEqual(f.yawMax);
      expect(s.floatPeriod).toBeGreaterThanOrEqual(tuning.float.periodMin);
      expect(s.floatPeriod).toBeLessThanOrEqual(tuning.float.periodMax);
    }
  });
});
