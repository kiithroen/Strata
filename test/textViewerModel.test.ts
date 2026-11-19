import { describe, expect, it } from 'vitest';
import {
  createTextDecoder,
  findTextMatches,
  formatMatchCount,
  stepMatchIndex,
  TEXT_ENCODINGS,
} from '../src/widgets/explorer/textViewerModel';

describe('createTextDecoder', () => {
  it('수동 인코딩 선택 목록에 자동·UTF-8·EUC-KR·UTF-16LE 가 모두 있다', () => {
    expect(TEXT_ENCODINGS.map((e) => e.value)).toEqual(['auto', 'utf-8', 'euc-kr', 'utf-16le']);
  });

  it('UTF-8 조각 경계에 걸친 멀티바이트 한글을 이어 해독한다', () => {
    const raw = new TextEncoder().encode('안녕 스트라타');
    const decoder = createTextDecoder('utf-8');
    // '안' 은 3바이트(0..2)라 2바이트에서 자르면 글자 경계가 걸친다
    const part1 = decoder.push(raw.subarray(0, 2), false);
    const part2 = decoder.push(raw.subarray(2), true);
    expect(decoder.encoding).toBe('utf-8');
    expect(part1 + part2).toBe('안녕 스트라타');
  });

  it('수동 EUC-KR 모드는 EUC-KR 바이트를 처음부터 바로 해독한다', () => {
    // EUC-KR '한글': 0xC7 0xD1 0xB1 0xDB
    const bytes = new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb]);
    const decoder = createTextDecoder('euc-kr');
    const a = decoder.push(bytes.subarray(0, 1), false);
    const b = decoder.push(bytes.subarray(1), true);
    expect(decoder.encoding).toBe('euc-kr');
    expect(a + b).toBe('한글');
  });

  it('수동 UTF-16LE 모드는 BOM 없는 UTF-16LE 도 해독한다', () => {
    // 'AB' in UTF-16LE: 0x41 0x00 0x42 0x00, '가'(U+AC00): 0x00 0xAC
    const bytes = new Uint8Array([0x41, 0x00, 0x42, 0x00, 0x00, 0xac]);
    const decoder = createTextDecoder('utf-16le');
    expect(decoder.encoding).toBe('utf-16le');
    expect(decoder.push(bytes, true)).toBe('AB가');
  });

  it('자동 모드는 UTF-8 BOM 과 EUC-KR 폴백을 지원한다', () => {
    const euc = new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb]);
    const d = createTextDecoder('auto');
    expect(d.push(euc, true)).toBe('한글');
    expect(d.encoding).toBe('euc-kr');
  });
});

describe('findTextMatches · stepMatchIndex · formatMatchCount', () => {
  it('대소문자 구분 없이 겹치지 않는 모든 일치 구간을 찾는다', () => {
    const text = 'Alpha beta ALPHA aaaa';
    expect(findTextMatches(text, 'alpha')).toEqual([
      { start: 0, end: 5 },
      { start: 11, end: 16 },
    ]);
    expect(findTextMatches(text, 'aa')).toEqual([
      { start: 17, end: 19 },
      { start: 19, end: 21 },
    ]);
  });

  it('빈 검색어나 빈 본문은 빈 목록을 낸다', () => {
    expect(findTextMatches('hello', '')).toEqual([]);
    expect(findTextMatches('', 'hello')).toEqual([]);
  });

  it('이전·다음 매치 이동은 양 끝에서 순환하고 매치가 없으면 -1 이다', () => {
    expect(stepMatchIndex(-1, 0, 1)).toBe(-1);
    expect(stepMatchIndex(-1, 3, 1)).toBe(0);
    expect(stepMatchIndex(-1, 3, -1)).toBe(2);
    expect(stepMatchIndex(0, 3, 1)).toBe(1);
    expect(stepMatchIndex(2, 3, 1)).toBe(0);
    expect(stepMatchIndex(0, 3, -1)).toBe(2);
  });

  it('매치 수 표시 글자를 상태에 맞게 만든다', () => {
    expect(formatMatchCount(-1, 0, '')).toBe('');
    expect(formatMatchCount(-1, 0, 'foo')).toBe('0 / 0');
    expect(formatMatchCount(1, 5, 'foo')).toBe('2 / 5');
  });
});
