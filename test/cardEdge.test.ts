import { Euler, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { cardEdgePoint } from '../src/widgets/noteCard/cardEdge';

/** 카메라에서 본 화면 방향(시선에 수직인 두 성분)으로 바꾼다. eye 는 +Z 쪽에서 −Z 를 본다 */
const screen = (p: Vector3, eye: Vector3) => {
  const d = p.clone().sub(eye);
  return { x: d.x / -d.z, y: d.y / -d.z };
};

describe('cardEdgePoint', () => {
  const eye = new Vector3(0, 0, 10);
  const center = new Vector3(0, 0, 0);
  const facing = new Quaternion();
  const out = new Vector3();

  it('카메라를 바라보는 카드: 바깥 노드에서 오는 선은 카드 테두리에서 멈춘다', () => {
    cardEdgePoint(new Vector3(5, 0, 0), eye, center, facing, 1, 0.5, out);
    expect(out.distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-9);
    cardEdgePoint(new Vector3(4, 4, 0), eye, center, facing, 1, 0.5, out);
    // 대각선은 반높이가 먼저 닿는다
    expect(out.distanceTo(new Vector3(0.5, 0.5, 0))).toBeLessThan(1e-9);
  });

  it('노드가 카드 뒤에 있어도 화면에서 노드와 카드 중심을 잇는 선 위의 테두리 자리다', () => {
    const from = new Vector3(3, 1, -6);
    cardEdgePoint(from, eye, center, facing, 1, 0.5, out);
    const a = screen(from, eye);
    const b = screen(out, eye);
    // 중심(화면 0,0)과 노드, 끝점이 한 직선 위이고 끝점은 테두리 위다
    expect(a.x * b.y - a.y * b.x).toBeCloseTo(0, 9);
    expect(Math.max(Math.abs(out.x) / 1, Math.abs(out.y) / 0.5)).toBeCloseTo(1, 9);
    expect(out.z).toBeCloseTo(0, 9);
  });

  it('노드가 화면에서 카드 안에 보이면 그 자리를 내어 선이 카드 위에 그려지지 않는다', () => {
    cardEdgePoint(new Vector3(0.2, 0.1, -5), eye, center, facing, 1, 0.5, out);
    const b = screen(out, eye);
    const a = screen(new Vector3(0.2, 0.1, -5), eye);
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(b.y).toBeCloseTo(a.y, 9);
  });

  it('카드가 돌아 있어도 끝점은 카드 면 위 테두리에 있다', () => {
    const q = new Quaternion().setFromEuler(new Euler(0.4, -0.6, 0.3));
    const pos = new Vector3(1, -1, 2);
    cardEdgePoint(new Vector3(6, 3, 1), eye, pos, q, 0.8, 0.6, out);
    const local = out.clone().sub(pos).applyQuaternion(q.clone().invert());
    expect(local.z).toBeCloseTo(0, 9);
    expect(Math.max(Math.abs(local.x) / 0.8, Math.abs(local.y) / 0.6)).toBeCloseTo(1, 9);
  });

  it('시선이 카드 면과 나란하면 중심을 낸다', () => {
    const edgeOn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    cardEdgePoint(new Vector3(0, 0, 5), eye, center, edgeOn, 1, 0.5, out);
    expect(out.distanceTo(center)).toBeLessThan(1e-9);
  });
});
