import { tuning } from '../../config';
import { LruCache } from '../../core/lruCache';
import type { FileEntry, FileSource } from './fileSource';

/** 만들어 둔 썸네일: 줄인 JPEG 의 객체 URL */
export interface Thumb {
  url: string;
  bytes: number;
}

/**
 * 탐색기 썸네일 캐시. 페이지가 열려 있는 동안 남아 은하에 다녀오거나 폴더를 오가도 다시 디코딩하지 않는다.
 * explorer.thumbCacheMB 를 넘으면 오래 안 본 것부터 버리고 객체 URL 을 돌려준다
 */
export const thumbCache = new LruCache<Thumb>(tuning.explorer.thumbCacheMB * 1024 * 1024, (t) => URL.revokeObjectURL(t.url));

const sourceIds = new WeakMap<FileSource, number>();
let nextSourceId = 1;

/** 원본·경로·크기·수정 시각으로 썸네일을 가린다. 파일이 바뀌면 다른 키가 된다 */
export function thumbKey(source: FileSource, entry: FileEntry): string {
  let id = sourceIds.get(source);
  if (id === undefined) {
    id = nextSourceId++;
    sourceIds.set(source, id);
  }
  return `${id}|${entry.path}|${entry.size}|${entry.modified}`;
}

/** 썸네일을 만드는 폭(기기 px): explorer.thumbPx 에 기기 픽셀 비율(최대 2배)을 곱한다 */
export function thumbWidth(): number {
  return Math.round(tuning.explorer.thumbPx * Math.min(2, window.devicePixelRatio || 1));
}

/** 그림을 그 크기 그대로 JPEG 썸네일로 굽는다 */
async function encode(image: CanvasImageSource & { width: number; height: number }): Promise<Thumb> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: tuning.explorer.thumbQuality });
  return { url: URL.createObjectURL(blob), bytes: blob.size };
}

/** 사진 파일의 썸네일을 만든다. 디코딩할 수 없으면(SVG·손상 등) 거부한다 */
export async function imageThumb(file: Blob, width: number): Promise<Thumb> {
  const bitmap = await createImageBitmap(file, { resizeWidth: width, resizeQuality: 'medium' });
  try {
    return await encode(bitmap);
  } finally {
    bitmap.close();
  }
}
