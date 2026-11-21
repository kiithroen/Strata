import { mergeRecords, noteFileName, noteIdOf, parseNoteRecord, photoFileName, type NoteRecord } from '../sync/noteRecord';
import type { NoteStore } from './noteStore';

/** 노트 사본을 두는 앱 밖 폴더. name 은 폴더 안의 파일 이름이다 */
export interface BackupFolder {
  /** 폴더의 파일 이름들. 폴더가 없으면 만들고 빈 목록, 쓸 수 없으면 오류다 */
  list(): Promise<string[]>;
  readText(name: string): Promise<string | null>;
  writeText(name: string, text: string): Promise<void>;
  readBlob(name: string): Promise<Blob | null>;
  writeBlob(name: string, blob: Blob): Promise<void>;
  /** 없어도 오류를 내지 않는다 */
  remove(name: string): Promise<void>;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const PHOTO_NAME = /^photo-(.+)\.[a-z0-9]+$/i;
/** 갤러리 앱이 폴더의 사진을 사진첩에 올리지 않게 하는 표시 파일 */
export const NO_MEDIA = '.nomedia';

export interface BackupResult {
  /** 폴더에서 받아 앱 저장소에 넣은 노트 수 */
  downloaded: number;
  /** 폴더에 새로 쓰거나 고쳐 쓴 노트 수 */
  uploaded: number;
}

/**
 * 앱 저장소를 감싸 노트를 앱 밖 폴더에도 쓴다. 폴더는 드라이브와 같은 모양(노트마다 note-<번호>.json 과 photo-<번호>.<확장자>)이라
 * 앱을 지워도 남고, 다시 설치하면 sync 가 되살린다. 화면은 앱 저장소만 읽는다.
 * sync 가 한 번 성공한 뒤부터 put 마다 폴더에 쓴다. 폴더 쓰기는 저장을 기다리게 하지 않고 차례로 돌며, 실패해도 저장은 그대로다
 * (다음 sync 가 수정 시각으로 다시 맞춘다)
 */
export class BackupNoteStore implements NoteStore {
  private active = false;
  /** 폴더에 있는 노트별 사진 파일 이름 */
  private readonly photoNames = new Map<string, string>();
  /** 폴더 작업을 차례로 돌린다 */
  private chain: Promise<void> = Promise.resolve();
  /** sync 가 도는 동안 저장한 노트. 그 노트는 폴더 쪽으로 덮어쓰지 않는다 */
  private touched: Set<string> | null = null;
  /** 첫 sync 가 끝날 때까지 사이에 저장한 노트. 맞추기가 끝난 뒤 폴더에 쓴다 */
  private dirtyDuringSync: Map<string, { record: NoteRecord; photo: Blob | null | undefined }> | null = null;
  /** 마지막 폴더 작업의 오류. 성공하면 비운다 */
  lastError: string | null = null;

  constructor(
    private readonly inner: NoteStore,
    private readonly folder: BackupFolder,
    private readonly onDownload?: (records: NoteRecord[]) => void,
  ) {}

  /** 폴더에 쓰고 있는지(sync 가 한 번 성공했는지) */
  get enabled(): boolean {
    return this.active;
  }

  list(): Promise<NoteRecord[]> {
    return this.inner.list();
  }

  photo(id: string): Promise<Blob | null> {
    return this.inner.photo(id);
  }

  async put(record: NoteRecord, photo?: Blob | null): Promise<void> {
    this.touched?.add(record.id);
    await this.inner.put(record, photo);
    // 실패는 lastError 로 남고 다음 sync 가 다시 맞춘다
    if (this.active) {
      this.queue(() => this.mirror(record, photo)).catch(() => undefined);
    } else if (this.dirtyDuringSync) {
      const prev = this.dirtyDuringSync.get(record.id);
      this.dirtyDuringSync.set(record.id, { record, photo: photo === undefined ? prev?.photo : photo });
    }
  }

  /** 기다리던 폴더 작업이 다 끝나면 끝난다 */
  flush(): Promise<void> {
    return this.chain;
  }

  /**
   * 폴더와 앱 저장소를 맞춘다(수정 시각이 늦은 쪽이 이긴다, mergeRecords). 폴더에만 있거나 폴더가 새 노트는 앱 저장소에 넣고,
   * 앱 저장소에만 있거나 앱이 새 노트는 폴더에 쓴다. 성공하면 그 뒤로 put 마다 폴더에 쓴다
   */
  sync(): Promise<BackupResult> {
    return this.queue(async () => {
      this.touched = new Set();
      this.dirtyDuringSync = new Map();
      try {
        return await this.reconcile();
      } finally {
        this.touched = null;
        this.dirtyDuringSync = null;
      }
    });
  }

