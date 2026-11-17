import type { NoteDraft } from '../album/albumModel';
import type { PhotoSource } from '../widgets/noteCard/cardTexture';
import { NoteEditor, type EditorResult } from '../widgets/noteView/NoteEditor';
import { NoteViewer } from '../widgets/noteView/NoteViewer';
import type { NoteRef } from '../widgets/timeAxis/axisModel';
import { OverlayStack } from './overlayStack';

/** 메모 앨범 동작. 우주 보기가 앨범 노트를 띄울 때 넘긴다 */
export interface AlbumActions {
  /** 저장소에 있어 고치고 지울 수 있는 노트인지 */
  editable(id: string): boolean;
  /** 고칠 노트의 지금 내용 */
  draft(id: string): NoteDraft | undefined;
  /** 입력 내용을 저장하고 노트 번호를 돌려준다(id 가 없으면 새 노트). 화면은 바꾸지 않는다 */
  save(result: EditorResult, id?: string): Promise<string>;
  remove(id: string): Promise<void>;
  /** 앨범을 다시 띄운다. focusId 가 있으면 그 노트의 묶음으로 다가간다 */
  reload(focusId?: string): void;
  readTakenAt?: (file: File) => Promise<number | undefined>;
}

/**
 * 우주 보기 위에 겹쳐 여는 노트 보기·입력 화면과 그 방문 기록. 저장·삭제 뒤에는 열린 화면과 아래 화면(카드 보기·지층 보기)이
 * 쌓은 기록을 한꺼번에 되돌린 다음 앨범을 다시 띄운다.
 */
export class NoteScreens {
  readonly viewer: NoteViewer;
  readonly editor: NoteEditor | null;
  private readonly stack = new OverlayStack();
  /** 입력 화면이 고치는 노트 번호(새 노트면 undefined) */
  private editing: string | undefined;

  constructor(
    private readonly notes: readonly NoteRef[],
    private readonly photos: readonly (PhotoSource | undefined)[],
    private readonly album: AlbumActions | undefined,
    /** 아래 화면을 기록은 그대로 두고 닫고, 그 화면들이 쌓았던 기록 수를 돌려준다 */
    private readonly dismissBelow: () => number,
  ) {
    const editable = album !== undefined;
    this.viewer = new NoteViewer({
      onClose: () => this.stack.back(),
      onEdit: editable ? (id) => this.edit(id) : undefined,
      onDelete: editable ? (id) => void this.remove(id).catch((err) => console.error(err)) : undefined,
    });
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

  /** 노트 번호(notes 안의 순서)를 보기 화면으로 연다 */
  openNote(index: number): void {
    const note = this.notes[index];
    if (!note) return;
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
    this.stack.dispose();
    this.viewer.dispose();
    this.editor?.dispose();
  }

  private async save(result: EditorResult): Promise<void> {
    const album = this.album;
    if (!album) return;
    // 저장이 실패하면 입력 화면을 그대로 두어 글을 잃지 않는다
    const id = await album.save(result, this.editing);
    await this.leave();
    album.reload(id);
  }

  private async remove(id: string): Promise<void> {
    const album = this.album;
    if (!album) return;
    await album.remove(id);
    await this.leave();
    album.reload();
  }

  /** 열린 화면과 아래 화면을 닫고 그동안 쌓인 기록을 되돌린다 */
  private async leave(): Promise<void> {
    const count = this.stack.hideAll() + this.dismissBelow();
    await this.stack.rewind(count);
  }
}
