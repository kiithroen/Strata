import { describe, expect, it } from 'vitest';
import { Album } from '../src/album/album';
import type { NoteDraft } from '../src/album/albumModel';
import { MemoryNoteStore } from '../src/album/noteStore';
import { checklistText } from '../src/core/checklist';

const t0 = new Date(2026, 10, 18, 9, 0).getTime();
const draft = (title: string, time: number): NoteDraft => ({ time, title, body: '', tags: [] });

function clockAlbum(store = new MemoryNoteStore()) {
  let now = t0;
  const album = new Album(store, () => now, () => 0.5);
  return { album, store, tick: (ms: number) => (now += ms) };
}

describe('Album', () => {
  it('저장한 노트를 최근 것부터 띄우고, 다시 읽어도 같다', async () => {
    const { album, store, tick } = clockAlbum();
    expect(album.data()).toBeNull();
    await album.save(draft('먼저 쓴 노트', t0 - 2000));
    tick(10);
    const b = await album.save(draft('나중 노트', t0 - 1000));
    const notes = album.data()?.notes ?? [];
    expect(notes.map((n) => n.title)).toEqual(['나중 노트', '먼저 쓴 노트']);
    expect(album.record(b.id)?.modified).toBe(t0 + 10);

    const reopened = new Album(store);
    await reopened.load();
    expect(reopened.data()?.notes.map((n) => n.id)).toEqual(notes.map((n) => n.id));
  });

  it('고치면 같은 번호의 기록이 바뀌고 수정 시각이 늦어진다', async () => {
    const { album, tick } = clockAlbum();
    const a = await album.save(draft('처음', t0));
    tick(500);
    const edited = await album.save({ ...draft('고친 제목', t0), tags: ['일상'] }, undefined, a.id);
    expect(edited.id).toBe(a.id);
    expect(album.count).toBe(1);
    expect(album.record(a.id)).toMatchObject({ title: '고친 제목', tags: ['일상'], modified: t0 + 500 });
  });

  it('지우면 띄우지 않고 저장소에는 지움 표시와 함께 사진도 지운다', async () => {
    const { album, store, tick } = clockAlbum();
    const photo = new Blob(['jpeg']);
    const a = await album.save({ ...draft('사진', t0), photo: { width: 4, height: 3 } }, photo);
    expect(await store.photo(a.id)).toBe(photo);
    expect(album.data()?.photos[0]).toMatchObject({ width: 4, height: 3 });
    tick(100);
    await album.remove(a.id);
    expect(album.data()).toBeNull();
    expect(album.record(a.id)).toBeUndefined();
    expect(await store.photo(a.id)).toBeNull();
    const [tomb] = await store.list();
    expect(tomb).toMatchObject({ id: a.id, deleted: true, modified: t0 + 100 });
  });

  it('사진을 빼면(null) 저장소의 사진도 지우고, 그대로 두면(undefined) 남긴다', async () => {
    const { album, store } = clockAlbum();
    const photo = new Blob(['jpeg']);
    const a = await album.save({ ...draft('사진', t0), photo: { width: 4, height: 3 } }, photo);
    await album.save({ ...draft('캡션만 고침', t0), photo: { width: 4, height: 3 } }, undefined, a.id);
    expect(await store.photo(a.id)).toBe(photo);
    await album.save(draft('사진 뺌', t0), null, a.id);
    expect(await store.photo(a.id)).toBeNull();
    expect(album.record(a.id)?.kind).toBe('memo');
  });
});

describe('Album 체크리스트', () => {
  it('항목을 체크하면 바로 저장하고 수정 시각이 늦어지며, 띄우는 노트 글도 바뀐다', async () => {
    const { album, store, tick } = clockAlbum();
    const a = await album.save({
      ...draft('장보기', t0),
      checklist: [
        { text: '우유', done: false },
        { text: '  ', done: false },
        { text: '빵', done: false },
      ],
    });
    expect(album.record(a.id)?.checklist).toEqual([
      { text: '우유', done: false },
      { text: '빵', done: false },
    ]);
    expect(album.record(a.id)?.body).toBeUndefined();
    tick(300);
    await album.check(a.id, 1, true);
    const checked = [
      { text: '우유', done: false },
      { text: '빵', done: true },
    ];
    expect(album.record(a.id)).toMatchObject({ checklist: checked, modified: t0 + 300 });
    expect(album.data()?.notes[0]).toMatchObject({ checklist: checked, body: checklistText(checked) });
    const [stored] = await store.list();
    expect(stored.checklist).toEqual(checked);
  });

  it('없는 항목이나 같은 상태로는 바꾸지 않는다', async () => {
    const { album, tick } = clockAlbum();
    const a = await album.save({ ...draft('목록', t0), checklist: [{ text: '하나', done: true }] });
    tick(100);
    await album.check(a.id, 0, true);
    await album.check(a.id, 5, false);
    expect(album.record(a.id)?.modified).toBe(t0);
  });

  it('applyExternal 은 더 새 기록만 반영하고 같거나 옛 기록은 덮어쓰지 않는다', async () => {
    const { album, tick } = clockAlbum();
    const a = await album.save(draft('원본', t0));
    tick(100);
    const b = await album.save(draft('최신', t0));
    const recA = album.record(a.id)!;
    const recB = album.record(b.id)!;

    album.applyExternal([
      { ...recA, title: '더 새것', modified: recA.modified + 10 },
      { ...recB, title: '같은 시각', modified: recB.modified },
      { ...recB, title: '더 옛것', modified: recB.modified - 10 },
      { v: 1, id: 'ext-1', time: t0, modified: t0, kind: 'memo', title: '외부 새 노트' },
    ]);

    expect(album.record(a.id)?.title).toBe('더 새것');
    expect(album.record(b.id)?.title).toBe('최신');
    expect(album.record('ext-1')?.title).toBe('외부 새 노트');
  });
});
