import { createRng, range } from '../core/random';
import type { PhotoSource } from '../widgets/noteCard/cardTexture';

/**
 * 개발용 가짜 사진. 풍경, 종이 메모, 화이트보드 세 종류를 시드로 만든다.
 * 사진마다 시드를 들고 있다가 요청한 해상도로 같은 그림을 다시 그린다. 그린 캔버스는 들고 있지 않는다.
 */
const SIZES: [number, number][] = [
  [640, 480],
  [480, 640],
  [560, 560],
  [640, 360],
];

export function createPlaceholderPhotos(count: number, seed: number): PhotoSource[] {
  const rng = createRng(seed);
  const photos: PhotoSource[] = [];
  for (let i = 0; i < count; i++) {
    const [width, height] = SIZES[Math.floor(rng() * SIZES.length)];
    const photoSeed = Math.floor(rng() * 2 ** 31);
    photos.push({ width, height, render: (targetWidth) => drawPhoto(photoSeed, width, height, targetWidth) });
  }
  return photos;
}

function drawPhoto(seed: number, width: number, height: number, targetWidth: number): HTMLCanvasElement {
  const scale = targetWidth / width;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D 캔버스를 만들 수 없다');
  ctx.scale(scale, scale);
  const rng = createRng(seed);
  const kind = rng();
  if (kind < 0.4) drawLandscape(ctx, width, height, rng);
  else if (kind < 0.75) drawPaper(ctx, width, height, rng);
  else drawWhiteboard(ctx, width, height, rng);
  addGrain(ctx, width, height, rng);
  return canvas;
}

function drawLandscape(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number): void {
  const hue = range(rng, 180, 360);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, `hsl(${hue}, 45%, ${range(rng, 18, 40)}%)`);
  sky.addColorStop(1, `hsl(${(hue + 40) % 360}, 55%, ${range(rng, 55, 75)}%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = `hsla(${(hue + 60) % 360}, 80%, 85%, 0.9)`;
  ctx.beginPath();
  ctx.arc(range(rng, 0.2, 0.8) * w, range(rng, 0.2, 0.5) * h, range(rng, 0.05, 0.12) * Math.min(w, h), 0, Math.PI * 2);
  ctx.fill();

  const horizon = range(rng, 0.55, 0.75) * h;
  ctx.fillStyle = `hsl(${hue}, 25%, 8%)`;
  let x = 0;
  while (x < w) {
    const bw = range(rng, 0.04, 0.12) * w;
    const bh = range(rng, 0.05, 0.35) * h;
    ctx.fillRect(x, horizon - bh, bw + 1, h - horizon + bh);
    x += bw;
  }
}

function drawPaper(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number): void {
  ctx.fillStyle = `hsl(${range(rng, 20, 40)}, 12%, ${range(rng, 22, 32)}%)`;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(range(rng, -0.12, 0.12));
  const pw = w * 0.78;
  const ph = h * 0.82;
  ctx.fillStyle = `hsl(48, 40%, ${range(rng, 86, 93)}%)`;
  ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
  ctx.strokeStyle = 'rgba(80, 120, 200, 0.35)';
  ctx.lineWidth = 1;
  const gap = ph / 18;
  for (let y = -ph / 2 + gap * 2; y < ph / 2; y += gap) {
    ctx.beginPath();
    ctx.moveTo(-pw / 2, y);
    ctx.lineTo(pw / 2, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(30, 30, 60, 0.75)';
  ctx.lineWidth = 2;
  for (let y = -ph / 2 + gap * 2; y < ph / 2 - gap; y += gap) {
    if (rng() < 0.2) continue;
    let x = -pw / 2 + pw * 0.08;
    const end = -pw / 2 + pw * range(rng, 0.45, 0.92);
    ctx.beginPath();
    ctx.moveTo(x, y - gap * 0.3);
    while (x < end) {
      x += range(rng, 4, 10);
      ctx.lineTo(x, y - gap * range(rng, 0.15, 0.6));
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawWhiteboard(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number): void {
  ctx.fillStyle = `hsl(200, 8%, ${range(rng, 80, 90)}%)`;
  ctx.fillRect(0, 0, w, h);
  const colors = ['#1f4fbf', '#c3262f', '#1d7a3d', '#202020'];
  const strokes = 4 + Math.floor(rng() * 6);
  for (let i = 0; i < strokes; i++) {
    ctx.strokeStyle = colors[Math.floor(rng() * colors.length)];
    ctx.lineWidth = range(rng, 3, 6);
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (rng() < 0.35) {
      const cx = range(rng, 0.2, 0.8) * w;
      const cy = range(rng, 0.2, 0.8) * h;
      ctx.ellipse(cx, cy, range(rng, 0.06, 0.18) * w, range(rng, 0.05, 0.14) * h, 0, 0, Math.PI * 2);
    } else {
      let x = range(rng, 0.05, 0.5) * w;
      let y = range(rng, 0.1, 0.9) * h;
      ctx.moveTo(x, y);
      const segs = 6 + Math.floor(rng() * 10);
      for (let s = 0; s < segs; s++) {
        x += range(rng, 6, 24);
        y += range(rng, -10, 10);
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
}

function addGrain(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number): void {
  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(0,0,0,${range(rng, 0.25, 0.45)})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}
