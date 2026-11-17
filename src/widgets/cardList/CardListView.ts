import { tuning } from '../../config';
import { formatStamp } from '../../core/format';
import { holoTint, releasePhoto, type PhotoSource } from '../noteCard/cardTexture';
import { countItems, photoBoxRatio, type CardListItem, type CardListSection } from './cardListModel';

/** 카드 보기 방식: 3D 공간(목록 화면은 머리만 남기고 뒤의 3D 화면을 보인다) 또는 2D 목록 */
export type CardViewMode = 'space' | 'list';

/** 공간 모드 머리 아래에 적는 지금 훑는 층: 층 이름, 몇째 층인지(0부터)와 층 수, 그 층의 카드 수, 태그 낱말(많이 쓰인 것부터, 쓰인 정도 0~1) */
export interface CardLayerInfo {
  label: string;
  index: number;
  total: number;
  count: number;
  words: readonly { text: string; weight: number }[];
}

export interface CardListOptions {
  /** 닫기 단추 글자 */
  closeLabel: string;
  onClose: () => void;
  /** 있으면 머리에 공간/목록 토글을 띄우고, 바꿀 때 부른다 */
  onModeChange?: (mode: CardViewMode) => void;
  /** 있으면 카드를 누를 때 그 노트 번호로 부른다 */
  onOpen?: (id: string) => void;
  /** 있으면 머리에 검색 칸을 띄우고, 글을 고칠 때마다 검색어로 부른다. empty 는 보여 줄 카드가 없을 때의 안내 글이다 */
  search?: { placeholder: string; empty: (query: string) => string; onQuery: (query: string) => void };
}

/**
 * 2D 카드 목록: 노트를 읽기 좋은 HTML 카드로 묶음별로 펼친 화면. 3D 화면 위를 덮는다.
 * 토글이 있으면 공간 모드에서는 머리(닫기·장수·토글)만 남고 목록은 숨어 뒤의 3D 카드 공간이 보인다.
 * 사진은 화면 가까이 왔을 때만 칸 폭에 맞춰 그려 받는다(PhotoSource.render). 닫으면 늦게 온 사진은 버린다.
 */
