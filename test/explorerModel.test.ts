import { describe, expect, it } from 'vitest';
import { ListSource } from '../src/widgets/explorer/browserSources';
import {
  breadcrumbs,
  childOnPath,
  decodeText,
  defaultSortDir,
  extensionOf,
  filterEntries,
  formatSize,
  isViewable,
  joinPath,
  kindOf,
  parentPath,
  sortEntries,
  TextChunkDecoder,
  visibleEntries,
} from '../src/widgets/explorer/explorerModel';
import type { FileEntry } from '../src/widgets/explorer/fileSource';

const entry = (name: string, kind: FileEntry['kind'], size = 0, modified = 0): FileEntry => ({ name, path: name, kind, size, modified });

describe('파일 종류', () => {
  it('확장자로 종류를 고르고, 모르는 확장자는 MIME 앞부분을 본다', () => {
    expect(kindOf('IMG_0001.JPG')).toBe('image');
    expect(kindOf('clip.mp4')).toBe('video');
    expect(kindOf('song.flac')).toBe('audio');
    expect(kindOf('note.md')).toBe('text');
    expect(kindOf('archive.zip')).toBe('other');
    expect(kindOf('noext', 'text/plain')).toBe('text');
    expect(kindOf('weird.bin', 'image/heic')).toBe('image');
    expect(isViewable('image') && isViewable('text')).toBe(true);
    expect(isViewable('other') || isViewable('folder')).toBe(false);
  });

  it('확장자는 마지막 점 뒤 소문자이고, 점 파일은 이름 전체가 확장자다', () => {
    expect(extensionOf('a.b.TXT')).toBe('txt');
    expect(extensionOf('README')).toBe('');
    expect(extensionOf('.gitignore')).toBe('gitignore');
  });
});

describe('경로', () => {
  it('잇고, 위로 가고, 경로 막대 조각을 낸다', () => {
    expect(joinPath('', 'a')).toBe('a');
    expect(joinPath('a/b', 'c')).toBe('a/b/c');
    expect(parentPath('')).toBeNull();
    expect(parentPath('a')).toBe('');
    expect(parentPath('a/b/c')).toBe('a/b');
    expect(breadcrumbs('사진', '')).toEqual([{ name: '사진', path: '' }]);
    expect(breadcrumbs('사진', '2026/11')).toEqual([
      { name: '사진', path: '' },
      { name: '2026', path: '2026' },
      { name: '11', path: '2026/11' },
    ]);
  });

  it('상위 폴더에서 하위 경로로 향하는 직전 자식 경로를 찾는다', () => {
    expect(childOnPath('', '2026')).toBe('2026');
    expect(childOnPath('', '2026/11/seoul')).toBe('2026');
    expect(childOnPath('2026', '2026/11')).toBe('2026/11');
    expect(childOnPath('2026', '2026/11/seoul')).toBe('2026/11');
    expect(childOnPath('2026/11', '2026/11/seoul')).toBe('2026/11/seoul');
    expect(childOnPath('', '')).toBeUndefined();
    expect(childOnPath('2026', '2026')).toBeUndefined();
    expect(childOnPath('2026', '20260/11')).toBeUndefined();
    expect(childOnPath('2026/11', '2026')).toBeUndefined();
    expect(childOnPath('a', 'b/c')).toBeUndefined();
  });
});

