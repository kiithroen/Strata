import { tuning } from '../../config';
import { draftHasContent, noteKindOf, parseTags, sameDraft, toggleTagInText, type NoteDraft } from '../../album/albumModel';
import { checklistToLines, linesToChecklist, type ChecklistItem } from '../../core/checklist';
import type { NoteKind } from '../noteCard/cardLayout';
import { releasePhoto, type PhotoSource } from '../noteCard/cardTexture';
import { button } from './NoteViewer';

/** 입력 화면이 저장할 때 넘기는 것. photo 가 File 이면 새 사진, null 이면 사진을 뺐고, 없으면 원래 사진 그대로다 */
export interface EditorResult {
  draft: NoteDraft;
  photo?: File | null;
}

export interface NoteEditorOptions {
  /** 취소 단추 */
  onCancel: () => void;
  /** 저장 단추·Ctrl+Enter. 끝날 때까지 저장 단추를 막고, 실패하면 그 글을 상태 줄에 적는다 */
  onSave: (result: EditorResult) => Promise<void>;
  /** 고른 사진 파일의 촬영 시각(ms). 새 노트는 이 시각에 놓는다 */
  readTakenAt?: (file: File) => Promise<number | undefined>;
  /** 입력 화면에 추천으로 띄울 기존 태그 목록 */
  suggestedTags?: () => readonly string[];
}

const DIRTY_PROMPT = '저장하지 않은 내용이 있다. 한 번 더 누르면 버린다';

const KIND_NOTE: Record<NoteKind, string> = {
  photo: '사진 노트로 저장한다',
  memo: '메모로 저장한다',
  doc: '긴 문서로 저장한다',
};

