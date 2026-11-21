import { describe, expect, it } from 'vitest';
import { BackupNoteStore, NO_MEDIA, type BackupFolder } from '../src/album/backupStore';
import { MemoryNoteStore } from '../src/album/noteStore';
import { noteFileName, photoFileName, type NoteRecord } from '../src/sync/noteRecord';

class MemoryFolder implements BackupFolder {
  readonly files = new Map<string, string | Blob>();
  /** 켜면 모든 작업이 실패한다(권한 없음) */
  denied = false;
  private check() {
    if (this.denied) throw new Error('권한 없음');
  }
  async list() {
    this.check();
    return [...this.files.keys()];
  }
  async readText(name: string) {
    this.check();
    const v = this.files.get(name);
    return typeof v === 'string' ? v : null;
  }
  async writeText(name: string, text: string) {
    this.check();
    this.files.set(name, text);
  }
  async readBlob(name: string) {
    this.check();
    const v = this.files.get(name);
    return v instanceof Blob ? v : null;
  }
  async writeBlob(name: string, blob: Blob) {
    this.check();
    this.files.set(name, blob);
  }
  async remove(name: string) {
    this.check();
    this.files.delete(name);
  }
  record(id: string): NoteRecord | null {
    const v = this.files.get(noteFileName(id));
    return typeof v === 'string' ? (JSON.parse(v) as NoteRecord) : null;
  }
}

const t0 = new Date(2026, 10, 21, 9, 0).getTime();
const memo = (id: string, title: string, modified = t0): NoteRecord => ({ v: 1, id, time: t0, modified, kind: 'memo', title, tags: [] });
const photoNote = (id: string, modified = t0): NoteRecord => ({
  v: 1,
  id,
  time: t0,
  modified,
  kind: 'photo',
  title: '사진',
  tags: [],
  photo: { file: photoFileName(id, 'jpg'), width: 4, height: 3 },
});
const jpeg = (text: string) => new Blob([text], { type: 'image/jpeg' });

