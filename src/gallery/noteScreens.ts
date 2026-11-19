import type { NoteDraft } from '../album/albumModel';
import { checklistText } from '../core/checklist';
import type { PhotoSource } from '../widgets/noteCard/cardTexture';
import { NoteEditor, type EditorResult } from '../widgets/noteView/NoteEditor';
import { NoteViewer } from '../widgets/noteView/NoteViewer';
import { sequenceOf, stepSequence, type NoteSequence } from '../widgets/noteView/noteNav';
import type { NoteRef } from '../widgets/timeAxis/axisModel';
import type { CosmosView } from './cosmosDemo';
import { OverlayStack, type OverlayLayer } from './overlayStack';

/** 앨범을 다시 띄울 때 보여 줄 것: 새로 쓴 노트의 묶음(focusNote) 또는 보던 화면(view), 그리고 노트 보기로 열 노트(openNote) */
export interface AlbumReload {
  focusNote?: string;
  view?: CosmosView;
  openNote?: string;
}

/** 메모 앨범 동작. 우주 보기가 앨범 노트를 띄울 때 넘긴다 */
export interface AlbumActions {
  /** 저장소에 있어 고치고 지울 수 있는 노트인지 */
  editable(id: string): boolean;
  /** 고칠 노트의 지금 내용 */
  draft(id: string): NoteDraft | undefined;
  /** 입력 내용을 저장하고 노트 번호를 돌려준다(id 가 없으면 새 노트). 화면은 바꾸지 않는다 */
  save(result: EditorResult, id?: string): Promise<string>;
  remove(id: string): Promise<void>;
  /** 체크리스트 항목 하나의 체크를 바꿔 바로 저장한다. 화면은 바꾸지 않는다 */
  check(id: string, index: number, done: boolean): Promise<void>;
  /** 앨범을 다시 띄운다 */
  reload(target: AlbumReload): void;
  readTakenAt?: (file: File) => Promise<number | undefined>;
}

/**
 * 우주 보기 위에 겹쳐 여는 노트 보기·입력 화면과 그 방문 기록. 저장·삭제 뒤에는 열린 화면과 아래 화면(카드 보기·지층 보기)이
 * 쌓은 기록을 한꺼번에 되돌린 다음 앨범을 다시 띄운다. 새 노트는 그 노트의 묶음으로 다가가고, 고치거나 지웠으면
 * 보던 화면을 되살린다(고쳤으면 그 노트의 보기 화면도 다시 연다).
 * 보기 화면은 연 자리의 노트 묶음(카드 목록의 묶음, 검색 결과의 묶음, 은하의 행성) 안에서 이전·다음으로 넘긴다.
 * 넘겨도 방문 기록은 쌓지 않아 뒤로 한 번에 보기 화면을 닫는다.
 * 보기 화면에서 체크리스트 항목을 체크하면 바로 저장하고, 보기 화면을 닫을 때 앨범을 다시 띄워 카드에도 반영한다(보던 화면은 되살린다).
 */
