import { Capacitor } from '@capacitor/core';
import type { NoteRecord } from '../sync/noteRecord';

/**
 * 메모 앨범의 로컬 저장소. 노트 기록(지움 표시 포함)과 노트마다 사진 사본 하나를 둔다. 화면은 이것만 읽는다.
 * 브라우저는 IndexedDB 구현(IdbNoteStore)을, 안드로이드 앱은 SQLite·앱 파일 저장소 구현(SqliteNoteStore)을 쓴다.
 */
export interface NoteStore {
  /** 모든 기록(지움 표시 포함) */
  list(): Promise<NoteRecord[]>;
  /** 기록을 넣거나 바꾼다. photo 가 Blob 이면 사진을 바꾸고 null 이면 지우며, 없으면 그대로 둔다 */
  put(record: NoteRecord, photo?: Blob | null): Promise<void>;
  /** 노트의 사진 사본. 없으면 null */
  photo(id: string): Promise<Blob | null>;
}

/** 메모리에만 두는 저장소. 테스트와 IndexedDB 를 못 쓸 때(사생활 보호 창 등) 쓴다. 다시 불러오면 비어 있다 */
export class MemoryNoteStore implements NoteStore {
  private readonly records = new Map<string, NoteRecord>();
  private readonly photos = new Map<string, Blob>();

  async list(): Promise<NoteRecord[]> {
    return [...this.records.values()].map((r) => structuredClone(r));
  }

  async put(record: NoteRecord, photo?: Blob | null): Promise<void> {
    this.records.set(record.id, structuredClone(record));
    if (photo === null) this.photos.delete(record.id);
    else if (photo) this.photos.set(record.id, photo);
  }

  async photo(id: string): Promise<Blob | null> {
    return this.photos.get(id) ?? null;
  }
}

const DB_NAME = 'strata';
const NOTES = 'notes';
const PHOTOS = 'photos';

function promised<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('저장이 중단됐다'));
  });
}

/** 브라우저 IndexedDB 저장소: 기록은 notes(번호가 열쇠), 사진은 photos(노트 번호 열쇠의 Blob)에 둔다 */
export class IdbNoteStore implements NoteStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(): Promise<IdbNoteStore> {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTES)) db.createObjectStore(NOTES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
    };
    return new IdbNoteStore(await promised(request));
  }

  async list(): Promise<NoteRecord[]> {
    const tx = this.db.transaction(NOTES, 'readonly');
    return (await promised(tx.objectStore(NOTES).getAll())) as NoteRecord[];
  }

  async put(record: NoteRecord, photo?: Blob | null): Promise<void> {
    const tx = this.db.transaction([NOTES, PHOTOS], 'readwrite');
    tx.objectStore(NOTES).put(record);
    if (photo === null) tx.objectStore(PHOTOS).delete(record.id);
    else if (photo) tx.objectStore(PHOTOS).put(photo, record.id);
    await done(tx);
  }

  async photo(id: string): Promise<Blob | null> {
    const tx = this.db.transaction(PHOTOS, 'readonly');
    const blob = (await promised(tx.objectStore(PHOTOS).get(id))) as Blob | undefined;
    return blob ?? null;
  }
}

/**
 * 실행 환경의 저장소를 연다. 안드로이드 앱은 SQLite·앱 파일 저장소, 브라우저는 IndexedDB 다.
 * 못 쓰면 메모리 저장소로 대신하고 persistent 를 false 로 알린다
 */
export async function openNoteStore(): Promise<{ store: NoteStore; persistent: boolean }> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { openNativeNoteStore } = await import('./nativeNoteStore');
      return { store: await openNativeNoteStore(), persistent: true };
    } catch (err) {
      console.error(err);
      return { store: new MemoryNoteStore(), persistent: false };
    }
  }
  try {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB 없음');
    const store = await IdbNoteStore.open();
    // 브라우저가 저장소를 마음대로 비우지 않도록 요청한다(거절돼도 쓸 수는 있다)
    void navigator.storage?.persist?.().catch(() => false);
    return { store, persistent: true };
  } catch {
    return { store: new MemoryNoteStore(), persistent: false };
  }
}
