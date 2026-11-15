import { CanvasTexture, SRGBColorSpace } from 'three';
import { tuning } from '../../config';
import { formatStamp } from '../../core/format';
import type { CardLayout } from './cardLayout';

export interface CardFace {
  id: string;
  createdAt: Date;
  image: CanvasImageSource;
  imageWidth: number;
  imageHeight: number;
}

const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "D2Coding", monospace';

/** 사진, 테두리, 모서리 괄호, 날짜·번호 라벨을 캔버스 하나에 그려 텍스처로 만든다. */
export function createCardTexture(face: CardFace, layout: CardLayout, anisotropy: number): CanvasTexture {
  const look = tuning.look;
  const canvas = document.createElement('canvas');
  canvas.width = layout.textureWidth;
  canvas.height = layout.textureHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D 캔버스를 만들 수 없다');

  ctx.fillStyle = look.panel;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const { photo, label, padding, bracket } = layout;
  drawCover(ctx, face.image, face.imageWidth, face.imageHeight, photo.x, photo.y, photo.width, photo.height);

  ctx.strokeStyle = look.frameLine;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(photo.x + 0.75, photo.y + 0.75, photo.width - 1.5, photo.height - 1.5);

  ctx.strokeStyle = look.accent;
  ctx.lineWidth = 3;
  const inset = padding * 0.45;
  drawBrackets(ctx, inset, inset, canvas.width - inset * 2, canvas.height - inset * 2, bracket);

  const fontSize = Math.round(label.height * 0.34);
  const midY = label.y + label.height * 0.52;
  ctx.font = `${fontSize}px ${MONO}`;
  ctx.textBaseline = 'middle';

  const marker = Math.round(fontSize * 0.55);
  ctx.fillStyle = look.accent;
  ctx.fillRect(label.x, midY - marker / 2, marker, marker);

  ctx.fillStyle = look.text;
  ctx.textAlign = 'left';
  ctx.fillText(formatStamp(face.createdAt), label.x + marker * 1.8, midY);

  ctx.fillStyle = look.textDim;
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

function drawBrackets(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, len: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.moveTo(x + w - len, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + len);
  ctx.moveTo(x + w, y + h - len);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - len, y + h);
  ctx.moveTo(x + len, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - len);
  ctx.stroke();
}
