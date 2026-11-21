import { tuning } from '../../config';
import { damp } from '../../core/motion';
import { hash01 } from '../cosmos/cosmosModel';

type SlotState = 'wait' | 'grow' | 'hold' | 'shrink' | 'leave';

interface Slot {
  /** 앉은 노트(멤버 번호). 멤버 번호는 관련도 높은 순서다 */
  member: number;
  /** 부푼 정도(0~1). 창의 배율과 불투명도에 곱한다 */
  bubble: number;
  state: SlotState;
  /** wait 는 남은 기다림, hold 는 지난 시간(게임 시간, 초) */
  timer: number;
  /** hold 를 마칠 시간 */
  holdFor: number;
  /** 이 칸에서 노트가 바뀐 횟수. 머무는 시간을 정하는 난수 씨앗이다 */
  turns: number;
}

const GROWN = 0.995;
const GONE = 0.01;

/**
 * 층 하나의 창 칸을 돌려 쓴다. 칸 수보다 노트가 많으면 칸마다 시차를 두고 앉은 노트가 거품처럼 꺼지고
 * 대기열의 다음 노트가 부풀어 오른다. 꺼진 노트는 대기열 맨 뒤로 가서, 한 노트가 두 칸에 동시에 앉지 않고 모든 노트가 돌아가며 보인다.
 * 칸 수가 바뀌면(바라보는 층이 바뀔 때) 늘어난 칸은 시차를 두고 부풀고, 줄어든 칸은 꺼진 뒤 사라진다.
 * 시간은 게임 시간이고, 부푸는 정도는 strata.rotate.rate 로 지수 접근한다.
 */
export class TileRotation {
  private readonly slots: Slot[] = [];
  private readonly queue: number[] = [];
  private target: number;

  /** members 는 노트 수, slots 는 처음 칸 수다. 처음 칸은 관련도 높은 노트로 다 부푼 채 시작한다 */
  constructor(
    readonly members: number,
    slots: number,
  ) {
    this.target = Math.min(members, Math.max(0, slots));
    for (let k = 0; k < this.target; k++) {
      const slot: Slot = { member: k, bubble: 1, state: 'hold', timer: 0, holdFor: 0, turns: 0 };
      slot.holdFor = this.holdTime(k, 0);
      // 칸마다 머문 시간을 다르게 시작해 한꺼번에 바뀌지 않는다
      slot.timer = slot.holdFor * ((k * 0.618034) % 1);
      this.slots.push(slot);
    }
    for (let m = this.target; m < members; m++) this.queue.push(m);
  }

  private holdTime(slot: number, turns: number): number {
    const [lo, hi] = tuning.strata.rotate.hold;
    return lo + (hi - lo) * hash01(slot + 1, turns + 1);
  }

  /** 지금 칸 수(꺼지고 있는 칸 포함) */
  get slotCount(): number {
    return this.slots.length;
  }

  /** 칸 수를 바꾼다. 노트 수보다 많을 수 없다 */
  setSlots(count: number): void {
    const next = Math.min(this.members, Math.max(0, count));
    if (next === this.target) return;
    this.target = next;
    let added = 0;
    for (let k = 0; k < this.slots.length; k++) {
      const slot = this.slots[k];
      if (k >= next) {
        if (slot.state !== 'leave') slot.state = 'leave';
      } else if (slot.state === 'leave') {
        slot.state = 'grow';
      }
    }
    while (this.slots.length < next) {
      const member = this.queue.shift();
      if (member === undefined) break;
      const k = this.slots.length;
      this.slots.push({ member, bubble: 0, state: 'wait', timer: added * tuning.strata.rotate.stagger, holdFor: this.holdTime(k, 0), turns: 0 });
      added++;
    }
    if (this.queue.length === 0) {
      for (const slot of this.slots) {
        if (slot.state === 'shrink') slot.state = 'grow';
      }
    }
  }

  /** dt 만큼 진행한다. 부르는 쪽이 멈출 때(손가락, 펼친 카드)는 dt 를 0으로 넘긴다 */
  update(dt: number): void {
    if (dt <= 0) return;
    const r = tuning.strata.rotate;
    const rotating = this.queue.length > 0;
    for (const slot of this.slots) {
      switch (slot.state) {
        case 'wait':
          slot.timer -= dt;
          if (slot.timer <= 0) slot.state = 'grow';
          break;
        case 'grow':
          slot.bubble = damp(slot.bubble, 1, r.rate, dt);
          if (slot.bubble >= GROWN) {
            slot.bubble = 1;
            slot.state = 'hold';
            slot.timer = 0;
          }
          break;
        case 'hold':
          if (!rotating) break;
          slot.timer += dt;
          if (slot.timer >= slot.holdFor) slot.state = 'shrink';
          break;
        case 'shrink':
        case 'leave':
          slot.bubble = damp(slot.bubble, 0, r.rate, dt);
          if (slot.bubble <= GONE) {
            slot.bubble = 0;
            if (slot.state === 'shrink') this.swap(slot);
          }
          break;
      }
    }
    // 다 꺼진 꼬리 칸을 없애고 노트를 대기열로 돌려보낸다
    while (this.slots.length > this.target) {
      const last = this.slots[this.slots.length - 1];
      if (last.state !== 'leave' || last.bubble > 0) break;
      this.queue.push(last.member);
      this.slots.pop();
    }
  }

  private swap(slot: Slot): void {
    const k = this.slots.indexOf(slot);
    const next = this.queue.shift();
    if (next !== undefined) {
      this.queue.push(slot.member);
      slot.member = next;
    }
    slot.turns++;
    slot.holdFor = this.holdTime(k, slot.turns);
    slot.state = 'grow';
  }

  /** 멤버가 앉은 칸 번호와 부푼 정도. 앉지 않았으면 null */
  find(member: number): { slot: number; bubble: number } | null {
    for (let k = 0; k < this.slots.length; k++) {
      const s = this.slots[k];
      if (s.member === member) return { slot: k, bubble: s.bubble };
    }
    return null;
  }

  /** 칸마다 앉은 멤버(칸 차례) */
  occupants(): number[] {
    return this.slots.map((s) => s.member);
  }
}
