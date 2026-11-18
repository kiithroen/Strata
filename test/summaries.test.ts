import { describe, expect, it } from 'vitest';
import { Album } from '../src/album/album';
import type { NoteDraft } from '../src/album/albumModel';
import { MemoryNoteStore } from '../src/album/noteStore';
import { cleanTags, needsSummary, SummaryError, SummaryRunner, tagVocabulary, type SummaryInput } from '../src/album/summaries';
import { tuning } from '../src/config';
import { albumNotes, contentKey, freshSummary, parseNoteRecord, type NoteRecord } from '../src/sync/noteRecord';

const s = tuning.album.summary;
const settle = s.settleSec * 1000;
const t0 = new Date(2026, 10, 18, 9, 0).getTime();
/** 요약이 필요한 길이의 글 */
const long = (seed: string) => seed.repeat(s.minChars).slice(0, s.minChars);
const rec = (id: string, extra: Partial<NoteRecord> = {}): NoteRecord => ({ v: 1, id, time: t0, modified: t0, kind: 'memo', ...extra });
const draft = (title: string, body: string, time = t0, tags: string[] = []): NoteDraft => ({ time, title, body, tags });
const result = (summary: string, tags: string[] = []) => ({ summary, tags });

function clockAlbum() {
  let now = t0;
  const album = new Album(new MemoryNoteStore(), () => now, () => 0.5);
  return { album, clock: () => now, tick: (ms: number) => (now += ms) };
}

describe('요약 기록', () => {
  it('contentKey 는 제목·본문·체크리스트 항목 글이 바뀌면 바뀌고, 항목을 끝냄으로 바꾸는 것만으로는 그대로다', () => {
    const base = contentKey({ title: '장보기', body: '우유' });
    expect(contentKey({ title: '장보기', body: '우유' })).toBe(base);
    expect(contentKey({ title: '장보기!', body: '우유' })).not.toBe(base);
    expect(contentKey({ title: '장보기', body: '두유' })).not.toBe(base);
    const list = contentKey({ title: '장보기', checklist: [{ text: '우유', done: false }] });
    expect(contentKey({ title: '장보기', checklist: [{ text: '우유', done: true }] })).toBe(list);
    expect(contentKey({ title: '장보기', checklist: [{ text: '두유', done: false }] })).not.toBe(list);
  });

  it('요약 글은 지금 글로 만든 것만 쓰고, AI 태그는 지난 요약이어도 사용자 태그 뒤에 겹치지 않게 붙인다', () => {
    const r = rec('a', { title: '제목', body: '본문', tags: ['여행'] });
    const fresh = { ...r, summary: { text: '요약', tags: ['캠핑', '여행'], source: contentKey(r) } };
    const stale = { ...r, summary: { text: '옛 요약', tags: ['캠핑'], source: 'ffffffff' } };
    expect(freshSummary(fresh)).toBe('요약');
    expect(freshSummary(stale)).toBeUndefined();
    const [f] = albumNotes([fresh]).notes;
    expect(f).toMatchObject({ summary: '요약', tags: ['여행', '캠핑'], autoTags: ['캠핑'] });
    const [st] = albumNotes([stale]).notes;
    expect(st.summary).toBeUndefined();
    expect(st).toMatchObject({ tags: ['여행', '캠핑'], autoTags: ['캠핑'] });
    expect(albumNotes([rec('b')]).notes[0]).toMatchObject({ tags: undefined, autoTags: undefined });
  });

  it('드라이브 기록의 요약과 태그를 읽고, 형식이 틀린 요약은 버린다', () => {
    const base = { v: 1, id: 'x', time: 1, modified: 1, kind: 'doc' };
    expect(parseNoteRecord({ ...base, summary: { text: '요약', source: 'ab' } })?.summary).toEqual({ text: '요약', source: 'ab' });
    expect(parseNoteRecord({ ...base, summary: { text: '요약', tags: ['가', 3], source: 'ab' } })?.summary).toEqual({ text: '요약', tags: ['가'], source: 'ab' });
    expect(parseNoteRecord({ ...base, summary: { text: '', source: 'ab' } })?.summary).toBeUndefined();
    expect(parseNoteRecord({ ...base, summary: { text: '요약' } })?.summary).toBeUndefined();
  });

  it('요약이 필요한 노트: 지우지 않은 긴 메모·문서이고 지금 글의 요약이 없다', () => {
    const body = long('가');
    expect(needsSummary(rec('a', { body }))).toBe(true);
    expect(needsSummary(rec('a', { body, kind: 'doc' }))).toBe(true);
    expect(needsSummary(rec('a', { body: body.slice(1) }))).toBe(false);
    expect(needsSummary(rec('a', { body, kind: 'photo' }))).toBe(false);
    expect(needsSummary(rec('a', { body, deleted: true }))).toBe(false);
    const r = rec('a', { body });
    expect(needsSummary({ ...r, summary: { text: '요약', source: contentKey(r) } })).toBe(false);
    expect(needsSummary({ ...r, summary: { text: '요약', source: 'ffffffff' } })).toBe(true);
  });
});

