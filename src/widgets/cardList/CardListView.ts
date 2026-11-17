import { tuning } from '../../config';
import { formatStamp } from '../../core/format';
import { holoTint, releasePhoto, type PhotoSource } from '../noteCard/cardTexture';
import { countItems, photoBoxRatio, type CardListItem, type CardListSection } from './cardListModel';

export interface CardListOptions {
  /** 닫기 단추 글자 */
  closeLabel: string;
  onClose: () => void;
}

/**
 * 2D 카드 목록: 노트를 읽기 좋은 HTML 카드로 묶음별로 펼친 화면. 3D 화면 위를 덮는다.
 * 사진은 화면 가까이 왔을 때만 칸 폭에 맞춰 그려 받는다(PhotoSource.render). 닫으면 늦게 온 사진은 버린다.
 */
export class CardListView {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLSpanElement;
  private readonly body: HTMLDivElement;
  private readonly observer: IntersectionObserver;
  private readonly pending = new Map<Element, PhotoSource>();
  /** 보여 줄 때마다 늘린다. 닫힌 뒤 도착한 사진을 가려낸다 */
  private generation = 0;

  constructor(private readonly options: CardListOptions) {
    const c = tuning.cardList;
    this.root = el('div', 'card-list');
    this.root.hidden = true;
    this.root.style.setProperty('--card-list-col', `${c.minColumnPx}px`);
    const head = el('header', 'card-list-head');
    const close = el('button', 'card-list-close');
    close.type = 'button';
    close.textContent = options.closeLabel;
    close.addEventListener('click', () => this.options.onClose());
    this.title = el('span', 'card-list-title');
    head.append(close, this.title);
    this.body = el('div', 'card-list-body');
    this.root.append(head, this.body);
    document.body.appendChild(this.root);
    this.observer = new IntersectionObserver((entries) => this.onIntersect(entries), {
      root: this.body,
      rootMargin: `${c.preloadPx}px 0px`,
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** 지금 목록에 있는 카드 수와 사진을 아직 받지 않은 칸 수 */
  stats(): { cards: number; waitingPhotos: number } {
    return { cards: this.body.querySelectorAll('.card-item').length, waitingPhotos: this.pending.size };
  }

  /** focusKey 묶음이 맨 위에 오도록 펼친다 */
  show(sections: readonly CardListSection[], focusKey?: string): void {
    this.reset();
    const gen = ++this.generation;
    this.title.textContent = `노트 ${countItems(sections)}장`;
    let focusEl: HTMLElement | null = null;
    for (const section of sections) {
      const sec = el('section', 'card-list-section');
      const h = el('h2', 'card-list-heading');
      h.textContent = section.label;
      const count = el('span', 'card-list-count');
      count.textContent = `${section.items.length}장`;
      h.append(count);
      const grid = el('div', 'card-list-grid');
      for (const item of section.items) grid.append(this.card(item, gen));
      sec.append(h, grid);
      this.body.append(sec);
      if (section.key === focusKey) focusEl = sec;
    }
    this.root.hidden = false;
    this.body.scrollTop = focusEl ? focusEl.offsetTop : 0;
  }

  hide(): void {
    if (!this.open) return;
    this.root.hidden = true;
    this.reset();
  }

  dispose(): void {
    this.reset();
    this.observer.disconnect();
    this.root.remove();
  }

  private reset(): void {
    this.generation++;
    this.observer.disconnect();
    this.pending.clear();
    this.body.replaceChildren();
  }

  private card(item: CardListItem, gen: number): HTMLElement {
    const card = el('article', `card-item card-${item.kind}`);
    card.style.setProperty('--card-tint', holoTint(item));
    if (item.photo) {
      const box = el('div', 'card-item-photo');
      box.style.aspectRatio = `1 / ${photoBoxRatio(item.photo, tuning.cardList.photoAspect)}`;
      const canvas = el('canvas', 'card-item-canvas');
      canvas.dataset.gen = String(gen);
      box.append(canvas);
      card.append(box);
      this.pending.set(canvas, item.photo);
      this.observer.observe(canvas);
    }
    if (item.title) {
      const t = el('h3', 'card-item-title');
      t.textContent = item.title;
      card.append(t);
    }
    if (item.body) {
      const b = el('p', 'card-item-body');
      b.textContent = item.body;
      card.append(b);
    }
    const foot = el('footer', 'card-item-foot');
    const time = el('time', 'card-item-time');
    time.textContent = formatStamp(new Date(item.time));
    foot.append(time);
    for (const tag of item.tags) {
      const t = el('span', 'card-item-tag');
      t.textContent = `#${tag}`;
      foot.append(t);
    }
    card.append(foot);
    return card;
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const canvas = entry.target as HTMLCanvasElement;
      const photo = this.pending.get(canvas);
      if (!photo) continue;
      this.pending.delete(canvas);
      this.observer.unobserve(canvas);
      this.loadPhoto(canvas, photo, Number(canvas.dataset.gen));
    }
  }

  private loadPhoto(canvas: HTMLCanvasElement, photo: PhotoSource, gen: number): void {
    const width = Math.max(1, Math.round(canvas.clientWidth * window.devicePixelRatio));
    const draw = (image: CanvasImageSource | null) => {
      if (!image) return;
      if (gen === this.generation) {
        const box = canvas.parentElement;
        const height = Math.max(1, Math.round((box?.clientHeight ?? canvas.clientHeight) * window.devicePixelRatio));
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) drawCover(ctx, image, photo, width, height);
        canvas.classList.add('loaded');
      }
      releasePhoto(image);
    };
    const result = photo.render(width);
    if (result instanceof Promise) result.then(draw, () => undefined);
    else draw(result);
  }
}

/** 칸을 꽉 채우도록 가운데를 잘라 그린다 */
function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, photo: PhotoSource, w: number, h: number): void {
  const iw = 'width' in image && typeof image.width === 'number' ? image.width : photo.width;
  const ih = 'height' in image && typeof image.height === 'number' ? image.height : photo.height;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}
