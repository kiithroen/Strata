import { tuning } from '../../config';

/** 카드 텍스처(px)와 월드 크기. 사진 비율에서 정해진다. */
export interface CardLayout {
  textureWidth: number;
  textureHeight: number;
  padding: number;
  photo: { x: number; y: number; width: number; height: number };
  label: { x: number; y: number; width: number; height: number };
  bracket: number;
  worldWidth: number;
  worldHeight: number;
}

export function cardLayout(imageWidth: number, imageHeight: number): CardLayout {
  const c = tuning.card;
  const textureWidth = c.textureWidth;
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
    bracket: Math.round(textureWidth * c.bracketRatio),
    worldWidth: c.width,
    worldHeight: (c.width * textureHeight) / textureWidth,
  };
}
