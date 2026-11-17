import { describe, expect, it } from 'vitest';
import { albumNotes, mergeRecords, noteFileName, noteIdOf, parseNoteRecord, photoFileName, type NoteRecord } from '../src/sync/noteRecord';

const rec = (id: string, modified: number, extra: Partial<NoteRecord> = {}): NoteRecord => ({ v: 1, id, time: 1000, modified, kind: 'memo', ...extra });

describe('noteRecord 파일 이름', () => {
  it('노트·사진 파일 이름을 만들고 노트 이름에서 번호를 꺼낸다', () => {
    expect(noteFileName('a1')).toBe('note-a1.json');
    expect(photoFileName('a1', '.JPG')).toBe('photo-a1.jpg');
    expect(noteIdOf('note-a1.json')).toBe('a1');
    expect(noteIdOf('photo-a1.jpg')).toBeNull();
  });
});

describe('parseNoteRecord', () => {
  it('맞는 형식은 읽고 모르는 필드는 버린다', () => {
    const r = parseNoteRecord({ v: 1, id: 'x', time: 5, modified: 6, kind: 'photo', title: '바다', tags: ['여행', 3], tint: 1.7, photo: { file: 'photo-x.jpg', width: 4, height: 3 }, extra: true });
    expect(r).toEqual({ v: 1, id: 'x', time: 5, modified: 6, kind: 'photo', title: '바다', tags: ['여행'], tint: 1, photo: { file: 'photo-x.jpg', width: 4, height: 3 } });
  });

  it('판·번호·시각·종류가 틀리면 null 이고, 크기가 틀린 사진 정보는 버린다', () => {
    expect(parseNoteRecord(null)).toBeNull();
    expect(parseNoteRecord({ v: 2, id: 'x', time: 1, modified: 1, kind: 'memo' })).toBeNull();
    expect(parseNoteRecord({ v: 1, id: '', time: 1, modified: 1, kind: 'memo' })).toBeNull();
    expect(parseNoteRecord({ v: 1, id: 'x', time: 'a', modified: 1, kind: 'memo' })).toBeNull();
    expect(parseNoteRecord({ v: 1, id: 'x', time: 1, modified: 1, kind: 'video' })).toBeNull();
    expect(parseNoteRecord({ v: 1, id: 'x', time: 1, modified: 1, kind: 'memo', photo: { file: 'p', width: 0, height: 3 } })?.photo).toBeUndefined();
    expect(parseNoteRecord({ v: 1, id: 'x', time: 1, modified: 1, kind: 'memo', deleted: true })?.deleted).toBe(true);
  });
});

describe('mergeRecords', () => {
  it('한쪽에만 있으면 그쪽 것을 쓰고 없는 쪽으로 보낸다', () => {
    const m = mergeRecords([rec('a', 1)], [rec('b', 1)]);
    expect(m.merged.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(m.upload.map((r) => r.id)).toEqual(['a']);
    expect(m.download.map((r) => r.id)).toEqual(['b']);
  });

  it('양쪽에 있으면 수정 시각이 늦은 쪽이 이기고, 같고 내용도 같으면 아무것도 보내지 않는다', () => {
    const newerLocal = mergeRecords([rec('a', 5, { title: 'L' })], [rec('a', 3, { title: 'R' })]);
    expect(newerLocal.merged[0].title).toBe('L');
    expect(newerLocal.upload).toHaveLength(1);
    expect(newerLocal.download).toHaveLength(0);
    const newerRemote = mergeRecords([rec('a', 3, { title: 'L' })], [rec('a', 5, { title: 'R' })]);
    expect(newerRemote.merged[0].title).toBe('R');
    expect(newerRemote.download).toHaveLength(1);
    const same = mergeRecords([rec('a', 3)], [rec('a', 3)]);
    expect(same.upload.length + same.download.length).toBe(0);
  });

  it('수정 시각이 같은데 내용이 다르면 드라이브 쪽을 따른다', () => {
    const m = mergeRecords([rec('a', 3, { title: 'L' })], [rec('a', 3, { title: 'R' })]);
    expect(m.merged[0].title).toBe('R');
    expect(m.download).toHaveLength(1);
    expect(m.upload).toHaveLength(0);
  });

  it('지움 표시도 수정 시각으로 겨룬다: 더 늦게 지우면 지워지고, 지운 뒤 더 늦게 고치면 되살아난다', () => {
    expect(mergeRecords([rec('a', 2)], [rec('a', 4, { deleted: true })]).merged[0].deleted).toBe(true);
    expect(mergeRecords([rec('a', 6, { title: '고침' })], [rec('a', 4, { deleted: true })]).merged[0].deleted).toBeUndefined();
  });
});

describe('albumNotes', () => {
  it('지운 노트를 빼고 최근 것부터 노트로 바꾼다', () => {
    const { notes } = albumNotes([rec('a', 1, { time: 10 }), rec('b', 1, { time: 30, deleted: true }), rec('c', 1, { time: 20, tint: 2 })]);
    expect(notes.map((n) => n.id)).toEqual(['c', 'a']);
    expect(notes[0].tint).toBe(2);
  });
});
