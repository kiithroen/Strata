import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { createPose } from '../src/widgets/noteCard/cardMotion';
import {
  layoutStrata,
  nearestLayer,
  paintOrder,
  strataDistance,
  strataFocusHeight,
  strataPose,
  type StrataLayerInput,
  type StrataTileInput,
} from '../src/widgets/strata/strataLayout';

const s = tuning.strata;

function tiles(count: number, seed: number): StrataTileInput[] {
  return Array.from({ length: count }, (_, i) => ({
    index: seed * 100 + i,
    id: String(seed * 100 + i).padStart(4, '0'),
    width: tuning.card.width * (i % 3 === 0 ? 1 : 0.84),
    height: tuning.card.width * (i % 2 === 0 ? 0.8 : 1.4),
    affinity: ((i * 37) % 11) / 10,
  }));
}

const layers: StrataLayerInput[] = [1, 5, 12, 3].map((count, i) => ({
  key: `L${i}`,
  label: `L${i}`,
  anchorTime: 1_000_000 - i * 86_400_000,
  tiles: tiles(count, i + 1),
}));

describe('layoutStrata', () => {
  it('고른 층이 높이 0이고, 최근 층일수록 layerGap 만큼 위다', () => {
    for (let focus = 0; focus < layers.length; focus++) {
      const out = layoutStrata(layers, focus);
      expect(out[focus].y).toBe(0);
      for (let i = 1; i < out.length; i++) expect(out[i - 1].y - out[i].y).toBeCloseTo(s.layerGap, 12);
    }
  });

  it('칸은 노트 수와 maxTiles 중 작은 수이고, 가장 큰 창이 어느 칸에 앉아도 겹치지 않고 원판 안에 든다', () => {
    const many: StrataLayerInput = { key: 'many', label: 'many', anchorTime: 0, tiles: tiles(s.maxTiles * 3 + 1, 9) };
    for (const layer of layoutStrata([...layers, many], 0)) {
      const count = layer.tiles.length;
      expect(layer.slots.length).toBe(Math.min(count, s.maxTiles));
      const r = Math.max(...layer.tiles.map((t) => t.radius));
      const p = layer.slots;
      const outer = Math.max(...p.map((x) => Math.hypot(x.x, x.z) + r));
      expect(layer.radius).toBeCloseTo(outer + s.margin, 9);
      for (let i = 0; i < p.length; i++) {
        for (let j = i + 1; j < p.length; j++) expect(Math.hypot(p[i].x - p[j].x, p[i].z - p[j].z)).toBeGreaterThanOrEqual(2 * r - 1e-9);
      }
    }
  });

  it('노트가 칸보다 많아도 원판은 칸 수만큼만 커진다', () => {
    // 창 크기가 같아야 원판 크기를 칸 수로만 비교할 수 있다
    const same = (n: number) => tiles(n, 9).map((t) => ({ ...t, width: tuning.card.width, height: tuning.card.width, affinity: 0.5 }));
    const big = (n: number) => layoutStrata([{ key: 'k', label: 'k', anchorTime: 0, tiles: same(n) }], 0)[0];
    expect(big(s.maxTiles * 10).radius).toBeCloseTo(big(s.maxTiles).radius, 9);
  });

  it('층의 모든 노트를 관련도 높은 순서로 들고, 관련도가 높을수록 창이 크다', () => {
    const out = layoutStrata(layers, 1);
    out.forEach((layer, li) => {
      const inputs = layers[li].tiles;
      expect(layer.tiles.map((t) => t.index).sort((a, b) => a - b)).toEqual(inputs.map((t) => t.index).sort((a, b) => a - b));
      const byIndex = new Map(inputs.map((t) => [t.index, t]));
      for (const tile of layer.tiles) {
        const a = byIndex.get(tile.index)!.affinity;
        expect(tile.scale).toBeCloseTo(s.cardScale[0] + (s.cardScale[1] - s.cardScale[0]) * a, 12);
      }
      for (let i = 1; i < layer.tiles.length; i++) {
        expect(byIndex.get(layer.tiles[i - 1].index)!.affinity).toBeGreaterThanOrEqual(byIndex.get(layer.tiles[i].index)!.affinity);
      }
    });
  });

  it('같은 입력이면 같은 자리다', () => {
    expect(layoutStrata(layers, 2)).toEqual(layoutStrata(layers, 2));
  });

  it('같은 창들이라도 층 키가 다르면 배치가 통째로 돌아 있어 위에서 볼 때 창 자리가 겹치지 않는다', () => {
    const same = tiles(12, 1);
    const [a, b] = layoutStrata(
      [
        { key: '2026-10-01', label: 'a', anchorTime: 0, tiles: same },
        { key: '2026-10-02', label: 'b', anchorTime: 0, tiles: same },
      ],
      0,
    );
    // 돌리기만 했으니 중심 거리와 창끼리 거리는 같다
    a.slots.forEach((t, i) => expect(Math.hypot(t.x, t.z)).toBeCloseTo(Math.hypot(b.slots[i].x, b.slots[i].z), 9));
    expect(Math.hypot(a.slots[1].x - a.slots[5].x, a.slots[1].z - a.slots[5].z)).toBeCloseTo(
      Math.hypot(b.slots[1].x - b.slots[5].x, b.slots[1].z - b.slots[5].z),
      9,
    );
    // 가운데 칸을 뺀 칸들은 다른 층의 같은 번째 칸과 자리가 다르다
    const r = a.tiles[0].radius;
    const moved = a.slots.slice(1).filter((t, i) => Math.hypot(t.x - b.slots[i + 1].x, t.z - b.slots[i + 1].z) > r * 0.5);
    expect(moved.length).toBe(a.slots.length - 1);
  });

  it('1장은 정중앙에, 2~4장은 같은 반지름 원 위에 대칭으로 놓인다', () => {
    const one = layoutStrata([{ key: '1', label: '1', anchorTime: 0, tiles: tiles(1, 1) }], 0)[0].slots;
    expect(Math.hypot(one[0].x, one[0].z)).toBe(0);
    for (const n of [2, 3, 4]) {
      const group = layoutStrata([{ key: String(n), label: String(n), anchorTime: 0, tiles: tiles(n, n) }], 0)[0].slots;
      const radii = group.map((t) => Math.hypot(t.x, t.z));
      for (const r of radii) expect(r).toBeCloseTo(radii[0], 9);
    }
  });

  it('5장 이상인 층은 1·2번 칸이 중심을 사이에 두고 맞은편에 놓여 일부 칸만 써도 한쪽에 쏠리지 않는다', () => {
    for (const n of [5, 7, 12]) {
      const slots = layoutStrata([{ key: `k${n}`, label: `k${n}`, anchorTime: 0, tiles: tiles(n, n) }], 0)[0].slots;
      expect(Math.hypot(slots[0].x, slots[0].z)).toBe(0);
      expect(slots[1].x * slots[2].x + slots[1].z * slots[2].z).toBeLessThan(0);
    }
  });
});

