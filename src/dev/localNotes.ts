import { tuning } from '../config';
import { TaskQueue } from '../core/taskQueue';
import type { PhotoSource } from '../widgets/noteCard/cardTexture';
import type { NoteRef } from '../widgets/timeAxis/axisModel';
import { readImageInfo } from './imageHeader';
import { parseKeepNote } from './keepNote';
import type { NoteData } from './noteData';

/** 사진 디코딩 큐. 성능 표시가 기다리는 수를 보여 준다 */
export const photoQueue = new TaskQueue(tuning.dev.decodeConcurrency);

export interface ImportResult {
  data: NoteData;
  photos: number;
  memos: number;
  /** 읽지 못한 파일(형식을 모르거나 디코딩 실패) */
  skipped: number;
}

interface Entry {
  note: Omit<NoteRef, 'id'>;
  photo?: PhotoSource;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;

/**
 * 로컬 파일을 노트로 읽는 임시 주입. 사진은 EXIF 촬영 시각(없으면 파일 수정 시각)에 놓고,
 * 구글 킵 테이크아웃 JSON 은 메모·문서로 읽는다. 사진은 크기만 읽어 두고 그릴 때 photoQueue 로 디코딩한다.
 */
export async function importLocalNotes(files: readonly File[], onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  const entries: Entry[] = [];
  let skipped = 0;
  let done = 0;
  const step = async (file: File) => {
    const entry = await readEntry(file).catch(() => null);
    if (entry) entries.push(entry);
    else skipped++;
    onProgress?.(++done, files.length);
  };
  // 파일 앞부분 읽기는 몇 개씩 겹쳐 돌린다
  const reads = new TaskQueue(8);
  await Promise.all(files.map((file) => reads.run(() => step(file))));

  entries.sort((a, b) => b.note.time - a.note.time);
  const n = entries.length;
  const notes: NoteRef[] = entries.map((e, i) => ({ ...e.note, id: String(n - i).padStart(4, '0') }));
  const photos = entries.map((e) => e.photo);
  const photoCount = photos.filter(Boolean).length;
  return { data: { notes, photos }, photos: photoCount, memos: n - photoCount, skipped };
}

async function readEntry(file: File): Promise<Entry | null> {
  if (/\.json$/i.test(file.name) || file.type === 'application/json') {
    const keep = parseKeepNote(JSON.parse(await file.text()));
    if (!keep) return null;
    return { note: { time: keep.time, kind: keep.kind, title: keep.title, body: keep.body, checklist: keep.checklist, tags: keep.tags } };
  }
  if (!file.type.startsWith('image/') && !IMAGE_EXT.test(file.name)) return null;
  const { photo, takenAt } = await readPhoto(file);
  const title = file.name.replace(/\.[^.]+$/, '');
  return { note: { time: takenAt ?? file.lastModified, kind: 'photo', title, tags: [] }, photo };
}

/**
 * 사진 파일을 카드 사진 원본으로 읽는다. 크기와 EXIF 촬영 시각은 앞부분만 읽어 알아내고(모르는 형식은 한 번 디코딩해 잰다),
 * 그림은 카드가 그릴 때 photoQueue 로 필요한 폭만큼 디코딩한다
 */
export async function readPhoto(file: File): Promise<{ photo: PhotoSource; takenAt?: number }> {
  const head = new Uint8Array(await file.slice(0, tuning.dev.headerBytes).arrayBuffer());
  let info = readImageInfo(head);
  if (!info) {
    // 앞부분으로 크기를 모르는 형식은 한 번 디코딩해서 잰다
    const bitmap = await photoQueue.run(() => createImageBitmap(file));
    info = { width: bitmap.width, height: bitmap.height, orientation: 1 };
    bitmap.close();
  }
  const { width, height } = info;
  const photo: PhotoSource = {
    width,
    height,
    render: (targetWidth, urgent) =>
      photoQueue.run(
        () => createImageBitmap(file, { resizeWidth: Math.max(1, Math.round(targetWidth)), resizeQuality: 'medium' }),
        urgent,
      ),
  };
  return { photo, takenAt: info.takenAt };
}
