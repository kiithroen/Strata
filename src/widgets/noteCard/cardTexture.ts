import { CanvasTexture, Color, SRGBColorSpace } from 'three';
import { tuning } from '../../config';
import { formatStamp } from '../../core/format';
import { createRng } from '../../core/random';
import { cornerRadius, memoMetrics, MEMO_TITLE_LINES, type CardLayout, type NoteKind, type Rect } from './cardLayout';
import { wrapLines } from './textWrap';

/**
 * 사진 원본. 필요한 해상도로 그때그때 그려 받는다. 텍스처를 만든 뒤에는 결과를 들고 있지 않는다.
 * 디코딩해야 하는 원본은 Promise 로 주고, urgent 면 기다리는 디코딩보다 먼저 한다. 받은 ImageBitmap 은 쓴 쪽이 닫는다.
 */
export interface PhotoSource {
  width: number;
  height: number;
  render(targetWidth: number, urgent?: boolean): CanvasImageSource | Promise<CanvasImageSource>;
}

/** 다 쓴 사진 그림을 놓는다. ImageBitmap 이면 닫아 메모리를 바로 돌려준다 */
export function releasePhoto(image: CanvasImageSource): void {
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
}

export interface CardFace {
  id: string;
  createdAt: Date;
  kind?: NoteKind;
  photo?: PhotoSource;
  title?: string;
  body?: string;
  /** 메모 색 번호(card.holo.memoColors). 없으면 노트 번호로 고른다 */
  tint?: number;
}

const MONO = 'ui-monospace, "Cascadia Mono", "Malgun Gothic", Consolas, "D2Coding", monospace';
const SANS = 'system-ui, "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

/** 카드의 홀로그램 선 색. 사진·문서는 종류 색, 메모는 포스트잇 색 가운데 하나다 */
export function holoTint(face: Pick<CardFace, 'id' | 'kind' | 'tint'>): string {
  const h = tuning.card.holo;
  const kind: NoteKind = face.kind ?? 'photo';
  if (kind !== 'memo') return h.kinds[kind];
  const n = h.memoColors.length;
  const i = face.tint ?? idHash(face.id);
  return h.memoColors[((i % n) + n) % n];
}

/** 선 색에서 낸 칠 색들 */
interface Palette {
  line: string;
  dim: string;
  faint: string;
  band: string;
  wash: string;
  rule: string;
}

function palette(face: CardFace): Palette {
  const h = tuning.card.holo;
  const c = new Color(holoTint(face));
  const rgba = (a: number) => `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a})`;
  return { line: rgba(1), dim: rgba(h.dimAlpha), faint: rgba(h.faintAlpha), band: rgba(h.bandAlpha), wash: rgba(h.washAlpha), rule: rgba(h.ruleAlpha) };
}

function idHash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function newCanvas(layout: CardLayout): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = layout.textureWidth;
  canvas.height = layout.textureHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D 캔버스를 만들 수 없다');
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement, anisotropy: number): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** 선과 글자에 빛 번짐을 켜고 끈다. 사진과 바탕에는 쓰지 않는다. unit 은 레이아웃 기준 폭이다 */
function glow(ctx: CanvasRenderingContext2D, color: string | null, unit: number): void {
  if (color === null) {
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    return;
  }
  ctx.shadowColor = color;
  ctx.shadowBlur = unit * tuning.card.holo.glowRatio;
}

/** 세 종류 모두 같은 둥근 사각형 겉모양이다. 바탕 칠·테두리·클립이 모두 이 길을 쓴다 */
function outline(ctx: CanvasRenderingContext2D, layout: CardLayout, inset: number): void {
  ctx.beginPath();
  ctx.roundRect(inset, inset, layout.textureWidth - inset * 2, layout.textureHeight - inset * 2, Math.max(0, cornerRadius(layout) - inset));
}

/** 사진 칸처럼 안쪽 사각형을 둥글게 자르는 길 */
function innerRect(ctx: CanvasRenderingContext2D, r: Rect, unit: number): void {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.width, r.height, Math.min(unit * tuning.card.window.innerCornerRatio, r.width / 2, r.height / 2));
}

/**
 * 가까이서 보는 홀로그램 카드. 반투명 남색 둥근 사각형에 종류별 색의 가는 테두리와 글자를 그린다. 장식 없이 이름표·내용·시각만 둔다.
 * 흑백으로 바꾸는 건 거리에 따라 셰이더가 한다. photo 는 사진 칸에 그릴 그림이고, 아직 없으면 빈 칸으로 그린다.
 */
