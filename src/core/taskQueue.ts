/**
 * 동시에 도는 비동기 작업 수를 제한하는 큐. 사진 디코딩처럼 한꺼번에 돌리면 메모리가 튀는 작업에 쓴다.
 * 기본은 들어온 순서대로 돌리고, urgent 작업은 기다리는 줄 맨 앞에 끼운다.
 */
export class TaskQueue {
  private running = 0;
  private readonly waiting: Array<{ start: () => void; cancel: (reason: unknown) => void }> = [];

  constructor(private readonly concurrency: number) {
    if (!(concurrency >= 1)) throw new Error('동시 작업 수는 1 이상이어야 한다');
  }

  /** 돌고 있는 작업 수 */
  get active(): number {
    return this.running;
  }

  /** 기다리는 작업 수 */
  get pending(): number {
    return this.waiting.length;
  }

  /** 아직 시작하지 않은 대기 작업을 모두 취소한다 */
  clear(reason: unknown = new Error('cancelled')): void {
    const dropped = this.waiting.splice(0, this.waiting.length);
    for (const entry of dropped) entry.cancel(reason);
  }

  run<T>(task: () => Promise<T>, urgent = false): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const entry = {
        start: () => {
          this.running++;
          let result: Promise<T>;
          try {
            result = task();
          } catch (e) {
            result = Promise.reject(e);
          }
          result.then(resolve, reject).finally(() => {
            this.running--;
            this.waiting.shift()?.start();
          });
        },
        cancel: reject,
      };
      if (this.running < this.concurrency) entry.start();
      else if (urgent) this.waiting.unshift(entry);
      else this.waiting.push(entry);
    });
  }
}
