import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import {
  deletedRecord,
  draftFromRecord,
  draftHasContent,
  newNoteId,
  noteKindOf,
  parseQuery,
  parseTags,
  recordFromDraft,
  sameDraft,
  searchNotes,
  toggleTagInText,
  type NoteDraft,
} from '../src/album/albumModel';
import { checklistText } from '../src/core/checklist';
import { parseNoteRecord } from '../src/sync/noteRecord';

const base: NoteDraft = { time: new Date(2026, 10, 18, 9, 30).getTime(), title: '', body: '', tags: [] };

describe('parseTags', () => {
  it('쉼표·띄어쓰기로 나누고 #을 떼며 같은 태그는 하나만 남긴다', () => {
    expect(parseTags(' #여행, 바다  일상,,#여행 ')).toEqual(['여행', '바다', '일상']);
    expect(parseTags('')).toEqual([]);
    expect(parseTags('# ,')).toEqual([]);
  });
});

describe('noteKindOf', () => {
  it('사진이 있으면 사진, 본문이 album.docMinChars 자 이상이면 긴 문서, 아니면 메모다', () => {
    const n = tuning.album.docMinChars;
    expect(noteKindOf({ body: '가'.repeat(n), photo: { width: 4, height: 3 } })).toBe('photo');
    expect(noteKindOf({ body: '가'.repeat(n) })).toBe('doc');
    expect(noteKindOf({ body: '가'.repeat(n - 1) })).toBe('memo');
    // 앞뒤 빈칸은 세지 않는다
    expect(noteKindOf({ body: ` ${'가'.repeat(n - 1)} ` })).toBe('memo');
  });

  it('체크리스트는 본문 대신 항목 글의 길이로 정한다', () => {
    const text = '가'.repeat(tuning.album.docMinChars);
    const long = [{ text, done: false }];
    const kind = checklistText(long).length >= tuning.album.docMinChars ? 'doc' : 'memo';
    expect(noteKindOf({ body: '', checklist: long })).toBe(kind);
    expect(noteKindOf({ body: text, checklist: [{ text: '빵', done: false }] })).toBe('memo');
  });
});

describe('draftHasContent', () => {
  it('제목·본문·사진 가운데 하나라도 있어야 저장할 수 있다', () => {
    expect(draftHasContent(base)).toBe(false);
    expect(draftHasContent({ ...base, title: '  ' })).toBe(false);
    expect(draftHasContent({ ...base, body: '메모' })).toBe(true);
    expect(draftHasContent({ ...base, photo: { width: 1, height: 1 } })).toBe(true);
  });

  it('체크리스트는 빈 항목만 있으면 내용이 없고, 본문은 보지 않는다', () => {
    expect(draftHasContent({ ...base, body: '메모', checklist: [{ text: ' ', done: true }] })).toBe(false);
    expect(draftHasContent({ ...base, checklist: [{ text: '빵', done: false }] })).toBe(true);
  });
});

describe('newNoteId', () => {
  it('만든 시각과 난수로 다른 번호를 낸다', () => {
    const now = base.time;
    expect(newNoteId(now, () => 0)).not.toBe(newNoteId(now, () => 0.5));
    expect(newNoteId(now, () => 0)).not.toBe(newNoteId(now + 1, () => 0));
    expect(newNoteId(now, () => 0.999999)).toMatch(/^[0-9a-z]+$/);
  });
});

