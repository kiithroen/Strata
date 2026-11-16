import { describe, expect, it } from 'vitest';
import type { CanvasTexture } from 'three';
import { LabelCache, type LabelStyle, type LabelTexture } from '../src/widgets/common/labelCache';

function fakeRenderer() {
  const disposed: string[] = [];
  let created = 0;
  const render = (text: string, style: LabelStyle): LabelTexture => {
    created++;
    const tag = `${style}:${text}#${created}`;
    return {
      aspect: 1,
      texture: { dispose: () => disposed.push(tag) } as unknown as CanvasTexture,
    };
  };
  return { render, disposed, created: () => created };
}

describe('LabelCache', () => {
  it('같은 글자와 스타일이면 캐시에서 재사용한다', () => {
    const mock = fakeRenderer();
    const cache = new LabelCache(4, mock.render);
    const a = cache.get('여행', 'major');
    const b = cache.get('여행', 'major');
    const c = cache.get('여행', 'minor');
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(mock.created()).toBe(2);
  });

  it('상한을 넘기면 가장 오래 안 쓴 텍스처부터 하나씩 비운다', () => {
    const mock = fakeRenderer();
    const cache = new LabelCache(2, mock.render);
    const a = cache.get('A', 'major');
    cache.get('B', 'major');
    // A 를 다시 읽으면 B 가 가장 오래된 항목이 된다
    expect(cache.get('A', 'major')).toBe(a);
    cache.get('C', 'major');
    expect(mock.disposed).toEqual(['major:B#2']);
    // A 는 여전히 남아 있어 다시 그리지 않는다
    expect(cache.get('A', 'major')).toBe(a);
    expect(mock.created()).toBe(3);

    cache.clear();
    expect(mock.disposed).toEqual(['major:B#2', 'major:C#3', 'major:A#1']);
  });
});
