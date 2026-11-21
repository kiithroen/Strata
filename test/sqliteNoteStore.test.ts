import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { Album } from '../src/album/album';
import { SqliteNoteStore, type PhotoFolder, type SqlDb } from '../src/album/sqliteNoteStore';
import type { NoteRecord } from '../src/sync/noteRecord';

/** 앱의 SQLite 플러그인 대신 node:sqlite 로 같은 SQL 을 돌린다 */
function nodeDb(db = new DatabaseSync(':memory:')): SqlDb & { raw: DatabaseSync } {
  return {
    raw: db,
    async execute(sql) {
      db.exec(sql);
    },
    async run(sql, params) {
      db.prepare(sql).run(...(params as (string | number | null)[]));
    },
    async query(sql, params = []) {
      return db.prepare(sql).all(...(params as (string | number | null)[])) as Record<string, unknown>[];
    },
  };
}

class MemoryFolder implements PhotoFolder {
  readonly files = new Map<string, Blob>();
  failWrites = false;
  async write(name: string, blob: Blob) {
    if (this.failWrites) throw new Error('쓰기 실패');
    this.files.set(name, blob);
  }
  async read(name: string) {
    return this.files.get(name) ?? null;
  }
  async remove(name: string) {
    this.files.delete(name);
  }
}

const t0 = new Date(2026, 10, 21, 9, 0).getTime();
const record = (id: string, title: string, modified = t0): NoteRecord => ({ v: 1, id, time: t0, modified, kind: 'memo', title, tags: [] });
const jpeg = (text: string) => new Blob([text], { type: 'image/jpeg' });

async function setup() {
  const db = nodeDb();
  const folder = new MemoryFolder();
  let now = t0;
  const store = await SqliteNoteStore.open(db, folder, () => (now += 1));
  return { db, folder, store };
}

