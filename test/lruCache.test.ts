import { describe, expect, it } from 'vitest';
import { LruCache } from '../src/core/lruCache';

describe('LruCache', () => {
  it('상한을 넘으면 오래 안 쓴 것부터 버리고 알린다', () => {
    const evicted: string[] = [];
    const c = new LruCache<string>(10, (v) => evicted.push(v));
    c.set('a', 'A', 4);
    c.set('b', 'B', 4);
    expect(c.get('a')).toBe('A'); // a 를 최근으로 올린다
    c.set('c', 'C', 4);
    expect(evicted).toEqual(['B']);
    expect(c.has('a') && c.has('c') && !c.has('b')).toBe(true);
    expect(c.bytes).toBe(8);
  });

  it('같은 키를 다시 넣으면 옛 값을 알리고 크기를 바꾼다', () => {
    const evicted: string[] = [];
    const c = new LruCache<string>(10, (v) => evicted.push(v));
    c.set('a', 'A1', 3);
    c.set('a', 'A2', 5);
    expect(evicted).toEqual(['A1']);
    expect(c.bytes).toBe(5);
    expect(c.size).toBe(1);
  });

  it('상한보다 큰 값은 넣자마자 버리고, 비우면 모두 알린다', () => {
    const evicted: string[] = [];
    const c = new LruCache<string>(10, (v) => evicted.push(v));
    c.set('big', 'X', 11);
    expect(c.has('big')).toBe(false);
    c.set('a', 'A', 2);
    c.set('b', 'B', 2);
    c.clear();
    expect(evicted).toEqual(['X', 'A', 'B']);
    expect(c.bytes).toBe(0);
  });
});
