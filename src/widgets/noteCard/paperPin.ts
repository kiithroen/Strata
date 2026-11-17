import type { Quaternion, Vector3 } from 'three';

/**
 * 카드 중심에서 앞면(+Z) 또는 뒷면(-Z)으로 lift(카드 폭 대비)만큼 떨어진 월드 위치.
 * 종이가 휜 높이(paperBend.bendHeight)에서 card.pin.lift 를 빼 넘기면 카드 중심 바로 뒷면에 붙어,
 * 앞면 본문을 가리지 않고 그래프 간선처럼 카드에 이어진다.
 */
export function pinPoint(
  position: Vector3,
  quaternion: Quaternion,
  scale: number,
  width: number,
  lift: number,
  out: Vector3,
): Vector3 {
  return out
    .set(0, 0, lift * width * scale)
    .applyQuaternion(quaternion)
    .add(position);
}
