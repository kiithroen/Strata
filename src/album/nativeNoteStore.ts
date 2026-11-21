import { Capacitor, registerPlugin } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { BackupNoteStore, type BackupFolder } from './backupStore';
import type { NoteStore } from './noteStore';
import { SqliteNoteStore, type PhotoFolder, type SqlDb } from './sqliteNoteStore';

/** 앱 데이터베이스 이름. 플러그인이 앱 전용 databases 폴더에 `<이름>SQLite.db` 로 만든다 */
const DB_NAME = 'strata';
/** 사진 파일 폴더. 앱 전용 파일 폴더(Directory.Data) 아래다 */
const PHOTO_DIR = 'photos';
/** 노트 사본 폴더. 내장 저장소의 공용 Documents 폴더 아래라 앱을 지워도 남는다 */
const BACKUP_DIR = 'Strata';
/** 화면에 보이는 노트 사본 폴더 이름 */
export const BACKUP_LABEL = `Documents/${BACKUP_DIR}`;

/** 앱 안의 네이티브 플러그인(android/app 의 AllFilesAccessPlugin) */
const AllFilesAccess = registerPlugin<{ check(): Promise<{ granted: boolean }>; request(): Promise<{ granted: boolean }> }>(
  'AllFilesAccess',
);

function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function blobOf(base64: string, type: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

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

/** 공용 Documents/Strata 폴더. 모든 파일 접근 권한이 있어야 다시 설치한 뒤에도 읽고 고칠 수 있다 */
const backupFolder: BackupFolder = {
  async list() {
    try {
      return (await Filesystem.readdir({ path: BACKUP_DIR, directory: Directory.Documents })).files.map((f) => f.name);
    } catch {
      // 폴더가 없으면 만든다. 권한이 없어 못 만들면 그 오류를 그대로 낸다
      await Filesystem.mkdir({ path: BACKUP_DIR, directory: Directory.Documents, recursive: true });
      return [];
    }
  },
  async readText(name) {
    try {
      const { data } = await Filesystem.readFile({ path: `${BACKUP_DIR}/${name}`, directory: Directory.Documents, encoding: Encoding.UTF8 });
      return typeof data === 'string' ? data : await data.text();
    } catch {
      return null;
    }
  },
  async writeText(name, text) {
    await Filesystem.writeFile({ path: `${BACKUP_DIR}/${name}`, directory: Directory.Documents, data: text, encoding: Encoding.UTF8, recursive: true });
  },
  async readBlob(name) {
    try {
      const { data } = await Filesystem.readFile({ path: `${BACKUP_DIR}/${name}`, directory: Directory.Documents });
      const type = MIME[name.split('.').pop() ?? ''] ?? 'application/octet-stream';
      return typeof data === 'string' ? blobOf(data, type) : data;
    } catch {
      return null;
    }
  },
  async writeBlob(name, blob) {
    await Filesystem.writeFile({ path: `${BACKUP_DIR}/${name}`, directory: Directory.Documents, data: await base64Of(blob), recursive: true });
  },
  async remove(name) {
    await Filesystem.deleteFile({ path: `${BACKUP_DIR}/${name}`, directory: Directory.Documents }).catch(() => undefined);
  },
};

async function openSqlite(): Promise<SqliteNoteStore> {
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

/** 설정 화면이 쓰는 노트 백업 상태와 권한 요청 */
export interface BackupControls {
  /** 지금 상태를 적은 글 */
  text(): string;
  /** 권한이 없어 요청할 수 있는지 */
  needsAccess(): boolean;
  /** 모든 파일 접근 설정 화면을 열고, 허락하면 폴더와 맞춘다. 폴더에서 노트를 되살렸으면 앱을 다시 불러온다 */
  requestAccess(): Promise<void>;
}

/**
 * 안드로이드 앱의 저장소: Capacitor SQLite 데이터베이스와 앱 전용 파일 폴더, 그리고 그 사본을 쓰는 공용 Documents/Strata 폴더.
 * 권한이 있으면 폴더와 맞춘다. 앱 저장소가 비어 있으면(새로 설치) 맞춘 뒤에 돌려주어 되살린 노트로 첫 화면을 띄운다.
 * 권한이 없으면 첫 화면 뒤에 한 번 묻는다
 */
export async function openNativeNoteStore(): Promise<{ store: NoteStore; backup: BackupControls }> {
  const sqlite = await openSqlite();
  const store = new BackupNoteStore(sqlite, backupFolder);
  let granted = (await AllFilesAccess.check().catch(() => ({ granted: false }))).granted;
  let syncing = false;

  const sync = async () => {
    syncing = true;
    try {
      return await store.sync();
    } finally {
      syncing = false;
    }
  };

  const backup: BackupControls = {
    text() {
      if (!granted) return `꺼짐: 모든 파일 접근 권한이 없어 노트가 앱 안에만 있다. 앱을 지우면 노트도 지워진다.`;
      if (syncing) return `${BACKUP_LABEL} 폴더와 맞추는 중이다.`;
      if (!store.enabled) return `꺼짐: ${BACKUP_LABEL} 폴더를 쓸 수 없다${store.lastError ? ` (${store.lastError})` : ''}.`;
      if (store.lastError) return `켜짐, 마지막 쓰기 실패(${store.lastError}). 앱을 다시 열면 다시 맞춘다.`;
      return `켜짐: 노트를 내장 저장소 ${BACKUP_LABEL} 폴더에도 저장한다. 앱을 다시 설치하면 이 폴더에서 되살린다.`;
    },
    needsAccess: () => !granted,
    async requestAccess() {
      granted = (await AllFilesAccess.request().catch(() => ({ granted: false }))).granted;
      if (!granted) return;
      const { downloaded } = await sync().catch(() => ({ downloaded: 0 }));
      if (downloaded > 0) location.reload();
    },
  };

  if (granted) {
    const fresh = (await sqlite.list()).length === 0;
    const run = sync().catch(() => undefined);
    if (fresh) await run;
  } else {
    // 첫 화면을 띄운 뒤에 묻는다. 거절하면 설정 화면의 노트 백업에서 다시 켤 수 있다
    window.setTimeout(() => {
      const ok = window.confirm(
        `노트를 내장 저장소 ${BACKUP_LABEL} 폴더에도 저장하려면 '모든 파일 접근' 권한이 필요하다. ` +
          '권한이 없으면 앱을 지울 때 노트도 함께 지워진다.\n\n권한 설정을 열까?',
      );
      if (ok) void backup.requestAccess();
    }, 1500);
  }
  return { store, backup };
}
