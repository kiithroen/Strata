import { tuning } from '../config';
import { checklistText, cleanChecklist, type ChecklistItem } from '../core/checklist';
import { photoFileName, type NoteRecord } from '../sync/noteRecord';
import type { NoteKind } from '../widgets/noteCard/cardLayout';

/** 입력 화면이 넘기는 노트 내용. 사진은 저장소가 따로 다룬다(photo 는 사진이 있는지와 크기만) */
export interface NoteDraft {
  /** 노트의 시각(ms). 은하에서 자리를 정한다 */
  time: number;
  title: string;
  /** 글 노트의 본문. 체크리스트 노트면 쓰지 않는다 */
  body: string;
  /** 있으면 체크리스트 노트다(빈 항목은 저장할 때 뺀다) */
  checklist?: readonly ChecklistItem[];
  tags: readonly string[];
  /** 메모 포스트잇 색 번호. 사진 노트는 쓰지 않는다 */
  tint?: number;
  photo?: { width: number; height: number };
}

/** 태그 입력 글을 태그로 나눈다. 쉼표·띄어쓰기로 나누고 앞의 #은 뗀다. 같은 태그는 하나만 남기고 처음 쓴 순서를 지킨다 */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,，]+/)) {
    const tag = raw.replace(/^#+/, '').trim();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/** 태그 입력 글에서 tag 가 이미 있으면 빼고, 없으면 끝에 넣어 공백으로 이은 글을 돌려준다 */
export function toggleTagInText(text: string, tag: string): string {
  const clean = tag.replace(/^#+/, '').trim();
  const list = parseTags(text);
  if (!clean) return list.join(' ');
  const i = list.indexOf(clean);
  if (i >= 0) list.splice(i, 1);
  else list.push(clean);
  return list.join(' ');
}

/** 두 입력 내용이 실질적으로 같은지 비교한다(시각은 분 단위, 제목·본문·체크리스트·태그는 다듬은 값 기준) */
export function sameDraft(a: NoteDraft, b: NoteDraft): boolean {
  if (Math.floor(a.time / 60000) !== Math.floor(b.time / 60000)) return false;
  if (a.title.trim() !== b.title.trim()) return false;
  if ((a.checklist !== undefined) !== (b.checklist !== undefined)) return false;
  if (a.checklist && b.checklist) {
    const ca = cleanChecklist(a.checklist);
    const cb = cleanChecklist(b.checklist);
    if (ca.length !== cb.length || ca.some((item, i) => item.text !== cb[i].text || item.done !== cb[i].done)) return false;
  } else if (a.body.trim() !== b.body.trim()) {
    return false;
  }
  if (a.tags.length !== b.tags.length || a.tags.some((t, i) => t !== b.tags[i])) return false;
  if (a.photo?.width !== b.photo?.width || a.photo?.height !== b.photo?.height) return false;
  if (!a.photo && a.tint !== b.tint) return false;
  return true;
}

/** 카드에 쓰일 글: 체크리스트 노트면 남는 항목을 줄마다 적은 글, 아니면 본문 */
function draftText(draft: Pick<NoteDraft, 'body' | 'checklist'>): string {
  return draft.checklist ? checklistText(cleanChecklist(draft.checklist)) : draft.body.trim();
}

/** 노트 종류: 사진이 있으면 사진, 없으면 글(체크리스트는 항목 글)이 album.docMinChars 자 이상일 때 긴 문서, 아니면 메모다 */
export function noteKindOf(draft: Pick<NoteDraft, 'body' | 'checklist' | 'photo'>): NoteKind {
  if (draft.photo) return 'photo';
  return draftText(draft).length >= tuning.album.docMinChars ? 'doc' : 'memo';
}

/** 저장할 만한 내용이 있는지: 제목·글(본문이나 체크리스트 항목)·사진 가운데 하나 */
export function draftHasContent(draft: Pick<NoteDraft, 'title' | 'body' | 'checklist' | 'photo'>): boolean {
  return draft.title.trim() !== '' || draftText(draft) !== '' || draft.photo !== undefined;
}

/**
 * 새 노트 번호: 만든 시각(36진수)과 난수 두 자리. 같은 기기에서 같은 밀리초에 두 번 만들 일이 없고,
 * 다른 기기와 겹치지 않게 난수를 붙인다. rand 는 0~1 난수다
 */
export function newNoteId(now: number, rand: () => number): string {
  const tail = Math.floor(rand() * 36 * 36)
    .toString(36)
    .padStart(2, '0');
  return `${now.toString(36)}${tail}`;
}

/** 저장하는 사진 사본의 확장자. 사본은 늘 JPEG 로 굽는다 */
export const PHOTO_EXT = 'jpg';

/** 입력 내용으로 노트 기록을 만든다. 비운 글과 빈 항목은 뺀다. 체크리스트 노트는 본문을 적지 않는다. 수정 시각은 now 다 */
export function recordFromDraft(id: string, draft: NoteDraft, now: number): NoteRecord {
  const kind = noteKindOf(draft);
  const record: NoteRecord = { v: 1, id, time: draft.time, modified: now, kind };
  const title = draft.title.trim();
  if (title) record.title = title;
  if (draft.checklist) {
    const items = cleanChecklist(draft.checklist);
    if (items.length > 0) record.checklist = items;
  } else {
    const body = draft.body.trim();
    if (body) record.body = body;
  }
  if (draft.tags.length > 0) record.tags = [...draft.tags];
  if (kind !== 'photo' && draft.tint !== undefined) record.tint = draft.tint;
  if (draft.photo) record.photo = { file: photoFileName(id, PHOTO_EXT), width: draft.photo.width, height: draft.photo.height };
  return record;
}

/** 기록을 입력 화면에 채울 내용으로 되돌린다 */
export function draftFromRecord(record: NoteRecord): NoteDraft {
  return {
    time: record.time,
    title: record.title ?? '',
    body: record.body ?? '',
    checklist: record.checklist?.map((item) => ({ ...item })),
    tags: record.tags ?? [],
    tint: record.tint,
    photo: record.photo ? { width: record.photo.width, height: record.photo.height } : undefined,
  };
}

/** 지움 표시를 남긴 기록. 글과 사진 정보는 비우고 번호·시각만 남겨 다른 기기에 지움을 퍼뜨린다 */
export function deletedRecord(record: NoteRecord, now: number): NoteRecord {
  return { v: 1, id: record.id, time: record.time, modified: now, kind: record.kind, deleted: true };
}

/** 검색이 보는 노트 필드 */
export interface SearchableNote {
  title?: string;
  body?: string;
  tags?: readonly string[];
}

const fold = (s: string) => s.normalize('NFC').toLowerCase();

/** 검색어를 낱말로 나눈다. `#`으로 시작하는 낱말은 태그만 찾는다 */
export function parseQuery(query: string): { words: string[]; tags: string[] } {
  const words: string[] = [];
  const tags: string[] = [];
  for (const raw of fold(query).split(/\s+/)) {
    if (!raw) continue;
    if (raw.startsWith('#')) {
      const tag = raw.replace(/^#+/, '');
      if (tag) tags.push(tag);
    } else words.push(raw);
  }
  return { words, tags };
}

/**
 * 검색어에 맞는 노트 번호(들어온 순서대로). 낱말마다 제목·본문·태그 어딘가에 들어 있어야 하고,
 * `#태그` 낱말은 그 글자를 품은 태그가 있어야 한다. 대소문자는 가리지 않는다. 빈 검색어는 아무것도 찾지 않는다
 */
export function searchNotes(notes: readonly SearchableNote[], query: string): number[] {
  const { words, tags } = parseQuery(query);
  if (words.length === 0 && tags.length === 0) return [];
  const out: number[] = [];
  notes.forEach((note, i) => {
    const noteTags = (note.tags ?? []).map(fold);
    const text = [note.title ?? '', note.body ?? '', ...noteTags].map(fold).join('\n');
    if (words.every((w) => text.includes(w)) && tags.every((t) => noteTags.some((nt) => nt.includes(t)))) out.push(i);
  });
  return out;
}
