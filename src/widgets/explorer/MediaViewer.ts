import { tuning } from '../../config';
import { decodeText, formatSize } from './explorerModel';
import type { FileEntry, FileSource } from './fileSource';

export interface MediaViewerOptions {
  /** 닫기 단추·Esc·뒤로로 닫혔을 때. last 는 닫을 때 보던 파일이다 */
  onClose?: (last: FileEntry | null) => void;
}

/**
 * 전체 화면 2D 뷰어: 사진·동영상·음악·텍스트를 열고, 같은 폴더의 다음·이전 파일로 넘긴다(방향키, 사진은 가로 끌기).
 * 음악이 끝나면 같은 폴더의 다음 음악을 이어 튼다. 파일은 열 때마다 원본에서 읽고, 닫거나 넘기면 객체 URL 을 돌려준다.
 */
export class MediaViewer {
  readonly root: HTMLDivElement;
  private readonly title: HTMLSpanElement;
  private readonly counter: HTMLSpanElement;
  private readonly stage: HTMLDivElement;
  private readonly prevButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private source: FileSource | null = null;
  private items: readonly FileEntry[] = [];
  private index = 0;
  private url: string | null = null;
  /** 넘기는 사이 늦게 끝난 읽기를 버리는 번호 */
  private generation = 0;
  private swipeX: number | null = null;

  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.open) return;
    if (e.key === 'Escape') this.close();
    else if (e.key === 'ArrowRight') this.step(1);
    else if (e.key === 'ArrowLeft') this.step(-1);
    else return;
    e.preventDefault();
  };

  constructor(private readonly options: MediaViewerOptions = {}) {
    this.root = document.createElement('div');
    this.root.className = 'viewer';
    this.root.hidden = true;
    this.root.style.setProperty('--viewer-audio', tuning.explorer.kindColors.audio);
    const head = document.createElement('header');
    head.className = 'viewer-head';
    this.title = document.createElement('span');
    this.title.className = 'viewer-title';
    this.counter = document.createElement('span');
    this.counter.className = 'viewer-count';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'explorer-button';
    close.textContent = '닫기';
    close.addEventListener('click', () => this.close());
    head.append(this.title, this.counter, close);

    this.stage = document.createElement('div');
    this.stage.className = 'viewer-stage';
    this.stage.addEventListener('pointerdown', (e) => {
      if (this.current?.kind === 'image') this.swipeX = e.clientX;
    });
    this.stage.addEventListener('pointerup', (e) => {
      if (this.swipeX === null) return;
      const dx = e.clientX - this.swipeX;
      this.swipeX = null;
      if (Math.abs(dx) >= tuning.explorer.swipePx) this.step(dx < 0 ? 1 : -1);
    });

    this.prevButton = this.navButton('viewer-prev', '‹', -1);
    this.nextButton = this.navButton('viewer-next', '›', 1);
    this.root.append(head, this.stage, this.prevButton, this.nextButton);
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.onKey);
  }

  private navButton(className: string, text: string, dir: number): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `viewer-nav ${className}`;
    b.textContent = text;
    b.addEventListener('click', () => this.step(dir));
    return b;
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  get current(): FileEntry | null {
    return this.open ? this.items[this.index] ?? null : null;
  }

  /** items 가운데 index 번째를 연다. items 는 같은 폴더의 뷰어로 여는 파일들이다 */
  show(source: FileSource, items: readonly FileEntry[], index: number): void {
    this.source = source;
    this.items = items;
    this.root.hidden = false;
    document.body.classList.add('viewer-open');
    this.load(Math.max(0, Math.min(items.length - 1, index)));
  }

  close(): void {
    if (!this.open) return;
    const last = this.current;
    this.clear();
    this.root.hidden = true;
    document.body.classList.remove('viewer-open');
    this.options.onClose?.(last);
  }

  /** 다음(+1)·이전(−1) 파일로 넘긴다. 끝에서는 멈춘다 */
  step(dir: number): void {
    const next = this.index + dir;
    if (next < 0 || next >= this.items.length) return;
    this.load(next);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.clear();
    this.root.remove();
    document.body.classList.remove('viewer-open');
  }

  private clear(): void {
    this.generation++;
    for (const m of this.stage.querySelectorAll('video, audio')) (m as HTMLMediaElement).pause();
    this.stage.replaceChildren();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  private load(index: number): void {
    this.clear();
    this.index = index;
    const entry = this.items[index];
    this.title.textContent = entry.name;
    this.counter.textContent = `${index + 1} / ${this.items.length}`;
    this.prevButton.disabled = index === 0;
    this.nextButton.disabled = index === this.items.length - 1;
    this.root.dataset.kind = entry.kind;
    const gen = this.generation;
    const source = this.source;
    if (!source) return;
    source
      .file(entry.path)
      .then((file) => (gen === this.generation ? this.render(entry, file) : undefined))
      .catch(() => {
        if (gen === this.generation) this.message('파일을 읽을 수 없다');
      });
  }

  private render(entry: FileEntry, file: File): void {
    if (entry.kind === 'text') {
      void this.renderText(file);
      return;
    }
    this.url = URL.createObjectURL(file);
    if (entry.kind === 'image') {
      const img = document.createElement('img');
      img.className = 'viewer-image';
      img.alt = entry.name;
      img.draggable = false;
      img.src = this.url;
      img.addEventListener('error', () => this.message('이 사진 형식은 열 수 없다'));
      this.stage.append(img);
    } else if (entry.kind === 'video') {
      const video = document.createElement('video');
      video.className = 'viewer-video';
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.src = this.url;
      video.addEventListener('error', () => this.message('이 동영상 형식은 브라우저에서 열 수 없다'));
      this.stage.append(video);
    } else if (entry.kind === 'audio') {
      const box = document.createElement('div');
      box.className = 'viewer-audio';
      const name = document.createElement('p');
      name.className = 'viewer-audio-name';
      name.textContent = entry.name;
      const meta = document.createElement('p');
      meta.className = 'viewer-audio-meta';
      meta.textContent = formatSize(entry.size);
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.autoplay = true;
      audio.src = this.url;
      audio.addEventListener('ended', () => this.playNextAudio());
      audio.addEventListener('error', () => this.message('이 음악 형식은 열 수 없다'));
      box.append(name, meta, audio);
      this.stage.append(box);
    }
  }

  private async renderText(file: File): Promise<void> {
    const gen = this.generation;
    const max = tuning.explorer.textMaxBytes;
    const truncated = file.size > max;
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.slice(0, max).arrayBuffer());
    } catch {
      if (gen === this.generation) this.message('파일을 읽을 수 없다');
      return;
    }
    if (gen !== this.generation) return;
    const { text, encoding } = decodeText(bytes, truncated);
    const pre = document.createElement('pre');
    pre.className = 'viewer-text';
    pre.textContent = text;
    const note = document.createElement('p');
    note.className = 'viewer-text-note';
    note.textContent = `${encoding.toUpperCase()} · ${formatSize(file.size)}${truncated ? ` · 앞 ${formatSize(max)}만 표시` : ''}`;
    this.stage.append(note, pre);
  }

  /** 같은 폴더에서 지금 다음에 오는 음악으로 넘긴다. 없으면 멈춘다 */
  private playNextAudio(): void {
    for (let i = this.index + 1; i < this.items.length; i++) {
      if (this.items[i].kind === 'audio') {
        this.load(i);
        return;
      }
    }
  }

  private message(text: string): void {
    this.stage.replaceChildren();
    const p = document.createElement('p');
    p.className = 'viewer-message';
    p.textContent = text;
    this.stage.append(p);
  }
}
