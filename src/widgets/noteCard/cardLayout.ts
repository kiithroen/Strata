import { tuning } from '../../config';
import { qualityDefaults } from '../../core/quality';
import { estimatedMeasure, estimateTextWidth, wrapLines } from './textWrap';

export type NoteKind = 'photo' | 'memo' | 'doc';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 레이아웃이 보는 노트 내용 */
export interface LayoutFace {
  kind?: NoteKind;
  photo?: { width: number; height: number };
  title?: string;
  body?: string;
}

/**
 * 홀로그램 카드의 텍스처(px)와 월드 크기. 위에서부터 제목 줄, 내용 칸, 상태 줄이다.
 * 사진은 사진 비율을 지키고, 메모는 글 양에 맞춘 크기, 긴 문서는 1:√2 세로 비율이다.
 * unit 은 텍스처 기준 폭(px)이다. 틀·글자 크기는 이것에 비례해 카드 크기가 달라도 같은 월드 크기로 보인다.
 */
export interface CardLayout {
  kind: NoteKind;
  unit: number;
  textureWidth: number;
  textureHeight: number;
  padding: number;
  /** 테두리 선 굵기(px) */
  line: number;
  titleBar: Rect;
  /** 제목 줄 왼쪽 종류 아이콘 자리 */
  ring: { x: number; y: number; size: number };
  content: Rect;
  footer: Rect;
  worldWidth: number;
  worldHeight: number;
}

/**
 * 카드 겉모양(둥근 사각형)의 모서리 반지름(텍스처 px). 텍스처의 바탕·테두리·클립과 셰이더의 테두리 빛(cornerUv)이 함께 쓴다
 */
export function cornerRadius(layout: CardLayout): number {
  return Math.min(layout.unit * tuning.card.window.cornerRatio, layout.textureWidth / 2, layout.textureHeight / 2);
}

/** 모서리 반지름을 카드 높이 단위(uv 세로)로 바꾼다. 셰이더가 테두리를 따라 빛을 그릴 때 쓴다 */
export function cornerUv(layout: CardLayout): number {
  return cornerRadius(layout) / layout.textureHeight;
}

/** 메모 글자 크기와 줄 간격(px). 레이아웃과 그리기가 함께 쓴다 */
export function memoMetrics(unit: number): { titleSize: number; bodySize: number; titleLineH: number; bodyLineH: number; titleGap: number } {
  const m = tuning.card.memo;
  const titleSize = Math.max(10, Math.round(unit * m.titleRatio));
  const bodySize = Math.max(9, Math.round(unit * m.bodyRatio));
  return { titleSize, bodySize, titleLineH: titleSize * 1.3, bodyLineH: bodySize * m.lineHeight, titleGap: bodySize * 0.4 };
}

/** 메모 제목은 두 줄까지 */
export const MEMO_TITLE_LINES = 2;

/** 메모의 폭 배율(기준 폭 대비)과 높이/폭 비율. 품질 설정으로 바뀐 텍스처 폭과 무관하게 기본 해상도에서 정한다 */
function memoFit(face: LayoutFace): { scale: number; aspect: number } {
  const c = tuning.card;
  const m = c.memo;
  const u = qualityDefaults.tex;
  const padding = Math.round(u * c.window.paddingRatio);
  const titleH = Math.round(u * c.window.titleRatio);
  const footerH = Math.round(u * c.window.footerRatio);
  const text = `${face.title ?? ''}${face.body ?? ''}`;
  const t = Math.min(1, estimateTextWidth(text) / m.fullText);
  const scale = m.widthScales[0] + (m.widthScales[1] - m.widthScales[0]) * t;
  const w = Math.round(u * scale);
  const innerW = w - padding * 2;
  const mm = memoMetrics(u);
  let need = padding * 0.3;
  if (face.title) {
    need += wrapLines(estimatedMeasure(mm.titleSize), face.title, innerW, MEMO_TITLE_LINES).length * mm.titleLineH + mm.titleGap;
  }
  if (face.body) need += wrapLines(estimatedMeasure(mm.bodySize), face.body, innerW, 1000).length * mm.bodyLineH;
  need += padding;
  const raw = titleH + padding + need + footerH;
  const h = Math.min(w * m.aspect[1], Math.max(w * m.aspect[0], raw));
  return { scale: w / u, aspect: h / w };
}

/** baseWidth 를 바꿔도 월드 크기와 칸 비율은 같다. 텍스처 해상도만 달라진다. */
export function faceLayout(face: LayoutFace, baseWidth: number = tuning.card.textureWidth): CardLayout {
  const c = tuning.card;
  const win = c.window;
  const kind = face.kind ?? 'photo';
  const u = baseWidth;
  const padding = Math.round(u * win.paddingRatio);
  const line = Math.max(1, u * win.lineRatio);
  const titleH = Math.round(u * win.titleRatio);
  const footerH = Math.round(u * win.footerRatio);
  const contentY = titleH + padding;

  let w = u;
  let textureHeight: number;
  let worldWidth: number;
  if (kind === 'photo') {
    const iw = face.photo?.width ?? 4;
    const ih = face.photo?.height ?? 3;
    textureHeight = contentY + Math.round(((u - padding * 2) * ih) / iw) + footerH;
    worldWidth = c.width;
  } else if (kind === 'memo') {
    // 글이 길수록 넓고, 줄 수에 맞춰 높이를 정한다. 비율은 기준 해상도에서 한 번 정해 어느 해상도의 텍스처든 같은 모양이다
    const fit = memoFit(face);
    w = Math.round(u * fit.scale);
    worldWidth = c.width * fit.scale;
    textureHeight = Math.round(w * fit.aspect);
  } else {
    textureHeight = Math.round(u * Math.SQRT2);
    worldWidth = c.width * c.doc.widthScale;
  }

  const ringSize = Math.round(titleH * 0.42);
  return {
    kind,
    unit: u,
    textureWidth: w,
    textureHeight,
    padding,
    line,
    titleBar: { x: 0, y: 0, width: w, height: titleH },
    ring: { x: padding + ringSize / 2, y: titleH / 2, size: ringSize },
    content: { x: padding, y: contentY, width: w - padding * 2, height: textureHeight - contentY - footerH },
    footer: { x: padding, y: textureHeight - footerH, width: w - padding * 2, height: footerH },
    worldWidth,
    worldHeight: (worldWidth * textureHeight) / w,
  };
}

/** 사진 카드 레이아웃 */
export function cardLayout(imageWidth: number, imageHeight: number, baseWidth: number = tuning.card.textureWidth): CardLayout {
  return faceLayout({ kind: 'photo', photo: { width: imageWidth, height: imageHeight } }, baseWidth);
}
