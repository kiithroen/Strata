import { tuning } from '../../config';

export type NoteKind = 'photo' | 'memo' | 'doc';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 창 모양 카드의 텍스처(px)와 월드 크기. 위에서부터 제목 줄, 내용 칸, 아래 상태 줄이다.
 * 사진은 사진 비율을 지키고, 짧은 노트(메모)는 정사각, 긴 문서는 1:√2 세로 비율이다.
 */
export interface CardLayout {
  kind: NoteKind;
  textureWidth: number;
  textureHeight: number;
  padding: number;
  /** 테두리 선 굵기(px) */
  line: number;
  titleBar: Rect;
  /** 제목 줄 왼쪽 고리. 노드에서 나온 실이 여기에 묶인다 */
  ring: { x: number; y: number; size: number };
  content: Rect;
  footer: Rect;
  worldWidth: number;
  worldHeight: number;
}

/** textureWidth 를 바꿔도 월드 크기와 비율은 같다. 텍스처 해상도만 달라진다. */
export function faceLayout(
  kind: NoteKind,
  photo?: { width: number; height: number },
  textureWidth: number = tuning.card.textureWidth,
): CardLayout {
  const c = tuning.card;
  const win = c.window;
  const w = textureWidth;
  const padding = Math.round(w * win.paddingRatio);
  const line = Math.max(1, w * win.lineRatio);
  const titleH = Math.round(w * win.titleRatio);
  const footerH = Math.round(w * win.footerRatio);
  const innerW = w - padding * 2;

  let textureHeight: number;
  let worldWidth: number;
  if (kind === 'photo') {
    const iw = photo?.width ?? 4;
    const ih = photo?.height ?? 3;
    const photoH = Math.round((innerW * ih) / iw);
    textureHeight = titleH + padding + photoH + footerH;
    worldWidth = c.width;
  } else if (kind === 'memo') {
    textureHeight = w;
    worldWidth = c.width * c.memo.widthScale;
  } else {
    textureHeight = Math.round(w * Math.SQRT2);
    worldWidth = c.width * c.doc.widthScale;
  }

  const contentY = titleH + padding;
  const ringSize = Math.round(titleH * 0.42);
  return {
    kind,
    textureWidth: w,
    textureHeight,
    padding,
    line,
    titleBar: { x: 0, y: 0, width: w, height: titleH },
    ring: { x: padding + ringSize / 2, y: titleH / 2, size: ringSize },
    content: { x: padding, y: contentY, width: innerW, height: textureHeight - contentY - footerH },
    footer: { x: padding, y: textureHeight - footerH, width: innerW, height: footerH },
    worldWidth,
    worldHeight: (worldWidth * textureHeight) / w,
  };
}

/** 사진 카드 레이아웃 */
export function cardLayout(imageWidth: number, imageHeight: number, textureWidth: number = tuning.card.textureWidth): CardLayout {
  return faceLayout('photo', { width: imageWidth, height: imageHeight }, textureWidth);
}
