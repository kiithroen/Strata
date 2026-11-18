import { describe, expect, it } from 'vitest';
import { Album } from '../src/album/album';
import type { NoteDraft } from '../src/album/albumModel';
import { MemoryNoteStore } from '../src/album/noteStore';
import { needsSummary, SummaryError, SummaryRunner, type SummaryInput } from '../src/album/summaries';
import { tuning } from '../src/config';
import { albumNotes, contentKey, freshSummary, parseNoteRecord, type NoteRecord } from '../src/sync/noteRecord';

const s = tuning.album.summary;
const t0 = new Date(2026, 10, 18, 9, 0).getTime();
/** 요약이 필요한 길이의 글 */
const long = (seed: string) => seed.repeat(s.minChars).slice(0, s.minChars);
const rec = (id: string, extra: Partial<NoteRecord> = {}): NoteRecord => ({ v: 1, id, time: t0, modified: t0, kind: 'memo', ...extra });
const draft = (title: string, body: string, time = t0): NoteDraft => ({ time, title, body, tags: [] });

function clockAlbum() {
  let now = t0;
  const album = new Album(new MemoryNoteStore(), () => now, () => 0.5);
  return { album, tick: (ms: number) => (now += ms) };
}

describe('요약 기록', () => {
  it('contentKey 는 제목·본문·체크리스트 글이 바뀌면 바뀐다', () => {
    const base = contentKey({ title: '장보기', body: '우유' });
    expect(contentKey({ title: '장보기', body: '우유' })).toBe(base);
    expect(contentKey({ title: '장보기!', body: '우유' })).not.toBe(base);
    expect(contentKey({ title: '장보기', body: '두유' })).not.toBe(base);
    const list = contentKey({ title: '장보기', checklist: [{ text: '우유', done: false }] });
    expect(contentKey({ title: '장보기', checklist: [{ text: '우유', done: true }] })).not.toBe(list);
  });

  it('요약은 지금 글로 만든 것만 쓰고, 은하 노트에도 그것만 넘긴다', () => {
    const r = rec('a', { title: '제목', body: '본문' });
    const fresh = { ...r, summary: { text: '요약', source: contentKey(r) } };
    const stale = { ...r, summary: { text: '옛 요약', source: 'ffffffff' } };
    expect(freshSummary(fresh)).toBe('요약');
    expect(freshSummary(stale)).toBeUndefined();
    expect(albumNotes([fresh]).notes[0].summary).toBe('요약');
    expect(albumNotes([stale]).notes[0].summary).toBeUndefined();
  });

  it('드라이브 기록의 요약을 읽고, 형식이 틀린 요약은 버린다', () => {
    const base = { v: 1, id: 'x', time: 1, modified: 1, kind: 'doc' };
    expect(parseNoteRecord({ ...base, summary: { text: '요약', source: 'ab' } })?.summary).toEqual({ text: '요약', source: 'ab' });
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

describe('Album 요약', () => {
  it('요약을 적으면 수정 시각이 그 판보다 1ms 늦고, 그 사이 글이 바뀌었으면 적지 않는다', async () => {
    const { album, tick } = clockAlbum();
    const a = await album.save(draft('제목', long('가')));
    const source = contentKey(a);
    tick(5000);
    const written = await album.setSummary(a.id, '요약', source);
    expect(written).toMatchObject({ summary: { text: '요약', source }, modified: a.modified + 1 });
    expect(album.data()?.notes[0].summary).toBe('요약');

    await album.save(draft('제목', long('나')), undefined, a.id);
    expect(await album.setSummary(a.id, '늦은 요약', source)).toBeUndefined();
    expect(album.record(a.id)?.summary).toBeUndefined();
  });

  it('태그만 고치면 요약을 그대로 두고, 글을 고치면 버린다', async () => {
    const { album, tick } = clockAlbum();
    const a = await album.save(draft('제목', long('가')));
    await album.setSummary(a.id, '요약', contentKey(a));
    tick(10);
    await album.save({ ...draft('제목', long('가')), tags: ['일'] }, undefined, a.id);
    expect(freshSummary(album.record(a.id)!)).toBe('요약');
    tick(10);
    await album.save(draft('새 제목', long('가')), undefined, a.id);
    expect(album.record(a.id)?.summary).toBeUndefined();
  });
});

describe('SummaryRunner', () => {
  async function albumWith(count: number) {
    const { album, tick } = clockAlbum();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      tick(1);
      ids.push((await album.save(draft(`노트 ${i}`, long(String(i)), t0 + i * 1000))).id);
    }
    return { album, ids };
  }

  it('최근 노트부터 한 차례에 perRun 개까지 요약해 적고 카드에 알린다', async () => {
    const { album, ids } = await albumWith(s.perRun + 2);
    const asked: string[] = [];
    const shown: string[] = [];
    const runner = new SummaryRunner(
      album,
      async (n: SummaryInput) => {
        asked.push(n.title ?? '');
        return ` ${n.title} 요약 `;
      },
      (id) => shown.push(id),
    );
    expect(runner.status().pending).toBe(ids.length);
    expect(await runner.runOnce()).toBe(s.perRun);
    const newestFirst = [...ids].reverse();
    expect(shown).toEqual(newestFirst.slice(0, s.perRun));
    expect(asked[0]).toBe(`노트 ${ids.length - 1}`);
    expect(freshSummary(album.record(newestFirst[0])!)).toBe(`노트 ${ids.length - 1} 요약`);
    expect(runner.status()).toMatchObject({ pending: 2, running: false, done: s.perRun, error: null });
    expect(await runner.runOnce()).toBe(2);
    expect(runner.status().pending).toBe(0);
  });

  it('거절된 노트는 이번 실행 동안 건너뛰고, 키·연결 오류는 그 차례를 멈춘다', async () => {
    const { album, ids } = await albumWith(3);
    const newest = ids[2];
    let fail: 'skip' | 'stop' = 'skip';
    const calls: string[] = [];
    const runner = new SummaryRunner(album, async (n) => {
      calls.push(n.title ?? '');
      if (n.title === '노트 2') throw new SummaryError('거절', fail === 'skip');
      return '요약';
    });
    expect(await runner.runOnce()).toBe(2);
    expect(runner.status()).toMatchObject({ pending: 0, error: null });
    expect(album.record(newest)?.summary).toBeUndefined();

    // 글을 고치면 건너뛴 표시가 풀린다. 이번에는 멈추는 오류라 뒤 노트로 가지 않는다
    await album.save(draft('노트 2', long('바뀐'), t0 + 2000), undefined, newest);
    await album.save(draft('노트 0', long('바뀐'), t0), undefined, ids[0]);
    fail = 'stop';
    calls.length = 0;
    expect(await runner.runOnce()).toBe(0);
    expect(calls).toEqual(['노트 2']);
    expect(runner.status()).toMatchObject({ pending: 2, error: '거절' });
  });

  it('빈 요약은 적지 않고 그 노트를 건너뛴다', async () => {
    const { album, ids } = await albumWith(1);
    const runner = new SummaryRunner(album, async () => '   ');
    expect(await runner.runOnce()).toBe(0);
    expect(album.record(ids[0])?.summary).toBeUndefined();
    expect(runner.status().pending).toBe(0);
  });
});
