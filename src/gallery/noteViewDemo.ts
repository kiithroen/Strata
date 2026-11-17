import { createFakeNoteData } from '../dev/noteData';
import { draftFromRecord } from '../album/albumModel';
import type { NoteRecord } from '../sync/noteRecord';
import { NoteEditor } from '../widgets/noteView/NoteEditor';
import { NoteViewer, type ViewedNote } from '../widgets/noteView/NoteViewer';
import type { Stage, WidgetDemo } from './stage';

export interface NoteViewDemo extends WidgetDemo {
  readonly viewer: NoteViewer;
  readonly editor: NoteEditor;
  /** 보기 화면에 띄울 수 있는 샘플 노트(사진·메모·문서) */
  readonly samples: readonly ViewedNote[];
}

/**
 * 노트 보기·입력 데모: 가짜 노트에서 사진·메모·문서를 하나씩 골라 보기 화면으로 연다. 편집하면 입력 화면이 열리고,
 * 저장하면 그 내용을 이 데모 안에서만 바꿔 다시 보여 준다. 닫은 뒤 화면을 탭하면 다음 샘플을 연다
 */
export function mountNoteViewDemo(stage: Stage): NoteViewDemo {
  const { notes, photos } = createFakeNoteData(new Date(2026, 10, 15, 21, 30).getTime());
  const samples: ViewedNote[] = (['photo', 'memo', 'doc'] as const).map((kind) => {
    const i = notes.findIndex((n) => n.kind === kind);
    const n = notes[i];
    return { id: n.id, time: n.time, kind, title: n.title, body: n.body, tags: n.tags ?? [], tint: n.tint, photo: photos[i] };
  });
  let shown = 0;
  const viewer: NoteViewer = new NoteViewer({
    onClose: () => viewer.hide(),
    onEdit: () => {
      const note = samples[shown];
      const record: NoteRecord = { v: 1, id: note.id, time: note.time, modified: note.time, kind: note.kind, title: note.title, body: note.body, tags: [...note.tags], tint: note.tint };
      if (note.photo) record.photo = { file: '', width: note.photo.width, height: note.photo.height };
      editor.show(Date.now(), { draft: draftFromRecord(record), photo: note.photo });
    },
    onDelete: () => viewer.hide(),
  });
  const editor: NoteEditor = new NoteEditor({
    onCancel: () => editor.hide(),
    onSave: async ({ draft }) => {
      const note = samples[shown];
      // 데모는 사진을 저장하지 않으니 원래 사진을 그대로 둔다
      samples[shown] = { ...note, time: draft.time, title: draft.title || undefined, body: draft.body || undefined, tags: draft.tags, tint: draft.tint };
      editor.hide();
      viewer.show(samples[shown], true);
    },
  });
  viewer.show(samples[shown], true);
  const canvas = stage.renderer.domElement;
  const next = () => {
    if (viewer.open || editor.open) return;
    shown = (shown + 1) % samples.length;
    viewer.show(samples[shown], true);
  };
  canvas.addEventListener('pointerup', next);
  return {
    title: 'NOTE',
    hint: '편집: 입력 화면 · 닫은 뒤 탭: 다음 샘플',
    viewer,
    editor,
    samples,
    update() {},
    dispose() {
      canvas.removeEventListener('pointerup', next);
      viewer.dispose();
      editor.dispose();
    },
  };
}
