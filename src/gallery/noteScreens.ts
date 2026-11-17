import type { NoteDraft } from '../album/albumModel';
import type { PhotoSource } from '../widgets/noteCard/cardTexture';
import { NoteEditor, type EditorResult } from '../widgets/noteView/NoteEditor';
import { NoteViewer } from '../widgets/noteView/NoteViewer';
import { sequenceOf, stepSequence, type NoteSequence } from '../widgets/noteView/noteNav';
import type { NoteRef } from '../widgets/timeAxis/axisModel';
import type { CosmosView } from './cosmosDemo';
import { OverlayStack } from './overlayStack';

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
 */
export class NoteScreens {
  readonly viewer: NoteViewer;
  readonly editor: NoteEditor | null;
  private readonly stack = new OverlayStack();
  /** 입력 화면이 고치는 노트 번호(새 노트면 undefined) */
  private editing: string | undefined;
  /** 보기 화면이 넘길 차례 */
  private sequence: NoteSequence | null = null;
  /** 방향키는 보기 화면이 맨 위에 있을 때만 넘긴다(입력 화면의 글 칸에서는 커서를 옮긴다) */
  private readonly onKey = (e: KeyboardEvent) => {
    if (this.stack.top !== this.viewer || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
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
  ) {
    const editable = album !== undefined;
    this.viewer = new NoteViewer({
      onClose: () => this.stack.back(),
      onEdit: editable ? (id) => this.edit(id) : undefined,
      onDelete: editable ? (id) => void this.remove(id).catch((err) => console.error(err)) : undefined,
      onStep: (dir) => this.step(dir),
    });
    window.addEventListener('keydown', this.onKey);
    this.editor = album
      ? new NoteEditor({
          onCancel: () => this.stack.back(),
          onSave: (result) => this.save(result),
          readTakenAt: album.readTakenAt,
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
    this.stack.back();
    return true;
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
        tags: note.tags ?? [],
        tint: note.tint,
        photo: this.photos[index],
      },
      this.album?.editable(note.id) ?? false,
      { position: seq.position, total: seq.members.length },
      enter,
    );
    if (!this.stack.has(this.viewer)) this.stack.push(this.viewer);
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
    const count = this.stack.hideAll() + this.dismissBelow();
    await this.stack.rewind(count);
  }
}
