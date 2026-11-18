import { checklistText, type ChecklistItem } from '../core/checklist';
import type { NoteKind } from '../widgets/noteCard/cardLayout';
import type { NoteRef } from '../widgets/timeAxis/axisModel';

/**
 * 구글 드라이브 `Strata/` 폴더에 노트마다 하나씩 두는 메타데이터(`note-<id>.json`). 사진은 `photo-<id>.<확장자>`로 따로 둔다.
 * 지운 노트는 파일을 지우지 않고 deleted 를 남겨 다른 기기에도 지움이 퍼지게 한다.
 */
export interface NoteRecord {
  /** 형식 판(바꾸면 읽는 쪽에서 옮겨 읽는다) */
  v: 1;
  id: string;
  /** 노트의 시각(찍거나 쓴 때, ms). 은하에서 자리를 정한다 */
  time: number;
  /** 마지막으로 고친 시각(ms). 같은 노트가 양쪽에서 바뀌면 늦은 쪽이 이긴다 */
  modified: number;
  kind: NoteKind;
  title?: string;
  body?: string;
  /** 체크리스트 항목(있으면 체크리스트 노트이고 body 는 없다) */
  checklist?: ChecklistItem[];
  tags?: string[];
  /** 메모 포스트잇 색 번호 */
  tint?: number;
  /** 사진 파일 이름과 크기(레이아웃 비율에 미리 쓴다) */
  photo?: { file: string; width: number; height: number };
  /**
   * AI 요약과 AI 가 붙인 태그. source 는 요약할 때 글의 contentKey 이고, 지금 글과 다르면 지난 요약이다.
   * 지난 요약의 글은 쓰지 않지만 태그는 새 요약이 올 때까지 그대로 쓴다
   */
  summary?: { text: string; tags?: string[]; source: string };
  deleted?: boolean;
}

const KINDS: readonly NoteKind[] = ['photo', 'memo', 'doc'];

export function noteFileName(id: string): string {
  return `note-${id}.json`;
}

export function photoFileName(id: string, ext: string): string {
  return `photo-${id}.${ext.replace(/^\./, '').toLowerCase()}`;
}

/** `note-<id>.json` 이름에서 노트 번호를 꺼낸다. 아니면 null */
export function noteIdOf(fileName: string): string | null {
  const m = /^note-(.+)\.json$/.exec(fileName);
  return m ? m[1] : null;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';

/** 드라이브에서 읽은 JSON 을 검사해 노트로 읽는다. 형식이 맞지 않으면 null(그 파일은 건너뛴다) */
export function parseNoteRecord(json: unknown): NoteRecord | null {
  if (typeof json !== 'object' || json === null) return null;
  const r = json as Record<string, unknown>;
  if (r.v !== 1 || !isStr(r.id) || r.id.length === 0 || !isNum(r.time) || !isNum(r.modified)) return null;
  if (!KINDS.includes(r.kind as NoteKind)) return null;
  const out: NoteRecord = { v: 1, id: r.id, time: r.time, modified: r.modified, kind: r.kind as NoteKind };
  if (isStr(r.title)) out.title = r.title;
  if (isStr(r.body)) out.body = r.body;
  if (Array.isArray(r.checklist)) {
    const items = r.checklist
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && isStr((x as Record<string, unknown>).text))
      .map((x) => ({ text: x.text as string, done: x.done === true }));
    if (items.length > 0) out.checklist = items;
  }
  if (Array.isArray(r.tags)) out.tags = r.tags.filter(isStr);
  if (isNum(r.tint)) out.tint = Math.trunc(r.tint);
  const p = r.photo as Record<string, unknown> | undefined;
  if (p && isStr(p.file) && isNum(p.width) && isNum(p.height) && p.width > 0 && p.height > 0) {
    out.photo = { file: p.file, width: p.width, height: p.height };
  }
  const sm = r.summary as Record<string, unknown> | undefined;
  if (sm && isStr(sm.text) && sm.text.length > 0 && isStr(sm.source)) {
    out.summary = { text: sm.text, source: sm.source };
    if (Array.isArray(sm.tags)) out.summary.tags = sm.tags.filter(isStr);
  }
  if (r.deleted === true) out.deleted = true;
  return out;
}

/** 카드·목록·검색에 쓰는 노트 글: 체크리스트 노트는 항목을 줄마다 적은 글, 아니면 본문이다 */
export function noteText(record: Pick<NoteRecord, 'body' | 'checklist'>): string | undefined {
  return record.checklist ? checklistText(record.checklist) : record.body;
}

