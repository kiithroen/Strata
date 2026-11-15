import { CanvasTexture, SRGBColorSpace } from 'three';
import { tuning } from '../../config';

export type LabelStyle = 'major' | 'minor' | 'badge';

export interface LabelTexture {
  texture: CanvasTexture;
  /** 폭 / 높이 */
  aspect: number;
}

const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "D2Coding", monospace';
const CANVAS_HEIGHT = 64;
const MAX_ENTRIES = 512;

/** 글자 하나를 캔버스 텍스처로 구워 재사용한다. 눈금 라벨과 묶음 배지가 함께 쓴다. */
export class LabelCache {
  private readonly entries = new Map<string, LabelTexture>();

  get(text: string, style: LabelStyle): LabelTexture {
    const key = `${style}\u0000${text}`;
    const hit = this.entries.get(key);
    if (hit) return hit;
    if (this.entries.size >= MAX_ENTRIES) this.clear();
    const made = render(text, style);
    this.entries.set(key, made);
    return made;
  }

  clear(): void {
    for (const e of this.entries.values()) e.texture.dispose();
    this.entries.clear();
  }
}

function render(text: string, style: LabelStyle): LabelTexture {
  const look = tuning.look;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D 캔버스를 만들 수 없다');
  const fontSize = Math.round(CANVAS_HEIGHT * 0.62);
  const font = `${style === 'badge' ? 700 : 400} ${fontSize}px ${MONO}`;
  ctx.font = font;
  const padX = style === 'badge' ? fontSize * 0.45 : fontSize * 0.1;
  const width = Math.ceil(ctx.measureText(text).width + padX * 2);
  canvas.width = Math.max(width, 1);
  canvas.height = CANVAS_HEIGHT;

  if (style === 'badge') {
    ctx.fillStyle = look.accent;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = style === 'badge' ? look.background : style === 'major' ? look.text : look.textDim;
  ctx.fillText(text, padX, CANVAS_HEIGHT * 0.54);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, aspect: canvas.width / canvas.height };
}
