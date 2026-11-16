import { describe, expect, it } from 'vitest';
import { TaskQueue } from '../src/core/taskQueue';

/** 밖에서 끝낼 수 있는 작업 */
function gate() {
  let open!: () => void;
  const done = new Promise<void>((r) => (open = r));
  return { done, open };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('TaskQueue', () => {
  it('동시 작업 수를 넘기지 않고 끝나는 대로 다음 작업을 돌린다', async () => {
    const q = new TaskQueue(2);
    const gates = [gate(), gate(), gate()];
    const started: number[] = [];
    const runs = gates.map((g, i) =>
      q.run(async () => {
        started.push(i);
        await g.done;
        return i;
      }),
    );
    await tick();
    expect(started).toEqual([0, 1]);
    expect(q.active).toBe(2);
    expect(q.pending).toBe(1);
    gates[0].open();
    await tick();
    expect(started).toEqual([0, 1, 2]);
    gates[1].open();
    gates[2].open();
    expect(await Promise.all(runs)).toEqual([0, 1, 2]);
    expect(q.active).toBe(0);
  });

  it('급한 작업은 기다리는 줄 맨 앞에 끼운다', async () => {
    const q = new TaskQueue(1);
    const first = gate();
    const order: string[] = [];
    q.run(async () => {
      await first.done;
      order.push('a');
    });
    const b = q.run(async () => {
      order.push('b');
    });
    const c = q.run(async () => {
      order.push('c');
    }, true);
    first.open();
    await Promise.all([b, c]);
    expect(order).toEqual(['a', 'c', 'b']);
  });

  it('실패한 작업도 자리를 비운다', async () => {
    const q = new TaskQueue(1);
    const bad = q.run(async () => {
      throw new Error('x');
    });
    const good = q.run(async () => 7);
    await expect(bad).rejects.toThrow('x');
    expect(await good).toBe(7);
  });
});
