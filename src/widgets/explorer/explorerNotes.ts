import { tuning } from '../../config';
import { TaskQueue } from '../../core/taskQueue';
import { photoQueue, readPhoto } from '../../dev/localNotes';
import type { NoteData } from '../../dev/noteData';
import type { NoteKind } from '../noteCard/cardLayout';
import type { PhotoSource } from '../noteCard/cardTexture';
import { decodeText, formatSize, isViewable, joinPath } from './explorerModel';
import type { FileEntry, FileSource } from './fileSource';
import { videoFrame, videoSize } from './videoFrames';

export interface FolderNotes {
  data: NoteData;
  /** 카드로 만든 파일 수와 상한에 걸려 남긴 파일이 있는지 */
  files: number;
  truncated: boolean;
}

interface Entry {
  time: number;
  kind: NoteKind;
  title: string;
  body?: string;
  photo?: PhotoSource;
  folder: string;
}

/** 동영상 파일을 카드 사진 원본으로 만든다. 그림은 카드가 그릴 때 photoQueue 로 장면 하나를 뽑는다 */
async function readVideo(file: File): Promise<PhotoSource> {
  const size = (await videoSize(file)) ?? { width: 16, height: 9 };
  return { ...size, render: (targetWidth, urgent) => photoQueue.run(() => videoFrame(file, targetWidth), urgent) };
}

async function readEntry(source: FileSource, e: FileEntry, folder: string): Promise<Entry | null> {
  const file = await source.file(e.path);
  const title = e.name;
  const time = file.lastModified || e.modified;
  if (e.kind === 'image') {
    const { photo, takenAt } = await readPhoto(file);
    return { time: takenAt ?? time, kind: 'photo', title, photo, folder };
  }
  if (e.kind === 'video') return { time, kind: 'photo', title, photo: await readVideo(file), folder };
  if (e.kind === 'audio') return { time, kind: 'memo', title, body: `음악 · ${formatSize(file.size)}`, folder };
  if (e.kind === 'text') {
    const max = tuning.explorer.cardTextBytes;
    const bytes = new Uint8Array(await file.slice(0, max).arrayBuffer());
    return { time, kind: 'doc', title, body: decodeText(bytes, file.size > max).text, folder };
  }
  return null;
}

/**
 * 탐색기 폴더(dir)와 그 하위 폴더의 열 수 있는 파일을 은하에 띄울 노트로 만든다. 가까운 폴더부터 훑고(너비 우선)
 * 파일이 explorer.cosmosMaxFiles 개가 되면 멈춘다. 사진·동영상은 사진 카드, 음악은 메모 카드, 텍스트는 앞부분을 담은 문서 카드다.
 * 노트 시각은 사진의 EXIF 촬영 시각, 없으면 파일 수정 시각이고, 노트마다 dir 기준 폴더 경로를 붙여 폴더 축으로 볼 수 있게 한다.
 */
export async function folderNotes(
  source: FileSource,
  dir: string,
  onProgress?: (done: number, total: number) => void,
): Promise<FolderNotes> {
  const max = tuning.explorer.cosmosMaxFiles;
  const files: { entry: FileEntry; folder: string }[] = [];
  const queue: { path: string; rel: string }[] = [{ path: dir, rel: '' }];
  let truncated = false;
  while (queue.length > 0 && !truncated) {
    const { path, rel } = queue.shift()!;
    let list: FileEntry[];
    try {
      list = await source.list(path);
    } catch {
      continue;
    }
    for (const e of list) {
      if (e.kind === 'folder') queue.push({ path: e.path, rel: joinPath(rel, e.name) });
      else if (isViewable(e.kind)) {
        if (files.length >= max) {
          truncated = true;
          break;
        }
        files.push({ entry: e, folder: rel });
      }
    }
  }

  // 파일 앞부분 읽기는 몇 개씩 겹쳐 돌린다
  const reads = new TaskQueue(tuning.explorer.readConcurrency);
  let done = 0;
  const entries: Entry[] = [];
  await Promise.all(
    files.map(({ entry, folder }) =>
      reads
        .run(() => readEntry(source, entry, folder))
        .catch(() => null)
        .then((r) => {
          if (r) entries.push(r);
          onProgress?.(++done, files.length);
        }),
    ),
  );
  entries.sort((a, b) => b.time - a.time || (a.title < b.title ? -1 : 1));
  const n = entries.length;
  const rootName = dir === '' ? source.name : dir.slice(dir.lastIndexOf('/') + 1);
  return {
    data: {
      notes: entries.map((e, i) => ({ id: String(n - i).padStart(4, '0'), time: e.time, kind: e.kind, title: e.title, body: e.body })),
      photos: entries.map((e) => e.photo),
      folders: { paths: entries.map((e) => e.folder), rootName },
    },
    files: n,
    truncated,
  };
}
