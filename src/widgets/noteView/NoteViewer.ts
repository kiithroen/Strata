import { tuning } from '../../config';
import { formatStamp } from '../../core/format';
import type { NoteKind } from '../noteCard/cardLayout';
import { holoTint, releasePhoto, type PhotoSource } from '../noteCard/cardTexture';

/** 보기 화면에 띄우는 노트 하나 */
export interface ViewedNote {
  id: string;
  time: number;
  kind: NoteKind;
  title?: string;
  body?: string;
  tags: readonly string[];
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
}

const KIND_LABEL: Record<NoteKind, string> = { photo: '사진', memo: '메모', doc: '문서' };

/**
 * 노트 보기: 노트 하나의 사진 전체와 글 전체를 읽는 2D 전체 화면. 3D 화면 위를 덮는다.
 * 사진은 화면 폭 × 기기 픽셀 배율(album.viewerPhotoMaxPx 이하)로 그려 받는다. 고칠 수 있는 노트는 편집·삭제 단추가 있고,
 * 삭제는 한 번 더 눌러야 지운다. 방문 기록과 Esc 는 여는 쪽이 맡는다(hide 는 기록을 건드리지 않는다).
 */
export class NoteViewer {
  private readonly root: HTMLDivElement;
  private readonly kindLabel: HTMLSpanElement;
  private readonly editButton: HTMLButtonElement;
  private readonly deleteButton: HTMLButtonElement;
  private readonly body: HTMLDivElement;
  private note: ViewedNote | null = null;
  private armed = false;
  /** 보여 줄 때마다 늘린다. 다른 노트로 바뀐 뒤 도착한 사진을 가려낸다 */
  private generation = 0;

  constructor(private readonly options: NoteViewerOptions) {
    this.root = el('div', 'note-viewer');
    this.root.hidden = true;
    const head = el('header', 'note-viewer-head');
    const close = button('note-button', '닫기', () => this.options.onClose());
    this.kindLabel = el('span', 'note-viewer-kind');
    this.editButton = button('note-button', '편집', () => {
      if (this.note) this.options.onEdit?.(this.note.id);
    });
    this.deleteButton = button('note-button note-delete', '삭제', () => this.onDeleteClick());
    head.append(close, this.kindLabel, this.editButton, this.deleteButton);
    this.body = el('div', 'note-viewer-body');
    this.root.append(head, this.body);
    document.body.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** 지금 보는 노트 번호 */
  get current(): string | null {
    return this.open ? this.note?.id ?? null : null;
  }

  /** 노트를 연다. editable 이면 편집·삭제 단추를 보인다 */
  show(note: ViewedNote, editable: boolean): void {
    this.note = note;
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
    if (note.body) {
      const b = el('p', 'note-viewer-text');
      b.textContent = note.body;
      page.append(b);
    }
    const foot = el('footer', 'note-viewer-foot');
    const time = el('time', 'note-viewer-time');
    time.textContent = formatStamp(new Date(note.time));
    foot.append(time);
    for (const tag of note.tags) {
      const t = el('span', 'note-viewer-tag');
      t.textContent = `#${tag}`;
      foot.append(t);
    }
    page.append(foot);
    this.body.append(page);
    this.root.hidden = false;
    this.body.scrollTop = 0;
    document.body.classList.add('note-viewer-open');
  }

  hide(): void {
    if (!this.open) return;
    this.generation++;
    this.root.hidden = true;
    this.body.replaceChildren();
    this.note = null;
    document.body.classList.remove('note-viewer-open');
  }

  dispose(): void {
    this.hide();
    this.root.remove();
  }

  private onDeleteClick(): void {
    if (!this.note) return;
    if (!this.armed) {
      this.armed = true;
      this.deleteButton.textContent = '한 번 더 누르면 지운다';
      this.deleteButton.classList.add('armed');
      return;
    }
    this.disarm();
    this.options.onDelete?.(this.note.id);
  }

  private disarm(): void {
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