describe('SqliteNoteStore', () => {
  it('기록을 넣고 고치면 같은 번호 한 줄이 바뀌고, 다시 열어도 남는다', async () => {
    const { db, folder, store } = await setup();
    await store.put(record('a', '처음'));
    await store.put(record('b', '둘째'));
    await store.put({ ...record('a', '고친 제목', t0 + 5), tags: ['일상'] });
    const reopened = await SqliteNoteStore.open(db, folder);
    const list = await reopened.list();
    expect(list).toHaveLength(2);
    expect(list.find((r) => r.id === 'a')).toEqual({ ...record('a', '고친 제목', t0 + 5), tags: ['일상'] });
    expect(db.raw.prepare('SELECT modified, deleted FROM notes WHERE id = ?').get('a')).toEqual({ modified: t0 + 5, deleted: 0 });
  });

  it('있던 노트를 지움 표시로 바꾸면 기록이 남고 deleted 열이 켜진다(사진을 주든 안 주든)', async () => {
    const { db, store } = await setup();
    await store.put(record('a', '글'));
    await store.put(record('b', '사진'), jpeg('pic'));
    await store.put({ ...record('a', ''), deleted: true });
    await store.put({ ...record('b', ''), deleted: true }, null);
    expect((await store.list()).map((r) => r.deleted)).toEqual([true, true]);
    expect(db.raw.prepare('SELECT deleted FROM notes ORDER BY id').all()).toEqual([{ deleted: 1 }, { deleted: 1 }]);
  });

  it('사진은 바꿀 때 새 파일을 쓰고 옛 파일을 지우며, photo 를 주지 않으면 그대로 두고, null 이면 지운다', async () => {
    const { folder, store } = await setup();
    await store.put(record('a', '사진'), jpeg('first'));
    expect(await (await store.photo('a'))?.text()).toBe('first');
    expect(folder.files.size).toBe(1);

    await store.put(record('a', '사진 고침'), jpeg('second'));
    expect(await (await store.photo('a'))?.text()).toBe('second');
    expect(folder.files.size).toBe(1);

    await store.put(record('a', '글만 고침'));
    expect(await (await store.photo('a'))?.text()).toBe('second');

    await store.put(record('a', '사진 뺌'), null);
    expect(await store.photo('a')).toBeNull();
    expect(folder.files.size).toBe(0);
  });

  it('사진 쓰기가 실패하면 기록과 옛 사진이 그대로다', async () => {
    const { folder, store } = await setup();
    await store.put(record('a', '처음'), jpeg('first'));
    folder.failWrites = true;
    await expect(store.put(record('a', '바뀌면 안 됨'), jpeg('second'))).rejects.toThrow();
    expect((await store.list())[0].title).toBe('처음');
    expect(await (await store.photo('a'))?.text()).toBe('first');
  });

  it('깨진 행이나 형식이 틀린 행은 건너뛰고 나머지를 읽는다', async () => {
    const { db, store } = await setup();
    await store.put(record('a', '멀쩡함'));
    db.raw.prepare("INSERT INTO notes (id, time, modified, deleted, record) VALUES ('x', 0, 0, 0, '{깨짐')").run();
    db.raw.prepare("INSERT INTO notes (id, time, modified, deleted, record) VALUES ('y', 0, 0, 0, '{}')").run();
    db.raw.prepare("INSERT INTO notes (id, time, modified, deleted, record) VALUES ('z', 0, 0, 0, 'null')").run();
    db.raw.prepare('INSERT INTO notes (id, time, modified, deleted, record) VALUES (\'w\', 0, 0, 0, \'{"v":1,"id":"w"}\')').run();
    const list = await store.list();
    expect(list.map((r) => r.id)).toEqual(['a']);
  });

  it('같은 밀리초 안에서 사진을 바꿔도 새 파일 이름을 쓰고, DB 쓰기가 실패해도 옛 사진은 지우지 않는다', async () => {
    const db = nodeDb();
    const folder = new MemoryFolder();
    const store = await SqliteNoteStore.open(db, folder, () => t0);
    await store.put(record('a', '첫 사진'), jpeg('first'));
    const [firstName] = [...folder.files.keys()];
    await store.put(record('a', '둘째 사진'), jpeg('second'));
    const [secondName] = [...folder.files.keys()];
    expect(secondName).not.toBe(firstName);

    const run = db.run.bind(db);
    db.run = async () => {
      throw new Error('DB 쓰기 실패');
    };
    await expect(store.put(record('a', '실패'), jpeg('third'))).rejects.toThrow('DB 쓰기 실패');
    db.run = run;

    expect(folder.files.size).toBe(1);
    expect(folder.files.has(secondName)).toBe(true);
    expect(await (await store.photo('a'))?.text()).toBe('second');
  });

  it('사진 삭제가 실패해도 저장 성공을 깨지 않고, DB 실패 때는 원래 DB 오류를 낸다', async () => {
    const db = nodeDb();
    const folder = new MemoryFolder();
    const store = await SqliteNoteStore.open(db, folder, () => t0);
    await store.put(record('a', '처음'), jpeg('first'));
    folder.remove = async () => {
      throw new Error('파일 삭제 실패');
    };
    await expect(store.put(record('a', '바꿈'), jpeg('second'))).resolves.toBeUndefined();
    expect(await (await store.photo('a'))?.text()).toBe('second');

    db.run = async () => {
      throw new Error('DB 오류');
    };
    await expect(store.put(record('a', '실패'), jpeg('third'))).rejects.toThrow('DB 오류');
  });

  it('Album 이 이 저장소로 저장·사진·다시 읽기를 한다', async () => {
    const { db, folder, store } = await setup();
    const album = new Album(store, () => t0, () => 0.5);
    const saved = await album.save({ time: t0, title: '사진 노트', body: '', tags: [], photo: { width: 4, height: 3 } }, jpeg('pic'));
    const store2 = await SqliteNoteStore.open(db, folder);
    const reopened = new Album(store2);
    await reopened.load();
    expect(reopened.data()?.notes.map((n) => n.id)).toEqual([saved.id]);
    expect(reopened.record(saved.id)?.photo).toMatchObject({ width: 4, height: 3 });
    expect(await (await store2.photo(saved.id))?.text()).toBe('pic');
  });
});