/** AI 요약에 넘기는 글: 체크리스트 노트는 항목 글만 줄마다 적고(끝냄 표시 없이), 아니면 본문이다 */
export function summaryText(record: Pick<NoteRecord, 'body' | 'checklist'>): string | undefined {
  return record.checklist ? record.checklist.map((it) => it.text).join('\n') : record.body;
}

/**
 * 제목과 요약할 글로 낸 짧은 지문(FNV-1a 32비트, 16진수). 요약이 지금 글로 만든 것인지 가릴 때 쓴다.
 * 체크리스트 항목을 끝냄으로 바꾸는 것만으로는 바뀌지 않는다
 */
export function contentKey(record: Pick<NoteRecord, 'title' | 'body' | 'checklist'>): string {
  const text = `${record.title ?? ''}\n${summaryText(record) ?? ''}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 지금 글로 만든 요약. 없거나 지난 요약이면 undefined */
export function freshSummary(record: NoteRecord): string | undefined {
  return record.summary && record.summary.source === contentKey(record) ? record.summary.text : undefined;
}

/** 기록의 태그와 AI 태그를 합친 것(사용자 태그 먼저, 대소문자를 가리지 않고 겹치면 뺀다)과 그중 AI 태그 */
export function noteTags(record: NoteRecord): { tags: string[]; auto: string[] } {
  const tags = [...(record.tags ?? [])];
  const seen = new Set(tags.map((t) => t.toLowerCase()));
  const auto: string[] = [];
  for (const t of record.summary?.tags ?? []) {
    if (seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    tags.push(t);
    auto.push(t);
  }
  return { tags, auto };
}

/** 키 순서와 상관없이 같은 값이면 같은 글이 되는 JSON(객체 키를 정렬한다) */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 두 기록이 같은 내용인지(수정 시각 포함). 필드를 만든 순서는 보지 않는다 */
function sameRecord(a: NoteRecord, b: NoteRecord): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

export interface MergeResult {
  /** 합친 결과(지움 표시 포함). 로컬에 이것을 둔다 */
  merged: NoteRecord[];
  /** 드라이브에 올릴 것(로컬이 더 새것이거나 드라이브에 없는 것) */
  upload: NoteRecord[];
  /** 드라이브에서 받아 로컬을 바꾼 것 */
  download: NoteRecord[];
}

/**
 * 로컬과 드라이브의 노트를 합친다. 한쪽에만 있으면 그쪽 것을 쓰고, 양쪽에 있으면 수정 시각이 늦은 쪽이 이긴다.
 * 수정 시각이 같은데 내용이 다르면 드라이브 쪽을 따른다(여러 기기가 같은 결과에 닿게).
 * 지움 표시도 보통 기록처럼 수정 시각으로 겨룬다. 그래서 지운 뒤 다른 기기에서 더 늦게 고친 노트는 되살아난다.
 */
export function mergeRecords(local: readonly NoteRecord[], remote: readonly NoteRecord[]): MergeResult {
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const localById = new Map(local.map((r) => [r.id, r]));
  const merged: NoteRecord[] = [];
  const upload: NoteRecord[] = [];
  const download: NoteRecord[] = [];
  for (const l of local) {
    const r = remoteById.get(l.id);
    if (!r || l.modified > r.modified) {
      merged.push(l);
      upload.push(l);
    } else if (r.modified > l.modified || !sameRecord(l, r)) {
      merged.push(r);
      download.push(r);
    } else merged.push(l);
  }
  for (const r of remote) {
    if (localById.has(r.id)) continue;
    merged.push(r);
    download.push(r);
  }
  return { merged, upload, download };
}

/** 은하에 띄울 노트: 지운 노트를 빼고 최근 것부터. 체크리스트 노트는 항목을 줄마다 적은 글을 body 로 넘겨 카드·목록·검색이 쓴다 */
export function albumNotes(records: readonly NoteRecord[]): { notes: NoteRef[]; records: NoteRecord[] } {
  const live = records.filter((r) => !r.deleted).sort((a, b) => b.time - a.time || (a.id < b.id ? -1 : 1));
  return {
    records: live,
    notes: live.map((r) => {
      const { tags, auto } = noteTags(r);
      return {
        id: r.id,
        time: r.time,
        kind: r.kind,
        title: r.title,
        body: noteText(r),
        summary: freshSummary(r),
        checklist: r.checklist,
        tags: tags.length > 0 ? tags : undefined,
        autoTags: auto.length > 0 ? auto : undefined,
        tint: r.tint,
      };
    }),
  };
}
