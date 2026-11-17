import { Quaternion, Vector3 } from 'three';

const normal = new Vector3();
const ray = new Vector3();
const local = new Vector3();
const inCard = new Vector3();
const inverse = new Quaternion();

/**
 * 노드(from)에서 카드 중심으로 긋는 선이 화면에서 카드 테두리에 닿는 자리(월드).
 * 카메라(eye)에서 from 을 지나는 시선이 카드 면과 만나는 점 P 를 구하고, 카드 면 위에서 중심 → P 방향이 사각형(반폭 halfW, 반높이 halfH)
 * 테두리를 지나는 곳을 낸다. 그 점은 화면에서 from 과 카드 중심을 잇는 선 위에 있어, 선을 거기까지만 그으면 카드 바깥에서 멈춘다.
 * P 가 카드 안이면(노드가 카드 뒤에 가려 보이면) P 를 내어 선이 카드 위에 그려지지 않는다. 시선이 카드 면과 나란하거나 카드가 시선 뒤면 중심을 낸다.
 */
export function cardEdgePoint(
  from: Vector3,
  eye: Vector3,
  position: Vector3,
  quaternion: Quaternion,
  halfW: number,
  halfH: number,
  out: Vector3,
): Vector3 {
  normal.set(0, 0, 1).applyQuaternion(quaternion);
  ray.copy(from).sub(eye);
  const denom = normal.dot(ray);
  if (Math.abs(denom) < 1e-9) return out.copy(position);
  const t = normal.dot(local.copy(position).sub(eye)) / denom;
  if (t <= 0) return out.copy(position);
  // P − 중심을 카드 좌표로
  local.copy(eye).addScaledVector(ray, t).sub(position);
  inverse.copy(quaternion).invert();
  inCard.copy(local).applyQuaternion(inverse);
  const s = Math.max(Math.abs(inCard.x) / halfW, Math.abs(inCard.y) / halfH);
  return s <= 1 ? out.copy(position).add(local) : out.copy(position).addScaledVector(local, 1 / s);
}