export class NoteScreens {
  readonly viewer: NoteViewer;
  readonly editor: NoteEditor | null;
  private readonly stack = new OverlayStack();
  /** 입력 화면이 고치는 노트 번호(새 노트면 undefined) */
  private editing: string | undefined;
  /** 보기 화면이 넘길 차례 */
  private sequence: NoteSequence | null = null;
  /** 보기 화면에서 체크를 바꿨는지. 닫을 때 앨범을 다시 띄운다 */
  private checked = false;
  /** 저장·삭제·체크 반영으로 화면을 모두 닫는 중인지 */
  private leaving = false;
  /** 방문 기록에 쌓는 보기 화면. 닫힐 때 체크를 바꿨으면 앨범을 다시 띄운다 */
  private readonly viewerLayer: OverlayLayer = {
    hide: () => {
      this.viewer.hide();
      if (this.checked && !this.leaving) {
        this.checked = false;
        void this.refresh().catch((err) => console.error(err));
      }
    },
  };
  /** 방향키는 보기 화면이 맨 위에 있을 때만 넘긴다(입력 화면의 글 칸에서는 커서를 옮긴다) */
  private readonly onKey = (e: KeyboardEvent) => {
    if (this.stack.top !== this.viewerLayer || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    this.step(e.key === 'ArrowRight' ? 1 : -1);
  };

  constructor(
    private readonly notes: readonly NoteRef[],
    private readonly photos: readonly (PhotoSource | undefined)[],
    private readonly album: AlbumActions | undefined,
    /** 지금 보는 우주 보기 화면 */
    private readonly snapshot: () => CosmosView,
    /** 아래 화면을 기록은 그대로 두고 닫고, 그 화면들이 쌓았던 기록 수를 돌려준다 */
    private readonly dismissBelow: () => number,
    /** 연 쪽이 넘길 차례를 주지 않았을 때 노트가 속한 묶음의 노트 번호들(최근 것부터) */
    private readonly groupOf: (index: number) => readonly number[] = (index) => [index],
    extras?: { onTagClick?: (tag: string) => void; suggestedTags?: () => readonly string[] },
  ) {
    const editable = album !== undefined;
    this.viewer = new NoteViewer({
      onClose: () => void this.back(),
      onEdit: editable ? (id) => this.edit(id) : undefined,
      onDelete: editable ? (id) => void this.remove(id).catch((err) => console.error(err)) : undefined,
      onStep: (dir) => this.step(dir),
      onCheck: editable ? (id, index, done) => void this.check(id, index, done) : undefined,
      onTagClick: extras?.onTagClick,
    });
    window.addEventListener('keydown', this.onKey);
    this.editor = album
      ? new NoteEditor({
          onCancel: () => this.stack.back(),
          onSave: (result) => this.save(result),
          readTakenAt: album.readTakenAt,
          suggestedTags: extras?.suggestedTags,
        })
      : null;
  }

  /** 열린 화면이 있는지 */
  get open(): boolean {
    return this.stack.depth > 0;
  }

  /** 맨 위 화면을 닫는다(Esc). 열린 화면이 없으면 false */
  back(): boolean {
    if (this.stack.depth === 0) return false;
    if (this.editor && this.stack.top === this.editor) {
      this.editor.requestCancel();
      return true;
    }
    // 체크를 바꾼 보기 화면은 그 기록까지 한꺼번에 되돌리고 앨범을 다시 띄운다
    if (this.stack.top === this.viewerLayer && this.checked) {
      this.checked = false;
      void this.refresh().catch((err) => console.error(err));
    } else this.stack.back();
    return true;
  }

  /** 태그 검색을 위해 열린 보기·입력 화면을 닫고 기록을 되돌린 뒤 openSearch 를 부른다 */
  async closeForTag(tag: string, openSearch: (query: string) => void): Promise<void> {
    if (this.checked) {
      this.checked = false;
      const view = { ...this.snapshot(), search: `#${tag}` };
      await this.leave();
      this.album?.reload({ view });
      return;
    }
    const count = this.stack.hideAll();
    await this.stack.rewind(count);
    openSearch(`#${tag}`);
  }

  /**
   * 노트 번호(notes 안의 순서)를 보기 화면으로 연다. members 는 넘길 차례의 노트 번호들(최근 것부터)이고,
   * 없으면 노트가 속한 묶음이다
   */
  openNote(index: number, members?: readonly number[]): void {
    if (!this.notes[index]) return;
    this.showSequence(sequenceOf(members ?? this.groupOf(index), index));
  }

  /** 보기 화면에서 이전(-1)·다음(1) 노트로 넘긴다. 끝이면 그대로다 */
  step(dir: 1 | -1): boolean {
    if (!this.viewer.open || !this.sequence) return false;
    const next = stepSequence(this.sequence, dir);
    if (!next) return false;
    this.showSequence(next, dir);
    return true;
  }

  private showSequence(seq: NoteSequence, enter?: 1 | -1): void {
    const index = seq.members[seq.position];
    const note = this.notes[index];
    if (!note) return;
    this.sequence = seq;
    this.viewer.show(
      {
        id: note.id,
        time: note.time,
        kind: note.kind ?? 'photo',
        title: note.title,
        body: note.body,
        checklist: note.checklist,
        tags: note.tags ?? [],
        autoTags: note.autoTags,
        tint: note.tint,
        photo: this.photos[index],
      },
      this.album?.editable(note.id) ?? false,
      { position: seq.position, total: seq.members.length },
      enter,
    );
    if (!this.stack.has(this.viewerLayer)) this.stack.push(this.viewerLayer);
  }

  /** 새 노트 입력 화면을 연다 */
  compose(): void {
    if (!this.editor) return;
    this.editing = undefined;
    this.editor.show(Date.now());
    if (!this.stack.has(this.editor)) this.stack.push(this.editor);
  }

  /** 저장된 노트를 고치는 입력 화면을 연다 */
  edit(id: string): void {
    const draft = this.album?.draft(id);
    if (!this.editor || !draft) return;
    this.editing = id;
    const index = this.notes.findIndex((n) => n.id === id);
    this.editor.show(Date.now(), { draft, photo: index >= 0 ? this.photos[index] : undefined });
    if (!this.stack.has(this.editor)) this.stack.push(this.editor);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.stack.dispose();
    this.viewer.dispose();
    this.editor?.dispose();
  }

  private async save(result: EditorResult): Promise<void> {
    const album = this.album;
    if (!album) return;
    // 저장이 실패하면 입력 화면을 그대로 두어 글을 잃지 않는다
    const editing = this.editing;
    const id = await album.save(result, editing);
    const view = editing === undefined ? undefined : this.snapshot();
    await this.leave();
    album.reload(editing === undefined ? { focusNote: id } : { view, openNote: id });
  }

  /** 체크를 저장하고 이 화면의 노트에도 적어 둔다(넘겼다 돌아와도 보이게). 실패하면 보기 화면을 저장된 상태로 다시 그린다 */
  private async check(id: string, index: number, done: boolean): Promise<void> {
    const album = this.album;
    if (!album) return;
    try {
      await album.check(id, index, done);
    } catch (err) {
      console.error(err);
      if (this.viewer.current === id && this.sequence) this.showSequence(this.sequence);
      return;
    }
    const note = this.notes.find((n) => n.id === id);
    const items = note?.checklist;
    if (!note || !items?.[index]) return;
    const next = items.map((item, i) => (i === index ? { text: item.text, done } : item));
    note.checklist = next;
    note.body = checklistText(next);
    this.checked = true;
  }

  /**
   * 체크를 바꾼 보기 화면을 닫는다(이미 뒤로 닫혔으면 그 아래부터): 열린 화면과 아래 화면을 닫고 기록을 되돌린 뒤
   * 보던 화면으로 앨범을 다시 띄운다
   */
  private async refresh(): Promise<void> {
    const album = this.album;
    if (!album) return;
    const view = this.snapshot();
    await this.leave();
    album.reload({ view });
  }

  private async remove(id: string): Promise<void> {
    const album = this.album;
    if (!album) return;
    await album.remove(id);
    const view = this.snapshot();
    await this.leave();
    album.reload({ view });
  }

  /** 열린 화면과 아래 화면을 닫고 그동안 쌓인 기록을 되돌린다 */
  private async leave(): Promise<void> {
    this.leaving = true;
    const count = this.stack.hideAll() + this.dismissBelow();
    await this.stack.rewind(count);
  }
}
