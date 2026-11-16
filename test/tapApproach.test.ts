import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { TapApproach, approachDistance } from '../src/widgets/cosmos/tapApproach';

describe('TapApproach', () => {
  it('처음 탭한 노드로 다가가고 같은 노드를 다시 탭하면 들어간다', () => {
    const a = new TapApproach();
    expect(a.approached).toBeNull();
    expect(a.tap('d1')).toBe('approach');
    expect(a.approached).toBe('d1');
    expect(a.tap('d1')).toBe('enter');
    // 들어간 뒤에도 다가간 노드를 기억해 돌아와서 한 번 더 탭하면 바로 들어간다
    expect(a.tap('d1')).toBe('enter');
  });

  it('다른 노드를 탭하면 그 노드로 다시 다가간다', () => {
    const a = new TapApproach();
    a.tap('d1');
    expect(a.tap('d2')).toBe('approach');
    expect(a.approached).toBe('d2');
    expect(a.tap('d1')).toBe('approach');
  });

  it('잊은 뒤에는 같은 노드도 다시 다가가기부터 한다', () => {
    const a = new TapApproach();
    a.tap('d1');
    a.clear();
    expect(a.approached).toBeNull();
    expect(a.tap('d1')).toBe('approach');
  });
});

describe('approachDistance', () => {
  it('행성과 허브의 다가가기 거리 상한을 튜닝에서 읽는다', () => {
    expect(approachDistance('planet')).toBe(tuning.cosmos.approach.planetDistance);
    expect(approachDistance('hub')).toBe(tuning.cosmos.approach.hubDistance);
  });
});