describe('nearestLayer', () => {
  it('시각이 가장 가까운 층을 고른다', () => {
    const out = layoutStrata(layers, 0);
    out.forEach((l, i) => expect(nearestLayer(out, l.anchorTime + 1000)).toBe(i));
  });
});

describe('strataFocusHeight', () => {
  it('고른 층 높이에서 쌓인 층 가운데 쪽으로 stackBias 만큼 옮긴 높이를 겨눈다', () => {
    const out = layoutStrata(layers, 0);
    const ys = out.map((l) => l.y);
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    out.forEach((l, i) => {
      expect(strataFocusHeight(out, i)).toBeCloseTo(l.y + (mid - l.y) * s.stackBias, 9);
    });
    // 층이 하나면 그 층 중심이다
    expect(strataFocusHeight([out[0]], 0)).toBeCloseTo(out[0].y, 9);
  });
});

describe('paintOrder', () => {
  it('카메라와 높이 차가 큰 것부터 그린다: 위에서 보면 아래층부터, 층 사이에서 보면 먼 쪽부터', () => {
    const out = layoutStrata(layers, 0);
    const heights = out.map((l) => l.y);
    const top = Math.max(...heights);
    const bottom = Math.min(...heights);
    const above = paintOrder(heights, top + 10);
    const lowest = heights.indexOf(bottom);
    const highest = heights.indexOf(top);
    expect(above[lowest]).toBe(0);
    expect(above[highest]).toBe(heights.length - 1);
    expect([...above].sort((a, b) => a - b)).toEqual(heights.map((_, i) => i));

    // 카메라가 맨 아래층 바로 위에 있으면 맨 위층이 가장 멀어 먼저, 맨 아래층이 가장 가까워 마지막이다
    const near = paintOrder(heights, bottom + 1e-3);
    expect(near[highest]).toBe(0);
    expect(near[lowest]).toBe(heights.length - 1);
  });
});

