import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { parseKeepNote } from '../src/dev/keepNote';

describe('parseKeepNote', () => {
  const created = new Date(2025, 4, 6, 9, 30).getTime();
  const base = { createdTimestampUsec: created * 1000, isTrashed: false };

  it('제목·본문·라벨·시각을 읽고 짧은 글은 메모다', () => {
    const n = parseKeepNote({ ...base, title: ' 장보기 ', textContent: '우유, 계란', labels: [{ name: '일상' }, { name: ' ' }] });
    expect(n).toEqual({ time: created, kind: 'memo', title: '장보기', body: '우유, 계란', tags: ['일상'] });
  });

  it('체크리스트는 항목마다 한 줄로 잇는다', () => {
    const n = parseKeepNote({ ...base, listContent: [{ text: '빵', isChecked: false }, { text: '', isChecked: true }, { text: '잼' }] });
    expect(n?.body).toBe('- 빵\n- 잼');
  });

  it('본문이 기준 길이 이상이면 긴 문서다', () => {
    expect(parseKeepNote({ ...base, textContent: '가'.repeat(tuning.dev.docMinChars) })?.kind).toBe('doc');
    expect(parseKeepNote({ ...base, textContent: '가'.repeat(tuning.dev.docMinChars - 1) })?.kind).toBe('memo');
  });

  it('휴지통 노트, 빈 노트, 시각 없는 노트는 버린다', () => {
    expect(parseKeepNote({ ...base, isTrashed: true, title: 'x' })).toBeNull();
    expect(parseKeepNote({ ...base, title: '  ', textContent: '' })).toBeNull();
    expect(parseKeepNote({ title: 'x' })).toBeNull();
    expect(parseKeepNote('x')).toBeNull();
  });
});
