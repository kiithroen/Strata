import { tuning } from '../../config';
import { formatStamp } from '../../core/format';
import { TaskQueue } from '../../core/taskQueue';
import { gridLayout, moveCursor, scrollToShow, visibleRows, type GridKey, type GridLayout } from './explorerGrid';
import { breadcrumbs, extensionOf, formatSize, isViewable, parentPath, sortEntries, visibleEntries, type SortKey } from './explorerModel';
import type { FileEntry, FileSource } from './fileSource';
import { MediaViewer } from './MediaViewer';
import { imageThumb, thumbCache, thumbKey, thumbWidth, videoThumb, type Thumb } from './thumbnails';

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

/** 칸 모양: 썸네일 격자 또는 이름·크기·수정 시각 열의 목록 */
export type ViewMode = 'grid' | 'list';

interface Prefs {
  mode: ViewMode;
  sort: SortKey;
}

const PREFS_KEY = 'strata.explorer';

const GRID_KEYS = new Set<string>(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

/** 기기에 남긴 보기 방식과 정렬. 저장소를 못 쓰거나 값이 깨져 있으면 기본값이다 */
function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    return {
      mode: raw.mode === 'list' ? 'list' : 'grid',
      sort: raw.sort && raw.sort in SORT_LABEL ? raw.sort : 'name',
    };
  } catch {
    return { mode: 'grid', sort: 'name' };
  }
}

function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 저장하지 못하면 이번 실행에만 적용된다
  }
}

/** 목록 보기 머리 줄의 열: 누르면 그 열로 정렬한다 */
const LIST_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: '이름' },
  { key: 'size', label: '크기' },
  { key: 'modified', label: '수정 시각' },
];

/**
 * 로컬 탐색기 화면(2D): 경로 막대, 폴더·파일 썸네일 격자, 상태 줄. 폴더를 누르면 들어가고 파일을 누르면 뷰어로 연다.
 * 폴더를 옮길 때마다 방문 기록을 쌓아 브라우저·안드로이드 뒤로가 위 폴더로 간다. 격자는 화면 근처 줄의 칸만 만들고(가상 스크롤),
 * 사진·동영상 썸네일은 그 칸만 디코딩 큐로 만들어 썸네일 캐시에 둔다.
 */
export class ExplorerView {
  readonly root: HTMLDivElement;
  readonly viewer: MediaViewer;
  private readonly path: HTMLElement;
  private readonly upButton: HTMLButtonElement;
  private readonly cosmosButton: HTMLButtonElement;
  private readonly sortSelect: HTMLSelectElement;
  private readonly modeButton: HTMLButtonElement;
  private readonly listHead: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly spacer: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly status: HTMLElement;
  private readonly queue = new TaskQueue(tuning.explorer.decodeConcurrency);
  /** 동영상 장면은 미디어 디코더를 쥐므로 따로 적게 돌린다 */
  private readonly videoQueue = new TaskQueue(tuning.explorer.videoThumbConcurrency);
  /** 만드는 중인 썸네일(캐시 키 → 약속). 같은 칸이 다시 나타나도 한 번만 만든다 */
  private readonly inflight = new Map<string, Promise<Thumb>>();
  /** 지금 DOM 에 있는 칸(경로 → 칸) */
  private readonly rendered = new Map<string, HTMLButtonElement>();
  private readonly resizeObserver: ResizeObserver;
  private source: FileSource | null = null;
  private dir = '';
  private entries: FileEntry[] = [];
  /** 격자에 보이는 항목(정렬한 것) */
  private shown: FileEntry[] = [];
  private layout: GridLayout | null = null;
  private range = { first: -1, last: -1 };
  /** 키보드 커서가 있는 항목 번호(shown 기준). 없으면 -1 */
  private cursor = -1;
  private sortKey: SortKey;
  private mode: ViewMode;
  private generation = 0;
  private viewerPushed = false;

