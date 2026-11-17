import { describe, expect, it } from 'vitest';
import { Album } from '../src/album/album';
import type { NoteDraft } from '../src/album/albumModel';
import { MemoryNoteStore } from '../src/album/noteStore';

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
