import { CanvasTexture, Color, SRGBColorSpace } from 'three';
import { tuning } from '../../config';
import { formatStamp } from '../../core/format';
import { createRng } from '../../core/random';
import { memoMetrics, MEMO_TITLE_LINES, type CardLayout, type NoteKind, type Rect } from './cardLayout';
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
  strip: string;
}

function palette(face: CardFace): Palette {
  const h = tuning.card.holo;
  const c = new Color(holoTint(face));
  const rgba = (a: number) => `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a})`;
  return { line: rgba(1), dim: rgba(h.dimAlpha), faint: rgba(h.faintAlpha), band: rgba(h.bandAlpha), strip: rgba(h.stripAlpha) };
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

/**
 * 종류마다 다른 겉모양. 사진은 온전한 직사각 창, 메모는 오른쪽 위 모서리를 깎은 쪽지, 문서는 왼쪽 위에 파일 탭이 솟은 긴 창이다.
 * 바탕 칠·테두리·클립이 모두 이 길을 쓴다.
 */
function outline(ctx: CanvasRenderingContext2D, layout: CardLayout, inset: number): void {
  const win = tuning.card.window;
  const w = layout.textureWidth;
  const h = layout.textureHeight;
  const i = inset;
  ctx.beginPath();
  if (layout.kind === 'memo') {
    const cut = layout.unit * win.chamferRatio;
    ctx.moveTo(i, i);
    ctx.lineTo(w - cut, i);
    ctx.lineTo(w - i, cut);
    ctx.lineTo(w - i, h - i);
    ctx.lineTo(i, h - i);
  } else if (layout.kind === 'doc') {
    const t = layout.titleBar.height;
    const tab = layout.unit * win.tabRatio;
    ctx.moveTo(i, i);
    ctx.lineTo(tab, i);
    ctx.lineTo(tab + t, t + i);
    ctx.lineTo(w - i, t + i);
    ctx.lineTo(w - i, h - i);
    ctx.lineTo(i, h - i);
  } else {
    ctx.rect(i, i, w - i * 2, h - i * 2);
  }
  ctx.closePath();
}

/**
 * 가까이서 보는 홀로그램 카드. 반투명 남색 바탕에 종류별 색의 빛나는 선과 글자를 그린다.
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
 * 멀리서 보는 단순한 카드. 글자 없이 같은 겉모양에 사진은 굵은 모자이크, 메모는 굵은 막대 몇 줄, 문서는 줄 번호 칸과 가는 막대로만 그린다.
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
  if (layout.kind === 'photo') {
    if (photo) {
      ctx.imageSmoothingEnabled = false;
      drawCover(ctx, mosaic(photo, s.photoBlocks), content);
      ctx.imageSmoothingEnabled = true;
    }
    drawViewfinder(ctx, content, p.line, Math.max(1, w * tuning.card.window.simpleLineRatio));
  } else if (layout.kind === 'memo') {
    // 굵은 글 막대 몇 줄
    let y = content.y + gap * 0.2;
    for (let i = 0; y + barH * 1.6 <= content.y + content.height && i < 4; i++) {
      ctx.fillStyle = i === 0 ? p.line : p.dim;
      ctx.fillRect(content.x, y, content.width * (i === 0 ? 0.7 : 0.5 + rng() * 0.5), barH * 1.6);
      y += gap * 1.5;
    }
  } else {
    // 줄 번호 칸 점과 가는 글 막대
    const gutter = Math.round(w * tuning.card.window.gutterRatio);
    let y = content.y + gap * 0.3;
    while (y + barH <= content.y + content.height) {
      ctx.fillStyle = p.faint;
      ctx.fillRect(content.x, y, gutter * 0.5, barH);
      ctx.fillStyle = p.dim;
      ctx.fillRect(content.x + gutter, y, (content.width - gutter) * (0.4 + rng() * 0.6), barH);
      y += gap;
    }
  }
  ctx.fillStyle = p.faint;
  ctx.fillRect(footer.x, footer.y + (footer.height - barH) / 2, footer.width * 0.45, barH);
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

/** 겉모양 바탕, 제목 띠, 테두리, 종류별 강조선, 실을 묶는 고리 */
function drawBody(ctx: CanvasRenderingContext2D, layout: CardLayout, p: Palette, simple: boolean): void {
  const h = tuning.card.holo;
  const win = tuning.card.window;
  const w = layout.textureWidth;
  const u = layout.unit;
  const hh = layout.textureHeight;
  const line = simple ? Math.max(1, u * win.simpleLineRatio) : layout.line;
  const { titleBar, ring } = layout;
  const glowOn = (c: string) => glow(ctx, simple ? null : c, u);

  ctx.clearRect(0, 0, w, hh);
  outline(ctx, layout, line / 2);
  ctx.fillStyle = h.fill;
  ctx.fill();

  // 제목 띠: 메모는 진한 접착 띠, 문서는 탭 안, 사진은 창 제목 줄
  ctx.save();
  outline(ctx, layout, line / 2);
  ctx.clip();
  ctx.fillStyle = layout.kind === 'memo' ? p.strip : p.band;
  ctx.fillRect(0, 0, w, titleBar.height);
  ctx.restore();

  glowOn(p.dim);
  ctx.strokeStyle = p.dim;
  ctx.lineWidth = line;
  outline(ctx, layout, line / 2);
  ctx.stroke();
  if (layout.kind !== 'doc') {
    // 제목 줄 아래 구분선은 겉모양 안에서만 긋는다(메모의 깎은 모서리 밖으로 삐져나오지 않게)
    ctx.save();
    outline(ctx, layout, line / 2);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(0, titleBar.height);
    ctx.lineTo(w, titleBar.height);
    ctx.stroke();
    ctx.restore();
  }

  // 종류별 강조선: 사진은 네 모서리 꺾쇠, 메모는 깎은 모서리, 문서는 탭 윤곽
  glowOn(p.line);
  ctx.strokeStyle = p.line;
  ctx.lineWidth = line * 1.8;
  const o = line;
  ctx.beginPath();
  if (layout.kind === 'memo') {
    const cut = u * win.chamferRatio;
    ctx.moveTo(w - cut - cut * 0.5, o);
    ctx.lineTo(w - cut, o);
    ctx.lineTo(w - o, cut);
    ctx.lineTo(w - o, cut + cut * 0.5);
    const b = Math.round(u * win.bracketRatio);
    ctx.moveTo(o + b, hh - o);
    ctx.lineTo(o, hh - o);
    ctx.lineTo(o, hh - o - b);
  } else if (layout.kind === 'doc') {
    const t = titleBar.height;
    const tab = u * win.tabRatio;
    ctx.moveTo(o, t + o);
    ctx.lineTo(o, o);
    ctx.lineTo(tab, o);
    ctx.lineTo(tab + t, t + o);
  } else {
    const b = Math.round(u * win.bracketRatio);
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
  }
  ctx.stroke();

  ctx.lineWidth = line;
  if (simple) {
    ctx.fillStyle = p.line;
    ctx.fillRect(ring.x - ring.size / 2, ring.y - ring.size / 2, ring.size, ring.size);
  } else {
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.size / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  glow(ctx, null, u);
}

/** 제목 줄 이름. right 는 이름이 넘지 말아야 할 오른쪽 끝(px) */
function drawTitleText(ctx: CanvasRenderingContext2D, layout: CardLayout, p: Palette, text: string, right: number): void {
  const { titleBar, ring, padding } = layout;
  const size = Math.max(8, Math.round(titleBar.height * 0.5));
  ctx.font = `600 ${size}px ${MONO}`;
  ctx.fillStyle = p.line;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const x = ring.x + ring.size / 2 + padding * 0.8;
  glow(ctx, p.line, layout.unit);
  ctx.fillText(truncateText(ctx, text, right - x), x, titleBar.height / 2 + size * 0.05);
  glow(ctx, null, layout.unit);
}

/** 사진: 창 단추가 있는 제목 줄, 뷰파인더 꺾쇠를 두른 사진, 상태 줄의 눈금 */
function drawPhoto(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout, p: Palette, photo: CanvasImageSource | null): void {
  const { content, line, titleBar, ring, padding } = layout;
  const w = layout.unit;
  if (photo) drawCover(ctx, photo, content);
  ctx.strokeStyle = p.dim;
  ctx.lineWidth = line;
  ctx.strokeRect(content.x - line / 2, content.y - line / 2, content.width + line, content.height + line);
  glow(ctx, p.line, w);
  drawViewfinder(ctx, content, p.line, line * 1.6);

  // 접기·닫기 단추
  const btn = ring.size;
  const cy = titleBar.height / 2;
  const cx = titleBar.width - padding - btn / 2;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = line * 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - btn / 2, cy - btn / 2);
  ctx.lineTo(cx + btn / 2, cy + btn / 2);
  ctx.moveTo(cx + btn / 2, cy - btn / 2);
  ctx.lineTo(cx - btn / 2, cy + btn / 2);
  const mx = cx - btn * 1.9;
  ctx.moveTo(mx - btn / 2, cy + btn / 2);
  ctx.lineTo(mx + btn / 2, cy + btn / 2);
  ctx.stroke();
  glow(ctx, null, w);
  drawTitleText(ctx, layout, p, face.title ?? `IMG_${face.id}`, mx - btn - padding * 0.8);
}

/** 사진 네 귀퉁이 안쪽의 뷰파인더 꺾쇠 */
function drawViewfinder(ctx: CanvasRenderingContext2D, r: Rect, color: string, width: number): void {
  const b = Math.min(r.width, r.height) * 0.12;
  const o = width * 1.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const [x, y, dx, dy] of [
    [r.x + o, r.y + o, 1, 1],
    [r.x + r.width - o, r.y + o, -1, 1],
    [r.x + o, r.y + r.height - o, 1, -1],
    [r.x + r.width - o, r.y + r.height - o, -1, -1],
  ] as const) {
    ctx.moveTo(x + dx * b, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * b);
  }
  ctx.stroke();
}