  private queue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task);
    this.chain = run.then(
      () => {
        this.lastError = null;
      },
      (err: unknown) => {
        this.lastError = err instanceof Error ? err.message : String(err);
        console.warn('노트 백업 폴더 작업 실패', err);
      },
    );
    return run;
  }

  private async reconcile(): Promise<BackupResult> {
    const names = await this.folder.list();
    if (!names.includes(NO_MEDIA)) await this.folder.writeText(NO_MEDIA, '');
    this.photoNames.clear();
    const remote: NoteRecord[] = [];
    for (const name of names) {
      const photoId = PHOTO_NAME.exec(name)?.[1];
      if (photoId) {
        this.photoNames.set(photoId, name);
        continue;
      }
      const id = noteIdOf(name);
      if (!id) continue;
      const record = parseRemote(await this.folder.readText(name));
      if (record && record.id === id) remote.push(record);
    }

    const local = await this.inner.list();
    const { upload, download } = mergeRecords(local, remote);
    const downloadedRecords: NoteRecord[] = [];
    for (const r of download) {
      if (this.touched?.has(r.id)) continue;
      const blob = r.photo && !r.deleted ? await this.folderPhoto(r.id) : null;
      if (this.touched?.has(r.id)) continue;
      // 사진 정보가 있는데 폴더에 사진 파일이 없으면 앱에 있던 사진을 그대로 둔다
      await this.inner.put(r, r.photo && !r.deleted ? (blob ?? undefined) : null);
      downloadedRecords.push(r);
    }
    const uploadIds = new Set(upload.map((r) => r.id));
    let uploaded = 0;
    for (const r of upload) {
      if (this.touched?.has(r.id)) continue;
      // 로컬 사진을 읽지 못해 null 이 와도 폴더에 남아 있던 백업 사진을 지우지 않는다
      const blob = r.photo && !r.deleted ? ((await this.inner.photo(r.id)) ?? undefined) : null;
      if (this.touched?.has(r.id)) continue;
      await this.mirror(r, blob);
      uploaded++;
    }
    // 기록은 같은데 폴더에 사진 파일이 빠진 노트는 사진만 채운다
    for (const r of local) {
      if (this.touched?.has(r.id) || uploadIds.has(r.id) || r.deleted || !r.photo || this.photoNames.has(r.id)) continue;
      const blob = await this.inner.photo(r.id);
      if (this.touched?.has(r.id)) continue;
      if (blob) await this.writePhoto(r.id, blob);
    }
    if (!this.active && this.dirtyDuringSync) {
      while (this.dirtyDuringSync.size > 0) {
        const batch = [...this.dirtyDuringSync.entries()];
        this.dirtyDuringSync.clear();
        for (const [, entry] of batch) await this.mirror(entry.record, entry.photo);
      }
    }
    this.active = true;
    if (downloadedRecords.length > 0) this.onDownload?.(downloadedRecords);
    return { downloaded: downloadedRecords.length, uploaded };
  }

  /** 기록 하나를 폴더에 쓴다. photo 가 Blob 이면 사진을 바꾸고, null 이면 지우며, 없으면 그대로 둔다. 사진을 먼저 쓴다 */
  private async mirror(record: NoteRecord, photo?: Blob | null): Promise<void> {
    if (photo) await this.writePhoto(record.id, photo);
    else if (photo === null) {
      const old = this.photoNames.get(record.id);
      if (old) {
        await this.folder.remove(old);
        this.photoNames.delete(record.id);
      }
    }
    await this.folder.writeText(noteFileName(record.id), JSON.stringify(record));
  }

  private async writePhoto(id: string, blob: Blob): Promise<void> {
    const name = photoFileName(id, EXT[blob.type] ?? 'jpg');
    await this.folder.writeBlob(name, blob);
    const old = this.photoNames.get(id);
    if (old && old !== name) await this.folder.remove(old);
    this.photoNames.set(id, name);
  }

  private async folderPhoto(id: string): Promise<Blob | null> {
    const name = this.photoNames.get(id);
    return name ? this.folder.readBlob(name) : null;
  }
}

function parseRemote(text: string | null): NoteRecord | null {
  if (text === null) return null;
  try {
    return parseNoteRecord(JSON.parse(text));
  } catch {
    return null;
  }
}
