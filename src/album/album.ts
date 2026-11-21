import { photoQueue } from '../dev/localNotes';
import type { NoteData } from '../dev/noteData';
import { albumNotes, contentKey, type NoteRecord } from '../sync/noteRecord';
import type { PhotoSource } from '../widgets/noteCard/cardTexture';
import { deletedRecord, recordFromDraft, newNoteId, type NoteDraft } from './albumModel';
import type { NoteStore } from './noteStore';
import type { SummaryResult } from './summaries';

/**
 * 메모 앨범의 노트: 저장소의 기록을 읽어 두고 은하에 띄울 노트 데이터를 만든다. 저장·지우기는 저장소에 바로 쓴다.
 * 사진은 그릴 때 저장소에서 사본을 읽어 사진 디코딩 큐로 필요한 폭만큼 디코딩한다.
 */
export class Album {
  private records = new Map<string, NoteRecord>();
  private cached: NoteData | null = null;
  private readonly photoBlobs = new Map<string, Promise<Blob | null>>();

  constructor(
    private readonly store: NoteStore,
    /** 저장할 때의 시각(ms). 테스트가 바꾼다 */
    private readonly now: () => number = Date.now,
    private readonly rand: () => number = Math.random,
  ) {}

  async load(): Promise<void> {
    this.records = new Map((await this.store.list()).map((r) => [r.id, r]));
    this.cached = null;
    this.photoBlobs.clear();
  }

  /** 외부 동기화로 저장소에 들어온 기록을 메모리 상태에 반영한다. 수정 시각이 더 늦은 기록만 받는다 */
  applyExternal(records: readonly NoteRecord[]): void {
    let changed = false;
    for (const r of records) {
      const cur = this.records.get(r.id);
      if (cur && cur.modified >= r.modified) continue;
      this.records.set(r.id, structuredClone(r));
      this.photoBlobs.delete(r.id);
      changed = true;
    }
    if (changed) this.cached = null;
  }

  /** 지우지 않은 노트 수 */
  get count(): number {
    let n = 0;
    for (const r of this.records.values()) if (!r.deleted) n++;
    return n;
  }

  /** 지우지 않은 노트의 기록 */
  record(id: string): NoteRecord | undefined {
    const r = this.records.get(id);
    return r && !r.deleted ? r : undefined;
  }

  /** 지우지 않은 노트의 기록 모두 */
  liveRecords(): NoteRecord[] {
    return [...this.records.values()].filter((r) => !r.deleted);
  }

  /**
   * AI 요약과 태그를 노트에 적는다. source 는 요약할 때 글의 contentKey 이고, 그 사이 글이 바뀌었거나 지웠으면 적지 않고 undefined 를 돌려준다.
   * 수정 시각은 그 판보다 1ms 만 늦춘다. 요약은 그 판에서 나온 것이라 다른 기기의 같은 판은 이기고, 그 뒤에 고친 글에는 진다
   */
  async setSummary(id: string, result: SummaryResult, source: string): Promise<NoteRecord | undefined> {
    const r = this.record(id);
    if (!r || contentKey(r) !== source) return undefined;
    const summary: NonNullable<NoteRecord['summary']> = { text: result.summary, source };
    if (result.tags.length > 0) summary.tags = [...result.tags];
    const record: NoteRecord = { ...r, summary, modified: r.modified + 1 };
    await this.store.put(record);
    this.records.set(id, record);
    this.cached = null;
    return record;
  }

  /** 은하에 띄울 노트(최근 것부터)와 사진. 지우지 않은 노트가 없으면 null 이다 */
  data(): NoteData | null {
    if (this.cached) return this.cached;
    const { notes, records } = albumNotes([...this.records.values()]);
    if (notes.length === 0) return null;
    this.cached = { notes, photos: records.map((r) => (r.photo ? this.photoSource(r) : undefined)) };
    return this.cached;
  }

  /**
   * 입력한 노트를 저장하고 기록을 돌려준다. id 가 없으면 새 노트다.
   * photo 가 Blob 이면 사진을 바꾸고(draft.photo 에 그 크기가 있어야 한다), null 이면 지우며, 없으면 그대로 둔다
   */
  async save(draft: NoteDraft, photo?: Blob | null, id?: string): Promise<NoteRecord> {
    const now = this.now();
    const noteId = id ?? this.freshId(now);
    const record = recordFromDraft(noteId, draft, now);
    // 요약은 그대로 옮긴다. 글이 바뀌었으면 지난 요약이 되어 글은 쓰지 않고, 새 요약이 올 때까지 태그만 쓴다
    const before = id ? this.records.get(id)?.summary : undefined;
    if (before) record.summary = before;
    await this.store.put(record, photo);
    this.records.set(noteId, record);
    if (photo !== undefined) this.photoBlobs.delete(noteId);
    this.cached = null;
    return record;
  }

  /**
   * 체크리스트 노트의 항목 하나를 끝냄(done)·안 끝냄으로 바꿔 바로 저장하고 기록을 돌려준다. 수정 시각도 바뀐다.
   * 그런 항목이 없거나 이미 그 상태면 그대로 두고 지금 기록을 돌려준다
   */
  async check(id: string, index: number, done: boolean): Promise<NoteRecord | undefined> {
    const r = this.record(id);
    const item = r?.checklist?.[index];
    if (!r || !item || item.done === done) return r;
    const checklist = r.checklist!.map((it, i) => (i === index ? { text: it.text, done } : { ...it }));
    const record: NoteRecord = { ...r, checklist, modified: this.now() };
    await this.store.put(record);
    this.records.set(id, record);
    this.cached = null;
    return record;
  }

  /** 노트를 지운다. 기록은 지움 표시로 남기고 사진은 지운다 */
  async remove(id: string): Promise<void> {
    const r = this.records.get(id);
    if (!r || r.deleted) return;
    const tomb = deletedRecord(r, this.now());
    await this.store.put(tomb, null);
    this.records.set(id, tomb);
    this.photoBlobs.delete(id);
    this.cached = null;
  }

  private freshId(now: number): string {
    let id = newNoteId(now, this.rand);
    while (this.records.has(id)) id = newNoteId(now, this.rand);
    return id;
  }

  private photoBlob(id: string): Promise<Blob | null> {
    let p = this.photoBlobs.get(id);
    if (!p) {
      p = this.store.photo(id);
      this.photoBlobs.set(id, p);
    }
    return p;
  }

  private photoSource(record: NoteRecord): PhotoSource {
    const { width, height } = record.photo!;
    return {
      width,
      height,
      render: async (targetWidth, urgent) => {
        const blob = await this.photoBlob(record.id);
        if (!blob) throw new Error('사진이 없다');
        return photoQueue.run(
          () => createImageBitmap(blob, { resizeWidth: Math.max(1, Math.round(targetWidth)), resizeQuality: 'medium' }),
          urgent,
        );
      },
    };
  }
}