export function createCardTexture(face: CardFace, layout: CardLayout, anisotropy: number, photo: CanvasImageSource | null = null): CanvasTexture {
  const { canvas, ctx } = newCanvas(layout);
  drawCard(ctx, face, layout, photo);
  return toTexture(canvas, anisotropy);
}

/** 사진이 늦게 오면 같은 캔버스에 다시 그리고 올린다 */
export function redrawCardTexture(texture: CanvasTexture, face: CardFace, layout: CardLayout, photo: CanvasImageSource | null): void {
  drawCard(canvasContext(texture), face, layout, photo);
  texture.needsUpdate = true;
}

function drawCard(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout, photo: CanvasImageSource | null): void {
  const p = palette(face);
  drawBody(ctx, layout, p, false);
  if (layout.kind === 'memo') drawMemo(ctx, face, layout, p);
  else if (layout.kind === 'doc') drawDoc(ctx, face, layout, p);
  else drawPhoto(ctx, face, layout, p, photo);
  drawFooter(ctx, face, layout, p);
}

function canvasContext(texture: CanvasTexture): CanvasRenderingContext2D {
  const ctx = (texture.image as HTMLCanvasElement).getContext('2d');
  if (!ctx) throw new Error('2D 캔버스를 만들 수 없다');
  return ctx;
}

/**
 * 멀리서 보는 단순한 카드. 글자 없이 같은 겉모양에 사진은 굵은 모자이크, 메모는 굵은 막대 몇 줄, 문서는 가는 막대 여러 줄로만 그린다.
 * layout 은 card.simpleTextureWidth 로 계산한 것을 넘긴다. photo 는 아무 해상도든 되고 모자이크로 줄여 그린다.
 */
export function createSimpleTexture(face: CardFace, layout: CardLayout, anisotropy: number, photo: CanvasImageSource | null = null): CanvasTexture {
  const { canvas, ctx } = newCanvas(layout);
  drawSimple(ctx, face, layout, photo);
  return toTexture(canvas, anisotropy);
}

export function redrawSimpleTexture(texture: CanvasTexture, face: CardFace, layout: CardLayout, photo: CanvasImageSource | null): void {
  drawSimple(canvasContext(texture), face, layout, photo);
  texture.needsUpdate = true;
}

function drawSimple(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout, photo: CanvasImageSource | null): void {
  const p = palette(face);
  const s = tuning.card.simple;
  const w = layout.unit;
  const { content, footer } = layout;
  drawBody(ctx, layout, p, true);

  const barH = Math.max(1, Math.round(w * s.barRatio));
  const gap = Math.max(barH + 1, Math.round(w * s.barGapRatio));
  const rng = createRng(idHash(face.id));
  const bar = (x: number, y: number, width: number, height: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, height / 2);
    ctx.fill();
  };
  if (layout.kind === 'photo') {
    ctx.save();
    innerRect(ctx, content, w);
    ctx.clip();
    if (photo) {
      ctx.imageSmoothingEnabled = false;
      drawCover(ctx, mosaic(photo, s.photoBlocks), content);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle = p.band;
      ctx.fillRect(content.x, content.y, content.width, content.height);
    }
    ctx.restore();
  } else {
    // 메모는 굵은 글 막대 몇 줄, 문서는 가는 글 막대 여러 줄
    const memo = layout.kind === 'memo';
    const h = memo ? barH * 1.6 : barH;
    let y = content.y + gap * 0.25;
    for (let i = 0; y + h <= content.y + content.height && (!memo || i < 4); i++) {
      bar(content.x, y, content.width * (i === 0 ? 0.7 : 0.4 + rng() * 0.55), h, i === 0 ? p.line : p.dim);
      y += memo ? gap * 1.5 : gap;
    }
  }
  bar(footer.x, footer.y + (footer.height - barH) / 2, footer.width * 0.4, barH, p.faint);
}

