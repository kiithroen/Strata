/**
 * 바이트 상한이 있는 LRU 캐시. 넣을 때마다 오래 안 쓴 것부터 상한 아래로 내려갈 때까지 버리고 onEvict 로 알린다.
 * 상한보다 큰 값 하나는 넣자마자 버린다
 */
export class LruCache<V> {
  private readonly map = new Map<string, { value: V; size: number }>();
  private total = 0;

  constructor(
    private readonly budget: number,
    private readonly onEvict?: (value: V) => void,
  ) {}

  /** 담긴 값 크기의 합 */
  get bytes(): number {
    return this.total;
  }

  get size(): number {
    return this.map.size;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  /** 값을 꺼내고 가장 최근에 쓴 것으로 올린다 */
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, size: number): void {
    const old = this.map.get(key);
    if (old) {
      this.map.delete(key);
      this.total -= old.size;
      if (old.value !== value) this.onEvict?.(old.value);
    }
    this.map.set(key, { value, size });
    this.total += size;
    for (const [k, v] of this.map) {
      if (this.total <= this.budget) break;
      this.map.delete(k);
      this.total -= v.size;
      this.onEvict?.(v.value);
    }
  }

  clear(): void {
    for (const v of this.map.values()) this.onEvict?.(v.value);
    this.map.clear();
    this.total = 0;
  }
}
