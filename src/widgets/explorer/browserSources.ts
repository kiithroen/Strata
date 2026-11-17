import { tuning } from '../../config';
import { TaskQueue } from '../../core/taskQueue';
import { joinPath, kindOf } from './explorerModel';
import type { FileEntry, FileSource } from './fileSource';

/**
 * 고른 파일 목록(폴더 입력의 webkitRelativePath)으로 만든 원본. 폴더 고르기 API 가 없는 브라우저(폰 크롬 등)와 확인 스크립트가 쓴다.
 * 첫 경로 조각이 원본 폴더 이름이고, 그 아래 경로로 폴더 구조를 다시 세운다. 상대 경로가 없는 파일은 원본 폴더 바로 아래에 둔다.
 */
export class ListSource implements FileSource {
  readonly name: string;
  private readonly files = new Map<string, File>();
  private readonly children = new Map<string, Map<string, FileEntry>>();

  constructor(files: readonly File[], fallbackName = '선택한 파일') {
    let root: string | null = null;
    for (const f of files) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const parts = rel.split('/').filter((p) => p.length > 0);
      if (parts.length > 1) {
        root ??= parts[0];
        parts.shift();
      }
      const path = parts.join('/');
      this.files.set(path, f);
      let dir = '';
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i];
        const entryPath = joinPath(dir, name);
        const isFile = i === parts.length - 1;
        const siblings = this.dir(dir);
        if (!siblings.has(name)) {
          siblings.set(
            name,
            isFile
              ? { name, path: entryPath, kind: kindOf(name, f.type), size: f.size, modified: f.lastModified }
              : { name, path: entryPath, kind: 'folder', size: 0, modified: 0 },
          );
        }
        dir = entryPath;
      }
    }
    this.name = root ?? fallbackName;
  }

  private dir(path: string): Map<string, FileEntry> {
    let d = this.children.get(path);
    if (!d) {
      d = new Map();
      this.children.set(path, d);
    }
    return d;
  }

  async list(path: string): Promise<FileEntry[]> {
    const d = this.children.get(path);
    if (!d) {
      if (path === '') return [];
      throw new Error(`폴더가 없다: ${path}`);
    }
    return [...d.values()];
  }

  async file(path: string): Promise<File> {
    const f = this.files.get(path);
    if (!f) throw new Error(`파일이 없다: ${path}`);
    return f;
  }
}

/** File System Access API 의 폴더 핸들로 읽는 원본. 하위 폴더 핸들은 처음 열 때 찾아 기억해 둔다 */
export class HandleSource implements FileSource {
  readonly name: string;
  private readonly dirs = new Map<string, FileSystemDirectoryHandle>();

  constructor(readonly root: FileSystemDirectoryHandle) {
    this.name = root.name;
    this.dirs.set('', root);
  }

  private async dirHandle(path: string): Promise<FileSystemDirectoryHandle> {
    const hit = this.dirs.get(path);
    if (hit) return hit;
    const slash = path.lastIndexOf('/');
    const parent = await this.dirHandle(slash < 0 ? '' : path.slice(0, slash));
    const handle = await parent.getDirectoryHandle(path.slice(slash + 1));
    this.dirs.set(path, handle);
    return handle;
  }

  async list(path: string): Promise<FileEntry[]> {
    const dir = await this.dirHandle(path);
    const out: FileEntry[] = [];
    const pending: Promise<void>[] = [];
    // 파일이 수천 개인 폴더에서도 파일 열기를 몇 개씩만 겹쳐 돌린다
    const opens = new TaskQueue(tuning.explorer.readConcurrency);
    for await (const handle of (dir as FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> }).values()) {
      const entryPath = joinPath(path, handle.name);
      if (handle.kind === 'directory') {
        this.dirs.set(entryPath, handle as FileSystemDirectoryHandle);
        out.push({ name: handle.name, path: entryPath, kind: 'folder', size: 0, modified: 0 });
      } else {
        // 크기·시각은 파일을 열어야 알 수 있어 한꺼번에 기다린다
        pending.push(
          opens
            .run(() => (handle as FileSystemFileHandle).getFile())
            .then((f) => {
              out.push({ name: handle.name, path: entryPath, kind: kindOf(handle.name, f.type), size: f.size, modified: f.lastModified });
            })
            .catch(() => {
              out.push({ name: handle.name, path: entryPath, kind: kindOf(handle.name), size: 0, modified: 0 });
            }),
        );
      }
    }
    await Promise.all(pending);
    return out;
  }

  async file(path: string): Promise<File> {
    const slash = path.lastIndexOf('/');
    const dir = await this.dirHandle(slash < 0 ? '' : path.slice(0, slash));
    return (await dir.getFileHandle(path.slice(slash + 1))).getFile();
  }
}

/** 이 브라우저가 폴더 고르기(File System Access API)를 지원하는지 */
export function canPickDirectory(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** 폴더를 골라 원본을 만든다. 사용자가 취소하면 null */
export async function pickDirectory(): Promise<HandleSource | null> {
  const picker = (window as Window & { showDirectoryPicker?: (o?: { mode?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  if (!picker) return null;
  try {
    return new HandleSource(await picker({ mode: 'read' }));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

const DB = 'strata-explorer';
const STORE = 'handles';
const RECENT = 'recent';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 마지막으로 연 폴더 핸들을 기억한다(다음에 다시 열기 단추용 편의 기능이라 실패해도 그냥 넘어간다) */
export async function rememberDirectory(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handle, RECENT);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // 개인 창·저장소 차단에서는 기억하지 않는다
  }
}

/** 기억해 둔 폴더 핸들. 없거나 읽을 수 없으면 null */
export async function recentDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(RECENT);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

/** 기억해 둔 폴더를 다시 연다. 읽기 권한을 다시 물어야 하므로 탭·클릭 처리 안에서 불러야 한다 */
export async function reopenDirectory(handle: FileSystemDirectoryHandle): Promise<HandleSource | null> {
  type Permissioned = FileSystemDirectoryHandle & {
    queryPermission?(o: { mode: string }): Promise<PermissionState>;
    requestPermission?(o: { mode: string }): Promise<PermissionState>;
  };
  const h = handle as Permissioned;
  try {
    let state = (await h.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (state !== 'granted') state = (await h.requestPermission?.({ mode: 'read' })) ?? 'denied';
    return state === 'granted' ? new HandleSource(handle) : null;
  } catch {
    return null;
  }
}
