import { tuning } from '../../config';

/** 카드 텍스처(px)와 월드 크기. 사진 비율에서 정해진다. */
export interface CardLayout {
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
    textureWidth,
    textureHeight,
    padding,
    photo: { x: padding, y: padding, width: photoWidth, height: photoHeight },
    label: { x: padding, y: padding + photoHeight, width: photoWidth, height: labelHeight },
    worldWidth: c.width,
    worldHeight: (c.width * textureHeight) / textureWidth,
  };
}
