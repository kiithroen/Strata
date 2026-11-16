import { CanvasTexture, SRGBColorSpace } from 'three';
import { tuning } from '../../config';
import { formatStamp } from '../../core/format';
import { createRng } from '../../core/random';
import type { CardLayout, NoteKind, Rect } from './cardLayout';

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

const MONO = 'ui-monospace, "Cascadia Mono", "Malgun Gothic", Consolas, "D2Coding", monospace';

/** 제목 줄 이름: 사진은 캡션, 없으면 종류 코드와 번호 */
function windowTitle(face: CardFace, kind: NoteKind): string {
  if (kind === 'photo') return face.title ?? `IMG_${face.id}`;
  return `${kind === 'memo' ? 'MEMO' : 'TXT'}_${face.id}`;
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

/**
 * 가까이서 보는 창 모양 카드. 반투명 바탕 위에 제목 줄(고리·이름·창 단추), 내용, 상태 줄을 그린다.
 * 사진만 제 색이고 나머지는 거의 무채색이다. 흑백으로 바꾸는 건 거리에 따라 셰이더가 한다.
 */
export function createCardTexture(face: CardFace, layout: CardLayout, anisotropy: number): CanvasTexture {
  const { canvas, ctx } = newCanvas(layout);
  drawWindow(ctx, layout, false);
  drawTitle(ctx, layout, windowTitle(face, layout.kind));
  if (layout.kind === 'memo') drawMemo(ctx, face, layout);
  else if (layout.kind === 'doc') drawDoc(ctx, face, layout);
  else drawPhoto(ctx, face, layout);
  drawFooter(ctx, face, layout);
  return toTexture(canvas, anisotropy);
}

/**
 * 멀리서 보는 단순한 카드. 글자 없이 같은 틀에 사진은 굵은 모자이크, 글은 줄 막대로만 그린다.
 * layout 은 card.simpleTextureWidth 로 계산한 것을 넘긴다.
 */
export function createSimpleTexture(face: CardFace, layout: CardLayout, anisotropy: number): CanvasTexture {
  const { canvas, ctx } = newCanvas(layout);
  const h = tuning.card.holo;
  drawWindow(ctx, layout, true);
  const { content, footer } = layout;
  const s = tuning.card.simple;
  const w = layout.textureWidth;
  if (layout.kind === 'photo' && face.photo) {
    const cols = s.photoBlocks;
    const image = face.photo.render(cols);
    ctx.imageSmoothingEnabled = false;
    drawCover(ctx, image, content);
    ctx.imageSmoothingEnabled = true;
  } else {
    // 글 줄 막대. 첫 줄은 제목처럼 굵고, 나머지는 노트 번호로 정한 길이다
    const rng = createRng(idHash(face.id));
    const barH = Math.max(1, Math.round(w * s.barRatio));
    const gap = Math.max(barH + 1, Math.round(w * s.barGapRatio));
    let y = content.y + gap * 0.3;
    let first = true;
    while (y + barH <= content.y + content.height) {
      const len = first ? 0.6 : 0.45 + rng() * 0.55;
      ctx.fillStyle = first ? h.line : h.dim;
      ctx.fillRect(content.x, y, content.width * len, first ? barH * 1.5 : barH);
      y += first ? gap * 1.3 : gap;
      first = false;
    }
  }
  const barH = Math.max(1, Math.round(w * s.barRatio));
  ctx.fillStyle = h.faint;
  ctx.fillRect(footer.x, footer.y + (footer.height - barH) / 2, footer.width * 0.45, barH);
  return toTexture(canvas, anisotropy);
}

/** 반투명 바탕, 제목 줄 띠, 흐린 테두리와 밝은 모서리 꺾쇠, 실을 묶는 고리 */
function drawWindow(ctx: CanvasRenderingContext2D, layout: CardLayout, simple: boolean): void {
  const h = tuning.card.holo;
  const win = tuning.card.window;
  const w = layout.textureWidth;
  const hh = layout.textureHeight;
  const line = simple ? Math.max(1, w * win.simpleLineRatio) : layout.line;
  const { titleBar, ring } = layout;

  ctx.clearRect(0, 0, w, hh);
  ctx.fillStyle = h.fill;
  ctx.fillRect(0, 0, w, hh);
  ctx.fillStyle = simple ? h.faint : h.titleFill;
  ctx.fillRect(titleBar.x, titleBar.y, titleBar.width, titleBar.height);

  ctx.strokeStyle = h.dim;
  ctx.lineWidth = line;
  ctx.strokeRect(line / 2, line / 2, w - line, hh - line);
  ctx.beginPath();
  ctx.moveTo(0, titleBar.height);
  ctx.lineTo(w, titleBar.height);
  ctx.stroke();

  // 모서리 꺾쇠: 테두리보다 굵고 밝다
  const b = Math.round(w * win.bracketRatio);
  const t = line * 1.8;
  ctx.strokeStyle = h.line;
  ctx.lineWidth = t;
  const o = t / 2;
  ctx.beginPath();
  for (const [x, y, dx, dy] of [
    [o, o, 1, 1],
    [w - o, o, -1, 1],
    [o, hh - o, 1, -1],
    [w - o, hh - o, -1, -1],
  ] as const) {
    ctx.moveTo(x + dx * b, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * b);
  }
  ctx.stroke();

  ctx.lineWidth = line;
  if (simple) {
    ctx.fillStyle = h.line;
    ctx.fillRect(ring.x - ring.size / 2, ring.y - ring.size / 2, ring.size, ring.size);
  } else {
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.size / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** 제목 줄: 고리 오른쪽에 이름, 오른쪽 끝에 접기·닫기 단추 */
function drawTitle(ctx: CanvasRenderingContext2D, layout: CardLayout, title: string): void {
  const h = tuning.card.holo;
  const { titleBar, ring, padding, line } = layout;
  const btn = ring.size;
  const cy = titleBar.height / 2;
  const right = titleBar.width - padding;

  ctx.strokeStyle = h.line;
  ctx.lineWidth = line * 1.2;
  // 닫기(×)
  const cx = right - btn / 2;
  ctx.beginPath();
  ctx.moveTo(cx - btn / 2, cy - btn / 2);
  ctx.lineTo(cx + btn / 2, cy + btn / 2);
  ctx.moveTo(cx + btn / 2, cy - btn / 2);
  ctx.lineTo(cx - btn / 2, cy + btn / 2);
  // 접기(밑줄)
  const mx = cx - btn * 1.9;
  ctx.moveTo(mx - btn / 2, cy + btn / 2);
  ctx.lineTo(mx + btn / 2, cy + btn / 2);
  ctx.stroke();

  const size = Math.max(8, Math.round(titleBar.height * 0.5));
  ctx.font = `600 ${size}px ${MONO}`;
  ctx.fillStyle = h.line;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const x = ring.x + ring.size / 2 + padding * 0.8;
  const maxW = mx - btn - padding * 0.8 - x;
  ctx.fillText(truncateText(ctx, title, maxW), x, cy + size * 0.05);
}

/** 사진 칸: 사진을 채우고 흐린 선으로 두른다 */
function drawPhoto(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout): void {
  const { content, line } = layout;
  if (face.photo) drawCover(ctx, face.photo.render(content.width), content);
  ctx.strokeStyle = tuning.card.holo.dim;
  ctx.lineWidth = line;
  ctx.strokeRect(content.x - line / 2, content.y - line / 2, content.width + line, content.height + line);
}

/** 짧은 노트: 굵은 제목과 큼직한 본문 */
function drawMemo(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout): void {
  const h = tuning.card.holo;
  const { content } = layout;
  const w = layout.textureWidth;
  const titleSize = Math.max(10, Math.round(w * 0.068));
  const bodySize = Math.max(9, Math.round(w * 0.056));
  const lineH = bodySize * 1.45;
  let y = content.y + layout.padding * 0.3;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  if (face.title) {
    ctx.font = `700 ${titleSize}px ${MONO}`;
    ctx.fillStyle = h.line;
    for (const l of wrapLines(ctx, face.title, content.width, 2)) {
      ctx.fillText(l, content.x, y);
      y += titleSize * 1.3;
    }
    y += bodySize * 0.4;
  }
  if (face.body) {
    ctx.font = `${bodySize}px ${MONO}`;
    ctx.fillStyle = h.line;
    const maxLines = Math.max(1, Math.floor((content.y + content.height - y) / lineH));
    for (const l of wrapLines(ctx, face.body, content.width, maxLines)) {
      ctx.fillText(l, content.x, y);
      y += lineH;
    }
  }
}

/** 긴 문서: 제목, 구분선, 촘촘한 문단. 오른쪽 스크롤 막대가 보이는 분량을 알린다 */
function drawDoc(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout): void {
  const h = tuning.card.holo;
  const { content, line, padding } = layout;
  const w = layout.textureWidth;
  const titleSize = Math.max(9, Math.round(w * 0.054));
  const bodySize = Math.max(8, Math.round(w * 0.04));
  const lineH = bodySize * 1.5;
  const barW = Math.max(2, Math.round(w * 0.012));
  const textW = content.width - barW - padding;

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  let y = content.y + padding * 0.2;
  ctx.font = `700 ${titleSize}px ${MONO}`;
  ctx.fillStyle = h.line;
  ctx.fillText(truncateText(ctx, face.title ?? `DOC ${face.id}`, textW), content.x, y);
  y += titleSize * 1.5;
  ctx.strokeStyle = h.dim;
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.moveTo(content.x, y);
  ctx.lineTo(content.x + textW, y);
  ctx.stroke();
  y += bodySize * 0.8;

  const bodyTop = y;
  let shown = 0;
  let total = 0;
  if (face.body) {
    ctx.font = `${bodySize}px ${MONO}`;
    ctx.fillStyle = h.line;
    const maxLines = Math.max(1, Math.floor((content.y + content.height - y) / lineH));
    const lines = wrapLines(ctx, face.body, textW, maxLines);
    total = wrapLines(ctx, face.body, textW, Number.MAX_SAFE_INTEGER).length;
    shown = lines.length;
    for (const l of lines) {
      ctx.fillText(l, content.x, y);
      y += lineH;
    }
  }

  // 스크롤 막대: 흐린 홈 위에 보이는 비율만큼의 손잡이
  const trackX = content.x + content.width - barW;
  const trackH = content.y + content.height - bodyTop;
  ctx.fillStyle = h.faint;
  ctx.fillRect(trackX, bodyTop, barW, trackH);
  ctx.fillStyle = h.line;
  ctx.fillRect(trackX, bodyTop, barW, trackH * (total > 0 ? Math.min(1, shown / total) : 1));
}

/** 상태 줄: 왼쪽에 찍은 시각, 오른쪽에 노트 번호 */
function drawFooter(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout): void {
  const h = tuning.card.holo;
  const { footer } = layout;
  const size = Math.max(8, Math.round(footer.height * 0.5));
  const cy = footer.y + footer.height / 2;
  ctx.font = `${size}px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = h.line;
  ctx.textAlign = 'left';
  ctx.fillText(formatStamp(face.createdAt), footer.x, cy);
  ctx.fillStyle = h.dim;
  ctx.textAlign = 'right';
  ctx.fillText(`#${face.id}`, footer.x + footer.width, cy);
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
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
function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, r: Rect): void {
  const iw = (image as { width: number }).width;
  const ih = (image as { height: number }).height;
  const scale = Math.max(r.width / iw, r.height / ih);
  const sw = r.width / scale;
  const sh = r.height / scale;
  ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, r.x, r.y, r.width, r.height);
}