/** datetime-local 입력 값(현지 시각, 분까지) */
function toLocalInput(time: number): string {
  const d = new Date(time);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 노트 입력: 새 노트를 쓰거나 저장된 노트를 고치는 2D 화면. 3D 화면 위를 덮는다.
 * 제목, 본문, 태그(쉼표·띄어쓰기로 나눔), 메모 색, 사진, 시각을 받는다. 종류는 사진이 있으면 사진, 본문이 길면 긴 문서, 아니면 메모다.
 * `체크리스트로`는 본문 줄을 항목으로 바꾸고, `글로 바꾸기`는 항목을 본문 줄로 되돌린다. 항목 칸에서 엔터는 아래에 새 항목을 만들고,
 * 빈 항목에서 지우기 키는 그 항목을 지운다.
 * 방문 기록과 Esc 는 여는 쪽이 맡는다(hide 는 기록을 건드리지 않는다).
 */
export class NoteEditor {
  private readonly root: HTMLDivElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly heading: HTMLSpanElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly photoBox: HTMLDivElement;
  private readonly photoCanvas: HTMLCanvasElement;
  private readonly pickButton: HTMLButtonElement;
  private readonly dropButton: HTMLButtonElement;
  private readonly fileInput: HTMLInputElement;
  private readonly titleInput: HTMLInputElement;
  private readonly bodyInput: HTMLTextAreaElement;
  private readonly checklistBox: HTMLDivElement;
  private readonly checklistRows: HTMLDivElement;
  private readonly checklistButton: HTMLButtonElement;
  /** 체크리스트 노트로 쓰는 중인지 */
  private checklistMode = false;
  private readonly tagsInput: HTMLInputElement;
  private readonly tagChips: HTMLDivElement;
  private readonly suggestBox: HTMLDivElement;
  private readonly tintRow: HTMLDivElement;
  private readonly swatches: HTMLButtonElement[] = [];
  private readonly timeInput: HTMLInputElement;
  private readonly kindNote: HTMLParagraphElement;
  private readonly status: HTMLParagraphElement;
  private tint = 0;
  /** 원래 사진(고칠 때)과 새로 고른 사진. photoFile 이 null 이면 사진을 뺐다 */
  private original: PhotoSource | null = null;
  private photoFile: File | null | undefined = undefined;
  private photoSize: { width: number; height: number } | undefined;
  private isNew = true;
  private timeTouched = false;
  private saving = false;
  private generation = 0;
  private initialDraft: NoteDraft | null = null;
  private cancelArmed = false;
  private cancelTimer: number | null = null;

  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.open) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void this.save();
    }
  };

  constructor(private readonly options: NoteEditorOptions) {
    this.root = el('div', 'note-editor');
    this.root.hidden = true;
    const head = el('header', 'note-editor-head');
    this.cancelButton = button('note-button', '취소', () => this.requestCancel());
    this.heading = el('span', 'note-editor-heading');
    this.saveButton = button('note-button note-save', '저장', () => void this.save());
    head.append(this.cancelButton, this.heading, this.saveButton);

    const form = el('div', 'note-editor-body');

    this.photoBox = el('div', 'note-editor-photo');
    this.photoCanvas = el('canvas', 'note-editor-canvas');
    this.photoBox.append(this.photoCanvas);
    this.fileInput = el('input', 'note-editor-file');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*';
    this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) void this.setPhotoFile(file);
    });
    this.pickButton = button('note-button', '사진 고르기', () => this.fileInput.click());
    this.dropButton = button('note-button', '사진 빼기', () => this.dropPhoto());
    this.checklistButton = button('note-button', '체크리스트로', () => this.setChecklistMode(!this.checklistMode, true));
    const photoRow = el('div', 'note-editor-row note-editor-photo-row');
    photoRow.append(this.pickButton, this.dropButton, this.checklistButton, this.fileInput);

    this.titleInput = el('input', 'note-editor-input note-editor-title');
    this.titleInput.type = 'text';
    this.titleInput.placeholder = '제목';
    this.titleInput.enterKeyHint = 'next';
    this.bodyInput = el('textarea', 'note-editor-input note-editor-text');
    this.bodyInput.placeholder = '내용';
    this.bodyInput.rows = 6;
    this.checklistBox = el('div', 'note-editor-checklist');
    this.checklistBox.hidden = true;
    this.checklistRows = el('div', 'note-editor-checklist');
    const addItem = button('note-button note-editor-check-add', '+ 항목', () => this.addRow(undefined, null).focus());
    this.checklistBox.append(this.checklistRows, addItem);
    this.tagsInput = el('input', 'note-editor-input note-editor-tags');
    this.tagsInput.type = 'text';
    this.tagsInput.placeholder = '태그 (쉼표나 띄어쓰기로 나눈다)';
    this.tagsInput.autocapitalize = 'off';
    this.tagChips = el('div', 'note-editor-chips');
    this.suggestBox = el('div', 'note-editor-suggests');
    this.suggestBox.hidden = true;

    this.tintRow = el('div', 'note-editor-row note-editor-tints');
    const tintLabel = el('span', 'note-editor-label');
    tintLabel.textContent = '메모 색';
    this.tintRow.append(tintLabel);
    tuning.card.holo.memoColors.forEach((color, i) => {
      const s = el('button', 'note-editor-swatch');
      s.type = 'button';
      s.style.setProperty('--swatch', color);
      s.setAttribute('aria-label', `메모 색 ${i + 1}`);
      s.addEventListener('click', () => {
        this.setTint(i);
        this.refresh();
      });
      this.swatches.push(s);
      this.tintRow.append(s);
    });

    const timeRow = el('label', 'note-editor-row');
    const timeLabel = el('span', 'note-editor-label');
    timeLabel.textContent = '시각';
    this.timeInput = el('input', 'note-editor-input note-editor-time');
    this.timeInput.type = 'datetime-local';
    this.timeInput.addEventListener('input', () => {
      this.timeTouched = true;
      this.refresh();
    });
    timeRow.append(timeLabel, this.timeInput);

    this.kindNote = el('p', 'note-editor-note');
    this.status = el('p', 'note-editor-status');

    for (const input of [this.titleInput, this.bodyInput, this.tagsInput]) input.addEventListener('input', () => this.refresh());
    form.append(
      this.photoBox,
      photoRow,
      this.titleInput,
      this.bodyInput,
      this.checklistBox,
      this.tagsInput,
      this.tagChips,
      this.suggestBox,
      this.tintRow,
      timeRow,
      this.kindNote,
      this.status,
    );
    this.root.append(head, form);
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.onKey);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /**
   * 입력 화면을 연다. initial 이 없으면 now 시각의 새 노트이고, 있으면 그 노트를 고친다(photo 는 원래 사진).
   * 새 노트에 사진을 고르면 시각을 직접 바꾸지 않은 한 사진의 촬영 시각으로 옮긴다
   */
  show(now: number, initial?: { draft: NoteDraft; photo?: PhotoSource }): void {
    this.disarmCancel();
    this.generation++;
    this.isNew = !initial;
    this.timeTouched = false;
    this.saving = false;
    const d = initial?.draft;
    this.heading.textContent = initial ? '노트 고치기' : '새 노트';
    this.titleInput.value = d?.title ?? '';
    this.bodyInput.value = d?.body ?? '';
    this.checklistRows.replaceChildren();
    for (const item of d?.checklist ?? []) this.addRow(item, null);
    this.buildSuggestions();
    this.setChecklistMode(d?.checklist !== undefined, false);
    this.tagsInput.value = (d?.tags ?? []).join(' ');
    this.timeInput.value = toLocalInput(d?.time ?? now);
    this.setTint(d?.tint ?? 0);
    this.original = initial?.photo ?? null;
    this.photoFile = undefined;
    this.photoSize = this.original ? { width: this.original.width, height: this.original.height } : undefined;
    this.status.textContent = '';
    this.drawPhoto(this.original);
    this.root.hidden = false;
    document.body.classList.add('note-editor-open');
    this.refresh();
    this.initialDraft = this.draft();
    // 새 메모는 바로 쓸 수 있게 제목에 입력 초점을 둔다
    if (this.isNew) this.titleInput.focus({ preventScroll: true });
  }

  hide(): void {
    if (!this.open) return;
    this.disarmCancel();
    this.generation++;
    this.root.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.body.classList.remove('note-editor-open');
  }

  dispose(): void {
    this.disarmCancel();
    window.removeEventListener('keydown', this.onKey);
    this.hide();
    this.root.remove();
  }

  /** 고친 내용이 있는지 */
  isDirty(): boolean {
    return this.photoFile !== undefined || (this.initialDraft !== null && !sameDraft(this.initialDraft, this.draft()));
  }

  /** 취소 요청: 고친 내용이 있으면 한 번 더 확인하고, 없거나 이미 확인 중이면 닫는다 */
  requestCancel(): void {
    if (!this.open) return;
    if (!this.isDirty() || this.cancelArmed) {
      this.disarmCancel();
      this.options.onCancel();
      return;
    }
    this.cancelArmed = true;
    this.cancelButton.textContent = '변경 버리기';
    this.cancelButton.classList.add('armed');
    this.status.textContent = DIRTY_PROMPT;
    if (this.cancelTimer !== null) window.clearTimeout(this.cancelTimer);
    this.cancelTimer = window.setTimeout(() => this.disarmCancel(), tuning.album.confirmResetSec * 1000);
  }

  private disarmCancel(): void {
    if (this.cancelTimer !== null) {
      window.clearTimeout(this.cancelTimer);
      this.cancelTimer = null;
    }
    this.cancelArmed = false;
    this.cancelButton.textContent = '취소';
    this.cancelButton.classList.remove('armed');
    if (this.status.textContent === DIRTY_PROMPT) this.status.textContent = '';
  }

  private buildSuggestions(): void {
    const tags = this.options.suggestedTags?.() ?? [];
    this.suggestBox.hidden = tags.length === 0;
    if (tags.length === 0) {
      this.suggestBox.replaceChildren();
      return;
    }
    const label = el('span', 'note-editor-label');
    label.textContent = '기존 태그';
    this.suggestBox.replaceChildren(
      label,
      ...tags.map((tag) => {
        const chip = button('note-editor-suggest', `#${tag}`, () => {
          this.tagsInput.value = toggleTagInText(this.tagsInput.value, tag);
          this.refresh();
        });
        chip.dataset.tag = tag;
        return chip;
      }),
    );
  }

  /** 지금 입력 내용(확인 스크립트·저장용) */
  draft(): NoteDraft {
    const parsed = new Date(this.timeInput.value).getTime();
    return {
      time: Number.isFinite(parsed) ? parsed : Date.now(),
      title: this.titleInput.value,
      body: this.checklistMode ? '' : this.bodyInput.value,
      checklist: this.checklistMode ? this.items() : undefined,
      tags: parseTags(this.tagsInput.value),
      tint: this.photoSize ? undefined : this.tint,
      photo: this.photoSize,
    };
  }

  /** 확인 스크립트가 입력 칸을 채운다 */
  fill(values: { title?: string; body?: string; checklist?: readonly ChecklistItem[]; tags?: string; tint?: number }): void {
    if (values.title !== undefined) this.titleInput.value = values.title;
    if (values.body !== undefined) this.bodyInput.value = values.body;
    if (values.checklist !== undefined) {
      this.checklistRows.replaceChildren();
      for (const item of values.checklist) this.addRow(item, null);
      this.setChecklistMode(true, false);
    }
    if (values.tags !== undefined) this.tagsInput.value = values.tags;
    if (values.tint !== undefined) this.setTint(values.tint);
    this.refresh();
  }

  /** 사진 파일을 고른 것처럼 넣는다 */
  async setPhotoFile(file: File): Promise<void> {
    const gen = this.generation;
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      this.status.textContent = '이 사진 형식은 열 수 없다';
      return;
    }
    if (gen !== this.generation) {
      bitmap.close();
      return;
    }
    this.photoFile = file;
    this.photoSize = { width: bitmap.width, height: bitmap.height };
    this.status.textContent = '';
    this.paint(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    this.refresh();
    if (this.isNew && !this.timeTouched && this.options.readTakenAt) {
      const taken = await this.options.readTakenAt(file);
      if (taken !== undefined && gen === this.generation && !this.timeTouched) this.timeInput.value = toLocalInput(taken);
    }
  }

  /** 지금 항목 줄들(빈 항목 포함) */
  private items(): ChecklistItem[] {
    return [...this.checklistRows.querySelectorAll<HTMLElement>('.note-editor-check')].map((row) => ({
      text: row.querySelector<HTMLInputElement>('.note-editor-check-text')?.value ?? '',
      done: row.querySelector<HTMLInputElement>('.note-editor-check-box')?.checked ?? false,
    }));
  }

  /**
   * 체크리스트로 쓰거나 글로 되돌린다. convert 면 본문 줄을 항목으로(켤 때), 항목을 본문 줄로(끌 때) 옮긴다.
   * 켰을 때 항목이 없으면 빈 항목 하나를 두고, 사람이 누른 것이면(convert) 마지막 항목에 입력 초점을 둔다
   */
  private setChecklistMode(on: boolean, convert: boolean): void {
    if (convert && on && !this.checklistMode) {
      this.checklistRows.replaceChildren();
      for (const item of linesToChecklist(this.bodyInput.value)) this.addRow(item, null);
      this.bodyInput.value = '';
    } else if (convert && !on && this.checklistMode) {
      this.bodyInput.value = checklistToLines(this.items());
      this.checklistRows.replaceChildren();
    }
    this.checklistMode = on;
    if (on && this.checklistRows.childElementCount === 0) this.addRow(undefined, null);
    this.bodyInput.hidden = on;
    this.checklistBox.hidden = !on;
    this.checklistButton.textContent = on ? '글로 바꾸기' : '체크리스트로';
    if (convert) {
      const focusTarget = on
        ? this.checklistRows.lastElementChild?.querySelector<HTMLInputElement>('.note-editor-check-text')
        : this.bodyInput;
      focusTarget?.focus({ preventScroll: true });
    }
    this.refresh();
  }

  /** after 줄 뒤에(null 이면 맨 끝에) 항목 줄을 더하고 그 글 칸을 돌려준다 */
  private addRow(item: ChecklistItem | undefined, after: HTMLElement | null): HTMLInputElement {
    const row = el('div', 'note-editor-check');
    const box = el('input', 'note-editor-check-box');
    box.type = 'checkbox';
    box.checked = item?.done ?? false;
    box.setAttribute('aria-label', '끝냄');
    const text = el('input', 'note-editor-input note-editor-check-text');
    text.type = 'text';
    text.value = item?.text ?? '';
    text.placeholder = '항목';
    text.enterKeyHint = 'next';
    const remove = button('note-button note-editor-check-remove', '✕', () => this.removeRow(row, false));
    remove.setAttribute('aria-label', '항목 지우기');
    box.addEventListener('change', () => {
      row.classList.toggle('done', box.checked);
      this.refresh();
    });
    text.addEventListener('input', () => this.refresh());
    text.addEventListener('keydown', (e) => {
      // 한글 조합 중의 엔터·지우기는 조합을 끝내는 입력이라 건드리지 않는다
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addRow(undefined, row).focus();
      } else if (e.key === 'Backspace' && text.value === '' && this.checklistRows.childElementCount > 1) {
        e.preventDefault();
        this.removeRow(row, true);
      }
    });
    row.append(box, text, remove);
    if (after) after.after(row);
    else this.checklistRows.append(row);
    row.classList.toggle('done', box.checked);
    this.refresh();
    return text;
  }

  /** 항목 줄을 지운다. focusPrev 면 위 줄(없으면 아래 줄) 끝에 입력 초점을 둔다. 마지막 한 줄은 비우기만 한다 */
  private removeRow(row: HTMLElement, focusPrev: boolean): void {
    const neighbor = (row.previousElementSibling ?? row.nextElementSibling) as HTMLElement | null;
    if (!neighbor) {
      const text = row.querySelector<HTMLInputElement>('.note-editor-check-text');
      if (text) text.value = '';
      this.refresh();
      return;
    }
    row.remove();
    if (focusPrev) {
      const text = neighbor.querySelector<HTMLInputElement>('.note-editor-check-text');
      if (text) {
        text.focus({ preventScroll: true });
        text.setSelectionRange(text.value.length, text.value.length);
      }
    }
    this.refresh();
  }

  private dropPhoto(): void {
    this.photoFile = this.original ? null : undefined;
    this.photoSize = undefined;
    this.drawPhoto(null);
    this.refresh();
  }

  private setTint(i: number): void {
    const n = this.swatches.length;
    this.tint = ((i % n) + n) % n;
    this.swatches.forEach((s, k) => s.classList.toggle('active', k === this.tint));
  }

  private drawPhoto(photo: PhotoSource | null): void {
    this.photoBox.hidden = !photo;
    if (!photo) return;
    const gen = this.generation;
    const width = Math.max(1, Math.round(Math.min(tuning.album.editorPhotoPx * window.devicePixelRatio, photo.width)));
    const result = photo.render(width, true);
    const draw = (image: CanvasImageSource) => {
      if (gen === this.generation && this.photoFile === undefined) this.paint(image, photo.width, photo.height);
      releasePhoto(image);
    };
    if (result instanceof Promise) result.then(draw, () => undefined);
    else draw(result);
  }

  private paint(image: CanvasImageSource, w: number, h: number): void {
    const width = Math.max(1, Math.round(Math.min(tuning.album.editorPhotoPx * window.devicePixelRatio, w)));
    this.photoCanvas.width = width;
    this.photoCanvas.height = Math.max(1, Math.round((width * h) / Math.max(1, w)));
    const ctx = this.photoCanvas.getContext('2d');
    ctx?.drawImage(image, 0, 0, this.photoCanvas.width, this.photoCanvas.height);
    this.photoBox.hidden = false;
  }

  /** 태그 미리보기, 추천 칩, 종류 안내, 색 줄, 저장 단추를 지금 입력에 맞춘다 */
  private refresh(): void {
    this.disarmCancel();
    const draft = this.draft();
    this.tagChips.replaceChildren(
      ...draft.tags.map((t) => {
        const chip = el('span', 'note-editor-chip');
        chip.textContent = `#${t}`;
        return chip;
      }),
    );
    for (const chip of this.suggestBox.querySelectorAll<HTMLButtonElement>('.note-editor-suggest')) {
      const active = chip.dataset.tag !== undefined && draft.tags.includes(chip.dataset.tag);
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', String(active));
    }
    const kind = noteKindOf(draft);
    this.kindNote.textContent = KIND_NOTE[kind];
    this.tintRow.hidden = kind !== 'memo';
    this.pickButton.textContent = this.photoSize ? '사진 바꾸기' : '사진 고르기';
    this.dropButton.hidden = !this.photoSize;
    this.saveButton.disabled = this.saving || !draftHasContent(draft);
  }

  private async save(): Promise<void> {
    const draft = this.draft();
    if (!this.open || this.saving || !draftHasContent(draft)) return;
    this.saving = true;
    this.refresh();
    this.status.textContent = '저장하는 중';
    try {
      await this.options.onSave({ draft, photo: this.photoFile });
      this.status.textContent = '';
    } catch (err) {
      this.status.textContent = `저장하지 못했다: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.saving = false;
      if (this.open) this.refresh();
    }
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}