  private readonly onPop = (e: PopStateEvent) => {
    if (this.viewer.open) {
      this.viewerPushed = false;
      this.viewer.close();
      return;
    }
    // 뷰어를 닫으며 되돌린 기록은 지금 폴더라 다시 읽지 않는다. 위 폴더로 돌아오면 지나온 폴더에 커서를 둔다
    if (isExplorerState(e.state) && this.source && e.state.path !== this.dir) void this.navigate(e.state.path, false, this.dir);
  };

  private readonly onKey = (e: KeyboardEvent) => {
    if (this.viewer.open || !this.source) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) {
      e.preventDefault();
      this.up();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey || this.shown.length === 0 || !this.layout) return;
    if (GRID_KEYS.has(e.key)) {
      e.preventDefault();
      const layout = this.layout;
      // 커서가 없으면 화면 맨 위 칸에서 시작한다
      const start = this.cursor >= 0 ? this.cursor : -1;
      const pageRows = Math.max(1, Math.floor(this.viewportHeight() / layout.stride));
      const next = start < 0 ? Math.min(this.shown.length - 1, this.firstVisible()) : moveCursor(start, e.key as GridKey, layout.columns, this.shown.length, pageRows);
      this.setCursor(next, true);
    } else if (e.key === 'Enter' && this.cursor >= 0 && (!target || target.tagName !== 'BUTTON' || target.classList.contains('explorer-tile'))) {
      // 칸 단추에 초점이 있어도 단추의 클릭 대신 커서 칸을 연다
      e.preventDefault();
      this.activate(this.shown[this.cursor]);
    }
  };

  constructor(private readonly options: ExplorerViewOptions) {
    this.root = document.createElement('div');
    this.root.className = 'explorer';
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
    const prefs = loadPrefs();
    this.sortKey = prefs.sort;
    this.mode = prefs.mode;
    this.sortSelect.value = this.sortKey;
    this.sortSelect.addEventListener('change', () => this.setSort(this.sortSelect.value as SortKey));
    this.modeButton = this.button('', () => this.setMode(this.mode === 'grid' ? 'list' : 'grid'));
    this.cosmosButton = this.button('은하로 보기', () => void this.openCosmos());
    this.cosmosButton.hidden = !options.showInCosmos;
    const openButton = this.button('폴더 열기', () => void this.pick());
    actions.append(this.sortSelect, this.modeButton, this.cosmosButton, openButton);
    head.append(this.upButton, this.path, actions);

    this.body = document.createElement('div');
    this.body.className = 'explorer-body';
    this.body.addEventListener('scroll', () => this.renderRange(), { passive: true });
    this.spacer = document.createElement('div');
    this.spacer.className = 'explorer-spacer';
    this.grid = document.createElement('div');
    this.grid.className = 'explorer-grid';
    this.spacer.append(this.grid);
    this.listHead = document.createElement('div');
    this.listHead.className = 'explorer-list-head';
    for (const c of LIST_COLUMNS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.key = c.key;
      b.textContent = c.label;
      b.addEventListener('click', () => this.setSort(c.key));
      this.listHead.append(b);
    }
    this.listHead.prepend(document.createElement('span'));
    this.applyMode();
    this.status = document.createElement('footer');
    this.status.className = 'explorer-status';
    this.root.append(head, this.body, this.status);
    document.body.appendChild(this.root);
    document.body.classList.add('explorer-open');

    this.viewer = new MediaViewer({
      onClose: (last) => {
        // 보던 파일에 커서를 둔다
        if (last) this.setCursor(this.shown.findIndex((x) => x.path === last.path), true);
        if (this.viewerPushed) {
          this.viewerPushed = false;
          history.back();
        }
      },
    });
    this.resizeObserver = new ResizeObserver(() => this.relayout());
    this.resizeObserver.observe(this.body);
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
  state(): { source: string | null; dir: string; entries: number; mode: ViewMode; tiles: number; thumbsPending: number; viewer: FileEntry | null } {
    return {
      source: this.source?.name ?? null,
      dir: this.dir,
      entries: this.entries.length,
      mode: this.mode,
      tiles: this.rendered.size,
      thumbsPending: this.inflight.size,
      viewer: this.viewer.current,
    };
  }

  /** 원본을 열고 dir 폴더(기본은 원본 폴더)로 간다 */
  async setSource(source: FileSource, dir = ''): Promise<void> {
    this.source = source;
    this.options.onSource?.(source);
    history.replaceState({ explorer: true, path: dir } satisfies HistoryState, '');
    await this.navigate(dir, false);
  }

  /** 폴더로 간다. push 면 방문 기록을 쌓는다. focus 경로의 항목이 있으면 그 칸에 커서를 두고 보이게 스크롤한다 */
  async navigate(path: string, push = true, focus?: string): Promise<void> {
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
    this.body.scrollTop = 0;
    this.cursor = -1;
    this.renderEntries();
    if (focus !== undefined) this.setCursor(this.shown.findIndex((x) => x.path === focus), true);
  }

  up(): void {
    const parent = parentPath(this.dir);
    if (parent !== null) void this.navigate(parent, true, this.dir);
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

  /** 정렬을 바꾸고 다시 그린다 */
  setSort(key: SortKey): void {
    this.sortKey = key;
    this.sortSelect.value = key;
    this.savePrefs();
    this.applyMode();
    this.rerender();
  }

  /** 격자·목록 보기를 바꾸고 다시 그린다 */
  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.savePrefs();
    this.applyMode();
    this.rerender();
  }

  /** 정렬·보기 방식이 바뀌어 다시 그린다. 커서는 같은 항목에 남긴다 */
  private rerender(): void {
    if (!this.source) return;
    const focused = this.shown[this.cursor]?.path;
    this.renderEntries();
    this.cursor = -1;
    if (focused !== undefined) this.setCursor(this.shown.findIndex((x) => x.path === focused), true);
  }

  /** 커서를 index 칸에 둔다(-1 이면 없앤다). show 면 그 칸이 보이게 스크롤한다 */
  private setCursor(index: number, show: boolean): void {
    this.cursor = index;
    const layout = this.layout;
    if (index >= 0 && show && layout) {
      const headH = this.stickyHeight();
      const top = this.body.scrollTop - this.spacer.offsetTop + headH;
      const next = scrollToShow(layout, index, top, this.viewportHeight());
      // 첫 줄이면 위 여백까지 보이게 맨 위로 간다
      if (next !== top) this.body.scrollTop = next === 0 ? 0 : next + this.spacer.offsetTop - headH;
    }
    this.renderRange(true);
  }

  /** 목록 보기의 머리 줄처럼 스크롤해도 위에 남아 칸을 가리는 높이 */
  private stickyHeight(): number {
    return this.mode === 'list' && this.listHead.isConnected ? this.listHead.offsetHeight : 0;
  }

  /** 칸이 실제로 보이는 높이: 머리 줄과 아래 여백을 뺀다 */
  private viewportHeight(): number {
    const pad = parseFloat(getComputedStyle(this.body).paddingBottom) || 0;
    return Math.max(1, this.body.clientHeight - this.stickyHeight() - pad);
  }

  /** 화면에 처음 보이는 칸 번호 */
  private firstVisible(): number {
    const layout = this.layout;
    if (!layout) return 0;
    const top = this.body.scrollTop - this.spacer.offsetTop + this.stickyHeight();
    return Math.max(0, Math.ceil(top / layout.stride)) * layout.columns;
  }

  /** 폴더는 들어가고 뷰어로 여는 파일은 연다 */
  private activate(e: FileEntry): void {
    if (e.kind === 'folder') void this.navigate(e.path);
    else if (isViewable(e.kind)) this.openFile(e.path);
  }

  private savePrefs(): void {
    savePrefs({ mode: this.mode, sort: this.sortKey });
  }

  /** 보기 방식 단추 글과 목록 머리 줄의 정렬 표시를 지금 상태에 맞춘다 */
  private applyMode(): void {
    this.modeButton.textContent = this.mode === 'grid' ? '목록 보기' : '격자 보기';
    this.grid.classList.toggle('list', this.mode === 'list');
    for (const b of this.listHead.querySelectorAll<HTMLButtonElement>('button')) {
      const active = b.dataset.key === this.sortKey;
      b.classList.toggle('active', active);
      b.dataset.dir = active ? (this.sortKey === 'name' ? '↑' : '↓') : '';
    }
  }

  dispose(): void {
    window.removeEventListener('popstate', this.onPop);
    window.removeEventListener('keydown', this.onKey);
    this.reset();
    this.resizeObserver.disconnect();
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
    this.videoQueue.clear();
    this.inflight.clear();
    this.rendered.clear();
    this.grid.replaceChildren();
    this.range = { first: -1, last: -1 };
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
    this.shown = sortEntries(shown, this.sortKey);
    if (this.shown.length === 0) {
      const p = document.createElement('p');
      p.className = 'explorer-empty-note';
      p.textContent = hidden > 0 ? `열 수 있는 파일이 없다 (숨긴 파일 ${hidden}개)` : '빈 폴더다';
      this.body.replaceChildren(p);
    } else {
      if (this.mode === 'list') this.body.replaceChildren(this.listHead, this.spacer);
      else this.body.replaceChildren(this.spacer);
      this.relayout();
    }
    const folders = this.shown.filter((e) => e.kind === 'folder').length;
    // 하위 폴더나 열 수 있는 파일이 있으면 은하로 볼 수 있다
    this.cosmosButton.disabled = this.shown.length === 0;
    const size = this.shown.reduce((s, e) => s + e.size, 0);
    this.setStatus(`폴더 ${folders} · 파일 ${this.shown.length - folders} · ${formatSize(size)}${hidden > 0 ? ` · 숨긴 파일 ${hidden}` : ''}`);
  }

  /** 격자 폭이나 항목이 바뀌면 열 수·칸 높이를 다시 재고 보이는 줄을 다시 그린다 */
  private relayout(): void {
    if (!this.spacer.isConnected) return;
    const width = this.spacer.clientWidth;
    if (width === 0) return;
    const gap = parseFloat(getComputedStyle(this.grid).rowGap) || 0;
    // 목록 보기는 한 줄에 하나다
    const minTile = this.mode === 'list' ? Infinity : tuning.explorer.tileMinPx;
    const columns = gridLayout(width, minTile, gap, 0, 0).columns;
    const rowHeight = this.measureTile((width - gap * (columns - 1)) / columns);
    const layout = gridLayout(width, minTile, gap, rowHeight, this.shown.length);
    this.layout = layout;
    this.spacer.style.height = `${layout.height}px`;
    this.grid.style.gridTemplateColumns = `repeat(${layout.columns}, minmax(0, 1fr))`;
    this.renderRange(true);
  }

  /** 칸 하나의 높이(px): 보이지 않는 견본 칸을 tileWidth 폭으로 그려 잰다. 격자 칸 높이는 썸네일 비율과 글자 줄로 정해진다 */
  private measureTile(tileWidth: number): number {
    const probe = this.item({ name: 'probe', path: '', kind: 'other', size: 0, modified: 0 });
    probe.style.cssText = `position:absolute;visibility:hidden;width:${tileWidth}px`;
    this.spacer.append(probe);
    const h = probe.offsetHeight;
    probe.remove();
    return h;
  }

  /** 화면 근처(explorer.preloadPx) 줄의 칸만 DOM 에 둔다. 이미 있는 칸은 다시 쓴다 */
  private renderRange(force = false): void {
    const layout = this.layout;
    if (!layout || !this.spacer.isConnected) return;
    const top = this.body.scrollTop - this.spacer.offsetTop;
    const range = visibleRows(layout, top, this.body.clientHeight, tuning.explorer.preloadPx);
    if (!force && range.first === this.range.first && range.last === this.range.last) return;
    this.range = range;
    const start = range.first * layout.columns;
    const end = Math.min(this.shown.length, range.last * layout.columns);
    const old = new Map(this.rendered);
    this.rendered.clear();
    const tiles: HTMLButtonElement[] = [];
    for (let i = start; i < end; i++) {
      const e = this.shown[i];
      const reused = old.get(e.path);
      const t = reused ?? this.item(e);
      // 썸네일 작업이 칸이 있는지 보므로 먼저 적는다
      this.rendered.set(e.path, t);
      if (!reused && (e.kind === 'image' || e.kind === 'video')) this.attachThumb(t, e);
      t.classList.toggle('cursor', i === this.cursor);
      tiles.push(t);
    }
    this.grid.style.transform = `translateY(${range.first * layout.stride}px)`;
    this.grid.replaceChildren(...tiles);
  }

  /** 항목 하나의 칸: 격자 보기는 썸네일 칸, 목록 보기는 작은 썸네일과 이름·크기·수정 시각 줄이다 */
  private item(e: FileEntry): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = this.mode === 'list' ? 'explorer-tile explorer-row' : 'explorer-tile';
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
      ext.textContent = (extensionOf(e.name) || e.kind).slice(0, this.mode === 'list' ? 4 : 5).toUpperCase();
      thumb.append(ext);
    }
    const name = document.createElement('span');
    name.className = 'explorer-name';
    name.textContent = e.name;
    const size = document.createElement('span');
    size.className = 'explorer-meta';
    size.textContent = e.kind === 'folder' ? '폴더' : formatSize(e.size);
    b.append(thumb, name, size);
    if (this.mode === 'list') {
      const date = document.createElement('span');
      date.className = 'explorer-meta explorer-date';
      date.textContent = e.modified > 0 ? formatStamp(new Date(e.modified)) : '';
      b.append(date);
    }
    // 키보드는 커서로 다루므로 탭 순서에서 뺀다
    b.tabIndex = -1;
    b.addEventListener('click', () => {
      this.cursor = this.shown.indexOf(e);
      this.activate(e);
    });
    return b;
  }

  /** 칸에 썸네일을 붙인다. 캐시에 있으면 바로, 없으면 만들어 칸이 아직 있을 때 붙인다 */
  private attachThumb(tile: HTMLButtonElement, entry: FileEntry): void {
    const source = this.source;
    if (!source) return;
    const key = thumbKey(source, entry);
    const hit = thumbCache.get(key);
    if (hit) {
      this.showThumb(tile, hit, false);
      return;
    }
    let job = this.inflight.get(key);
    if (!job) {
      const gen = this.generation;
      const video = entry.kind === 'video';
      const created = (video ? this.videoQueue : this.queue).run(async () => {
        // 기다리는 사이 화면 밖으로 나간 칸은 만들지 않는다
        if (gen !== this.generation || !this.rendered.has(entry.path)) throw new Error('stale');
        const cached = thumbCache.get(key);
        if (cached) return cached;
        const file = await source.file(entry.path);
        const thumb = await (video ? videoThumb(file, thumbWidth()) : imageThumb(file, thumbWidth()));
        thumbCache.set(key, thumb, thumb.bytes);
        return thumb;
      });
      const settle = () => {
        if (this.inflight.get(key) === created) this.inflight.delete(key);
      };
      created.then(settle, settle);
      this.inflight.set(key, created);
      job = created;
    }
    job.then(
      (thumb) => {
        if (this.rendered.get(entry.path) === tile) this.showThumb(tile, thumb, true);
      },
      () => {
        // 디코딩할 수 없는 사진(SVG·손상 등)·동영상이나 버린 작업은 확장자 글자만 둔다
      },
    );
  }

  private showThumb(tile: HTMLButtonElement, thumb: Thumb, fade: boolean): void {
    const box = tile.querySelector('.explorer-thumb');
    if (!box || box.classList.contains('loaded')) return;
    const img = document.createElement('img');
    img.className = 'explorer-thumb-image';
    if (fade) img.classList.add('fade');
    img.alt = '';
    img.draggable = false;
    img.src = thumb.url;
    box.append(img);
    box.classList.add('loaded');
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
  }
}
