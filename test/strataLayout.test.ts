import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { createPose } from '../src/widgets/noteCard/cardMotion';
import {
  layoutStrata,
  nearestLayer,
  strataDistance,
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

  it('층 안의 창은 서로 겹치지 않고 원판 안에 들어가며, 원판은 가장 바깥 창에 여유만큼 붙는다', () => {
    for (const layer of layoutStrata(layers, 0)) {
      const t = layer.tiles;
      const outer = Math.max(...t.map((x) => Math.hypot(x.x, x.z) + x.radius));
      expect(layer.radius).toBeCloseTo(outer + s.margin, 9);
      for (let i = 0; i < t.length; i++) {
        expect(Math.hypot(t[i].x, t[i].z) + t[i].radius).toBeLessThanOrEqual(layer.radius - s.margin + 1e-9);
        expect(Math.abs(t[i].yaw)).toBeLessThanOrEqual(s.yawJitter);
        for (let j = i + 1; j < t.length; j++) {
          expect(Math.hypot(t[i].x - t[j].x, t[i].z - t[j].z)).toBeGreaterThanOrEqual(t[i].radius + t[j].radius - 1e-9);
        }
      }
    }
  });

  it('모든 노트가 한 번씩 깔리고, 관련도가 높을수록 크고 가운데에 가깝다', () => {
    const out = layoutStrata(layers, 1);
    out.forEach((layer, li) => {
      const inputs = layers[li].tiles;
      expect(layer.tiles.map((t) => t.index).sort((a, b) => a - b)).toEqual(inputs.map((t) => t.index).sort((a, b) => a - b));
      const byIndex = new Map(inputs.map((t) => [t.index, t]));
      for (const tile of layer.tiles) {
        const a = byIndex.get(tile.index)!.affinity;
        expect(tile.scale).toBeCloseTo(s.cardScale[0] + (s.cardScale[1] - s.cardScale[0]) * a, 12);
      }
      const top = layer.tiles[0];
      const maxA = Math.max(...inputs.map((t) => t.affinity));
      expect(byIndex.get(top.index)!.affinity).toBe(maxA);
    });
  });

  it('같은 입력이면 같은 자리다', () => {
    expect(layoutStrata(layers, 2)).toEqual(layoutStrata(layers, 2));
  });

  it('1장은 정중앙에, 2~4장은 같은 반지름 원 위에 대칭으로 놓인다', () => {
    const one = layoutStrata([{ key: '1', label: '1', anchorTime: 0, tiles: tiles(1, 1) }], 0)[0].tiles;
    expect(Math.hypot(one[0].x, one[0].z)).toBe(0);
    for (const n of [2, 3, 4]) {
      const group = layoutStrata([{ key: String(n), label: String(n), anchorTime: 0, tiles: tiles(n, n) }], 0)[0].tiles;
      const radii = group.map((t) => Math.hypot(t.x, t.z));
      for (const r of radii) expect(r).toBeCloseTo(radii[0], 9);
    }
  });
});

describe('nearestLayer', () => {
  it('시각이 가장 가까운 층을 고른다', () => {
    const out = layoutStrata(layers, 0);
    out.forEach((l, i) => expect(nearestLayer(out, l.anchorTime + 1000)).toBe(i));
  });
});

describe('strataPose 원판 회전', () => {
  it('창은 원판에 놓인 채 층 중심 둘레로 함께 돌고, 한 바퀴 돌면 제자리다', () => {
    const layer = layoutStrata(layers, 0)[2];
    const frame = { origin: new Vector3(1, 2, 3), yaw: 0.4 };
    const tile = layer.tiles[layer.tiles.length - 1];
    const rest = strataPose(frame, layer, tile, createPose());
    const center = new Vector3(frame.origin.x, frame.origin.y + layer.y, frame.origin.z);
    for (const spin of [0.3, 1.7, -2.2]) {
      const p = strataPose(frame, layer, tile, createPose(), spin);
      expect(p.position.distanceTo(center)).toBeCloseTo(rest.position.distanceTo(center), 9);
      expect(p.position.y).toBeCloseTo(rest.position.y, 9);
      expect(p.quaternion.angleTo(rest.quaternion)).toBeCloseTo(Math.abs(spin), 6);
      const before = rest.position.clone().sub(center);
      const after = p.position.clone().sub(center);
      const delta = Math.atan2(-after.z, after.x) - Math.atan2(-before.z, before.x);
      expect(Math.atan2(Math.sin(delta), Math.cos(delta))).toBeCloseTo(spin, 6);
    }
    const full = strataPose(frame, layer, tile, createPose(), Math.PI * 2);
    expect(full.position.distanceTo(rest.position)).toBeLessThan(1e-9);
  });
});

describe('strataPose', () => {
  it('앞면이 위를 보고 창의 위쪽이 보는 쪽 반대를 향한다', () => {
    const out = layoutStrata(layers, 0);
    const layer = out[2];
    for (const yaw of [0, 0.7, -2.1]) {
      const frame = { origin: new Vector3(1, 2, 3), yaw };
      for (const tile of layer.tiles) {
        const pose = strataPose(frame, layer, { ...tile, yaw: 0 }, createPose());
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
