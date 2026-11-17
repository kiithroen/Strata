import { tuning } from '../../config';
import { TaskQueue } from '../../core/taskQueue';
import { breadcrumbs, extensionOf, formatSize, isViewable, parentPath, sortEntries, visibleEntries, type SortKey } from './explorerModel';
import type { FileEntry, FileSource } from './fileSource';
import { MediaViewer } from './MediaViewer';

export interface ExplorerViewOptions {
  /** 폴더 열기 단추. 원본을 골라 넘기거나 취소하면 null 을 낸다 */
  pickSource: () => Promise<FileSource | null>;
  /** 기억해 둔 폴더가 있으면 그 이름과 다시 여는 함수 */
  recent?: () => Promise<{ name: string; reopen: () => Promise<FileSource | null> } | null>;
  /** 원본을 새로 열었을 때(최근 폴더 기억 등) */
  onSource?: (source: FileSource) => void;
  /** 지금 폴더(하위 폴더 포함)를 3D 은하로 보는 단추. 없으면 단추를 숨긴다. progress 로 읽는 진행을 상태 줄에 보인다 */
  showInCosmos?: (source: FileSource, dir: string, progress: (text: string) => void) => Promise<string>;
}

interface HistoryState {
  explorer: true;
  path: string;
}

/** 탐색기가 쌓은 방문 기록 상태인지 */
export function isExplorerState(state: unknown): state is HistoryState {
  return typeof state === 'object' && state !== null && (state as { explorer?: unknown }).explorer === true;
}

const SORT_LABEL: Record<SortKey, string> = { name: '이름순', modified: '최근 수정순', size: '큰 파일순' };

/**
 * 로컬 탐색기 화면(2D): 경로 막대, 폴더·파일 썸네일 격자, 상태 줄. 폴더를 누르면 들어가고 파일을 누르면 뷰어로 연다.
 * 폴더를 옮길 때마다 방문 기록을 쌓아 브라우저·안드로이드 뒤로가 위 폴더로 간다. 사진 썸네일은 보이는 칸만 디코딩 큐로 만든다.
 */
export class ExplorerView {
  readonly root: HTMLDivElement;
  readonly viewer: MediaViewer;
  private readonly path: HTMLElement;
  private readonly upButton: HTMLButtonElement;
  private readonly cosmosButton: HTMLButtonElement;
  private readonly sortSelect: HTMLSelectElement;
  private readonly body: HTMLDivElement;
  private readonly status: HTMLElement;
  private readonly queue = new TaskQueue(tuning.explorer.decodeConcurrency);
  private readonly observer: IntersectionObserver;
  private readonly pending = new Map<Element, FileEntry>();
  private source: FileSource | null = null;
  private dir = '';
  private entries: FileEntry[] = [];
  private sortKey: SortKey = 'name';
  private generation = 0;
  private viewerPushed = false;

  private readonly onPop = (e: PopStateEvent) => {
    if (this.viewer.open) {
      this.viewerPushed = false;
      this.viewer.close();
      return;
    }
    // 뷰어를 닫으며 되돌린 기록은 지금 폴더라 다시 읽지 않는다
    if (isExplorerState(e.state) && this.source && e.state.path !== this.dir) void this.navigate(e.state.path, false);
  };

