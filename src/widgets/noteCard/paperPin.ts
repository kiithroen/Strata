import type { Quaternion, Vector3 } from 'three';
import type { CardLayout } from './cardLayout';

/**
 * 노드에서 나온 실이 묶이는 자리: 창 제목 줄 왼쪽 고리.
 * u 는 카드 폭 대비 가운데에서 오른쪽으로 벗어난 정도, v 는 카드 높이 대비 가운데에서 위로 올라간 정도다.
 * 텍스처 해상도와 상관없이 레이아웃 비율로 정해진다.
 */
export interface PaperPin {
  u: number;
  v: number;
}

export function paperPin(layout: Pick<CardLayout, 'ring' | 'textureWidth' | 'textureHeight'>): PaperPin {
  return {
    u: layout.ring.x / layout.textureWidth - 0.5,
    v: 0.5 - layout.ring.y / layout.textureHeight,
  };
}

/**
 * 종이(중심 position, 회전 quaternion, 배율 scale, 폭·높이) 위 실 묶는 자리의 월드 위치.
 * lift 는 앞면 위로 뜬 높이(폭 대비)다. 종이가 휜 높이(paperBend.bendHeight)에 card.pin.lift 를 더해 넘기면
 * 고리 바로 위에 붙는다
 */
export function pinPoint(
  position: Vector3,
  quaternion: Quaternion,
  scale: number,
  width: number,
  height: number,
  pin: PaperPin,
  lift: number,
  out: Vector3,
): Vector3 {
  return out
    .set(pin.u * width * scale, pin.v * height * scale, lift * width * scale)
    .applyQuaternion(quaternion)
    .add(position);
}