describe('strataPose 원판 회전', () => {
  it('창은 원판에 놓인 채 층 중심 둘레로 함께 돌고, 한 바퀴 돌면 제자리다', () => {
    const layer = layoutStrata(layers, 0)[2];
    const frame = { origin: new Vector3(1, 2, 3), yaw: 0.4 };
    const slot = layer.slots[layer.slots.length - 1];
    const rest = strataPose(frame, layer, slot, 1, createPose());
    const center = new Vector3(frame.origin.x, frame.origin.y + layer.y, frame.origin.z);
    for (const spin of [0.3, 1.7, -2.2]) {
      const p = strataPose(frame, layer, slot, 1, createPose(), spin);
      expect(p.position.distanceTo(center)).toBeCloseTo(rest.position.distanceTo(center), 9);
      expect(p.position.y).toBeCloseTo(rest.position.y, 9);
      expect(p.quaternion.angleTo(rest.quaternion)).toBeCloseTo(Math.abs(spin), 6);
      const before = rest.position.clone().sub(center);
      const after = p.position.clone().sub(center);
      const delta = Math.atan2(-after.z, after.x) - Math.atan2(-before.z, before.x);
      expect(Math.atan2(Math.sin(delta), Math.cos(delta))).toBeCloseTo(spin, 6);
    }
    const full = strataPose(frame, layer, slot, 1, createPose(), Math.PI * 2);
    expect(full.position.distanceTo(rest.position)).toBeLessThan(1e-9);
  });
});

describe('strataPose', () => {
  it('앞면이 위를 보고 창의 위쪽이 보는 쪽 반대를 향한다', () => {
    const out = layoutStrata(layers, 0);
    const layer = out[2];
    for (const yaw of [0, 0.7, -2.1]) {
      const frame = { origin: new Vector3(1, 2, 3), yaw };
      for (const [k, slot] of layer.slots.entries()) {
        const tile = layer.tiles[k];
        const pose = strataPose(frame, layer, slot, tile.scale, createPose());
        const normal = new Vector3(0, 0, 1).applyQuaternion(pose.quaternion);
        const up = new Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
        const toViewer = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        expect(normal.y).toBeCloseTo(1, 9);
        expect(up.dot(toViewer)).toBeCloseTo(-1, 9);
        expect(pose.position.y).toBeCloseTo(frame.origin.y + layer.y, 9);
        expect(pose.scale).toBe(tile.scale);
      }
    }
  });
});

describe('strataDistance', () => {
  const s = tuning.strata;
  const fovDeg = tuning.camera.fovDeg;
  const halfTan = Math.tan((fovDeg * Math.PI) / 360);

  it('판이 화면 폭에 들어오면 기본 거리다', () => {
    const tiny = [{ radius: 0.01 }];
    expect(strataDistance(tiny, fovDeg, 1)).toBe(s.distance);
  });

  it('좁은 화면에서는 원판 앞 가장자리의 반지름이 화면 반폭 × fitWidth 안에 들 만큼 물러난다', () => {
    const layers = [{ radius: 1 }, { radius: 3 }];
    for (const aspect of [0.45, 0.86, 2]) {
      const d = strataDistance(layers, fovDeg, aspect);
      expect(d).toBeGreaterThanOrEqual(s.distance);
      for (const l of layers) {
        const front = d - l.radius * Math.cos(s.pitch);
        expect(l.radius / (front * halfTan * aspect)).toBeLessThanOrEqual(s.fitWidth + 1e-9);
      }
    }
    expect(strataDistance(layers, fovDeg, 0.45)).toBeGreaterThan(strataDistance(layers, fovDeg, 0.86));
  });
});