  private readonly onKey = (e: KeyboardEvent) => {
    if (this.viewer.open || !this.source) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) {
      e.preventDefault();
      this.up();
    }
  };

  constructor(private readonly options: ExplorerViewOptions) {
    this.root = document.createElement('div');
    this.root.className = 'explorer';
    this.root.style.setProperty('--explorer-col', `${tuning.explorer.tileMinPx}px`);
    for (const [kind, color] of Object.entries(tuning.explorer.kindColors)) this.root.style.setProperty(`--kind-${kind}`, color);

    const head = document.createElement('header');
    head.className = 'explorer-head';
    this.upButton = this.button('↑ 위로', () => this.up());
    this.path = document.createElement('nav');
    this.path.className = 'explorer-path';
    const actions = document.createElement('div');
    actions.className = 'explorer-actions';
    this.sortSelect = document.createElement('select');
    this.sortSelect.className = 'explorer-sort';
    for (const key of Object.keys(SORT_LABEL) as SortKey[]) {
      const o = document.createElement('option');
      o.value = key;
      o.textContent = SORT_LABEL[key];
      this.sortSelect.append(o);
    }
    this.sortSelect.addEventListener('change', () => {
      this.sortKey = this.sortSelect.value as SortKey;
      this.renderEntries();
    });
    this.cosmosButton = this.button('은하로 보기', () => void this.openCosmos());
    this.cosmosButton.hidden = !options.showInCosmos;
    const openButton = this.button('폴더 열기', () => void this.pick());
    actions.append(this.sortSelect, this.cosmosButton, openButton);
    head.append(this.upButton, this.path, actions);

    this.body = document.createElement('div');
    this.body.className = 'explorer-body';
    this.status = document.createElement('footer');
    this.status.className = 'explorer-status';
    this.root.append(head, this.body, this.status);
    document.body.appendChild(this.root);
    document.body.classList.add('explorer-open');

    this.viewer = new MediaViewer({
      onClose: () => {
        if (this.viewerPushed) {
          this.viewerPushed = false;
          history.back();
        }
      },
    });
    this.observer = new IntersectionObserver((records) => this.onVisible(records), {
      root: this.body,
      rootMargin: `${tuning.explorer.preloadPx}px 0px`,
    });
    window.addEventListener('popstate', this.onPop);
    window.addEventListener('keydown', this.onKey);
    void this.renderEmpty();
  }

  private button(text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'explorer-button';
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }

  /** 지금 원본·폴더·보이는 항목 수(확인 스크립트용) */
  state(): { source: string | null; dir: string; entries: number; thumbsPending: number; viewer: FileEntry | null } {
    return { source: this.source?.name ?? null, dir: this.dir, entries: this.entries.length, thumbsPending: this.pending.size, viewer: this.viewer.current };
  }

  /** 원본을 열고 dir 폴더(기본은 원본 폴더)로 간다 */
  async setSource(source: FileSource, dir = ''): Promise<void> {
    this.source = source;
    this.options.onSource?.(source);
    history.replaceState({ explorer: true, path: dir } satisfies HistoryState, '');
    await this.navigate(dir, false);
  }

  /** 폴더로 간다. push 면 방문 기록을 쌓는다 */
  async navigate(path: string, push = true): Promise<void> {
    const source = this.source;
    if (!source) return;
    const gen = ++this.generation;
    let list: FileEntry[];
    try {
      list = await source.list(path);
    } catch {
      if (gen === this.generation) this.setStatus('폴더를 읽을 수 없다');
      return;
    }
    if (gen !== this.generation) return;
    this.dir = path;
    this.entries = list;
    if (push) history.pushState({ explorer: true, path } satisfies HistoryState, '');
    this.renderPath();
    this.renderEntries();
    this.body.scrollTop = 0;
  }

  up(): void {
    const parent = parentPath(this.dir);
    if (parent !== null) void this.navigate(parent);
  }

  /** 지금 폴더의 path 파일을 뷰어로 연다. 같은 폴더의 뷰어로 여는 파일을 지금 정렬 순서로 넘긴다 */
  openFile(path: string): void {
    const source = this.source;
    if (!source) return;
    const items = sortEntries(this.entries, this.sortKey).filter((e) => isViewable(e.kind));
    const index = items.findIndex((e) => e.path === path);
    if (index < 0) return;
    if (!this.viewer.open) {
      history.pushState({ explorer: true, path: this.dir, viewer: true }, '');
      this.viewerPushed = true;
    }
    this.viewer.show(source, items, index);
  }

  dispose(): void {
    window.removeEventListener('popstate', this.onPop);
    window.removeEventListener('keydown', this.onKey);
    this.reset();
    this.viewer.dispose();
    this.root.remove();
    document.body.classList.remove('explorer-open');
  }

  private async pick(): Promise<void> {
    const source = await this.options.pickSource();
    if (source) await this.setSource(source);
  }

  private async openCosmos(): Promise<void> {
    const source = this.source;
    const show = this.options.showInCosmos;
    if (!source || !show) return;
    this.cosmosButton.disabled = true;
    try {
      this.setStatus(await show(source, this.dir, (text) => this.setStatus(text)));
    } finally {
      this.cosmosButton.disabled = false;
    }
  }

  private reset(): void {
    this.generation++;
    this.queue.clear();
    this.observer.disconnect();
    this.pending.clear();
  }

  private async renderEmpty(): Promise<void> {
    this.renderPath();
    const box = document.createElement('div');
    box.className = 'explorer-empty';
    const lead = document.createElement('p');
    lead.textContent = '훑어볼 폴더를 연다. 사진·동영상·음악·텍스트를 바로 볼 수 있다.';
    box.append(lead, this.button('폴더 열기', () => void this.pick()));
    this.body.replaceChildren(box);
    this.setStatus('');
    const recent = await this.options.recent?.();
    if (recent && !this.source) {
      box.append(
        this.button(`최근 폴더 다시 열기: ${recent.name}`, () => {
          void recent.reopen().then((s) => (s ? this.setSource(s) : undefined));
        }),
      );
    }
  }

  private renderPath(): void {
    const crumbs = this.source ? breadcrumbs(this.source.name, this.dir) : [];
    this.path.replaceChildren(
      ...crumbs.flatMap((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'explorer-crumb';
        b.textContent = c.name;
        if (i === crumbs.length - 1) b.classList.add('current');
        else b.addEventListener('click', () => void this.navigate(c.path));
        if (i === 0) return [b];
        const sep = document.createElement('span');
        sep.className = 'explorer-sep';
        sep.textContent = '/';
        return [sep, b];
      }),
    );
    this.upButton.disabled = parentPath(this.dir) === null || !this.source;
    // 경로가 넘치면 지금 폴더(끝)가 보이게 한다
    this.path.scrollLeft = this.path.scrollWidth;
  }

  private renderEntries(): void {
    this.reset();
    // 폴더와 열 수 있는 파일만 보인다
    const { shown, hidden } = visibleEntries(this.entries);
    const sorted = sortEntries(shown, this.sortKey);
    const grid = document.createElement('div');
    grid.className = 'explorer-grid';
    for (const e of sorted) grid.append(this.tile(e));
    if (sorted.length === 0) {
      const p = document.createElement('p');
      p.className = 'explorer-empty-note';
      p.textContent = hidden > 0 ? `열 수 있는 파일이 없다 (숨긴 파일 ${hidden}개)` : '빈 폴더다';
      this.body.replaceChildren(p);
    } else this.body.replaceChildren(grid);
    const folders = sorted.filter((e) => e.kind === 'folder').length;
    // 하위 폴더나 열 수 있는 파일이 있으면 은하로 볼 수 있다
    this.cosmosButton.disabled = sorted.length === 0;
    const size = sorted.reduce((s, e) => s + e.size, 0);
    this.setStatus(`폴더 ${folders} · 파일 ${sorted.length - folders} · ${formatSize(size)}${hidden > 0 ? ` · 숨긴 파일 ${hidden}` : ''}`);
  }

  private tile(e: FileEntry): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'explorer-tile';
    b.dataset.kind = e.kind;
    b.title = e.name;
    const thumb = document.createElement('div');
    thumb.className = 'explorer-thumb';
    if (e.kind === 'folder') {
      const icon = document.createElement('span');
      icon.className = 'explorer-folder-icon';
      thumb.append(icon);
    } else {
      const ext = document.createElement('span');
      ext.className = 'explorer-ext';
      ext.textContent = (extensionOf(e.name) || e.kind).slice(0, 5).toUpperCase();
      thumb.append(ext);
    }
    if (e.kind === 'image') {
      this.pending.set(thumb, e);
      this.observer.observe(thumb);
    }
    const name = document.createElement('span');
    name.className = 'explorer-name';
    name.textContent = e.name;
    const meta = document.createElement('span');
    meta.className = 'explorer-meta';
    meta.textContent = e.kind === 'folder' ? '폴더' : formatSize(e.size);
    b.append(thumb, name, meta);
    b.addEventListener('click', () => {
      if (e.kind === 'folder') void this.navigate(e.path);
      else if (isViewable(e.kind)) this.openFile(e.path);
    });
    return b;
  }

  private onVisible(records: IntersectionObserverEntry[]): void {
    for (const r of records) {
      if (!r.isIntersecting) continue;
      const entry = this.pending.get(r.target);
      if (!entry) continue;
      this.pending.delete(r.target);
      this.observer.unobserve(r.target);
      void this.loadThumb(r.target as HTMLElement, entry);
    }
  }

  private async loadThumb(thumb: HTMLElement, entry: FileEntry): Promise<void> {
    const source = this.source;
    if (!source) return;
    const gen = this.generation;
    const width = Math.round(tuning.explorer.thumbPx * Math.min(2, window.devicePixelRatio || 1));
    try {
      const bitmap = await this.queue.run(async () => {
        if (gen !== this.generation) throw new Error('stale');
        const file = await source.file(entry.path);
        return createImageBitmap(file, { resizeWidth: width, resizeQuality: 'medium' });
      });
      if (gen !== this.generation) {
        bitmap.close();
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      bitmap.close();
      canvas.className = 'explorer-thumb-image';
      thumb.append(canvas);
      thumb.classList.add('loaded');
    } catch {
      // 디코딩할 수 없는 사진(SVG·손상 등)은 확장자 글자만 둔다
    }
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
  }
}