describe('sortEntries', () => {
  it('폴더가 먼저이고 이름은 숫자를 값으로 비교한다', () => {
    // 폴더 이름(zeta)이 파일 이름보다 뒤에 오는 글자여도 폴더가 먼저다
    const out = sortEntries([entry('IMG_10.jpg', 'image'), entry('zeta', 'folder'), entry('IMG_2.jpg', 'image'), entry('Alpha', 'folder')]);
    expect(out.map((e) => e.name)).toEqual(['Alpha', 'zeta', 'IMG_2.jpg', 'IMG_10.jpg']);
  });

  it('수정 시각·크기 순은 큰 것부터이고 같으면 이름 순이다. 원본은 바꾸지 않는다', () => {
    const list = [entry('c', 'text', 5, 300), entry('a', 'text', 9, 100), entry('b', 'text', 9, 300)];
    expect(sortEntries(list, 'modified').map((e) => e.name)).toEqual(['b', 'c', 'a']);
    expect(sortEntries(list, 'size').map((e) => e.name)).toEqual(['a', 'b', 'c']);
    expect(list.map((e) => e.name)).toEqual(['c', 'a', 'b']);
  });

  it('정렬 방향(asc/desc)을 바꾸어도 폴더 우선과 동률 시 이름 오름차순을 유지한다', () => {
    const list = [
      entry('z_folder', 'folder'),
      entry('a_folder', 'folder'),
      entry('c.txt', 'text', 5, 300),
      entry('a.txt', 'text', 9, 100),
      entry('b.txt', 'text', 9, 300),
    ];
    expect(defaultSortDir('name')).toBe('asc');
    expect(defaultSortDir('modified')).toBe('desc');
    expect(sortEntries(list, 'name', 'desc').map((e) => e.name)).toEqual(['z_folder', 'a_folder', 'c.txt', 'b.txt', 'a.txt']);
    expect(sortEntries(list, 'size', 'asc').map((e) => e.name)).toEqual(['a_folder', 'z_folder', 'c.txt', 'a.txt', 'b.txt']);
    expect(sortEntries(list, 'modified', 'asc').map((e) => e.name)).toEqual(['a_folder', 'z_folder', 'a.txt', 'b.txt', 'c.txt']);
  });
});

describe('filterEntries', () => {
  const list = [entry('2026 여행', 'folder'), entry('IMG_01_Sea.jpg', 'image'), entry('sea_sunset.mp4', 'video')];

  it('빈 검색어는 전체를 돌려주고 공백으로 나눈 낱말을 모두 포함한 항목만 대소문자 없이 남긴다', () => {
    expect(filterEntries(list, '   ').map((e) => e.name)).toEqual(list.map((e) => e.name));
    expect(filterEntries(list, 'SEA').map((e) => e.name)).toEqual(['IMG_01_Sea.jpg', 'sea_sunset.mp4']);
    expect(filterEntries(list, 'sea 01').map((e) => e.name)).toEqual(['IMG_01_Sea.jpg']);
    expect(filterEntries(list, '2026').map((e) => e.name)).toEqual(['2026 여행']);
  });
});

describe('visibleEntries', () => {
  it('폴더와 뷰어로 여는 파일만 남기고 숨긴 수를 낸다', () => {
    const list = [entry('a', 'folder'), entry('b.jpg', 'image'), entry('c.zip', 'other'), entry('d.mp3', 'audio'), entry('e.exe', 'other')];
    const { shown, hidden } = visibleEntries(list);
    expect(shown.map((e) => e.name)).toEqual(['a', 'b.jpg', 'd.mp3']);
    expect(hidden).toBe(2);
    expect(kindOf('old.avi')).toBe('other');
  });

  it('showHidden 이 true 면 미지원 파일도 shown 에 포함하고 hidden 은 미지원 파일 수를 그대로 낸다', () => {
    const list = [entry('a', 'folder'), entry('b.jpg', 'image'), entry('c.zip', 'other'), entry('d.mp3', 'audio'), entry('e.exe', 'other')];
    const all = visibleEntries(list, true);
    expect(all.shown.map((e) => e.name)).toEqual(['a', 'b.jpg', 'c.zip', 'd.mp3', 'e.exe']);
    expect(all.shown).not.toBe(list);
    expect(all.hidden).toBe(2);

    const onlyUnsupported = [entry('a.zip', 'other'), entry('b.bin', 'other')];
    expect(visibleEntries(onlyUnsupported, false)).toEqual({ shown: [], hidden: 2 });
    expect(visibleEntries(onlyUnsupported, true)).toEqual({ shown: onlyUnsupported, hidden: 2 });

    const noUnsupported = [entry('a', 'folder'), entry('b.jpg', 'image')];
    expect(visibleEntries(noUnsupported, true)).toEqual({ shown: noUnsupported, hidden: 0 });
  });
});

describe('formatSize', () => {
  it('1024 단위로 줄이고 10 미만은 소수 한 자리다', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(50 * 1024 * 1024)).toBe('50 MB');
  });
});

