import { CanvasTexture, SRGBColorSpace } from 'three';
import { tuning } from '../../config';
import { formatStamp } from '../../core/format';
import { createRng } from '../../core/random';
import type { CardLayout } from './cardLayout';

/** 사진 원본. 필요한 해상도로 그때그때 그려 받는다. 텍스처를 만든 뒤에는 결과를 들고 있지 않는다. */
export interface PhotoSource {
  width: number;
  height: number;
  render(targetWidth: number): CanvasImageSource;
}

export interface CardFace {
  id: string;
  createdAt: Date;
  photo: PhotoSource;
}

const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "D2Coding", monospace';

/** 흰 종이에 사진과 날짜·번호를 인쇄한 모양을 캔버스 하나에 그려 텍스처로 만든다. */
export function createCardTexture(face: CardFace, layout: CardLayout, anisotropy: number): CanvasTexture {
  const look = tuning.look;
  const canvas = document.createElement('canvas');
  canvas.width = layout.textureWidth;
  canvas.height = layout.textureHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D 캔버스를 만들 수 없다');

  const card = tuning.card;
  ctx.fillStyle = card.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrain(ctx, canvas.width, canvas.height, face.id);

  const { photo, label } = layout;
  const image = face.photo.render(photo.width);
  const iw = (image as { width: number }).width;
  const ih = (image as { height: number }).height;
  drawCover(ctx, image, iw, ih, photo.x, photo.y, photo.width, photo.height);

  ctx.strokeStyle = card.photoLine;
  const px = canvas.width / 512;
  ctx.lineWidth = 1.5 * px;
  ctx.strokeRect(photo.x + 0.75 * px, photo.y + 0.75 * px, photo.width - 1.5 * px, photo.height - 1.5 * px);

  const fontSize = Math.round(label.height * 0.34);
  const midY = label.y + label.height * 0.52;
  ctx.font = `${fontSize}px ${MONO}`;
  ctx.textBaseline = 'middle';

  const marker = Math.round(fontSize * 0.55);
  ctx.fillStyle = look.accent;
  ctx.fillRect(label.x, midY - marker / 2, marker, marker);

  ctx.fillStyle = card.ink;
  ctx.textAlign = 'left';
  ctx.fillText(formatStamp(face.createdAt), label.x + marker * 1.8, midY);

  ctx.fillStyle = card.inkDim;
  ctx.textAlign = 'right';
  ctx.fillText(`#${face.id}`, label.x + label.width, midY);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
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

/** 종이결: 노트 번호로 정한 옅은 점을 흩뿌린다 */
function drawGrain(ctx: CanvasRenderingContext2D, w: number, h: number, id: string): void {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  const rng = createRng(seed);
  const count = Math.round((w * h) / 90);
  for (let i = 0; i < count; i++) {
    const dark = rng() < 0.5;
    ctx.fillStyle = dark ? `rgba(0,0,0,${0.02 + rng() * 0.04})` : `rgba(255,255,255,${0.2 + rng() * 0.3})`;
    ctx.fillRect(rng() * w, rng() * h, 1, 1);
  }
}
