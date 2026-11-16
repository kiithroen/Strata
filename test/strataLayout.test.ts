import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { createPose } from '../src/widgets/noteCard/cardMotion';
import {
  layoutStrata,
  nearestLayer,
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

  it('층 안의 창은 서로 겹치지 않고 판 안에 들어간다', () => {
    for (const layer of layoutStrata(layers, 0)) {
      const t = layer.tiles;
      for (let i = 0; i < t.length; i++) {
        expect(Math.abs(t[i].x) + t[i].radius).toBeLessThanOrEqual(layer.halfWidth - s.margin + 1e-9);
        expect(Math.abs(t[i].z) + t[i].radius).toBeLessThanOrEqual(layer.halfDepth - s.margin + 1e-9);
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
});

describe('nearestLayer', () => {
  it('시각이 가장 가까운 층을 고른다', () => {
    const out = layoutStrata(layers, 0);
    out.forEach((l, i) => expect(nearestLayer(out, l.anchorTime + 1000)).toBe(i));
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
