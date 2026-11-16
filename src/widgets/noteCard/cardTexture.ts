import { CanvasTexture, SRGBColorSpace } from 'three';
import { tuning } from '../../config';
import { formatStamp } from '../../core/format';
import { createRng } from '../../core/random';
import type { CardLayout, NoteKind } from './cardLayout';
import { paperPin, type PaperPin } from './paperPin';

/** 사진 원본. 필요한 해상도로 그때그때 그려 받는다. 텍스처를 만든 뒤에는 결과를 들고 있지 않는다. */
export interface PhotoSource {
  width: number;
  height: number;
  render(targetWidth: number): CanvasImageSource;
}

export interface CardFace {
  id: string;
  createdAt: Date;
  kind?: NoteKind;
  photo?: PhotoSource;
  title?: string;
  body?: string;
}

export interface PaperColors {
  front: string;
  back: string;
  strip?: string;
}

const MONO = 'ui-monospace, "Cascadia Mono", "Malgun Gothic", Consolas, "D2Coding", monospace';

function idHash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 노트 타입과 번호로 앞·뒷면 종이 색을 고른다. */
export function paperColors(face: Pick<CardFace, 'id' | 'kind'>): PaperColors {
  const c = tuning.card;
  const kind = face.kind ?? 'photo';
  if (kind === 'memo') {
    const pal = c.memo.palette;
    return pal[idHash(face.id) % pal.length];
  }
  if (kind === 'doc') return { front: c.doc.paper, back: c.doc.paperBack };
  return { front: c.paper, back: c.paperBack };
}