/** 메모: 접착 띠 안에 MEMO 표시, 굵은 제목과 큼직한 본문. 크기는 레이아웃이 글 양에 맞춰 정했다 */
function drawMemo(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout, p: Palette): void {
  const { content } = layout;
  const u = layout.unit;
  const cut = u * tuning.card.window.chamferRatio;
  drawTitleText(ctx, layout, p, `MEMO ${face.id}`, layout.textureWidth - cut - layout.padding * 0.5);
  const m = memoMetrics(u);
  let y = content.y + layout.padding * 0.3;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  glow(ctx, p.line, u);
  if (face.title) {
    ctx.font = `700 ${m.titleSize}px ${MONO}`;
    ctx.fillStyle = p.line;
    for (const l of wrapLines(ctx, face.title, content.width, MEMO_TITLE_LINES)) {
      ctx.fillText(l, content.x, y);
      y += m.titleLineH;
    }
    y += m.titleGap;
  }
  if (face.body) {
    ctx.font = `${m.bodySize}px ${MONO}`;
    ctx.fillStyle = p.line;
    const maxLines = Math.max(1, Math.floor((content.y + content.height - y) / m.bodyLineH));
    for (const l of wrapLines(ctx, face.body, content.width, maxLines)) {
      ctx.fillText(l, content.x, y);
      y += m.bodyLineH;
    }
  }
  glow(ctx, null, u);
}

