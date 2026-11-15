import type { Quaternion, Vector3 } from 'three';
import { tuning } from '../../config';

/**
 * 종이에 꽂힌 압정 자리. 수사 보드처럼 노드에서 나온 실이 이 압정에 묶인다.
 * u 는 종이 폭 대비 가운데에서 좌우로 벗어난 정도, v 는 종이 높이 대비 가운데에서 위로 올라간 정도다.
 * 테이프도 같은 자리(u)에 붙고, tilt 만큼 기운다. 노트 번호로 정해져 같은 노트는 늘 같은 자리다.
 */
export interface PaperPin {
  u: number;
  v: number;
  tilt: number;
}

function hash01(id: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function paperPin(id: string): PaperPin {
  const p = tuning.card.pin;
  return {
    u: (hash01(id, 1) * 2 - 1) * p.jitter,
    v: 0.5 - p.inset,
    tilt: (hash01(id, 2) * 2 - 1) * tuning.card.tape.tilt,
  };
}

/**
 * 종이(중심 position, 회전 quaternion, 배율 scale, 폭·높이) 위 압정의 월드 위치.
 * lift 는 앞면 위로 뜬 높이(폭 대비)다. 종이가 휜 높이(paperBend.bendHeight)에 card.pin.lift 를 더해 넘기면
 * 압정이 앞면 바로 위에 붙어, 뒤에서 볼 때는 종이에 가려진다
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
