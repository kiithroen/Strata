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
  tags?: string[];
  /** 메모 포스트잇 색 번호 */
  tint?: number;
  /** 사진 파일 이름과 크기(레이아웃 비율에 미리 쓴다) */
  photo?: { file: string; width: number; height: number };
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
  if (Array.isArray(r.tags)) out.tags = r.tags.filter(isStr);
  if (isNum(r.tint)) out.tint = Math.trunc(r.tint);
  const p = r.photo as Record<string, unknown> | undefined;
  if (p && isStr(p.file) && isNum(p.width) && isNum(p.height) && p.width > 0 && p.height > 0) {
    out.photo = { file: p.file, width: p.width, height: p.height };
  }
  if (r.deleted === true) out.deleted = true;
  return out;
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

/** 은하에 띄울 노트: 지운 노트를 빼고 최근 것부터 */
export function albumNotes(records: readonly NoteRecord[]): { notes: NoteRef[]; records: NoteRecord[] } {
  const live = records.filter((r) => !r.deleted).sort((a, b) => b.time - a.time || (a.id < b.id ? -1 : 1));
  return {
    records: live,
    notes: live.map((r) => ({ id: r.id, time: r.time, kind: r.kind, title: r.title, body: r.body, tags: r.tags, tint: r.tint })),
  };
}
