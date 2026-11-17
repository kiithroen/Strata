import { Color, type Vector3 } from 'three';
import { tuning } from '../../config';
import type { ScreenLabels } from '../common/screenLabels';
import type { PlacedWord } from './wordCloud';

const accent = new Color();
const bright = new Color();
const color = new Color();

export interface CloudOptions {
  /** 낱말 색(우주 보기의 노드 색). 없으면 강조색이다 */
  tint?: Color;
  /** 가장 많이 쓰인 낱말(첫 낱말)의 겹침 정리 차례. 없으면 다른 낱말처럼 쓰인 정도다 */
  leadPriority?: number;
  /** 앞의 카드에 가리지 않게 위에 그린다(카드 공간) */
  onTop?: boolean;
}

/**
 * 묶음 하나의 워드 클라우드를 anchor 위(cloud.liftPx)에 그린다. 낱말은 강조색이고, 많이 쓰인 낱말일수록 밝은 글자색에 가깝고 또렷하다.
 * tint 를 주면(우주 보기의 노드 색) 그 색 글자이고, 많이 쓰인 낱말일수록 흰색 쪽으로 cloud.tintLift 비율까지만 밝아진다.
 * alpha 는 묶음 전체의 불투명도(0~1)다. key 는 묶음 열쇠로, 낱말마다 겹침 정리 열쇠(묶음 열쇠 + 낱말)를 만든다.
 * 다른 묶음 낱말과 겹치면 많이 쓰인 낱말이 남는다.
 */
export function drawCloud(
  labels: ScreenLabels,
  anchor: Vector3,
  words: readonly PlacedWord[],
  alpha: number,
  cameraPosition: Vector3,
  key: string,
  opts: CloudOptions = {},
): void {
  if (alpha < 0.01 || words.length === 0) return;
  const { tint, leadPriority, onTop } = opts;
  const c = tuning.cloud;
  if (tint) accent.copy(tint);
  else accent.set(tuning.look.accent);
  bright.set(1, 1, 1);
  const lift = tint ? c.tintLift : 1;
  words.forEach((w, i) => {
    color.copy(accent).lerp(bright, w.weight * lift);
    labels.add(anchor, w.text, w.px, c.alpha * alpha * (0.75 + 0.25 * w.weight), cameraPosition, {
      offsetXPx: w.x,
      offsetYPx: w.y + c.liftPx,
      color,
      style: 'title',
      priority: i === 0 && leadPriority !== undefined ? leadPriority : w.weight,
      onTop,
      key: `${key}\u0000${w.text}`,
    });
  });
}
