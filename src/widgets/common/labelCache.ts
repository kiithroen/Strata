import { CanvasTexture, Color, SRGBColorSpace } from 'three';
import { tuning } from '../../config';
import { MONO, SANS } from './fonts';

/** major·minor 는 고정폭 숫자·날짜(밝은·흐린 글자색), title 은 굵은 산세리프 태그, badge 는 강조색 바탕 배지다 */
export type LabelStyle = 'major' | 'minor' | 'title' | 'badge';

export interface LabelTexture {
  texture: CanvasTexture;
  /** 폭 / 높이 */
  aspect: number;
}

const CANVAS_HEIGHT = 64;
const MAX_ENTRIES = 512;

export interface LabelRenderer {
  (text: string, style: LabelStyle): LabelTexture;
}

/** 글자 하나를 캔버스 텍스처로 구워 재사용한다. 상한을 넘기면 가장 오래 안 쓴 것부터 비운다. */
export class LabelCache {
  private readonly entries = new Map<string, LabelTexture>();

  constructor(
    private readonly maxEntries = MAX_ENTRIES,
    private readonly renderLabel: LabelRenderer = render,
  ) {}

  get(text: string, style: LabelStyle): LabelTexture {
    const key = `${style}\u0000${text}`;
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.entries().next();
      if (oldest.done) break;
      const [oldKey, oldValue] = oldest.value;
      this.entries.delete(oldKey);
      oldValue.texture.dispose();
    }
    const made = this.renderLabel(text, style);
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
  const font =
    style === 'badge' ? `700 ${fontSize}px ${MONO}` : style === 'title' ? `600 ${fontSize}px ${SANS}` : `500 ${fontSize}px ${MONO}`;
  ctx.font = font;
  // 배지가 아닌 글자는 바탕색 테두리를 둘러 빛나는 선·빛 무리 위에서도 읽힌다
  const outline = style === 'badge' ? 0 : fontSize * look.label.outline;
  const padX = style === 'badge' ? fontSize * 0.45 : fontSize * 0.1 + outline / 2;
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
  if (outline > 0) {
    const bg = new Color(look.background);
    ctx.lineJoin = 'round';
    ctx.lineWidth = outline;
    ctx.strokeStyle = `rgba(${Math.round(bg.r * 255)}, ${Math.round(bg.g * 255)}, ${Math.round(bg.b * 255)}, ${look.label.outlineAlpha})`;
    ctx.strokeText(text, padX, CANVAS_HEIGHT * 0.54);
  }
  ctx.fillStyle = style === 'badge' ? look.background : style === 'minor' ? look.textDim : look.text;
  ctx.fillText(text, padX, CANVAS_HEIGHT * 0.54);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, aspect: canvas.width / canvas.height };
}