describe('recordFromDraft', () => {
  it('글을 다듬어 담고 빈 글은 빼며, 드라이브 형식 검사를 통과한다', () => {
    const now = base.time + 1000;
    const r = recordFromDraft('n1', { ...base, title: ' 장보기 ', body: '', tags: ['일상'], tint: 2 }, now);
    expect(r).toEqual({ v: 1, id: 'n1', time: base.time, modified: now, kind: 'memo', title: '장보기', tags: ['일상'], tint: 2 });
    expect(parseNoteRecord(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it('사진 노트는 메모 색을 버리고 사진 파일 이름과 크기를 적는다', () => {
    const r = recordFromDraft('n2', { ...base, tint: 1, photo: { width: 400, height: 300 } }, base.time);
    expect(r.kind).toBe('photo');
    expect(r.tint).toBeUndefined();
    expect(r.photo).toEqual({ file: 'photo-n2.jpg', width: 400, height: 300 });
  });

  it('체크리스트 노트는 빈 항목을 빼고 본문을 적지 않으며, 드라이브 형식 검사를 통과한다', () => {
    const checklist = [
      { text: ' 우유 ', done: true },
      { text: '', done: false },
      { text: '빵', done: false },
    ];
    const r = recordFromDraft('c1', { ...base, body: '버릴 본문', checklist }, base.time);
    expect(r.checklist).toEqual([
      { text: '우유', done: true },
      { text: '빵', done: false },
    ]);
    expect(r.body).toBeUndefined();
    expect(parseNoteRecord(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(recordFromDraft('c1', draftFromRecord(r), r.modified)).toEqual(r);
    expect(recordFromDraft('c2', { ...base, title: '빈 목록', checklist: [{ text: ' ', done: false }] }, base.time).checklist).toBeUndefined();
  });

  it('기록을 입력 내용으로 되돌리면 같은 기록이 된다', () => {
    const r = recordFromDraft('n3', { ...base, title: '제목', body: '본문', tags: ['a', 'b'], tint: 0 }, base.time);
    expect(recordFromDraft('n3', draftFromRecord(r), r.modified)).toEqual(r);
  });
});

describe('deletedRecord', () => {
  it('글은 비우고 번호·시각·지움 표시만 남긴다', () => {
    const r = recordFromDraft('n4', { ...base, title: '비밀', photo: { width: 2, height: 2 } }, base.time);
    const d = deletedRecord(r, base.time + 5);
    expect(d).toEqual({ v: 1, id: 'n4', time: base.time, modified: base.time + 5, kind: 'photo', deleted: true });
  });
});

describe('searchNotes', () => {
  const notes = [
    { title: '장보기 목록', body: '우유, 계란', tags: ['일상'] },
    { title: 'Trip Plan', body: '바다 산책', tags: ['여행', '바다'] },
    { title: '회의', body: '다음 주 일정', tags: ['작업'] },
    {},
  ];

  it('낱말마다 제목·본문·태그 어딘가에 들어 있어야 하고 대소문자는 가리지 않는다', () => {
    expect(searchNotes(notes, '바다')).toEqual([1]);
    expect(searchNotes(notes, 'trip 산책')).toEqual([1]);
    expect(searchNotes(notes, 'trip 우유')).toEqual([]);
    expect(searchNotes(notes, '일')).toEqual([0, 2]);
  });

  it('#태그 낱말은 태그만 찾는다', () => {
    expect(searchNotes(notes, '#바다')).toEqual([1]);
    expect(searchNotes(notes, '#우유')).toEqual([]);
    expect(searchNotes(notes, '#작 회의')).toEqual([2]);
  });

  it('빈 검색어는 아무것도 찾지 않는다', () => {
    expect(searchNotes(notes, '   ')).toEqual([]);
    expect(searchNotes(notes, '#')).toEqual([]);
    expect(parseQuery(' a  #B ')).toEqual({ words: ['a'], tags: ['b'] });
  });
});

describe('toggleTagInText', () => {
  it('태그가 없으면 끝에 추가하고 이미 있으면 제거하며 #·쉼표를 정리한다', () => {
    expect(toggleTagInText('', '여행')).toBe('여행');
    expect(toggleTagInText('#여행, 바다', '일상')).toBe('여행 바다 일상');
    expect(toggleTagInText('여행 바다 일상', '#바다')).toBe('여행 일상');
  });
});

describe('sameDraft', () => {
  const sample: NoteDraft = { ...base, title: '제목', body: '본문', tags: ['일상'], tint: 1 };

  it('초 단위 시각 차이와 앞뒤 공백은 같다고 본다', () => {
    expect(sameDraft(sample, { ...sample, time: sample.time + 15000, title: ' 제목 ', body: ' 본문\n' })).toBe(true);
  });

  it('분 단위 시각이나 제목·본문·체크리스트·태그·색·사진이 달라지면 다르다고 본다', () => {
    expect(sameDraft(sample, { ...sample, time: sample.time + 60000 })).toBe(false);
    expect(sameDraft(sample, { ...sample, title: '다른 제목' })).toBe(false);
    expect(sameDraft(sample, { ...sample, body: '다른 본문' })).toBe(false);
    expect(sameDraft(sample, { ...sample, tags: ['일상', '여행'] })).toBe(false);
    expect(sameDraft(sample, { ...sample, tint: 2 })).toBe(false);
    expect(sameDraft(sample, { ...sample, photo: { width: 10, height: 10 } })).toBe(false);
    expect(sameDraft(sample, { ...sample, checklist: [] })).toBe(false);

    const cl: NoteDraft = { ...base, checklist: [{ text: '우유', done: false }] };
    expect(sameDraft(cl, { ...base, checklist: [{ text: ' 우유 ', done: false }, { text: ' ', done: false }] })).toBe(true);
    expect(sameDraft(cl, { ...base, checklist: [{ text: '우유', done: true }] })).toBe(false);
  });
});