describe('BackupNoteStore', () => {
  it('sync 전에는 폴더에 쓰지 않고, sync 뒤로는 저장할 때마다 기록과 사진을 폴더에 쓴다', async () => {
    const folder = new MemoryFolder();
    const store = new BackupNoteStore(new MemoryNoteStore(), folder);
    await store.put(memo('a', '권한 전'));
    await store.flush();
    expect(folder.files.size).toBe(0);

    expect(await store.sync()).toEqual({ downloaded: 0, uploaded: 1 });
    expect(store.enabled).toBe(true);
    expect(folder.files.has(NO_MEDIA)).toBe(true);
    expect(folder.record('a')?.title).toBe('권한 전');

    await store.put(photoNote('b'), jpeg('pic'));
    await store.flush();
    expect(folder.record('b')?.kind).toBe('photo');
    expect(await (folder.files.get(photoFileName('b', 'jpg')) as Blob).text()).toBe('pic');
  });

  it('사진을 빼거나 노트를 지우면 폴더의 사진 파일도 지우고 지움 표시 기록을 남긴다', async () => {
    const folder = new MemoryFolder();
    const store = new BackupNoteStore(new MemoryNoteStore(), folder);
    await store.sync();
    await store.put(photoNote('a'), jpeg('pic'));
    await store.put({ ...memo('a', ''), modified: t0 + 1, deleted: true }, null);
    await store.flush();
    expect(folder.files.has(photoFileName('a', 'jpg'))).toBe(false);
    expect(folder.record('a')?.deleted).toBe(true);
  });

  it('앱을 새로 설치해 저장소가 비어 있으면 폴더에서 기록과 사진을 되살린다', async () => {
    const folder = new MemoryFolder();
    const before = new BackupNoteStore(new MemoryNoteStore(), folder);
    await before.sync();
    await before.put(memo('a', '메모'));
    await before.put(photoNote('b'), jpeg('pic'));
    await before.put({ ...memo('c', ''), deleted: true }, null);
    await before.flush();

    const fresh = new MemoryNoteStore();
    const after = new BackupNoteStore(fresh, folder);
    expect(await after.sync()).toEqual({ downloaded: 3, uploaded: 0 });
    const records = await fresh.list();
    expect(records.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
    expect(records.find((r) => r.id === 'c')?.deleted).toBe(true);
    expect(await (await fresh.photo('b'))?.text()).toBe('pic');
  });

  it('양쪽에 있으면 수정 시각이 늦은 쪽을 따른다', async () => {
    const folder = new MemoryFolder();
    folder.files.set(noteFileName('a'), JSON.stringify(memo('a', '폴더가 새것', t0 + 10)));
    folder.files.set(noteFileName('b'), JSON.stringify(memo('b', '폴더가 옛것', t0)));
    const inner = new MemoryNoteStore();
    await inner.put(memo('a', '앱이 옛것', t0));
    await inner.put(memo('b', '앱이 새것', t0 + 10));
    const store = new BackupNoteStore(inner, folder);
    expect(await store.sync()).toEqual({ downloaded: 1, uploaded: 1 });
    const byId = new Map((await inner.list()).map((r) => [r.id, r.title]));
    expect(byId.get('a')).toBe('폴더가 새것');
    expect(folder.record('b')?.title).toBe('앱이 새것');
  });

  it('기록이 같아도 폴더에 사진 파일이 빠졌으면 사진을 채운다', async () => {
    const folder = new MemoryFolder();
    const inner = new MemoryNoteStore();
    await inner.put(photoNote('a'), jpeg('pic'));
    folder.files.set(noteFileName('a'), JSON.stringify(photoNote('a')));
    await new BackupNoteStore(inner, folder).sync();
    expect(await (folder.files.get(photoFileName('a', 'jpg')) as Blob).text()).toBe('pic');
  });

  it('폴더 기록에 사진 정보가 있는데 사진 파일이 없으면 앱에 있던 사진을 그대로 둔다', async () => {
    const folder = new MemoryFolder();
    folder.files.set(noteFileName('a'), JSON.stringify({ ...photoNote('a', t0 + 10), title: '폴더가 새것' }));
    const inner = new MemoryNoteStore();
    await inner.put(photoNote('a'), jpeg('local'));
    await new BackupNoteStore(inner, folder).sync();
    expect((await inner.list())[0].title).toBe('폴더가 새것');
    expect(await (await inner.photo('a'))?.text()).toBe('local');
  });

  it('읽을 수 없거나 형식이 틀린 파일과 이름이 다른 기록은 건너뛴다', async () => {
    const folder = new MemoryFolder();
    folder.files.set(noteFileName('a'), '{깨짐');
    folder.files.set(noteFileName('b'), JSON.stringify({ v: 1, id: 'b' }));
    folder.files.set(noteFileName('c'), JSON.stringify(memo('x', '이름이 다름')));
    folder.files.set('readme.txt', '다른 파일');
    const inner = new MemoryNoteStore();
    expect(await new BackupNoteStore(inner, folder).sync()).toEqual({ downloaded: 0, uploaded: 0 });
    expect(await inner.list()).toEqual([]);
  });

  it('폴더를 못 쓰면 sync 가 실패하고 켜지지 않으며, 켜진 뒤 쓰기가 실패해도 저장은 남고 오류를 알린다', async () => {
    const folder = new MemoryFolder();
    folder.denied = true;
    const inner = new MemoryNoteStore();
    const store = new BackupNoteStore(inner, folder);
    await expect(store.sync()).rejects.toThrow();
    expect(store.enabled).toBe(false);

    folder.denied = false;
    await store.sync();
    folder.denied = true;
    await store.put(memo('a', '저장은 된다'));
    await store.flush();
    expect((await inner.list())[0].title).toBe('저장은 된다');
    expect(store.lastError).toBeTruthy();

    folder.denied = false;
    await store.sync();
    expect(store.lastError).toBeNull();
    expect(folder.record('a')?.title).toBe('저장은 된다');
  });

  it('sync 가 앱 저장소를 읽은 뒤 저장한 노트는 폴더의 옛 기록으로 덮어쓰지 않는다', async () => {
    const folder = new MemoryFolder();
    folder.files.set(noteFileName('a'), JSON.stringify(memo('a', '폴더', t0 + 10)));
    const inner = new MemoryNoteStore();
    const store = new BackupNoteStore(inner, folder);
    let editing: Promise<void> | null = null;
    const list = inner.list.bind(inner);
    inner.list = async () => {
      const records = await list();
      editing ??= store.put(memo('a', '방금 고침', t0 + 20));
      return records;
    };
    await store.sync();
    await editing;
    await store.flush();
    expect((await inner.list())[0].title).toBe('방금 고침');
    expect(folder.record('a')?.title).toBe('방금 고침');
  });

  it('폴더 사진을 읽는 중에 노트를 고치면 내려받은 옛 기록으로 덮어쓰지 않는다', async () => {
    const folder = new MemoryFolder();
    folder.files.set(noteFileName('a'), JSON.stringify({ ...photoNote('a', t0 + 10), title: '폴더 옛것' }));
    folder.files.set(photoFileName('a', 'jpg'), jpeg('old-pic'));
    const inner = new MemoryNoteStore();
    const store = new BackupNoteStore(inner, folder);
    let editing: Promise<void> | null = null;
    const readBlob = folder.readBlob.bind(folder);
    folder.readBlob = async (name) => {
      const blob = await readBlob(name);
      editing ??= store.put({ ...photoNote('a', t0 + 20), title: '방금 고침' }, jpeg('new-pic'));
      return blob;
    };
    await store.sync();
    await editing;
    await store.flush();
    expect((await inner.list())[0].title).toBe('방금 고침');
    expect(await (await inner.photo('a'))?.text()).toBe('new-pic');
    expect(folder.record('a')?.title).toBe('방금 고침');
    expect(await (folder.files.get(photoFileName('a', 'jpg')) as Blob).text()).toBe('new-pic');
  });

  it('업로드할 사진 노트의 앱 쪽 사진을 못 읽어도 폴더에 남아 있던 백업 사진은 지우지 않는다', async () => {
    const folder = new MemoryFolder();
    folder.files.set(noteFileName('a'), JSON.stringify(photoNote('a', t0)));
    folder.files.set(photoFileName('a', 'jpg'), jpeg('backup-pic'));
    const inner = new MemoryNoteStore();
    await inner.put(photoNote('a', t0 + 10), null);
    const store = new BackupNoteStore(inner, folder);
    expect(await store.sync()).toEqual({ downloaded: 0, uploaded: 1 });
    expect(folder.record('a')?.modified).toBe(t0 + 10);
    expect(await (folder.files.get(photoFileName('a', 'jpg')) as Blob).text()).toBe('backup-pic');
  });

  it('첫 sync 가 중간에 실패하면 enabled 는 꺼진 채 남는다', async () => {
    const folder = new MemoryFolder();
    folder.files.set(NO_MEDIA, '');
    const inner = new MemoryNoteStore();
    await inner.put(memo('a', '메모'));
    folder.writeText = async () => {
      throw new Error('쓰기 실패');
    };
    const store = new BackupNoteStore(inner, folder);
    await expect(store.sync()).rejects.toThrow('쓰기 실패');
    expect(store.enabled).toBe(false);
  });

  it('첫 sync 가 도는 동안 새로 저장한 노트도 누락하지 않고 폴더에 쓴다', async () => {
    const folder = new MemoryFolder();
    const inner = new MemoryNoteStore();
    const store = new BackupNoteStore(inner, folder);
    let saving: Promise<void> | null = null;
    const list = inner.list.bind(inner);
    inner.list = async () => {
      const records = await list();
      saving ??= store.put(photoNote('n.1'), jpeg('during-sync'));
      return records;
    };
    await store.sync();
    await saving;
    await store.flush();
    expect(folder.record('n.1')?.title).toBe('사진');
    expect(await (folder.files.get(photoFileName('n.1', 'jpg')) as Blob).text()).toBe('during-sync');
  });

  it('점이 들어간 번호와 대문자 확장자 사진 파일도 되살린다', async () => {
    const folder = new MemoryFolder();
    folder.files.set(noteFileName('a.1'), JSON.stringify({ ...photoNote('a.1'), photo: { file: 'photo-a.1.JPG', width: 4, height: 3 } }));
    folder.files.set('photo-a.1.JPG', jpeg('upper'));
    const inner = new MemoryNoteStore();
    const downloaded: NoteRecord[] = [];
    const store = new BackupNoteStore(inner, folder, (r) => downloaded.push(...r));
    expect(await store.sync()).toEqual({ downloaded: 1, uploaded: 0 });
    expect(downloaded.map((r) => r.id)).toEqual(['a.1']);
    expect(await (await inner.photo('a.1'))?.text()).toBe('upper');
  });

  it('onDownload 콜백은 실제로 내려받은 기록만 넘긴다', async () => {
    const folder = new MemoryFolder();
    folder.files.set(noteFileName('a'), JSON.stringify(memo('a', '폴더가 새것', t0 + 10)));
    folder.files.set(noteFileName('b'), JSON.stringify(memo('b', '폴더가 옛것', t0)));
    const inner = new MemoryNoteStore();
    await inner.put(memo('a', '앱이 옛것', t0));
    await inner.put(memo('b', '앱이 새것', t0 + 10));
    const got: NoteRecord[] = [];
    await new BackupNoteStore(inner, folder, (r) => got.push(...r)).sync();
    expect(got.map((r) => r.id)).toEqual(['a']);
  });
});