describe('AI 태그', () => {
  it('#·빈칸을 빼고 겹치는 것과 사용자 태그를 뺀 뒤 maxTags 개까지 남긴다', () => {
    expect(cleanTags(['#캠핑', '주말 여행', 'Camp', 'camp', '', '#'], ['캠핑'])).toEqual(['주말여행', 'Camp']);
    const many = Array.from({ length: s.maxTags + 2 }, (_, i) => `태그${i}`);
    expect(cleanTags(many)).toEqual(many.slice(0, s.maxTags));
  });

  it('앨범 태그 어휘는 사용자·AI 태그를 많이 쓴 순서로 센다', () => {
    const records = [
      rec('a', { tags: ['일'] }),
      rec('b', { tags: ['일'], summary: { text: '요약', tags: ['회의'], source: 'x' } }),
      rec('c', { summary: { text: '요약', tags: ['회의', '일'], source: 'x' } }),
      rec('d', { tags: ['가족'] }),
    ];
    expect(tagVocabulary(records, 2)).toEqual(['일', '회의']);
  });
});

describe('Album 요약', () => {
  it('요약을 적으면 수정 시각이 그 판보다 1ms 늦고, 그 사이 글이 바뀌었으면 적지 않는다', async () => {
    const { album, tick } = clockAlbum();
    const a = await album.save(draft('제목', long('가')));
    const source = contentKey(a);
    tick(5000);
    const written = await album.setSummary(a.id, result('요약', ['캠핑']), source);
    expect(written).toMatchObject({ summary: { text: '요약', tags: ['캠핑'], source }, modified: a.modified + 1 });
    expect(album.data()?.notes[0]).toMatchObject({ summary: '요약', tags: ['캠핑'] });

    await album.save(draft('제목', long('나')), undefined, a.id);
    expect(await album.setSummary(a.id, result('늦은 요약'), source)).toBeUndefined();
    expect(album.record(a.id)?.summary?.text).toBe('요약');
  });

  it('태그만 고치면 요약을 그대로 쓰고, 글을 고치면 요약 글은 버리되 AI 태그는 새 요약까지 남긴다', async () => {
    const { album, tick } = clockAlbum();
    const a = await album.save(draft('제목', long('가')));
    await album.setSummary(a.id, result('요약', ['캠핑']), contentKey(a));
    tick(10);
    await album.save(draft('제목', long('가'), t0, ['일']), undefined, a.id);
    expect(freshSummary(album.record(a.id)!)).toBe('요약');
    tick(10);
    await album.save(draft('새 제목', long('가')), undefined, a.id);
    expect(freshSummary(album.record(a.id)!)).toBeUndefined();
    expect(needsSummary(album.record(a.id)!)).toBe(true);
    expect(album.data()?.notes[0]).toMatchObject({ summary: undefined, tags: ['캠핑'] });
  });
});