/** 노트 타입에 맞춰 폴라로이드 사진 · 포스트잇 · A4 문서를 캔버스에 그려 텍스처로 만든다. */
export function createCardTexture(face: CardFace, layout: CardLayout, anisotropy: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = layout.textureWidth;
  canvas.height = layout.textureHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D 캔버스를 만들 수 없다');

  const colors = paperColors(face);
  ctx.fillStyle = colors.front;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (layout.kind === 'memo') drawMemoFace(ctx, face, layout, colors.strip);
  else if (layout.kind === 'doc') drawDocFace(ctx, face, layout);
  else drawPolaroidFace(ctx, face, layout);

  drawGrain(ctx, canvas.width, canvas.height, face.id);
  drawTape(ctx, canvas.width, canvas.height, paperPin(face.id));

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** 폴라로이드 인화지: 얇은 위·좌우 테두리, 안쪽 음영, 두툼한 아래 여백에 날짜·캡션. */
function drawPolaroidFace(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout): void {
  const c = tuning.card;
  const { photo, label } = layout;
  const px = layout.textureWidth / 512;

  if (face.photo) {
    const image = face.photo.render(photo.width);
    const iw = (image as { width: number }).width;
    const ih = (image as { height: number }).height;
    drawCover(ctx, image, iw, ih, photo.x, photo.y, photo.width, photo.height);
  }

  // 인화지 프레임 안쪽 그림자(위·왼쪽이 살짝 깊어 보이게)
  ctx.strokeStyle = c.photoInsetShadow;
  ctx.lineWidth = 3 * px;
  ctx.beginPath();
  ctx.moveTo(photo.x, photo.y + photo.height);
  ctx.lineTo(photo.x, photo.y);
  ctx.lineTo(photo.x + photo.width, photo.y);
  ctx.stroke();

  ctx.strokeStyle = c.photoLine;
  ctx.lineWidth = 1.5 * px;
  ctx.strokeRect(photo.x + 0.75 * px, photo.y + 0.75 * px, photo.width - 1.5 * px, photo.height - 1.5 * px);

  if (face.title) {
    const capSize = Math.max(9, Math.round(label.height * 0.24));
    ctx.font = `600 ${capSize}px ${MONO}`;
    ctx.fillStyle = c.ink;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(truncateText(ctx, face.title, label.width), label.x, label.y + label.height * 0.34);
  }
  const stampY = label.y + label.height * (face.title ? 0.7 : 0.52);
  drawStamp(ctx, face, label.x, label.width, stampY, Math.round(label.height * 0.21));
}

/** 짧은 노트(포스트잇): 윗변 접착 띠와 굵은 제목, 큼직한 짧은 본문, 아래 날짜. */
function drawMemoFace(
  ctx: CanvasRenderingContext2D,
  face: CardFace,
  layout: CardLayout,
  stripColor?: string,
): void {
  const c = tuning.card;
  const w = layout.textureWidth;
  const h = layout.textureHeight;
  const px = w / 512;

  const stripH = Math.round(h * c.memo.stripRatio);
  if (stripColor) {
    ctx.fillStyle = stripColor;
    ctx.fillRect(0, 0, w, stripH);
  }
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.lineWidth = 1.5 * px;
  ctx.beginPath();
  ctx.moveTo(0, stripH);
  ctx.lineTo(w, stripH);
  ctx.stroke();

  const area = layout.photo;
  let y = area.y + 4 * px;
  const titleSize = Math.max(11, Math.round(w * 0.072));
  const bodySize = Math.max(9, Math.round(w * 0.056));
  const lineH = bodySize * 1.42;

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  if (face.title) {
    ctx.font = `700 ${titleSize}px ${MONO}`;
    ctx.fillStyle = c.ink;
    const titleLines = wrapLines(ctx, face.title, area.width, 2);
    for (const line of titleLines) {
      ctx.fillText(line, area.x, y);
      y += titleSize * 1.28;
    }
    y += bodySize * 0.4;
  }

  const bodyText = face.body ?? '';
  if (bodyText) {
    ctx.font = `${bodySize}px ${MONO}`;
    ctx.fillStyle = c.ink;
    const maxLines = Math.max(1, Math.floor((area.y + area.height - y) / lineH));
    for (const line of wrapLines(ctx, bodyText, area.width, maxLines)) {
      ctx.fillText(line, area.x, y);
      y += lineH;
    }
  }

  const { label } = layout;
  drawStamp(ctx, face, label.x, label.width, label.y + label.height * 0.55, Math.round(w * 0.038));
}

/** 긴 문서(A4): 붉은 여백선·희미한 가로줄, 상단 제목·날짜 헤더, 촘촘한 문단. */
function drawDocFace(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout): void {
  const c = tuning.card;
  const w = layout.textureWidth;
  const h = layout.textureHeight;
  const px = w / 512;
  const { label, photo: body } = layout;

  // 희미한 노트 줄과 왼쪽 여백선
  ctx.strokeStyle = c.doc.marginLine;
  ctx.lineWidth = 1.5 * px;
  ctx.beginPath();
  ctx.moveTo(label.x - 6 * px, layout.padding * 0.8);
  ctx.lineTo(label.x - 6 * px, h - layout.padding * 0.8);
  ctx.stroke();

  const bodySize = Math.max(8, Math.round(w * 0.04));
  const lineH = bodySize * 1.48;
  ctx.strokeStyle = c.doc.ruleLine;
  ctx.lineWidth = Math.max(1, px);
  for (let ry = body.y + lineH; ry < body.y + body.height; ry += lineH) {
    ctx.beginPath();
    ctx.moveTo(body.x, ry);
    ctx.lineTo(body.x + body.width, ry);
    ctx.stroke();
  }

  // 헤더: 제목 + 날짜/번호 + 구분선
  const titleSize = Math.max(10, Math.round(w * 0.056));
  ctx.font = `700 ${titleSize}px ${MONO}`;
  ctx.fillStyle = c.ink;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(truncateText(ctx, face.title ?? `DOC #${face.id}`, label.width), label.x, label.y + 4 * px);

  drawStamp(ctx, face, label.x, label.width, label.y + label.height * 0.68, Math.round(w * 0.034));

  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.5 * px;
  ctx.beginPath();
  ctx.moveTo(label.x, label.y + label.height - 6 * px);
  ctx.lineTo(label.x + label.width, label.y + label.height - 6 * px);
  ctx.stroke();

  // 본문 문단
  const bodyText = face.body ?? '';
  if (bodyText) {
    ctx.font = `${bodySize}px ${MONO}`;
    ctx.fillStyle = c.ink;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const maxLines = Math.max(1, Math.floor(body.height / lineH));
    let y = body.y + 3 * px;
    for (const line of wrapLines(ctx, bodyText, body.width, maxLines)) {
      ctx.fillText(line, body.x, y);
      y += lineH;
    }
  }
}

function drawStamp(
  ctx: CanvasRenderingContext2D,
  face: CardFace,
  x: number,
  width: number,
  midY: number,
  rawFontSize: number,
): void {
  const c = tuning.card;
  const fontSize = Math.max(8, rawFontSize);
  ctx.font = `${fontSize}px ${MONO}`;
  ctx.textBaseline = 'middle';

  const marker = Math.max(3, Math.round(fontSize * 0.52));
  ctx.fillStyle = tuning.look.accent;
  ctx.fillRect(x, midY - marker / 2, marker, marker);

  ctx.fillStyle = c.ink;
  ctx.textAlign = 'left';
  ctx.fillText(formatStamp(face.createdAt), x + marker * 1.8, midY);

  ctx.fillStyle = c.inkDim;
  ctx.textAlign = 'right';
  ctx.fillText(`#${face.id}`, x + width, midY);
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end--;
  return `${text.slice(0, end)}…`;
}

/** 글자 단위로 줄을 나눈다. maxLines 를 넘는 글이 남으면 마지막 줄 끝을 말줄임표로 바꾼다. */
export function wrapLines(
  ctx: Pick<CanvasRenderingContext2D, 'measureText'>,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  const paras = text.split('\n');
  for (let p = 0; p < paras.length; p++) {
    let line = '';
    for (const ch of paras[p]) {
      const next = line + ch;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        if (lines.length >= maxLines) return appendEllipsis(ctx, lines, maxWidth);
        line = ch === ' ' ? '' : ch;
      } else {
        line = next;
      }
    }
    lines.push(line);
    if (lines.length >= maxLines) {
      // 문단 끝에서 줄이 다 찼어도 뒤에 남은 글이 있으면 잘렸다고 알린다
      const rest = paras.slice(p + 1).some((para) => para.trim() !== '');
      return rest ? appendEllipsis(ctx, lines, maxWidth) : lines;
    }
  }
  return lines;
}