/** 문서: 탭의 파일 이름, 왼쪽 줄 번호 칸, 제목과 촘촘한 문단, 보이는 분량을 알리는 스크롤 막대 */
function drawDoc(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout, p: Palette): void {
  const { content, line, padding } = layout;
  const w = layout.unit;
  drawTitleText(ctx, layout, p, `TXT_${face.id}.txt`, w * tuning.card.window.tabRatio);

  const gutter = Math.round(w * tuning.card.window.gutterRatio);
  const titleSize = Math.max(9, Math.round(w * 0.052));
  const bodySize = Math.max(8, Math.round(w * 0.04));
  const lineH = bodySize * 1.5;
  const barW = Math.max(2, Math.round(w * 0.012));
  const textX = content.x + gutter;
  const textW = content.width - gutter - barW - padding;

  // 줄 번호 칸 경계
  ctx.strokeStyle = p.faint;
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.moveTo(textX - padding * 0.5, content.y);
  ctx.lineTo(textX - padding * 0.5, content.y + content.height);
  ctx.stroke();

  ctx.textBaseline = 'top';
  let y = content.y + padding * 0.3;
  let n = 1;
  const number = (size: number) => {
    ctx.font = `${Math.round(size * 0.8)}px ${MONO}`;
    ctx.fillStyle = p.dim;
    ctx.textAlign = 'right';
    ctx.fillText(String(n++).padStart(2, '0'), textX - padding, y + size * 0.15);
    ctx.textAlign = 'left';
  };

  glow(ctx, p.line, w);
  number(titleSize);
  ctx.font = `700 ${titleSize}px ${MONO}`;
  ctx.fillStyle = p.line;
  ctx.fillText(truncateText(ctx, face.title ?? `DOC ${face.id}`, textW), textX, y);
  y += titleSize * 1.6;

  const bodyTop = y;
  let shown = 0;
  let total = 0;
  if (face.body) {
    ctx.font = `${bodySize}px ${MONO}`;
    const maxLines = Math.max(1, Math.floor((content.y + content.height - y) / lineH));
    const lines = wrapLines(ctx, face.body, textW, maxLines);
    total = wrapLines(ctx, face.body, textW, Number.MAX_SAFE_INTEGER).length;
    shown = lines.length;
    for (const l of lines) {
      number(bodySize);
      ctx.font = `${bodySize}px ${MONO}`;
      ctx.fillStyle = p.line;
      ctx.fillText(l, textX, y);
      y += lineH;
    }
  }
  glow(ctx, null, w);

  // 스크롤 막대: 흐린 홈 위에 보이는 비율만큼의 손잡이
  const trackX = content.x + content.width - barW;
  const trackH = content.y + content.height - bodyTop;
  ctx.fillStyle = p.faint;
  ctx.fillRect(trackX, bodyTop, barW, trackH);
  ctx.fillStyle = p.line;
  ctx.fillRect(trackX, bodyTop, barW, trackH * (total > 0 ? Math.min(1, shown / total) : 1));
}

