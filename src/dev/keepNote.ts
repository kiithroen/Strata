import { tuning } from '../config';
import type { NoteKind } from '../widgets/noteCard/cardLayout';

/** 구글 킵 내보내기(테이크아웃) 노트 하나에서 쓰는 것 */
export interface KeepNote {
  time: number;
  kind: NoteKind;
  title?: string;
  body?: string;
  tags: string[];
}

/**
 * 구글 킵 테이크아웃의 노트 JSON 하나를 읽는다. 휴지통 노트, 시각이 없거나 글이 비었으면 null 이다.
 * 체크리스트는 항목마다 한 줄로 잇는다. 본문이 album.docMinChars 자 이상이면 긴 문서, 아니면 메모다.
 */
export function parseKeepNote(json: unknown): KeepNote | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (o.isTrashed === true) return null;
  const usec = Number(o.createdTimestampUsec ?? o.userEditedTimestampUsec);
  if (!Number.isFinite(usec) || usec <= 0) return null;

  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : undefined;
  let body = typeof o.textContent === 'string' ? o.textContent.trim() : '';
  if (!body && Array.isArray(o.listContent)) {
    body = o.listContent
      .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>).text : undefined))
      .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      .map((t) => `- ${t.trim()}`)
      .join('\n');
  }
  if (!title && !body) return null;

  const tags = Array.isArray(o.labels)
    ? o.labels
        .map((l) => (l && typeof l === 'object' ? (l as Record<string, unknown>).name : undefined))
        .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
        .map((n) => n.trim())
    : [];
  const kind: NoteKind = body.length >= tuning.album.docMinChars ? 'doc' : 'memo';
  return { time: Math.floor(usec / 1000), kind, title, body: body || undefined, tags };
}