describe('SummaryRunner', () => {
  async function albumWith(count: number) {
    const { album, clock, tick } = clockAlbum();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      tick(1);
      ids.push((await album.save(draft(`노트 ${i}`, long(String(i)), t0 + i * 1000))).id);
    }
    tick(settle);
    return { album, ids, clock, tick };
  }

  it('최근 노트부터 한 차례에 perRun 개까지 요약해 적고 카드에 알린다', async () => {
    const { album, ids, clock } = await albumWith(s.perRun + 2);
    const asked: string[] = [];
    const shown: string[] = [];
    const runner = new SummaryRunner(
      album,
      async (n: SummaryInput) => {
        asked.push(n.title ?? '');
        return result(` ${n.title} 요약 `, ['#주제']);
      },
      (id) => shown.push(id),
      undefined,
      clock,
    );
    expect(runner.status().pending).toBe(ids.length);
    expect(await runner.runOnce()).toBe(s.perRun);
    const newestFirst = [...ids].reverse();
    expect(shown).toEqual(newestFirst.slice(0, s.perRun));
    expect(asked[0]).toBe(`노트 ${ids.length - 1}`);
    expect(album.record(newestFirst[0])?.summary).toMatchObject({ text: `노트 ${ids.length - 1} 요약`, tags: ['주제'] });
    expect(runner.status()).toMatchObject({ pending: 2, running: false, done: s.perRun, error: null });
    expect(await runner.runOnce()).toBe(2);
    expect(runner.status().pending).toBe(0);
  });

  it('고친 지 settleSec 이 안 된 노트는 미뤘다가 그 뒤 차례에 요약한다', async () => {
    const { album, ids, clock, tick } = await albumWith(2);
    await album.save(draft('노트 1', long('바뀐'), t0 + 1000), undefined, ids[1]);
    const asked: string[] = [];
    const runner = new SummaryRunner(album, async (n) => (asked.push(n.title ?? ''), result('요약')), undefined, undefined, clock);
    expect(await runner.runOnce()).toBe(1);
    expect(asked).toEqual(['노트 0']);
    expect(runner.status().pending).toBe(1);
    tick(settle - 1);
    expect(await runner.runOnce()).toBe(0);
    tick(1);
    expect(await runner.runOnce()).toBe(1);
    expect(asked).toEqual(['노트 0', '노트 1']);
  });

  it('요약할 때 노트의 태그와 앨범 태그 어휘를 넘기고, 사용자 태그와 겹치는 AI 태그는 뺀다', async () => {
    const { album, clock, tick } = clockAlbum();
    const a = await album.save(draft('여행 계획', long('가'), t0, ['여행', '가족']));
    tick(1);
    await album.save(draft('짧은 메모', '', t0 - 1000, ['여행']));
    tick(settle);
    let input: SummaryInput | undefined;
    const runner = new SummaryRunner(album, async (n) => ((input = n), result('요약', ['여행', '바다'])), undefined, undefined, clock);
    await runner.runOnce();
    expect(input).toMatchObject({ title: '여행 계획', tags: ['여행', '가족'], vocabulary: ['여행', '가족'] });
    expect(album.record(a.id)?.summary?.tags).toEqual(['바다']);
  });

  it('거절된 노트는 이번 실행 동안 건너뛰고, 키·연결 오류는 그 차례를 멈춘다', async () => {
    const { album, ids, clock, tick } = await albumWith(3);
    const newest = ids[2];
    let fail: 'skip' | 'stop' = 'skip';
    const calls: string[] = [];
    const runner = new SummaryRunner(
      album,
      async (n) => {
        calls.push(n.title ?? '');
        if (n.title === '노트 2') throw new SummaryError('거절', fail === 'skip');
        return result('요약');
      },
      undefined,
      undefined,
      clock,
    );
    expect(await runner.runOnce()).toBe(2);
    expect(runner.status()).toMatchObject({ pending: 0, error: null });
    expect(album.record(newest)?.summary).toBeUndefined();

    // 글을 고치면 건너뛴 표시가 풀린다. 이번에는 멈추는 오류라 뒤 노트로 가지 않는다
    await album.save(draft('노트 2', long('바뀐'), t0 + 2000), undefined, newest);
    await album.save(draft('노트 0', long('바뀐'), t0), undefined, ids[0]);
    tick(settle);
    fail = 'stop';
    calls.length = 0;
    expect(await runner.runOnce()).toBe(0);
    expect(calls).toEqual(['노트 2']);
    expect(runner.status()).toMatchObject({ pending: 2, error: '거절' });
  });

  it('빈 요약은 적지 않고 그 노트를 건너뛴다', async () => {
    const { album, ids, clock } = await albumWith(1);
    const runner = new SummaryRunner(album, async () => result('   ', ['태그']), undefined, undefined, clock);
    expect(await runner.runOnce()).toBe(0);
    expect(album.record(ids[0])?.summary).toBeUndefined();
    expect(runner.status().pending).toBe(0);
  });
});