/** 상태 줄: 왼쪽에 찍은 시각, 오른쪽에 노트 번호. 사진은 번호 대신 눈금 띠 */
function drawFooter(ctx: CanvasRenderingContext2D, face: CardFace, layout: CardLayout, p: Palette): void {
  const { footer, line } = layout;
  const w = layout.unit;
  const size = Math.max(8, Math.round(footer.height * 0.5));
  const cy = footer.y + footer.height / 2;
  ctx.font = `${size}px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = p.line;
  ctx.textAlign = 'left';
  glow(ctx, p.line, w);
  ctx.fillText(formatStamp(face.createdAt), footer.x, cy);
  glow(ctx, null, w);
  if (layout.kind === 'photo') {
    // 재생 막대 같은 눈금: 노트 번호로 정한 자리까지 밝다
    const ticks = 12;
    const span = footer.width * 0.32;
    const step = span / ticks;
    const lit = 2 + (idHash(face.id) % (ticks - 2));
    ctx.lineWidth = line * 1.2;
    for (let i = 0; i < ticks; i++) {
      const x = footer.x + footer.width - span + i * step + step / 2;
      const th = size * (i % 3 === 0 ? 0.9 : 0.55);
      ctx.strokeStyle = i < lit ? p.line : p.faint;
      ctx.beginPath();
      ctx.moveTo(x, cy - th / 2);
      ctx.lineTo(x, cy + th / 2);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = p.dim;
    ctx.textAlign = 'right';
    ctx.fillText(`#${face.id}`, footer.x + footer.width, cy);
  }
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