/** 마지막 줄 끝에 말줄임표를 붙이고, 폭을 넘으면 넘지 않을 때까지 글자를 덜어 낸다 */
function appendEllipsis(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, lines: string[], maxWidth: number): string[] {
  const last = lines.length - 1;
  if (last < 0) return lines;
  let line = lines[last];
  while (line.length > 0 && ctx.measureText(`${line}…`).width > maxWidth) line = line.slice(0, -1);
  lines[last] = `${line}…`;
  return lines;
}

/** CSS object-fit: cover 처럼 비율을 지키며 칸을 채운다. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  iw: number,
  ih: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

/** 압정 자리 윗변에 걸친 마스킹 테이프. 압정(paperPin)과 같은 가로 자리에 붙는다 */
function drawTape(ctx: CanvasRenderingContext2D, w: number, h: number, pin: PaperPin): void {
  const t = tuning.card.tape;
  const tw = w * t.width;
  const th = w * t.height;
  const cx = w * (0.5 + pin.u);
  const cy = h * (0.5 - pin.v);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(pin.tilt);
  ctx.fillStyle = t.color;
  ctx.fillRect(-tw / 2, -th / 2, tw, th);
  ctx.strokeStyle = t.edge;
  ctx.lineWidth = Math.max(1, w / 400);
  ctx.strokeRect(-tw / 2, -th / 2, tw, th);
  ctx.restore();
}

/** 종이결: 노트 번호로 정한 옅은 점을 흩뿌린다 */
function drawGrain(ctx: CanvasRenderingContext2D, w: number, h: number, id: string): void {
  const rng = createRng(idHash(id));
  const count = Math.round((w * h) / 90);
  for (let i = 0; i < count; i++) {
    const dark = rng() < 0.5;
    ctx.fillStyle = dark ? `rgba(0,0,0,${0.02 + rng() * 0.04})` : `rgba(255,255,255,${0.2 + rng() * 0.3})`;
    ctx.fillRect(rng() * w, rng() * h, 1, 1);
  }
}
