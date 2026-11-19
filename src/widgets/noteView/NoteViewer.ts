import { tuning } from '../../config';
import type { ChecklistItem } from '../../core/checklist';
import { formatStamp } from '../../core/format';
import {
  ImageZoom,
  isDoubleTap,
  zoomTransformCss,
  type Point2D,
  type TapRecord,
  type ZoomBounds,
} from '../common/imageZoom';
import type { NoteKind } from '../noteCard/cardLayout';
import { holoTint, releasePhoto, type PhotoSource } from '../noteCard/cardTexture';
import { lockSwipeAxis, swipeStep, type SwipeAxis } from './noteNav';

/** 보기 화면에 띄우는 노트 하나 */
export interface ViewedNote {
  id: string;
  time: number;
  kind: NoteKind;
  title?: string;
  body?: string;
  /** 있으면 체크리스트 노트다. 본문 대신 체크 칸 목록을 그린다 */
  checklist?: readonly ChecklistItem[];
  tags: readonly string[];
  /** tags 가운데 AI 가 붙인 태그 */
  autoTags?: readonly string[];
  tint?: number;
  photo?: PhotoSource;
}

export interface NoteViewerOptions {
  /** 닫기 단추 */
  onClose: () => void;
  /** 편집 단추(고칠 수 있는 노트만 보인다) */
  onEdit?: (id: string) => void;
  /** 삭제 단추를 두 번 눌렀을 때(고칠 수 있는 노트만 보인다) */
  onDelete?: (id: string) => void;
  /** 체크리스트 항목의 체크 칸을 눌렀을 때(고칠 수 있는 노트만 누를 수 있다) */
  onCheck?: (id: string, index: number, done: boolean) => void;
  /** 이전(-1)·다음(1) 노트로 넘길 때(단추·가로 끌기). 방향키는 여는 쪽이 맡는다 */
  onStep?: (dir: 1 | -1) => void;
  /** `#태그`를 눌렀을 때 부른다 */
  onTagClick?: (tag: string) => void;
}

/** 넘길 차례 안의 지금 자리(0부터)와 노트 수 */
export interface ViewerNav {
  position: number;
  total: number;
}

const KIND_LABEL: Record<NoteKind, string> = { photo: '사진', memo: '메모', doc: '문서' };

/**
 * 노트 보기: 노트 하나의 사진 전체와 글 전체를 읽는 2D 전체 화면. 3D 화면 위를 덮는다.
 * 넘길 차례(nav)를 주면 머리의 ‹ › 단추와 손가락 가로 끌기로 이전·다음 노트로 넘긴다. 기본 배율의 가로 끌기는
 * 축 잠금으로 세로 스크롤 중 튐을 막고, 끄는 동안 쪽이 손가락을 따라오며 넘기지 않으면 제자리로 돌아간다.
 * 사진은 핀치·더블탭·마우스 휠로 확대하고 확대 중에는 팬으로 동작하며(가로 넘기기 차단), 넘기거나 닫으면 배율을 1 로 되돌린다.
 * 사진은 화면 폭 × 기기 픽셀 배율(album.viewerPhotoMaxPx 이하)로 그려 받는다. 고칠 수 있는 노트는 편집·삭제 단추가 있고,
 * 삭제는 한 번 더 눌러야 지운다. 방문 기록과 Esc 는 여는 쪽이 맡는다(hide 는 기록을 건드리지 않는다).
 */
export class NoteViewer {
  private readonly root: HTMLDivElement;
  private readonly kindLabel: HTMLSpanElement;
  private readonly editButton: HTMLButtonElement;
  private readonly deleteButton: HTMLButtonElement;
  private readonly prevButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly counter: HTMLSpanElement;
  private readonly body: HTMLDivElement;
  private nav: ViewerNav | null = null;
  /** 끌고 있는 손가락과 시작 자리·잠긴 축 */
  private drag: { id: number; x: number; y: number; axis: SwipeAxis } | null = null;
  private note: ViewedNote | null = null;
  private armed = false;
  private disarmTimer: number | null = null;
  /** 보여 줄 때마다 늘린다. 다른 노트로 바뀐 뒤 도착한 사진을 가려낸다 */
  private generation = 0;