/** 폭 blocks 칸으로 줄인 그림. 키워 그릴 때 부드럽게 하지 않으면 굵은 모자이크가 된다 */
function mosaic(image: CanvasImageSource, blocks: number): HTMLCanvasElement {
  const iw = (image as { width: number }).width;
  const ih = (image as { height: number }).height;
  const canvas = document.createElement('canvas');
  canvas.width = blocks;
  canvas.height = Math.max(1, Math.round((blocks * ih) / iw));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D 캔버스를 만들 수 없다');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** 겉모양 바탕과 테두리, 실을 묶는 자리의 종류 아이콘. 메모는 메모 색 바탕과 접힌 귀퉁이도 그린다 */
function drawBody(ctx: CanvasRenderingContext2D, layout: CardLayout, p: Palette, simple: boolean): void {
  const h = tuning.card.holo;
  const u = layout.unit;
  const line = simple ? Math.max(1, u * tuning.card.window.simpleLineRatio) : layout.line;
  const { ring } = layout;

  ctx.clearRect(0, 0, layout.textureWidth, layout.textureHeight);
  outline(ctx, layout, line / 2);
  ctx.fillStyle = h.fill;
  ctx.fill();

  glow(ctx, simple ? null : p.line, u);
  ctx.strokeStyle = p.dim;
  ctx.lineWidth = line;
  outline(ctx, layout, line / 2);
  ctx.stroke();

  if (layout.kind === 'memo') {
    // 메모: 메모 색을 옅게 깔고 오른쪽 아래 귀퉁이를 접는다
    ctx.save();
    outline(ctx, layout, line / 2);
    ctx.clip();
    ctx.fillStyle = p.wash;
    ctx.fillRect(0, 0, layout.textureWidth, layout.textureHeight);
    ctx.restore();
    drawFold(ctx, layout, p, line);
  }

  // 실을 묶는 자리에 종류 아이콘(멀리서는 점)
  ctx.fillStyle = p.line;
  ctx.strokeStyle = p.line;
  if (simple) {
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else drawKindIcon(ctx, layout, line);
  glow(ctx, null, u);
}

/** 종류 아이콘: 사진은 조리개, 메모는 접착 메모지, 문서는 귀퉁이 접힌 페이지. 실을 묶는 자리(ring)가 가운데다 */
function drawKindIcon(ctx: CanvasRenderingContext2D, layout: CardLayout, line: number): void {
  const { ring } = layout;
  const r = ring.size / 2;
  const { x, y } = ring;
  ctx.lineWidth = line * 1.4;
  ctx.beginPath();
  if (layout.kind === 'photo') {
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
  } else if (layout.kind === 'memo') {
    ctx.roundRect(x - r, y - r, r * 2, r * 2, r * 0.35);
    ctx.fill();
  } else {
    const w = r * 1.5;
    const f = r * 0.7;
    ctx.moveTo(x - w / 2, y - r);
    ctx.lineTo(x + w / 2 - f, y - r);
    ctx.lineTo(x + w / 2, y - r + f);
    ctx.lineTo(x + w / 2, y + r);
    ctx.lineTo(x - w / 2, y + r);
    ctx.closePath();
    ctx.stroke();
  }
}

/** 메모 오른쪽 아래의 접힌 귀퉁이: 둥근 모서리 안쪽에 접혀 올라온 삼각형 */
function drawFold(ctx: CanvasRenderingContext2D, layout: CardLayout, p: Palette, line: number): void {
  const f = layout.unit * tuning.card.window.foldRatio;
  const inset = cornerRadius(layout) * 0.3 + line;
  const right = layout.textureWidth - inset;
  const bottom = layout.textureHeight - inset;
  ctx.beginPath();
  ctx.moveTo(right, bottom - f);
  ctx.lineTo(right - f, bottom);
  ctx.lineTo(right - f, bottom - f);
  ctx.closePath();
  ctx.fillStyle = p.band;
  ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = p.dim;
  ctx.stroke();
}

/** 제목 줄의 작은 이름표(종류·파일 이름). right 는 넘지 말아야 할 오른쪽 끝(px) */
function drawLabel(ctx: CanvasRenderingContext2D, layout: CardLayout, p: Palette, text: string, right: number): void {
  const { titleBar, ring, padding } = layout;
  const size = Math.max(8, Math.round(titleBar.height * 0.42));
  ctx.font = `500 ${size}px ${MONO}`;
  ctx.fillStyle = p.dim;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const x = ring.x + ring.size / 2 + padding * 0.6;
  ctx.fillText(truncateText(ctx, text, right - x), x, titleBar.height / 2 + size * 0.05);
}

/** 사진: 둥글게 자른 사진과 제목 줄의 파일 이름 */
function drawPhoto(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout, p: Palette, photo: CanvasImageSource | null): void {
  const { content, titleBar, padding } = layout;
  ctx.save();
  innerRect(ctx, content, layout.unit);
  ctx.clip();
  if (photo) drawCover(ctx, photo, content);
  else {
    ctx.fillStyle = p.band;
    ctx.fillRect(content.x, content.y, content.width, content.height);
  }
  ctx.restore();
  drawLabel(ctx, layout, p, face.title ?? `IMG_${face.id}`, titleBar.width - padding);
}

/** 메모: 굵은 제목과 큼직한 본문. 크기는 레이아웃이 글 양에 맞춰 정했다 */
function drawMemo(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout, p: Palette): void {
  const { content } = layout;
  const u = layout.unit;
  drawLabel(ctx, layout, p, 'MEMO', layout.textureWidth - layout.padding);
  const m = memoMetrics(u);
  let y = content.y + layout.padding * 0.3;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  glow(ctx, p.line, u);
  if (face.title) {
    ctx.font = `700 ${m.titleSize}px ${SANS}`;
    ctx.fillStyle = p.line;
    for (const l of wrapLines(ctx, face.title, content.width, MEMO_TITLE_LINES)) {
      ctx.fillText(l, content.x, y);
      y += m.titleLineH;
    }
    y += m.titleGap;
  }
  if (face.body) {
    ctx.font = `${m.bodySize}px ${SANS}`;
    ctx.fillStyle = p.line;
    const maxLines = Math.max(1, Math.floor((content.y + content.height - y) / m.bodyLineH));
    for (const l of wrapLines(ctx, face.body, content.width, maxLines)) {
      ctx.fillText(l, content.x, y);
      y += m.bodyLineH;
    }
  }
  glow(ctx, null, u);
}

/** 문서: 굵은 제목과 공책 괘선 위의 촘촘한 문단 */
function drawDoc(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout, p: Palette): void {
  const { content, padding } = layout;
  const w = layout.unit;
  drawLabel(ctx, layout, p, `TXT_${face.id}`, layout.textureWidth - padding);
  const titleSize = Math.max(9, Math.round(w * 0.056));
  const bodySize = Math.max(8, Math.round(w * 0.042));
  const lineH = bodySize * 1.55;

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  let y = content.y + padding * 0.3;
  glow(ctx, p.line, w);
  ctx.font = `700 ${titleSize}px ${SANS}`;
  ctx.fillStyle = p.line;
  ctx.fillText(truncateText(ctx, face.title ?? `DOC ${face.id}`, content.width), content.x, y);
  y += titleSize * 1.7;
  glow(ctx, null, w);

  // 공책처럼 본문 줄마다 아주 옅은 괘선을 긋는다(글자 밑줄 자리)
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = layout.line;
  ctx.beginPath();
  for (let ry = y + lineH - bodySize * 0.2; ry < content.y + content.height; ry += lineH) {
    ctx.moveTo(content.x, Math.round(ry) + 0.5);
    ctx.lineTo(content.x + content.width, Math.round(ry) + 0.5);
  }
  ctx.stroke();

  glow(ctx, p.line, w);
  ctx.fillStyle = p.line;
  if (face.body) {
    ctx.font = `${bodySize}px ${SANS}`;
    const maxLines = Math.max(1, Math.floor((content.y + content.height - y) / lineH));
    for (const l of wrapLines(ctx, face.body, content.width, maxLines)) {
      ctx.fillText(l, content.x, y);
      y += lineH;
    }
  }
  glow(ctx, null, w);
}

/** 상태 줄: 찍은 시각 */
function drawFooter(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout, p: Palette): void {
  const { footer } = layout;
  const size = Math.max(8, Math.round(footer.height * 0.46));
  ctx.font = `${size}px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = p.dim;
  ctx.fillText(formatStamp(face.createdAt), footer.x, footer.y + footer.height / 2);
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end--;
  return `${text.slice(0, end)}…`;
}

/** CSS object-fit: cover 처럼 비율을 지키며 칸을 채운다. */
function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, r: Rect): void {
  const iw = (image as { width: number }).width;
  const ih = (image as { height: number }).height;
  const scale = Math.max(r.width / iw, r.height / ih);
  const sw = r.width / scale;
  const sh = r.height / scale;
  ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, r.x, r.y, r.width, r.height);
}
