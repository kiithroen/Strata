import { Color, type Vector3 } from 'three';
import { tuning } from '../../config';
import type { ScreenLabels } from '../common/screenLabels';
import type { PlacedWord } from './wordCloud';

const accent = new Color();
const bright = new Color();
const color = new Color();

/**
 * 묶음 하나의 워드 클라우드를 anchor 위(cloud.liftPx)에 그린다. 낱말은 강조색이고, 많이 쓰인 낱말일수록 밝은 글자색에 가깝고 또렷하다.
 * tint 를 주면(우주 보기의 노드 색) 그 색 글자이고, 많이 쓰인 낱말일수록 흰색 쪽으로 cloud.tintLift 비율까지만 밝아진다.
 * alpha 는 묶음 전체의 불투명도(0~1)다.
 */
export function drawCloud(
  labels: ScreenLabels,
  anchor: Vector3,
  words: readonly PlacedWord[],
  alpha: number,
  cameraPosition: Vector3,
  tint?: Color,
): void {
  if (alpha < 0.01 || words.length === 0) return;
  const c = tuning.cloud;
  if (tint) accent.copy(tint);
  else accent.set(tuning.look.accent);
  bright.set(1, 1, 1);
  const lift = tint ? c.tintLift : 1;
  for (const w of words) {
    color.copy(accent).lerp(bright, w.weight * lift);
    labels.add(anchor, w.text, w.px, c.alpha * alpha * (0.75 + 0.25 * w.weight), cameraPosition, w.x, w.y + c.liftPx, color);
  }
}
