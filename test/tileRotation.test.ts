import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { TileRotation } from '../src/widgets/strata/tileRotation';

const r = tuning.strata.rotate;

/** 게임 시간 seconds 동안 dt 씩 진행하며 매 걸음 check 를 부른다 */
function run(rot: TileRotation, seconds: number, dt: number, check?: (rot: TileRotation) => void): void {
  for (let t = 0; t < seconds; t += dt) {
    rot.update(dt);
    check?.(rot);
  }
}

function noDuplicates(rot: TileRotation): void {
  const seated = rot.occupants();
  expect(new Set(seated).size).toBe(seated.length);
}

describe('TileRotation', () => {
  it('노트가 칸보다 적거나 같으면 돌리지 않고 모두 다 부푼 채 머문다', () => {
    const rot = new TileRotation(5, 8);
    expect(rot.slotCount).toBe(5);
    run(rot, r.hold[1] * 4, 1 / 60);
    for (let m = 0; m < 5; m++) expect(rot.find(m)).toEqual({ slot: m, bubble: 1 });
  });

  it('처음 칸에는 관련도 높은 노트가 다 부푼 채 앉아 있다', () => {
    const rot = new TileRotation(30, 6);
    expect(rot.occupants()).toEqual([0, 1, 2, 3, 4, 5]);
    for (let m = 0; m < 6; m++) expect(rot.find(m)?.bubble).toBe(1);
    expect(rot.find(6)).toBeNull();
  });

  it('노트가 많으면 한 노트가 두 칸에 앉지 않고, 시간이 지나면 모든 노트가 한 번씩 앉는다', () => {
    const members = 23;
    const slots = 5;
    const rot = new TileRotation(members, slots);
    const seen = new Set<number>(rot.occupants());
    // 한 바퀴에 칸마다 최대 hold[1] + 부풀고 꺼지는 시간이 걸린다
    const lap = (r.hold[1] + 2) * Math.ceil(members / slots) * 2;
    run(rot, lap, 1 / 60, (x) => {
      noDuplicates(x);
      expect(x.slotCount).toBe(slots);
      for (const m of x.occupants()) seen.add(m);
    });
    expect(seen.size).toBe(members);
  });

  it('칸들은 한꺼번에 바뀌지 않는다', () => {
    const rot = new TileRotation(40, 8);
    let maxChanging = 0;
    run(rot, r.hold[1] * 3, 1 / 60, (x) => {
      const changing = x.occupants().filter((m) => (x.find(m)?.bubble ?? 1) < 1).length;
      maxChanging = Math.max(maxChanging, changing);
    });
    expect(maxChanging).toBeGreaterThan(0);
    expect(maxChanging).toBeLessThan(8);
  });

  it('노트는 칸에 hold 범위의 최솟값보다 먼저 꺼지지 않는다', () => {
    const rot = new TileRotation(20, 4);
    const dt = 1 / 60;
    // 처음 앉은 노트는 머문 시간이 엇갈려 시작하니, 처음으로 새로 앉은 노트부터 잰다
    const since = new Map<number, number>();
    let t = 0;
    let checked = 0;
    while (t < r.hold[1] * 6) {
      rot.update(dt);
      t += dt;
      for (const m of rot.occupants()) {
        const seat = rot.find(m)!;
        if (m >= 4 && !since.has(m) && seat.bubble > 0) since.set(m, t);
      }
      for (const [m, start] of since) {
        const seat = rot.find(m);
        if (seat && seat.bubble < 1 && t - start > 1) {
          // 꺼지기 시작한 노트: 부푼 뒤 hold 를 다 채웠다
          expect(t - start).toBeGreaterThanOrEqual(r.hold[0]);
          since.delete(m);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('dt 를 0으로 넘기면 멈춘다', () => {
    const rot = new TileRotation(30, 6);
    run(rot, r.hold[1] * 1.3, 1 / 60);
    const before = rot.occupants().map((m) => ({ m, ...rot.find(m)! }));
    for (let i = 0; i < 600; i++) rot.update(0);
    expect(rot.occupants().map((m) => ({ m, ...rot.find(m)! }))).toEqual(before);
  });

  it('주사율이 달라도 같은 게임 시간이면 같은 노트가 앉는다', () => {
    const a = new TileRotation(30, 6);
    const b = new TileRotation(30, 6);
    // 부풀기가 끝나는 문턱 근처에서 걸음 크기만큼 어긋날 수 있으니 바뀌는 순간을 피해 잰다
    run(a, r.hold[0] * 2.5, 1 / 30);
    run(b, r.hold[0] * 2.5, 1 / 144);
    const settled = (x: TileRotation) => x.occupants().filter((m) => x.find(m)!.bubble === 1);
    expect(settled(a).length).toBeGreaterThanOrEqual(4);
    const common = settled(a).filter((m) => settled(b).includes(m));
    expect(common.length).toBeGreaterThanOrEqual(settled(a).length - 2);
  });

  it('칸이 늘면 새 칸은 꺼진 채 시차를 두고 부풀고, 줄면 꺼진 뒤 사라지며 노트는 다시 돌아온다', () => {
    const rot = new TileRotation(30, 3);
    rot.setSlots(9);
    expect(rot.slotCount).toBe(9);
    const added = rot.occupants().slice(3);
    for (const m of added) expect(rot.find(m)?.bubble).toBe(0);
    noDuplicates(rot);
    rot.update(r.stagger * 0.5);
    rot.update(r.stagger * 0.5);
    // 첫 새 칸은 부풀기 시작했고 마지막 새 칸은 아직 기다린다
    expect(rot.find(added[0])!.bubble).toBeGreaterThan(0);
    expect(rot.find(added[added.length - 1])!.bubble).toBe(0);
    run(rot, r.stagger * 9 + 2, 1 / 60, noDuplicates);
    for (const m of rot.occupants()) expect(rot.find(m)!.bubble).toBeGreaterThan(0);

    rot.setSlots(3);
    expect(rot.slotCount).toBe(9);
    run(rot, 2, 1 / 60, noDuplicates);
    expect(rot.slotCount).toBe(3);

    // 빠진 노트도 대기열로 돌아가 다시 앉는다
    const seen = new Set<number>();
    run(rot, (r.hold[1] + 2) * 30, 1 / 60, (x) => x.occupants().forEach((m) => seen.add(m)));
    expect(seen.size).toBe(30);
  });

  it('꺼지는 중에 칸이 다시 늘면 그 칸은 다시 부푼다', () => {
    const rot = new TileRotation(30, 6);
    rot.setSlots(2);
    rot.update(0.05);
    const leaving = rot.occupants()[5];
    const bubble = rot.find(leaving)!.bubble;
    expect(bubble).toBeLessThan(1);
    rot.setSlots(6);
    run(rot, 2, 1 / 60);
    expect(rot.find(leaving)?.bubble).toBe(1);
  });

  it('꺼지는 중에 칸이 늘어 대기열이 비면 그 칸이 0까지 꺼졌다 튀지 않고 바로 다시 부푼다', () => {
    const rot = new TileRotation(10, 3);
    const prev = new Map(rot.occupants().map((m) => [m, rot.find(m)!.bubble]));
    let shrinking: { member: number; bubble: number } | null = null;
    for (let step = 0; step < 600 && !shrinking; step++) {
      rot.update(1 / 60);
      for (const m of rot.occupants()) {
        const b = rot.find(m)!.bubble;
        const p = prev.get(m);
        if (p !== undefined && b < p) {
          shrinking = { member: m, bubble: b };
          break;
        }
        prev.set(m, b);
      }
    }
    expect(shrinking).not.toBeNull();
    rot.setSlots(10);
    for (let step = 0; step < 120; step++) {
      rot.update(1 / 60);
      const seat = rot.find(shrinking!.member);
      expect(seat).not.toBeNull();
      expect(seat!.bubble).toBeGreaterThanOrEqual(shrinking!.bubble);
    }
    expect(rot.find(shrinking!.member)?.bubble).toBe(1);
  });
});
