import type { NoteRecord } from '../sync/noteRecord';
import type { NoteStore } from './noteStore';

/** SQLite 연결에서 저장소가 쓰는 부분. 앱은 Capacitor SQLite 플러그인, 테스트는 node:sqlite 로 채운다 */
export interface SqlDb {
  /** 값 없이 문장을 실행한다(표 만들기 등) */
  execute(sql: string): Promise<void>;
  run(sql: string, params: unknown[]): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}

/** 사진 파일을 두는 폴더. name 은 폴더 안의 파일 이름이다 */
export interface PhotoFolder {
  write(name: string, blob: Blob): Promise<void>;
  /** 없으면 null */
  read(name: string): Promise<Blob | null>;
  /** 없어도 오류를 내지 않는다 */
  remove(name: string): Promise<void>;
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY NOT NULL,
  time INTEGER NOT NULL,
  modified INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  photo TEXT,
  record TEXT NOT NULL
)`;

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * 사진 파일 이름. 바꿀 때마다 새 이름이라 쓰다가 멈춰도 기록이 가리키는 옛 파일은 온전하다.
 * 드라이브의 파일 이름(photoFileName)과는 따로다
 */
function photoName(id: string, type: string, now: number): string {
  return `photo-${id}-${now.toString(36)}.${EXT[type] ?? 'bin'}`;
}

/**
 * 앱의 메모 앨범 저장소: 노트 기록은 SQLite notes 표(번호·시각·지움 표시는 열로, 기록 전체는 JSON 으로), 사진은 앱 파일 폴더에 둔다.
 * photo 열이 지금 사진 파일 이름이다. 사진을 바꿀 때는 새 파일을 다 쓴 뒤 행을 바꾸고 옛 파일을 지운다
 */
export class SqliteNoteStore implements NoteStore {
  private constructor(
    private readonly db: SqlDb,
    private readonly folder: PhotoFolder,
    private readonly now: () => number,
  ) {}

  static async open(db: SqlDb, folder: PhotoFolder, now: () => number = Date.now): Promise<SqliteNoteStore> {
    await db.execute(SCHEMA);
    return new SqliteNoteStore(db, folder, now);
  }

  async list(): Promise<NoteRecord[]> {
    const rows = await this.db.query('SELECT id, record FROM notes');
    const records: NoteRecord[] = [];
    for (const row of rows) {
      try {
        records.push(JSON.parse(String(row.record)) as NoteRecord);
      } catch {
        // 깨진 행 하나 때문에 앨범 전체를 못 여는 일이 없게 건너뛴다
        console.warn(`노트 ${String(row.id)} 기록을 읽을 수 없어 건너뛴다`);
      }
    }
    return records;
  }

  async put(record: NoteRecord, photo?: Blob | null): Promise<void> {
    const values = [record.id, record.time, record.modified, record.deleted ? 1 : 0];
    const json = JSON.stringify(record);
    if (photo === undefined) {
      await this.db.run(
        `INSERT INTO notes (id, time, modified, deleted, photo, record) VALUES (?, ?, ?, ?, NULL, ?)
         ON CONFLICT(id) DO UPDATE SET time = excluded.time, modified = excluded.modified, deleted = excluded.deleted, record = excluded.record`,
        [...values, json],
      );
      return;
    }
    const old = await this.photoNameOf(record.id);
    const name = photo ? photoName(record.id, photo.type, this.now()) : null;
    if (photo && name) await this.folder.write(name, photo);
    try {
      await this.db.run(
        `INSERT INTO notes (id, time, modified, deleted, photo, record) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET time = excluded.time, modified = excluded.modified, deleted = excluded.deleted,
           photo = excluded.photo, record = excluded.record`,
        [...values, name, json],
      );
    } catch (err) {
      if (name) await this.folder.remove(name);
      throw err;
    }
    if (old && old !== name) await this.folder.remove(old);
  }

  async photo(id: string): Promise<Blob | null> {
    const name = await this.photoNameOf(id);
    return name ? this.folder.read(name) : null;
  }

  private async photoNameOf(id: string): Promise<string | null> {
    const rows = await this.db.query('SELECT photo FROM notes WHERE id = ?', [id]);
    const name = rows[0]?.photo;
    return typeof name === 'string' && name ? name : null;
  }
}
