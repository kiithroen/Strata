import type { FileEntry, FileKind } from './fileSource';

const IMAGE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'svg', 'ico']);
const VIDEO = new Set(['mp4', 'm4v', 'webm', 'mov', 'mkv', 'ogv']);
const AUDIO = new Set(['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'oga', 'opus', 'weba']);
const TEXT = new Set([
  'txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h',
  'cpp', 'hpp', 'cs', 'sh', 'bat', 'ps1', 'sql', 'srt', 'vtt', 'gitignore',
]);

/** 확장자(점 없이, 소문자). 없으면 '' */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 && !name.startsWith('.') ? '' : name.slice(dot + 1).toLowerCase();
}

/** 파일 이름(과 알면 MIME 형식)으로 종류를 고른다. 확장자가 우선이고, 모르는 확장자는 MIME 앞부분을 본다 */
export function kindOf(name: string, mime = ''): FileKind {
  const ext = extensionOf(name);
  if (IMAGE.has(ext)) return 'image';
  if (VIDEO.has(ext)) return 'video';
  if (AUDIO.has(ext)) return 'audio';
  if (TEXT.has(ext)) return 'text';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('text/')) return 'text';
  return 'other';
}

/** 뷰어로 여는 종류 */
export function isViewable(kind: FileKind): boolean {
  return kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'text';
}

/** 탐색기에 보이는 항목: 폴더와 뷰어로 여는 파일. 나머지는 숨기고 그 수를 낸다 */
export function visibleEntries(entries: readonly FileEntry[]): { shown: FileEntry[]; hidden: number } {
  const shown = entries.filter((e) => e.kind === 'folder' || isViewable(e.kind));
  return { shown, hidden: entries.length - shown.length };
}

export function joinPath(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`;
}

/** 위 폴더 경로. 원본 폴더('')의 위는 없어 null 이다 */
export function parentPath(path: string): string | null {
  if (path === '') return null;
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

/** 경로 막대 조각: 원본 폴더부터 지금 폴더까지 이름과 경로 */
export function breadcrumbs(rootName: string, path: string): { name: string; path: string }[] {
  const out = [{ name: rootName, path: '' }];
  if (path === '') return out;
  let acc = '';
  for (const part of path.split('/')) {
    acc = joinPath(acc, part);
    out.push({ name: part, path: acc });
  }
  return out;
}

export type SortKey = 'name' | 'modified' | 'size';
export type SortDir = 'asc' | 'desc';

export function defaultSortDir(key: SortKey): SortDir {
  return key === 'name' ? 'asc' : 'desc';
}

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/**
 * 폴더를 먼저, 그다음 파일을 key·dir 순으로 늘어놓는다. 이름은 숫자를 값으로 비교한다(IMG_2 < IMG_10).
 * 수정 시각·크기 순에서 값이 같으면 이름 오름차순이다. 원본 배열은 바꾸지 않는다
 */
export function sortEntries(entries: readonly FileEntry[], key: SortKey = 'name', dir: SortDir = defaultSortDir(key)): FileEntry[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    const folder = Number(b.kind === 'folder') - Number(a.kind === 'folder');
    if (folder !== 0) return folder;
    if (key === 'modified' && a.modified !== b.modified) return (a.modified - b.modified) * sign;
    if (key === 'size' && a.size !== b.size) return (a.size - b.size) * sign;
    if (key === 'name') return collator.compare(a.name, b.name) * sign;
    return collator.compare(a.name, b.name);
  });
}

/** 이름에 query 의 띄어쓰기 낱말이 모두 들어 있는 항목만 남긴다(대소문자 무시). 비었으면 원본 복사본을 낸다 */
export function filterEntries(entries: readonly FileEntry[], query: string): FileEntry[] {
  const tokens = query.normalize('NFC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...entries];
  return entries.filter((e) => {
    const name = e.name.normalize('NFC').toLowerCase();
    return tokens.every((t) => name.includes(t));
  });
}

/** 바이트 수를 사람이 읽는 크기로 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/**
 * 텍스트 파일을 앞에서부터 조각으로 이어 읽는 디코더. 첫 조각에 BOM 이 있으면 그 인코딩, 없으면 UTF-8 로 읽고,
 * 깨진 바이트가 나왔을 때 그때까지 읽은 바이트가 모두 ASCII 면 한국어 윈도우 기본 인코딩(EUC-KR)으로 바꿔 그 조각부터 다시 읽는다.
 * 이미 UTF-8 글자를 읽은 뒤 깨지면 UTF-8 로 계속 읽고 깨진 바이트만 대체 글자로 둔다. 조각 경계에 걸친 글자는 다음 조각과 이어 읽는다
 */
export class TextChunkDecoder {
  private decoder: TextDecoder | null = null;
  private ascii = true;
  encoding = 'utf-8';

  /** 다음 조각을 글로 바꾼다. last 면 마지막 조각이라 남은 바이트를 마저 내보낸다 */
  push(bytes: Uint8Array, last: boolean): string {
    let body = bytes;
    if (!this.decoder) {
      const bom: [number[], string][] = [
        [[0xef, 0xbb, 0xbf], 'utf-8'],
        [[0xff, 0xfe], 'utf-16le'],
        [[0xfe, 0xff], 'utf-16be'],
      ];
      const hit = bom.find(([mark]) => mark.every((b, i) => bytes[i] === b));
      if (hit) {
        this.encoding = hit[1];
        this.ascii = false;
        this.decoder = new TextDecoder(hit[1]);
        body = bytes.subarray(hit[0].length);
      } else this.decoder = new TextDecoder('utf-8', { fatal: true });
    }
    let text: string;
    try {
      text = this.decoder.decode(body, { stream: !last });
    } catch {
      this.encoding = this.ascii ? 'euc-kr' : 'utf-8';
      this.decoder = new TextDecoder(this.encoding);
      text = this.decoder.decode(body, { stream: !last });
    }
    if (this.ascii) this.ascii = body.every((b) => b < 0x80);
    return text;
  }
}

/**
 * 텍스트 파일 바이트를 글로 바꾼다(TextChunkDecoder 의 한 조각). truncated 면 앞부분만 읽은 것이라 끝에서 잘린 글자는 버린다
 */
export function decodeText(bytes: Uint8Array, truncated = false): { text: string; encoding: string } {
  const d = new TextChunkDecoder();
  const text = d.push(bytes, !truncated);
  return { text, encoding: d.encoding };
}