  /** 사진 줌·팬 상태 */
  private readonly photoZoom = new ImageZoom();
  private photoBox: HTMLDivElement | null = null;
  private photoCanvas: HTMLCanvasElement | null = null;
  private readonly photoPointers = new Map<number, { x: number; y: number }>();
  private photoPinch: { ids: [number, number]; midX: number; midY: number; dist: number } | null = null;
  private photoPan: { id: number; lastX: number; lastY: number } | null = null;
  private photoTap: { id: number; x: number; y: number; t: number; moved: boolean } | null = null;
  private lastPhotoTap: TapRecord | null = null;
  private photoWasMulti = false;

  private readonly onRootDown = (e: PointerEvent) => {
    if (this.armed && e.target instanceof Node && !this.deleteButton.contains(e.target)) this.disarm();
  };

  private readonly onResize = () => {
    if (!this.open || !this.photoZoom.zoomed) return;
    this.photoZoom.clamp(this.photoBounds());
    this.applyPhotoZoom(false);
  };

  /** 사진 상자 밖에서 끝난 포인터(캡처 없는 마우스 등)가 photoPointers 에 남지 않게 정리한다 */
  private readonly onWindowPhotoEnd = (e: PointerEvent) => {
    if (this.photoPointers.has(e.pointerId)) this.onPhotoEnd(e, true);
  };

  private readonly onWindowBlur = () => {
    if (this.photoPointers.size === 0) return;
    this.photoPointers.clear();
    this.photoPinch = null;
    this.photoPan = null;
    this.photoTap = null;
    this.lastPhotoTap = null;
    this.photoWasMulti = false;
    this.photoBox?.classList.remove('panning');
    this.photoZoom.settle(this.photoBounds());
    this.applyPhotoZoom(false);
  };

