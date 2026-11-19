import { TextChunkDecoder } from './explorerModel';

/** 텍스트 뷰어의 인코딩 선택 모드 */
export type TextEncodingMode = 'auto' | 'utf-8' | 'euc-kr' | 'utf-16le';

export const TEXT_ENCODINGS: readonly { readonly value: TextEncodingMode; readonly label: string }[] = [
  { value: 'auto', label: '자동' },
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'euc-kr', label: 'EUC-KR' },
  { value: 'utf-16le', label: 'UTF-16LE' },
];

/** 텍스트 조각을 순서대로 이어 해독하는 디코더 인터페이스 */
export interface ChunkDecoder {
  readonly encoding: string;
  push(bytes: Uint8Array, last: boolean): string;
}

class FixedEncodingDecoder implements ChunkDecoder {
  private readonly decoder: TextDecoder;

  constructor(readonly encoding: Exclude<TextEncodingMode, 'auto'>) {
    this.decoder = new TextDecoder(encoding);
  }

  push(bytes: Uint8Array, last: boolean): string {
    return this.decoder.decode(bytes, { stream: !last });
  }
}

/** 선택한 인코딩 모드에 맞는 스트리밍 디코더를 만든다 */
export function createTextDecoder(mode: TextEncodingMode): ChunkDecoder {
  return mode === 'auto' ? new TextChunkDecoder() : new FixedEncodingDecoder(mode);
}

/** 텍스트 안에서 일치한 구간(start 포함, end 제외) */
export interface TextMatch {
  readonly start: number;
  readonly end: number;
}

/**
 * text 에서 query 와 대소문자 구분 없이 일치하는 모든 구간을 앞에서부터 겹치지 않게 찾는다.
 * query 가 비어 있으면 빈 배열이다
 */
export function findTextMatches(text: string, query: string): TextMatch[] {
  if (query === '' || text === '') return [];
  const hay = text.toLowerCase();
  const needle = query.toLowerCase();
  const len = needle.length;
  if (len === 0) return [];
  const matches: TextMatch[] = [];
  let from = 0;
  while (from <= hay.length - len) {
    const idx = hay.indexOf(needle, from);
    if (idx < 0) break;
    matches.push({ start: idx, end: Math.min(text.length, idx + len) });
    from = idx + len;
  }
  return matches;
}

/**
 * 매치 목록(total 개)에서 current 자리를 dir(+1 다음, -1 이전)만큼 순환 이동한다.
 * 매치가 없으면 -1 이다
 */
export function stepMatchIndex(current: number, total: number, dir: 1 | -1): number {
  if (total <= 0) return -1;
  if (current < 0 || current >= total) return dir > 0 ? 0 : total - 1;
  return (current + dir + total) % total;
}

/** 찾기 입력 줄에 띄울 매치 수 글자 */
export function formatMatchCount(active: number, total: number, query: string): string {
  if (query === '') return '';
  if (total <= 0 || active < 0) return '0 / 0';
  return `${active + 1} / ${total}`;
}
