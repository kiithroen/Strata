import { tuning } from '../../config';
import {
  ImageZoom,
  isDoubleTap,
  zoomTransformCss,
  type Point2D,
  type TapRecord,
  type ZoomBounds,
} from '../common/imageZoom';
import { lockSwipeAxis, swipeStep, type SwipeAxis } from '../noteView/noteNav';
import { formatSize } from './explorerModel';
import type { FileEntry, FileSource } from './fileSource';
import {
  createTextDecoder,
  findTextMatches,
  formatMatchCount,
  stepMatchIndex,
  TEXT_ENCODINGS,
  type TextEncodingMode,
  type TextMatch,
} from './textViewerModel';

export interface MediaViewerOptions {
  /** 닫기 단추·Esc·뒤로로 닫혔을 때. last 는 닫을 때 보던 파일이다 */
  onClose?: (last: FileEntry | null) => void;
}

/** 한 번에 모든 일치를 `<mark>` 노드로 감쌀 최대 매치 수. 넘으면 현재 일치만 감싼다 */
const MAX_HIGHLIGHT_MARKS = 2000;

/**
 * 전체 화면 2D 뷰어: 사진·동영상·음악·텍스트를 열고, 같은 폴더의 다음·이전 파일로 넘긴다(방향키, 사진은 터치 가로 끌기).
 * 사진은 핀치·더블탭·마우스 휠로 확대하고 확대 중에는 팬으로 동작한다. 사진·동영상은 미디어 영역을 단순 탭하면
 * 상단 헤더와 좌우 오버레이 UI 를 숨기거나 다시 보인다. 텍스트는 줄바꿈 전환·수동 인코딩 재해독·파일 내 찾기를 지원한다.
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
  /** 같은 텍스트 파일에서 인코딩을 바꿀 때 이전 스트리밍 읽기를 중단하는 번호 */
  private textReadGen = 0;
  private textFill: (() => Promise<void>) | null = null;
  private findInput: HTMLInputElement | null = null;
  private textWrap = true;
  private uiHidden = false;

  /** 사진 줌·팬·스와이프·탭 상태 */
  private readonly zoom = new ImageZoom();
  private currentImage: HTMLImageElement | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch: { ids: [number, number]; midX: number; midY: number; dist: number } | null = null;
  private panState: { id: number; lastX: number; lastY: number } | null = null;
  private swipe: { id: number; x: number; y: number; axis: SwipeAxis } | null = null;
  private tapCandidate: { id: number; x: number; y: number; t: number; moved: boolean } | null = null;
  private lastImageTap: TapRecord | null = null;
  private singleTapTimer: number | null = null;
  private wasMultiTouch = false;

  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.open) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
      if (this.current?.kind === 'text' && this.findInput) {
        e.preventDefault();
        this.findInput.focus();
        this.findInput.select();
      }
      return;
    }
    const target = e.target;
    const inControl =
      target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
    if (e.key === 'Escape') {
      this.close();
    } else if (!inControl && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === 'ArrowRight') {
      this.step(1);
    } else if (!inControl && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === 'ArrowLeft') {
      this.step(-1);
    } else {
      return;
    }
    e.preventDefault();
  };

  private readonly onResize = () => {
    if (!this.open || this.current?.kind !== 'image' || !this.zoom.zoomed) return;
    this.zoom.clamp(this.imageBounds());
    this.applyImageZoom(false);
  };

  /** stage 밖에서 끝난 포인터(동영상·합성 이벤트 등)가 남지 않게 정리한다 */
  private readonly onWindowPointerEnd = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId) || (this.tapCandidate && this.tapCandidate.id === e.pointerId)) {
      this.onStageEnd(e, true);
    }
  };

  private readonly onWindowBlur = () => {
    if (this.pointers.size === 0 && !this.tapCandidate) return;
    this.pointers.clear();
    this.pinch = null;
    this.panState = null;
    this.tapCandidate = null;
    this.lastImageTap = null;
    this.wasMultiTouch = false;
    this.clearSingleTapTimer();
    this.cancelSwipe();
    this.currentImage?.classList.remove('panning');
    if (this.currentImage) {
      this.zoom.settle(this.imageBounds());
      this.applyImageZoom(false);
    }
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
    this.stage.addEventListener('pointerdown', this.onStageDown);
    this.stage.addEventListener('pointermove', this.onStageMove);
    this.stage.addEventListener('pointerup', this.onStageUp);
    this.stage.addEventListener('pointercancel', this.onStageCancel);
    this.stage.addEventListener('wheel', this.onStageWheel, { passive: false });

    this.prevButton = this.navButton('viewer-prev', '‹', -1);
    this.nextButton = this.navButton('viewer-next', '›', 1);
    this.root.append(head, this.stage, this.prevButton, this.nextButton);
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointerup', this.onWindowPointerEnd);
    window.addEventListener('pointercancel', this.onWindowPointerEnd);
    window.addEventListener('blur', this.onWindowBlur);
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
    this.setUiHidden(false);
    this.root.hidden = false;
    document.body.classList.add('viewer-open');
    this.load(Math.max(0, Math.min(items.length - 1, index)));
  }

  close(): void {
    if (!this.open) return;
    const last = this.current;
    this.clear();
    this.setUiHidden(false);
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
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointerup', this.onWindowPointerEnd);
    window.removeEventListener('pointercancel', this.onWindowPointerEnd);
    window.removeEventListener('blur', this.onWindowBlur);
    this.clear();
    this.root.remove();
    document.body.classList.remove('viewer-open');
  }

  private clear(): void {
    this.generation++;
    this.textReadGen++;
    this.textFill = null;
    this.findInput = null;
    this.resetGestureState();
    this.currentImage = null;
    for (const m of this.stage.querySelectorAll('video, audio')) (m as HTMLMediaElement).pause();
    this.stage.replaceChildren();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  private resetGestureState(): void {
    this.zoom.reset();
    this.pointers.clear();
    this.pinch = null;
    this.panState = null;
    this.swipe = null;
    this.tapCandidate = null;
    this.lastImageTap = null;
    this.wasMultiTouch = false;
    this.clearSingleTapTimer();
  }

  private clearSingleTapTimer(): void {
    if (this.singleTapTimer !== null) {
      window.clearTimeout(this.singleTapTimer);
      this.singleTapTimer = null;
    }
  }

  private setUiHidden(hidden: boolean): void {
    this.uiHidden = hidden;
    this.root.classList.toggle('ui-hidden', hidden);
  }

  private toggleUi(): void {
    const kind = this.current?.kind;
    if (kind !== 'image' && kind !== 'video') return;
    this.setUiHidden(!this.uiHidden);
  }

  private load(index: number): void {
    this.clear();
    this.index = index;
    const entry = this.items[index];
    if (entry.kind !== 'image' && entry.kind !== 'video') this.setUiHidden(false);
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
      img.addEventListener('load', () => {
        if (img === this.currentImage && this.zoom.zoomed) {
          this.zoom.clamp(this.imageBounds());
          this.applyImageZoom(false);
        }
      });
      img.addEventListener('error', () => this.message('이 사진 형식은 열 수 없다'));
      this.currentImage = img;
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

  private imageBounds(): ZoomBounds {
    if (!this.currentImage) {
      return { viewWidth: 0, viewHeight: 0, contentWidth: 0, contentHeight: 0 };
    }
    return {
      viewWidth: this.stage.clientWidth,
      viewHeight: this.stage.clientHeight,
      contentWidth: this.currentImage.offsetWidth,
      contentHeight: this.currentImage.offsetHeight,
    };
  }

  private imageFocal(clientX: number, clientY: number): Point2D {
    const rect = this.stage.getBoundingClientRect();
    return {
      x: clientX - (rect.left + rect.width / 2),
      y: clientY - (rect.top + rect.height / 2),
    };
  }

  private applyImageZoom(animate: boolean): void {
    const img = this.currentImage;
    if (!img) return;
    img.classList.toggle('animating', animate);
    img.classList.remove('dragging');
    img.style.transform = zoomTransformCss(this.zoom.state);
    img.classList.toggle('zoomed', this.zoom.zoomed);
    if (!this.zoom.zoomed) img.classList.remove('panning');
  }

  private settleSwipe(): void {
    const img = this.currentImage;
    if (!img || this.zoom.zoomed) return;
    img.classList.remove('dragging');
    if (img.style.transform !== '') {
      img.classList.add('animating');
      img.style.transform = '';
    }
  }

  private cancelSwipe(): void {
    if (!this.swipe) return;
    this.swipe = null;
    this.settleSwipe();
  }

  private beginPinch(): void {
    const it = this.pointers.entries();
    const first = it.next();
    const second = it.next();
    if (first.done || second.done) return;
    const [idA, a] = first.value;
    const [idB, b] = second.value;
    this.pinch = {
      ids: [idA, idB],
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      dist: Math.hypot(b.x - a.x, b.y - a.y),
    };
  }

  private readonly onStageDown = (e: PointerEvent) => {
    const kind = this.current?.kind;
    if (kind !== 'image' && kind !== 'video') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // 동영상은 기본 재생기 컨트롤을 방해하지 않게 포인터 캡처 없이 단순 탭만 추적한다
    if (kind === 'video') {
      if (this.tapCandidate && e.timeStamp - this.tapCandidate.t <= tuning.input.tapMaxSeconds * 1000) {
        this.tapCandidate.moved = true;
        return;
      }
      this.tapCandidate = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false };
      return;
    }

    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.stage.setPointerCapture(e.pointerId);
    } catch {
      // 합성 이벤트 등 활성 포인터가 없을 때는 캡처를 건너뛴다
    }
    this.currentImage?.classList.remove('animating');

    if (this.pointers.size === 1) {
      this.wasMultiTouch = false;
      this.tapCandidate = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false };
      if (this.currentImage && this.zoom.zoomed) {
        this.panState = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY };
        this.currentImage.classList.add('panning');
      } else if (this.currentImage && e.pointerType !== 'mouse') {
        this.swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: 'none' };
      }
      return;
    }

    this.wasMultiTouch = true;
    this.tapCandidate = null;
    this.lastImageTap = null;
    this.clearSingleTapTimer();
    this.panState = null;
    this.currentImage?.classList.remove('panning');
    this.cancelSwipe();
    if (this.currentImage && !this.pinch) this.beginPinch();
  };

  private readonly onStageMove = (e: PointerEvent) => {
    const kind = this.current?.kind;
    if (kind === 'video') {
      if (this.tapCandidate && this.tapCandidate.id === e.pointerId) {
        if (Math.hypot(e.clientX - this.tapCandidate.x, e.clientY - this.tapCandidate.y) > tuning.input.tapSlop) {
          this.tapCandidate.moved = true;
        }
      }
      return;
    }
    if (kind !== 'image') return;

    const active = this.pointers.get(e.pointerId);
    if (!active) return;
    active.x = e.clientX;
    active.y = e.clientY;

    if (this.tapCandidate && this.tapCandidate.id === e.pointerId) {
      if (Math.hypot(e.clientX - this.tapCandidate.x, e.clientY - this.tapCandidate.y) > tuning.input.tapSlop) {
        this.tapCandidate.moved = true;
        this.lastImageTap = null;
        this.clearSingleTapTimer();
      }
    }

    if (this.pinch && this.currentImage) {
      const a = this.pointers.get(this.pinch.ids[0]);
      const b = this.pointers.get(this.pinch.ids[1]);
      if (!a || !b) return;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const panDelta = { x: midX - this.pinch.midX, y: midY - this.pinch.midY };
      this.zoom.pinch(this.pinch.dist, dist, this.imageFocal(midX, midY), this.imageBounds(), panDelta);
      this.pinch.midX = midX;
      this.pinch.midY = midY;
      this.pinch.dist = dist;
      this.applyImageZoom(false);
      return;
    }

    if (this.panState && this.panState.id === e.pointerId && this.currentImage) {
      const dx = e.clientX - this.panState.lastX;
      const dy = e.clientY - this.panState.lastY;
      this.panState.lastX = e.clientX;
      this.panState.lastY = e.clientY;
      this.zoom.pan(dx, dy, this.imageBounds());
      this.applyImageZoom(false);
      return;
    }

    if (this.swipe && this.swipe.id === e.pointerId && this.currentImage && !this.zoom.zoomed) {
      const dx = e.clientX - this.swipe.x;
      const dy = e.clientY - this.swipe.y;
      this.swipe.axis = lockSwipeAxis(this.swipe.axis, dx, dy);
      if (this.swipe.axis === 'x') {
        this.currentImage.classList.remove('animating');
        this.currentImage.classList.add('dragging');
        this.currentImage.style.transform = `translateX(${dx}px)`;
      }
    }
  };

  private onStageEnd(e: PointerEvent, cancelled: boolean): void {
    const kind = this.current?.kind;
    if (kind === 'video') {
      if (!this.tapCandidate || this.tapCandidate.id !== e.pointerId) return;
      const cand = this.tapCandidate;
      this.tapCandidate = null;
      if (!cancelled && !cand.moved) {
        const dt = e.timeStamp - cand.t;
        const dist = Math.hypot(e.clientX - cand.x, e.clientY - cand.y);
        if (dt <= tuning.input.tapMaxSeconds * 1000 && dist <= tuning.input.tapSlop) this.toggleUi();
      }
      return;
    }
    if (kind !== 'image' || !this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);

    if (this.pinch && (e.pointerId === this.pinch.ids[0] || e.pointerId === this.pinch.ids[1])) {
      this.pinch = null;
      if (this.pointers.size >= 2) {
        this.beginPinch();
      } else if (this.pointers.size === 1 && this.zoom.zoomed) {
        const first = this.pointers.entries().next();
        if (!first.done) {
          const [remId, rem] = first.value;
          this.panState = { id: remId, lastX: rem.x, lastY: rem.y };
          this.currentImage?.classList.add('panning');
        }
      } else if (this.pointers.size === 0) {
        this.zoom.settle(this.imageBounds());
        this.applyImageZoom(false);
        this.wasMultiTouch = false;
      }
      return;
    }

    if (this.panState && this.panState.id === e.pointerId) {
      this.panState = null;
      this.currentImage?.classList.remove('panning');
      if (this.pointers.size === 0) {
        this.zoom.settle(this.imageBounds());
        this.applyImageZoom(false);
      }
    }

    if (this.swipe && this.swipe.id === e.pointerId) {
      const swipe = this.swipe;
      this.swipe = null;
      if (!cancelled && swipe.axis === 'x' && !this.zoom.zoomed) {
        const dir = swipeStep(e.clientX - swipe.x, e.clientY - swipe.y, tuning.explorer.swipePx);
        const canStep = dir !== 0 && this.index + dir >= 0 && this.index + dir < this.items.length;
        if (canStep) {
          this.step(dir);
          return;
        }
      }
      this.settleSwipe();
    }

    if (!cancelled && this.pointers.size === 0 && !this.wasMultiTouch && this.tapCandidate && this.tapCandidate.id === e.pointerId) {
      const cand = this.tapCandidate;
      this.tapCandidate = null;
      const dt = e.timeStamp - cand.t;
      const dist = Math.hypot(e.clientX - cand.x, e.clientY - cand.y);
      if (!cand.moved && dt <= tuning.input.tapMaxSeconds * 1000 && dist <= tuning.input.tapSlop) {
        this.handleImageTap({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      }
    }

    if (this.pointers.size === 0) {
      this.wasMultiTouch = false;
      this.tapCandidate = null;
      if (cancelled) {
        this.lastImageTap = null;
        this.clearSingleTapTimer();
      }
    }
  }

  private readonly onStageUp = (e: PointerEvent) => this.onStageEnd(e, false);
  private readonly onStageCancel = (e: PointerEvent) => this.onStageEnd(e, true);

  /**
   * 사진 영역의 단일 탭(오버레이 UI 토글)과 더블탭(배율 토글)을 충돌 없이 나눈다.
   * 첫 탭은 zoom.doubleTapSeconds 동안 두 번째 탭을 기다리고, 그 안에 더블탭이 오면 UI 토글을 취소하고 줌만 수행한다
   */
  private handleImageTap(tap: TapRecord): void {
    if (this.currentImage && isDoubleTap(this.lastImageTap, tap)) {
      this.clearSingleTapTimer();
      this.lastImageTap = null;
      this.zoom.doubleTap(this.imageFocal(tap.x, tap.y), this.imageBounds());
      this.applyImageZoom(true);
      return;
    }
    this.clearSingleTapTimer();
    this.lastImageTap = this.currentImage ? tap : null;
    if (!this.currentImage) {
      this.toggleUi();
      return;
    }
    const gen = this.generation;
    this.singleTapTimer = window.setTimeout(() => {
      this.singleTapTimer = null;
      this.lastImageTap = null;
      if (gen === this.generation && this.open && this.current?.kind === 'image' && this.pointers.size === 0) {
        this.toggleUi();
      }
    }, tuning.zoom.doubleTapSeconds * 1000);
  }

  private readonly onStageWheel = (e: WheelEvent) => {
    if (this.current?.kind !== 'image' || !this.currentImage) return;
    e.preventDefault();
    this.clearSingleTapTimer();
    this.lastImageTap = null;
    this.cancelSwipe();
    const unit = (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1) * (e.ctrlKey ? 4 : 1);
    const bounds = this.imageBounds();
    this.zoom.wheel(e.deltaY * unit, this.imageFocal(e.clientX, e.clientY), bounds);
    if (e.deltaY > 0) this.zoom.settle(bounds);
    this.applyImageZoom(false);
  };

  /**
   * 텍스트를 explorer.textChunkBytes 씩 앞에서부터 읽는다. 첫 조각을 보이고, 끝에서 explorer.preloadPx 안으로 스크롤하면
   * 다음 조각을 이어 붙인다. 줄바꿈 토글·수동 인코딩 재해독·파일 내 찾기(매치 수·이전/다음·Ctrl+F)를 제공한다
   */
  private async renderText(file: File): Promise<void> {
    const gen = this.generation;
    const chunk = tuning.explorer.textChunkBytes;

    const bar = document.createElement('div');
    bar.className = 'viewer-text-bar';

    const note = document.createElement('span');
    note.className = 'viewer-text-note';

    const tools = document.createElement('div');
    tools.className = 'viewer-text-tools';

    const wrapBtn = document.createElement('button');
    wrapBtn.type = 'button';
    wrapBtn.className = 'explorer-button viewer-wrap';
    wrapBtn.textContent = '줄바꿈';

    const encodingSelect = document.createElement('select');
    encodingSelect.className = 'explorer-sort viewer-encoding';
    encodingSelect.setAttribute('aria-label', '인코딩');
    for (const opt of TEXT_ENCODINGS) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      encodingSelect.append(o);
    }

    const findBox = document.createElement('div');
    findBox.className = 'viewer-find';
    const findInput = document.createElement('input');
    findInput.type = 'search';
    findInput.className = 'viewer-find-input';
    findInput.placeholder = '파일 내 찾기';
    findInput.setAttribute('aria-label', '파일 내 찾기');
    const findCount = document.createElement('span');
    findCount.className = 'viewer-find-count';
    const findPrev = document.createElement('button');
    findPrev.type = 'button';
    findPrev.className = 'explorer-button viewer-find-step';
    findPrev.textContent = '‹';
    findPrev.setAttribute('aria-label', '이전 일치');
    findPrev.disabled = true;
    const findNext = document.createElement('button');
    findNext.type = 'button';
    findNext.className = 'explorer-button viewer-find-step';
    findNext.textContent = '›';
    findNext.setAttribute('aria-label', '다음 일치');
    findNext.disabled = true;
    findBox.append(findInput, findCount, findPrev, findNext);

    tools.append(wrapBtn, encodingSelect, findBox);
    bar.append(note, tools);

    const pre = document.createElement('pre');
    pre.className = 'viewer-text';

    const syncWrap = () => {
      pre.classList.toggle('nowrap', !this.textWrap);
      wrapBtn.classList.toggle('active', this.textWrap);
      wrapBtn.setAttribute('aria-pressed', String(this.textWrap));
    };
    syncWrap();
    wrapBtn.addEventListener('click', () => {
      this.textWrap = !this.textWrap;
      syncWrap();
    });

    let rawText = '';
    let query = '';
    let matches: TextMatch[] = [];
    let activeMatch = -1;
    let markEls: HTMLElement[] = [];
    let hasMarks = false;
    let mounted = false;

    const updateFindUi = () => {
      findCount.textContent = formatMatchCount(activeMatch, matches.length, query);
      const disabled = matches.length === 0;
      findPrev.disabled = disabled;
      findNext.disabled = disabled;
    };

    const scrollActiveMark = () => {
      const active =
        matches.length <= MAX_HIGHLIGHT_MARKS ? markEls[activeMatch] : pre.querySelector<HTMLElement>('.viewer-mark.active');
      active?.scrollIntoView({ block: 'center', inline: 'nearest' });
    };

    const renderHighlights = (scrollToActive: boolean) => {
      if (query === '' || matches.length === 0) {
        if (hasMarks) {
          pre.textContent = rawText;
          markEls = [];
          hasMarks = false;
        }
        updateFindUi();
        return;
      }

      const prevTop = pre.scrollTop;
      const prevLeft = pre.scrollLeft;
      const frag = document.createDocumentFragment();
      markEls = [];

      if (matches.length <= MAX_HIGHLIGHT_MARKS) {
        let cursor = 0;
        for (let i = 0; i < matches.length; i++) {
          const m = matches[i];
          if (m.start > cursor) frag.append(rawText.slice(cursor, m.start));
          const mark = document.createElement('mark');
          mark.className = i === activeMatch ? 'viewer-mark active' : 'viewer-mark';
          mark.textContent = rawText.slice(m.start, m.end);
          markEls.push(mark);
          frag.append(mark);
          cursor = m.end;
        }
        if (cursor < rawText.length) frag.append(rawText.slice(cursor));
      } else {
        const m = matches[activeMatch];
        if (m.start > 0) frag.append(rawText.slice(0, m.start));
        const mark = document.createElement('mark');
        mark.className = 'viewer-mark active';
        mark.textContent = rawText.slice(m.start, m.end);
        frag.append(mark);
        if (m.end < rawText.length) frag.append(rawText.slice(m.end));
      }

      pre.replaceChildren(frag);
      hasMarks = true;
      updateFindUi();
      if (scrollToActive) scrollActiveMark();
      else {
        pre.scrollTop = prevTop;
        pre.scrollLeft = prevLeft;
      }
    };

    const runSearch = (scrollToActive: boolean) => {
      matches = findTextMatches(rawText, query);
      if (matches.length === 0) activeMatch = -1;
      else if (scrollToActive || activeMatch < 0 || activeMatch >= matches.length) activeMatch = 0;
      renderHighlights(scrollToActive);
    };

    const stepFind = (dir: 1 | -1) => {
      if (matches.length === 0) return;
      const prev = activeMatch;
      activeMatch = stepMatchIndex(activeMatch, matches.length, dir);
      if (matches.length <= MAX_HIGHLIGHT_MARKS && markEls.length === matches.length) {
        markEls[prev]?.classList.remove('active');
        markEls[activeMatch]?.classList.add('active');
        updateFindUi();
        scrollActiveMark();
      } else {
        renderHighlights(true);
      }
    };

    findInput.addEventListener('input', () => {
      query = findInput.value;
      runSearch(true);
    });
    findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        if (findInput.value !== '') {
          findInput.value = '';
          query = '';
          runSearch(false);
        } else {
          findInput.blur();
        }
      } else if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        stepFind(e.shiftKey ? -1 : 1);
      }
    });
    findPrev.addEventListener('click', () => stepFind(-1));
    findNext.addEventListener('click', () => stepFind(1));

    const startRead = async (mode: TextEncodingMode) => {
      const readGen = ++this.textReadGen;
      const decoder = createTextDecoder(mode);
      let offset = 0;
      let loading = false;

      rawText = '';
      matches = [];
      activeMatch = -1;
      markEls = [];
      hasMarks = false;
      pre.replaceChildren();
      pre.scrollTop = 0;
      pre.scrollLeft = 0;
      updateFindUi();

      const alive = () => gen === this.generation && readGen === this.textReadGen;
      const updateNote = () => {
        const rest = offset < file.size ? ` · ${Math.floor((offset / file.size) * 100)}% 읽음, 내리면 이어 읽는다` : '';
        note.textContent = `${decoder.encoding.toUpperCase()} · ${formatSize(file.size)}${rest}`;
      };

      const readNext = async (): Promise<boolean> => {
        const end = Math.min(file.size, offset + chunk);
        let bytes: Uint8Array;
        try {
          bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
        } catch {
          return false;
        }
        if (!alive()) return false;
        offset = end;
        const piece = decoder.push(bytes, offset >= file.size);
        rawText += piece;
        if (query === '') {
          pre.append(piece);
        } else {
          const prevHadMarks = hasMarks;
          matches = findTextMatches(rawText, query);
          if (matches.length === 0) {
            activeMatch = -1;
            if (prevHadMarks) {
              pre.textContent = rawText;
              markEls = [];
              hasMarks = false;
            } else {
              pre.append(piece);
            }
            updateFindUi();
          } else {
            if (activeMatch < 0 || activeMatch >= matches.length) activeMatch = 0;
            renderHighlights(false);
          }
        }
        updateNote();
        return true;
      };

      const fill = async () => {
        if (loading) return;
        loading = true;
        while (offset < file.size && alive() && pre.scrollHeight - pre.scrollTop - pre.clientHeight < tuning.explorer.preloadPx) {
          if (!(await readNext())) break;
        }
        loading = false;
      };

      this.textFill = null;
      if (!(await readNext())) {
        if (alive()) this.message('파일을 읽을 수 없다');
        return;
      }
      if (!alive()) return;
      this.textFill = fill;
      if (!mounted) {
        mounted = true;
        this.findInput = findInput;
        this.stage.append(bar, pre);
        pre.addEventListener('scroll', () => void this.textFill?.(), { passive: true });
      }
      void fill();
    };

    encodingSelect.addEventListener('change', () => {
      void startRead(encodingSelect.value as TextEncodingMode);
    });

    await startRead('auto');
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
    this.textReadGen++;
    this.textFill = null;
    this.findInput = null;
    this.currentImage = null;
    this.zoom.reset();
    this.stage.replaceChildren();
    const p = document.createElement('p');
    p.className = 'viewer-message';
    p.textContent = text;
    this.stage.append(p);
  }
}