describe('decodeText', () => {
  const utf8 = new TextEncoder().encode('안녕 hello');

  it('UTF-8 은 그대로, BOM 은 떼고 읽는다', () => {
    expect(decodeText(utf8)).toEqual({ text: '안녕 hello', encoding: 'utf-8' });
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])).text).toBe('안녕 hello');
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]))).toEqual({ text: 'Hi', encoding: 'utf-16le' });
  });

  it('UTF-8 로 깨지는 바이트는 EUC-KR 로 읽는다', () => {
    // '가' 의 EUC-KR 바이트
    expect(decodeText(new Uint8Array([0xb0, 0xa1]))).toEqual({ text: '가', encoding: 'euc-kr' });
  });

  it('앞부분만 읽어 끝 글자가 잘렸으면 그 글자만 버리고 UTF-8 로 읽는다', () => {
    const cut = utf8.subarray(0, 4); // '안' 3바이트 + '녕' 의 첫 바이트
    expect(decodeText(cut, true)).toEqual({ text: '안', encoding: 'utf-8' });
  });
});

describe('TextChunkDecoder', () => {
  /** bytes 를 size 바이트씩 잘라 이어 읽는다 */
  const readChunks = (bytes: Uint8Array, size: number) => {
    const d = new TextChunkDecoder();
    let text = '';
    for (let i = 0; i < bytes.length; i += size) text += d.push(bytes.subarray(i, i + size), i + size >= bytes.length);
    return { text, encoding: d.encoding };
  };
  const source = '가나다 abc 한글 줄\n'.repeat(20);

  it('조각 경계에 걸친 UTF-8 글자를 다음 조각과 이어 읽는다', () => {
    const bytes = new TextEncoder().encode(source);
    for (const size of [1, 2, 5, 7, 64]) expect(readChunks(bytes, size)).toEqual({ text: source, encoding: 'utf-8' });
  });

  it('앞 조각이 모두 ASCII 였다가 깨지면 EUC-KR 로 바꿔 읽는다', () => {
    // 'abc' + '가'(EUC-KR B0A1) + 'd'
    const bytes = new Uint8Array([0x61, 0x62, 0x63, 0xb0, 0xa1, 0x64]);
    expect(readChunks(bytes, 3)).toEqual({ text: 'abc가d', encoding: 'euc-kr' });
    // EUC-KR 두 바이트 글자가 조각 경계에 걸쳐도 잇는다
    expect(readChunks(bytes, 4)).toEqual({ text: 'abc가d', encoding: 'euc-kr' });
  });

  it('UTF-8 글자를 읽은 뒤 깨진 바이트는 대체 글자로 두고 UTF-8 로 계속 읽는다', () => {
    const head = new TextEncoder().encode('한');
    const bytes = new Uint8Array([...head, 0x61, 0xff, 0x62]);
    const { text, encoding } = readChunks(bytes, head.length + 1);
    expect(encoding).toBe('utf-8');
    expect(text.startsWith('한a') && text.endsWith('b') && text.includes('\ufffd')).toBe(true);
  });

  it('BOM 은 첫 조각에서만 보고 떼어 낸다', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00, 0x21, 0x00]);
    expect(readChunks(bytes, 3)).toEqual({ text: 'Hi!', encoding: 'utf-16le' });
  });
});

describe('ListSource', () => {
  const file = (rel: string, body = 'x', type = '') => {
    const f = new File([body], rel.split('/').pop() ?? rel, { type, lastModified: 1000 });
    Object.defineProperty(f, 'webkitRelativePath', { value: rel });
    return f;
  };

  it('상대 경로로 폴더 구조를 다시 세우고, 첫 조각을 원본 폴더 이름으로 쓴다', async () => {
    const src = new ListSource([file('사진/2026/a.jpg'), file('사진/2026/b.txt', 'hello'), file('사진/c.mp3')]);
    expect(src.name).toBe('사진');
    const root = sortEntries(await src.list(''));
    expect(root.map((e) => [e.name, e.kind, e.path])).toEqual([
      ['2026', 'folder', '2026'],
      ['c.mp3', 'audio', 'c.mp3'],
    ]);
    const sub = sortEntries(await src.list('2026'));
    expect(sub.map((e) => e.path)).toEqual(['2026/a.jpg', '2026/b.txt']);
    expect(sub[1].size).toBe(5);
    expect(await (await src.file('2026/b.txt')).text()).toBe('hello');
    await expect(src.list('없음')).rejects.toThrow();
  });

  it('상대 경로가 없는 파일은 원본 바로 아래에 두고 기본 이름을 쓴다', async () => {
    const src = new ListSource([new File(['1'], 'x.png')], '고른 파일');
    expect(src.name).toBe('고른 파일');
    expect((await src.list('')).map((e) => e.kind)).toEqual(['image']);
  });
});
