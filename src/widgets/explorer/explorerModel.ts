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

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/**
 * 폴더를 먼저, 그다음 파일을 key 순으로 늘어놓는다. 이름은 숫자를 값으로 비교한다(IMG_2 < IMG_10).
 * 수정 시각·크기는 큰 것(최근·큰 파일)부터이고, 같으면 이름 순이다. 원본 배열은 바꾸지 않는다
 */
export function sortEntries(entries: readonly FileEntry[], key: SortKey = 'name'): FileEntry[] {
  return [...entries].sort((a, b) => {
    const folder = Number(b.kind === 'folder') - Number(a.kind === 'folder');
    if (folder !== 0) return folder;
    if (key === 'modified' && a.modified !== b.modified) return b.modified - a.modified;
    if (key === 'size' && a.size !== b.size) return b.size - a.size;
    return collator.compare(a.name, b.name);
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
 * 텍스트 파일 바이트를 글로 바꾼다. BOM 이 있으면 그 인코딩, 없으면 UTF-8 로 읽고 깨진 바이트가 있으면
 * 한국어 윈도우 기본 인코딩(EUC-KR)으로 다시 읽는다. truncated 면 앞부분만 읽은 것이라 끝에서 잘린 글자는 버린다
 */
export function decodeText(bytes: Uint8Array, truncated = false): { text: string; encoding: string } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: truncated }), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('euc-kr').decode(bytes), encoding: 'euc-kr' };
  }
}