export class CardListView {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLSpanElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly searchInput: HTMLInputElement | null = null;
  private readonly layer: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly observer: IntersectionObserver;
  private readonly pending = new Map<Element, PhotoSource>();
  /** 보여 줄 때마다 늘린다. 닫힌 뒤 도착한 사진을 가려낸다 */
  private generation = 0;
  private count = 0;
  private current: CardViewMode = 'list';
  private focusSection: HTMLElement | null = null;
  private readonly toggles = new Map<CardViewMode, HTMLButtonElement>();

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
    this.closeButton = close;
    this.title = el('span', 'card-list-title');
    head.append(close);
    const search = options.search;
    if (search) {
      const input = el('input', 'card-list-search');
      input.type = 'search';
      input.placeholder = search.placeholder;
      input.enterKeyHint = 'search';
      input.addEventListener('input', () => search.onQuery(input.value));
      this.searchInput = input;
      this.root.classList.add('searching');
      head.append(input);
    }
    head.append(this.title);
    if (options.onModeChange) {
      const toggle = el('div', 'card-list-toggle');
      for (const [mode, text] of [
        ['space', '공간'],
        ['list', '목록'],
      ] as const) {
        const b = el('button', 'card-list-mode');
        b.type = 'button';
        b.textContent = text;
        b.addEventListener('click', () => {
          if (mode === this.current) return;
          this.setMode(mode);
          this.options.onModeChange?.(mode);
        });
        this.toggles.set(mode, b);
        toggle.append(b);
      }
      head.append(toggle);
      this.current = 'space';
    }
    this.applyMode();
    this.layer = el('div', 'card-list-layer');
    this.layer.hidden = true;
    this.body = el('div', 'card-list-body');
    this.root.append(head, this.layer, this.body);
    document.body.appendChild(this.root);
    this.observer = new IntersectionObserver((entries) => this.onIntersect(entries), {
      root: this.body,
      rootMargin: `${c.preloadPx}px 0px`,
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setCloseLabel(text: string): void {
    this.closeButton.textContent = text;
  }

  /** 검색 칸의 글. 검색 칸이 없으면 빈 글 */
  get query(): string {
    return this.searchInput?.value ?? '';
  }

  /** 검색 칸에 글을 넣고 검색어로 부른다(확인 스크립트용) */
  setQuery(query: string): void {
    if (!this.searchInput) return;
    this.searchInput.value = query;
    this.options.search?.onQuery(query);
  }

  /** 검색 칸에 입력 초점을 둔다 */
  focusSearch(): void {
    this.searchInput?.focus();
  }

  get mode(): CardViewMode {
    return this.current;
  }

  /** 보기 방식을 바꾼다(onModeChange 는 부르지 않는다). 목록으로 바뀌면 보이는 칸의 사진을 받고 첫 전환이면 바라보는 층으로 스크롤한다 */
  setMode(mode: CardViewMode): void {
    this.current = mode;
    this.applyMode();
    this.scrollToFocus();
  }

  private applyMode(): void {
    this.root.classList.toggle('space', this.current === 'space');
    this.title.textContent = this.current === 'space' ? `노트 ${this.count}장 · 끌기: 앞뒤 이동` : `노트 ${this.count}장`;
    for (const [mode, b] of this.toggles) b.classList.toggle('active', mode === this.current);
  }

  private scrollToFocus(): void {
    if (this.current !== 'list' || !this.open) return;
    if (this.focusSection) {
      this.body.scrollTop = this.focusSection.offsetTop;
      this.focusSection = null;
    }
  }

  /** 지금 목록에 있는 카드 수와 사진을 아직 받지 않은 칸 수 */
  stats(): { cards: number; waitingPhotos: number } {
    return { cards: this.body.querySelectorAll('.card-item').length, waitingPhotos: this.pending.size };
  }

  /**
   * 공간 모드 머리 아래 줄에 지금 훑는 층의 이름과 태그를 적는다. null 이면 감춘다.
   * 낱말 크기는 cloud.px 범위, 색은 강조색에서 많이 쓰인 낱말일수록 흰색 쪽이다(워드 클라우드와 같은 규칙).
   */
  setLayer(info: CardLayerInfo | null): void {
    this.layer.replaceChildren();
    this.layer.hidden = info === null;
    if (!info) return;
    const c = tuning.cloud;
    const name = el('span', 'card-list-layer-name');
    name.textContent = info.label;
    const meta = el('span', 'card-list-layer-meta');
    meta.textContent = info.total > 1 ? `${info.index + 1}/${info.total} · ${info.count}장` : `${info.count}장`;
    const words = el('span', 'card-list-layer-words');
    for (const w of info.words) {
      const t = el('span', 'card-list-layer-word');
      t.textContent = w.text;
      t.style.fontSize = `${Math.round(c.px[0] + (c.px[1] - c.px[0]) * w.weight)}px`;
      t.style.color = `color-mix(in srgb, white ${Math.round(w.weight * 100)}%, var(--accent))`;
      t.style.opacity = String(c.alpha * (0.75 + 0.25 * w.weight));
      words.append(t);
    }
    this.layer.append(name, meta, words);
    // 층이 바뀔 때마다 살짝 나타나는 움직임을 다시 튼다
    this.layer.classList.remove('changed');
    void this.layer.offsetWidth;
    this.layer.classList.add('changed');
  }

  /** focusKey 묶음이 맨 위에 오도록 펼친다 */
  show(sections: readonly CardListSection[], focusKey?: string): void {
    this.reset();
    this.setLayer(null);
    const gen = ++this.generation;
    this.count = countItems(sections);
    this.applyMode();
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
    if (sections.length === 0 && this.options.search) {
      const p = el('p', 'card-list-empty');
      p.textContent = this.options.search.empty(this.query);
      this.body.append(p);
    }
    this.focusSection = focusEl;
    this.root.hidden = false;
    document.body.classList.add('card-view-open');
    this.body.scrollTop = 0;
    this.scrollToFocus();
  }

  hide(): void {
    if (!this.open) return;
    this.root.hidden = true;
    document.body.classList.remove('card-view-open');
    this.reset();
  }

  dispose(): void {
    document.body.classList.remove('card-view-open');
    this.reset();
    this.observer.disconnect();
    this.root.remove();
  }

  private reset(): void {
    this.generation++;
    this.focusSection = null;
    this.observer.disconnect();
    this.pending.clear();
    this.body.replaceChildren();
  }

  private card(item: CardListItem, gen: number): HTMLElement {
    const card = el('article', `card-item card-${item.kind}`);
    card.style.setProperty('--card-tint', holoTint(item));
    card.dataset.id = item.id;
    const onOpen = this.options.onOpen;
    if (onOpen) {
      card.classList.add('openable');
      card.addEventListener('click', () => {
        // 글을 끌어 고르는 중이면 열지 않는다
        if (window.getSelection()?.toString()) return;
        onOpen(item.id);
      });
    }
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
  if (iw <= 0 || ih <= 0) return;
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
