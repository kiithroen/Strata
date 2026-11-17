import { tuning } from '../config';
import { checklistText, type ChecklistItem } from '../core/checklist';
import type { NoteKind } from '../widgets/noteCard/cardLayout';

/** 구글 킵 내보내기(테이크아웃) 노트 하나에서 쓰는 것 */
export interface KeepNote {
  time: number;
  kind: NoteKind;
  title?: string;
  /** 본문. 체크리스트는 항목을 줄마다 적은 글이다(checklistText) */
  body?: string;
  checklist?: ChecklistItem[];
  tags: string[];
}

/**
 * 구글 킵 테이크아웃의 노트 JSON 하나를 읽는다. 휴지통 노트, 시각이 없거나 글이 비었으면 null 이다.
 * 체크리스트는 항목(빈 항목은 뺀다)과 체크 상태를 읽는다. 본문(체크리스트는 항목 글)이 album.docMinChars 자 이상이면 긴 문서, 아니면 메모다.
 */
export function parseKeepNote(json: unknown): KeepNote | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (o.isTrashed === true) return null;
  const usec = Number(o.createdTimestampUsec ?? o.userEditedTimestampUsec);
  if (!Number.isFinite(usec) || usec <= 0) return null;

  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : undefined;
  let body = typeof o.textContent === 'string' ? o.textContent.trim() : '';
  let checklist: ChecklistItem[] | undefined;
  if (!body && Array.isArray(o.listContent)) {
    const items = o.listContent
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .filter((item) => typeof item.text === 'string' && item.text.trim() !== '')
      .map((item) => ({ text: (item.text as string).trim(), done: item.isChecked === true }));
    if (items.length > 0) {
      checklist = items;
      body = checklistText(items);
    }
  }
  if (!title && !body) return null;

  const tags = Array.isArray(o.labels)
    ? o.labels
        .map((l) => (l && typeof l === 'object' ? (l as Record<string, unknown>).name : undefined))
        .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
        .map((n) => n.trim())
    : [];
  const kind: NoteKind = body.length >= tuning.album.docMinChars ? 'doc' : 'memo';
  return { time: Math.floor(usec / 1000), kind, title, body: body || undefined, ...(checklist ? { checklist } : {}), tags };
}
