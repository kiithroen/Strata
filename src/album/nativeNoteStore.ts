import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { SqliteNoteStore, type PhotoFolder, type SqlDb } from './sqliteNoteStore';

/** 앱 데이터베이스 이름. 플러그인이 앱 전용 databases 폴더에 `<이름>SQLite.db` 로 만든다 */
const DB_NAME = 'strata';
/** 사진 파일 폴더. 앱 전용 파일 폴더(Directory.Data) 아래다 */
const PHOTO_DIR = 'photos';

function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** 앱 전용 파일 폴더의 사진. 쓰기는 브리지로 base64 를 넘기고, 읽기는 웹뷰가 파일 주소로 바로 받는다 */
const photoFolder: PhotoFolder = {
  async write(name, blob) {
    await Filesystem.writeFile({ path: `${PHOTO_DIR}/${name}`, directory: Directory.Data, data: await base64Of(blob), recursive: true });
  },
  async read(name) {
    try {
      const { uri } = await Filesystem.getUri({ path: `${PHOTO_DIR}/${name}`, directory: Directory.Data });
      const response = await fetch(Capacitor.convertFileSrc(uri));
      return response.ok ? await response.blob() : null;
    } catch {
      return null;
    }
  },
  async remove(name) {
    await Filesystem.deleteFile({ path: `${PHOTO_DIR}/${name}`, directory: Directory.Data }).catch(() => undefined);
  },
};

/** 안드로이드 앱의 저장소: Capacitor SQLite 플러그인의 데이터베이스와 앱 전용 파일 폴더 */
export async function openNativeNoteStore(): Promise<SqliteNoteStore> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  await sqlite.checkConnectionsConsistency().catch(() => undefined);
  const exists = (await sqlite.isConnection(DB_NAME, false)).result;
  const conn = exists
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  await conn.open();
  const db: SqlDb = {
    async execute(sql) {
      await conn.execute(sql, false);
    },
    async run(sql, params) {
      await conn.run(sql, params, false);
    },
    async query(sql, params = []) {
      return ((await conn.query(sql, params)).values ?? []) as Record<string, unknown>[];
    },
  };
  return SqliteNoteStore.open(db, photoFolder);
}
