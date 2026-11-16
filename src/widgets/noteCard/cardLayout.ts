import { tuning } from '../../config';

export type NoteKind = 'photo' | 'memo' | 'doc';

/** 카드 텍스처(px)와 월드 크기. 노트 종류에 따라 폴라로이드·포스트잇·A4 비율로 정해진다. */
export interface CardLayout {
  kind: NoteKind;
  textureWidth: number;
  textureHeight: number;
  padding: number;
  photo: { x: number; y: number; width: number; height: number };
  label: { x: number; y: number; width: number; height: number };
  worldWidth: number;
  worldHeight: number;
}

/** textureWidth 를 바꿔도 월드 크기와 비율은 같다. 텍스처 해상도만 달라진다. */
export function cardLayout(imageWidth: number, imageHeight: number, textureWidth: number = tuning.card.textureWidth): CardLayout {
  const c = tuning.card;
  const padding = Math.round(textureWidth * c.paddingRatio);
  const photoWidth = textureWidth - padding * 2;
  const photoHeight = Math.round((photoWidth * imageHeight) / imageWidth);
  const labelHeight = Math.round(photoWidth * c.labelRatio);
  const textureHeight = padding + photoHeight + labelHeight;
  return {
    kind: 'photo',
    textureWidth,
    textureHeight,
    padding,
    photo: { x: padding, y: padding, width: photoWidth, height: photoHeight },
    label: { x: padding, y: padding + photoHeight, width: photoWidth, height: labelHeight },
    worldWidth: c.width,
    worldHeight: (c.width * textureHeight) / textureWidth,
  };
}

/** 노트 종류(폴라로이드 사진 · 정사각 포스트잇 · A4 문서)에 맞춘 레이아웃을 계산한다. */
export function faceLayout(
  kind: NoteKind,
  photo?: { width: number; height: number },
  textureWidth: number = tuning.card.textureWidth,
): CardLayout {
  if (kind === 'photo') {
    const w = photo?.width ?? 4;
    const h = photo?.height ?? 3;
    return cardLayout(w, h, textureWidth);
  }
  const c = tuning.card;
  if (kind === 'memo') {
    const padding = Math.round(textureWidth * c.memo.paddingRatio);
    const textureHeight = textureWidth;
    const worldWidth = c.width * c.memo.widthScale;
    const bodyWidth = textureWidth - padding * 2;
    const stripHeight = Math.round(textureHeight * c.memo.stripRatio);
    const labelHeight = Math.round(textureHeight * c.memo.labelRatio);
    return {
      kind,
      textureWidth,
      textureHeight,
      padding,
      photo: { x: padding, y: stripHeight + padding * 0.4, width: bodyWidth, height: textureHeight - stripHeight - labelHeight - padding },
      label: { x: padding, y: textureHeight - labelHeight - padding * 0.3, width: bodyWidth, height: labelHeight },
      worldWidth,
      worldHeight: worldWidth,
    };
  }
  const padding = Math.round(textureWidth * c.doc.paddingRatio);
  const textureHeight = Math.round(textureWidth * Math.SQRT2);
  const worldWidth = c.width * c.doc.widthScale;
  const bodyWidth = textureWidth - padding * 2;
  const headerHeight = Math.round(textureHeight * c.doc.headerRatio);
  return {
    kind,
    textureWidth,
    textureHeight,
    padding,
    photo: { x: padding, y: padding + headerHeight, width: bodyWidth, height: textureHeight - padding * 2 - headerHeight },
    label: { x: padding, y: padding, width: bodyWidth, height: headerHeight },
    worldWidth,
    worldHeight: (worldWidth * textureHeight) / textureWidth,
  };
}