  constructor(private readonly options: NoteViewerOptions) {
    this.root = el('div', 'note-viewer');
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', this.onRootDown);
    const head = el('header', 'note-viewer-head');
    const close = button('note-button', '닫기', () => this.options.onClose());
    this.kindLabel = el('span', 'note-viewer-kind');
    this.editButton = button('note-button', '편집', () => {
      if (this.note) this.options.onEdit?.(this.note.id);
    });
    this.deleteButton = button('note-button note-delete', '삭제', () => this.onDeleteClick());
    this.prevButton = button('note-button note-step', '‹', () => this.options.onStep?.(-1));
    this.prevButton.setAttribute('aria-label', '이전 노트');
    this.nextButton = button('note-button note-step', '›', () => this.options.onStep?.(1));
    this.nextButton.setAttribute('aria-label', '다음 노트');
    this.counter = el('span', 'note-viewer-count');
    head.append(close, this.kindLabel, this.prevButton, this.counter, this.nextButton, this.editButton, this.deleteButton);
    this.body = el('div', 'note-viewer-body');
    this.body.addEventListener('pointerdown', this.onPointerDown);
    this.body.addEventListener('pointermove', this.onPointerMove);
    this.body.addEventListener('pointerup', this.onPointerUp);
    this.body.addEventListener('pointercancel', this.onPointerCancel);
    this.root.append(head, this.body);
    document.body.appendChild(this.root);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointerup', this.onWindowPhotoEnd);
    window.addEventListener('pointercancel', this.onWindowPhotoEnd);
    window.addEventListener('blur', this.onWindowBlur);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** 지금 보는 노트 번호 */
  get current(): string | null {
    return this.open ? this.note?.id ?? null : null;
  }

  /** 넘길 차례 안의 지금 자리. 넘길 차례가 없으면 null */
  get position(): ViewerNav | null {
    return this.open ? this.nav : null;
  }

  /**
   * 노트를 연다. editable 이면 편집·삭제 단추를 보인다. nav 의 노트가 둘 이상이면 넘기기 단추와 자리를 보인다.
   * enter 는 넘겨 들어온 방향으로, 새 쪽이 그쪽에서 밀려 들어온다
   */
  show(note: ViewedNote, editable: boolean, nav?: ViewerNav, enter?: 1 | -1): void {
    this.note = note;
    this.nav = nav && nav.total > 1 ? nav : null;
    this.drag = null;
    this.resetPhotoZoom();
    const navigable = this.nav !== null && this.options.onStep !== undefined;
    this.prevButton.hidden = !navigable;
    this.nextButton.hidden = !navigable;
    this.counter.hidden = !navigable;
    if (this.nav) {
      this.prevButton.disabled = this.nav.position <= 0;
      this.nextButton.disabled = this.nav.position >= this.nav.total - 1;
      this.counter.textContent = `${this.nav.position + 1} / ${this.nav.total}`;
    }
    const gen = ++this.generation;
    this.disarm();
    this.editButton.hidden = !editable || !this.options.onEdit;
    this.deleteButton.hidden = !editable || !this.options.onDelete;
    this.root.style.setProperty('--card-tint', holoTint(note));
    this.root.dataset.kind = note.kind;
    this.kindLabel.textContent = KIND_LABEL[note.kind];
    this.body.replaceChildren();
    const page = el('article', 'note-viewer-page');
    if (note.photo) page.append(this.photo(note.photo, gen));
    if (note.title) {
      const t = el('h2', 'note-viewer-title');
      t.textContent = note.title;
      page.append(t);
    }
    if (note.checklist) page.append(this.checklist(note.id, note.checklist, editable && this.options.onCheck !== undefined));
    else if (note.body) {
      const b = el('p', 'note-viewer-text');
      b.textContent = note.body;
      page.append(b);
    }
    const foot = el('footer', 'note-viewer-foot');
    const time = el('time', 'note-viewer-time');
    time.textContent = formatStamp(new Date(note.time));
    foot.append(time);
    const onTagClick = this.options.onTagClick;
    for (const tag of note.tags) {
      const cls = note.autoTags?.includes(tag) ? 'note-viewer-tag auto' : 'note-viewer-tag';
      const t = onTagClick ? button(cls, `#${tag}`, () => onTagClick(tag)) : el('span', cls);
      if (!onTagClick) t.textContent = `#${tag}`;
      foot.append(t);
    }
    page.append(foot);
    if (enter) page.classList.add(enter > 0 ? 'enter-next' : 'enter-prev');
    this.body.append(page);
    this.root.hidden = false;
    this.body.scrollTop = 0;
    document.body.classList.add('note-viewer-open');
  }

  hide(): void {
    if (!this.open) return;
    this.disarm();
    this.resetPhotoZoom();
    this.generation++;
    this.root.hidden = true;
    this.body.replaceChildren();
    this.note = null;
    this.nav = null;
    this.drag = null;
    document.body.classList.remove('note-viewer-open');
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointerup', this.onWindowPhotoEnd);
    window.removeEventListener('pointercancel', this.onWindowPhotoEnd);
    window.removeEventListener('blur', this.onWindowBlur);
    this.root.removeEventListener('pointerdown', this.onRootDown);
    this.hide();
    this.root.remove();
  }

  private readonly onPointerDown = (e: PointerEvent) => {
    // 마우스는 글을 끌어 고르므로 넘기지 않는다(단추·방향키로 넘긴다). 확대·멀티터치 중에도 넘기지 않는다
    if (
      e.pointerType === 'mouse' ||
      !this.nav ||
      !this.options.onStep ||
      this.drag ||
      this.photoZoom.zoomed ||
      this.photoPointers.size > 1
    ) {
      return;
    }
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: 'none' };
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.id) return;
    if (this.photoZoom.zoomed || this.photoPointers.size > 1) {
      this.cancelSwipe();
      return;
    }
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.axis = lockSwipeAxis(drag.axis, dx, dy);
    // 세로 축으로 잠기거나 아직 판정 전이면 쪽을 좌우로 움직이지 않는다
    if (drag.axis !== 'x') return;
    const page = this.page();
    if (!page) return;
    page.classList.add('dragging');
    page.style.transform = `translateX(${dx}px)`;
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.id) return;
    this.drag = null;
    if (drag.axis !== 'x' || this.photoZoom.zoomed) {
      this.settle();
      return;
    }
    const dir = swipeStep(e.clientX - drag.x, e.clientY - drag.y);
    const nav = this.nav;
    const canStep = nav !== null && (dir > 0 ? nav.position < nav.total - 1 : nav.position > 0);
    if (dir !== 0 && canStep) this.options.onStep?.(dir);
    else this.settle();
  };

  private readonly onPointerCancel = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag = null;
    this.settle();
  };

  private cancelSwipe(): void {
    if (!this.drag) return;
    this.drag = null;
    this.settle();
  }

  /** 끌다 만 쪽을 제자리로 돌린다 */
  private settle(): void {
    const page = this.page();
    if (!page) return;
    page.classList.remove('dragging');
    page.style.transform = '';
  }

  private page(): HTMLElement | null {
    return this.body.querySelector<HTMLElement>('.note-viewer-page');
  }

  private resetPhotoZoom(): void {
    this.photoZoom.reset();
    this.photoPointers.clear();
    this.photoPinch = null;
    this.photoPan = null;
    this.photoTap = null;
    this.lastPhotoTap = null;
    this.photoWasMulti = false;
    this.photoBox = null;
    this.photoCanvas = null;
  }

  private photoBounds(): ZoomBounds {
    if (!this.photoBox || !this.photoCanvas) {
      return { viewWidth: 0, viewHeight: 0, contentWidth: 0, contentHeight: 0 };
    }
    return {
      viewWidth: this.photoBox.clientWidth,
      viewHeight: this.photoBox.clientHeight,
      contentWidth: this.photoCanvas.offsetWidth,
      contentHeight: this.photoCanvas.offsetHeight,
    };
  }

  private photoFocal(clientX: number, clientY: number): Point2D {
    if (!this.photoBox) return { x: 0, y: 0 };
    const rect = this.photoBox.getBoundingClientRect();
    return {
      x: clientX - (rect.left + rect.width / 2),
      y: clientY - (rect.top + rect.height / 2),
    };
  }

  private applyPhotoZoom(animate: boolean): void {
    if (!this.photoCanvas || !this.photoBox) return;
    this.photoCanvas.classList.toggle('animating', animate);
    this.photoCanvas.style.transform = zoomTransformCss(this.photoZoom.state);
    this.photoBox.classList.toggle('zoomed', this.photoZoom.zoomed);
    if (!this.photoZoom.zoomed) this.photoBox.classList.remove('panning');
  }

  private beginPhotoPinch(): void {
    const it = this.photoPointers.entries();
    const first = it.next();
    const second = it.next();
    if (first.done || second.done) return;
    const [idA, a] = first.value;
    const [idB, b] = second.value;
    this.photoPinch = {
      ids: [idA, idB],
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      dist: Math.hypot(b.x - a.x, b.y - a.y),
    };
    try {
      this.photoBox?.setPointerCapture(idA);
    } catch {
      // 합성 이벤트 등 활성 포인터가 없을 때는 캡처를 건너뛴다
    }
    try {
      this.photoBox?.setPointerCapture(idB);
    } catch {
      // 합성 이벤트 등 활성 포인터가 없을 때는 캡처를 건너뛴다
    }
  }

  private readonly onPhotoDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.photoPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.photoCanvas?.classList.remove('animating');

    if (this.photoPointers.size === 1) {
      this.photoWasMulti = false;
      this.photoTap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false };
      if (this.photoZoom.zoomed) {
        this.photoPan = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY };
        this.photoBox?.classList.add('panning');
        try {
          this.photoBox?.setPointerCapture(e.pointerId);
        } catch {
          // 합성 이벤트 등 활성 포인터가 없을 때는 캡처를 건너뛴다
        }
        e.stopPropagation();
        if (e.pointerType === 'mouse') e.preventDefault();
      }
      return;
    }

    this.photoWasMulti = true;
    this.photoTap = null;
    this.lastPhotoTap = null;
    this.photoPan = null;
    this.photoBox?.classList.remove('panning');
    this.cancelSwipe();
    if (!this.photoPinch) this.beginPhotoPinch();
    e.stopPropagation();
  };

  private readonly onPhotoMove = (e: PointerEvent) => {
    const active = this.photoPointers.get(e.pointerId);
    if (!active) return;
    active.x = e.clientX;
    active.y = e.clientY;

    if (this.photoTap && this.photoTap.id === e.pointerId) {
      if (Math.hypot(e.clientX - this.photoTap.x, e.clientY - this.photoTap.y) > tuning.input.tapSlop) {
        this.photoTap.moved = true;
        this.lastPhotoTap = null;
      }
    }

    if (this.photoPinch) {
      const a = this.photoPointers.get(this.photoPinch.ids[0]);
      const b = this.photoPointers.get(this.photoPinch.ids[1]);
      if (!a || !b) return;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const panDelta = { x: midX - this.photoPinch.midX, y: midY - this.photoPinch.midY };
      this.photoZoom.pinch(this.photoPinch.dist, dist, this.photoFocal(midX, midY), this.photoBounds(), panDelta);
      this.photoPinch.midX = midX;
      this.photoPinch.midY = midY;
      this.photoPinch.dist = dist;
      this.applyPhotoZoom(false);
      e.stopPropagation();
      return;
    }

    if (this.photoPan && this.photoPan.id === e.pointerId) {
      const dx = e.clientX - this.photoPan.lastX;
      const dy = e.clientY - this.photoPan.lastY;
      this.photoPan.lastX = e.clientX;
      this.photoPan.lastY = e.clientY;
      this.photoZoom.pan(dx, dy, this.photoBounds());
      this.applyPhotoZoom(false);
      e.stopPropagation();
    }
  };

  private onPhotoEnd(e: PointerEvent, cancelled: boolean): void {
    if (!this.photoPointers.has(e.pointerId)) return;
    this.photoPointers.delete(e.pointerId);

    if (this.photoPinch && (e.pointerId === this.photoPinch.ids[0] || e.pointerId === this.photoPinch.ids[1])) {
      this.photoPinch = null;
      e.stopPropagation();
      if (this.photoPointers.size >= 2) {
        this.beginPhotoPinch();
      } else if (this.photoPointers.size === 1 && this.photoZoom.zoomed) {
        const first = this.photoPointers.entries().next();
        if (!first.done) {
          const [remId, rem] = first.value;
          this.photoPan = { id: remId, lastX: rem.x, lastY: rem.y };
          this.photoBox?.classList.add('panning');
        }
      } else if (this.photoPointers.size === 0) {
        this.photoZoom.settle(this.photoBounds());
        this.applyPhotoZoom(false);
        this.photoWasMulti = false;
      }
      return;
    }

    if (this.photoPan && this.photoPan.id === e.pointerId) {
      this.photoPan = null;
      this.photoBox?.classList.remove('panning');
      e.stopPropagation();
      if (this.photoPointers.size === 0) {
        this.photoZoom.settle(this.photoBounds());
        this.applyPhotoZoom(false);
      }
    }

    if (!cancelled && this.photoPointers.size === 0 && !this.photoWasMulti && this.photoTap && this.photoTap.id === e.pointerId) {
      const tap = this.photoTap;
      this.photoTap = null;
      const dt = e.timeStamp - tap.t;
      const dist = Math.hypot(e.clientX - tap.x, e.clientY - tap.y);
      if (!tap.moved && dt <= tuning.input.tapMaxSeconds * 1000 && dist <= tuning.input.tapSlop) {
        const curr: TapRecord = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        if (isDoubleTap(this.lastPhotoTap, curr)) {
          this.lastPhotoTap = null;
          this.cancelSwipe();
          this.photoZoom.doubleTap(this.photoFocal(curr.x, curr.y), this.photoBounds());
          this.applyPhotoZoom(true);
        } else {
          this.lastPhotoTap = curr;
        }
      }
    }

    if (this.photoPointers.size === 0) {
      this.photoWasMulti = false;
      this.photoTap = null;
      if (cancelled) this.lastPhotoTap = null;
    }
  }

  private readonly onPhotoUp = (e: PointerEvent) => this.onPhotoEnd(e, false);
  private readonly onPhotoCancel = (e: PointerEvent) => this.onPhotoEnd(e, true);

  private readonly onPhotoWheel = (e: WheelEvent) => {
    if (!this.photoBox || !this.photoCanvas) return;
    // 기본 배율에서 아래로 굴릴 때는 본문 스크롤을 살려 두고, 확대 방향·확대 상태·트랙패드 핀치만 줌으로 받는다
    if (!e.ctrlKey && !this.photoZoom.zoomed && e.deltaY >= 0) return;
    e.preventDefault();
    this.lastPhotoTap = null;
    this.cancelSwipe();
    const unit = (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1) * (e.ctrlKey ? 4 : 1);
    const bounds = this.photoBounds();
    this.photoZoom.wheel(e.deltaY * unit, this.photoFocal(e.clientX, e.clientY), bounds);
    if (e.deltaY > 0) this.photoZoom.settle(bounds);
    this.applyPhotoZoom(false);
  };

  /** 체크 칸 목록. checkable 이 아니면 칸을 누를 수 없다 */
  private checklist(id: string, items: readonly ChecklistItem[], checkable: boolean): HTMLElement {
    const list = el('ul', 'note-viewer-checklist');
    items.forEach((item, index) => {
      const li = el('li', 'note-check');
      li.classList.toggle('done', item.done);
      const label = el('label', 'note-check-label');
      const box = el('input', 'note-check-box');
      box.type = 'checkbox';
      box.checked = item.done;
      box.disabled = !checkable;
      box.addEventListener('change', () => {
        li.classList.toggle('done', box.checked);
        this.options.onCheck?.(id, index, box.checked);
      });
      const text = el('span', 'note-check-text');
      text.textContent = item.text;
      label.append(box, text);
      li.append(label);
      list.append(li);
    });
    return list;
  }

  private onDeleteClick(): void {
    if (!this.note) return;
    if (!this.armed) {
      this.armed = true;
      this.deleteButton.textContent = '삭제 확인';
      this.deleteButton.classList.add('armed');
      if (this.disarmTimer !== null) window.clearTimeout(this.disarmTimer);
      this.disarmTimer = window.setTimeout(() => this.disarm(), tuning.album.confirmResetSec * 1000);
      return;
    }
    this.disarm();
    this.options.onDelete?.(this.note.id);
  }

  private disarm(): void {
    if (this.disarmTimer !== null) {
      window.clearTimeout(this.disarmTimer);
      this.disarmTimer = null;
    }
    this.armed = false;
    this.deleteButton.textContent = '삭제';
    this.deleteButton.classList.remove('armed');
  }

  private photo(photo: PhotoSource, gen: number): HTMLElement {
    const box = el('div', 'note-viewer-photo');
    const canvas = el('canvas', 'note-viewer-canvas');
    // 그리기 전에도 사진 비율로 자리를 잡는다
    const width = Math.max(1, Math.round(Math.min(window.innerWidth * window.devicePixelRatio, tuning.album.viewerPhotoMaxPx, photo.width)));
    canvas.width = width;
    canvas.height = Math.max(1, Math.round((width * photo.height) / Math.max(1, photo.width)));
    box.append(canvas);
    this.photoBox = box;
    this.photoCanvas = canvas;
    box.addEventListener('pointerdown', this.onPhotoDown);
    box.addEventListener('pointermove', this.onPhotoMove);
    box.addEventListener('pointerup', this.onPhotoUp);
    box.addEventListener('pointercancel', this.onPhotoCancel);
    box.addEventListener('wheel', this.onPhotoWheel, { passive: false });
    const draw = (image: CanvasImageSource) => {
      if (gen === this.generation) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.classList.add('loaded');
        }
      }
      releasePhoto(image);
    };
    const result = photo.render(width, true);
    if (result instanceof Promise) result.then(draw, () => undefined);
    else draw(result);
    return box;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

export function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className);
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
