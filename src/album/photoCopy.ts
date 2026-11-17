import { tuning } from '../config';
import { readImageInfo } from '../dev/imageHeader';

/** 사진 파일의 EXIF 촬영 시각(ms). 없거나 못 읽으면 undefined */
export async function readTakenAt(file: Blob): Promise<number | undefined> {
  try {
    const head = new Uint8Array(await file.slice(0, tuning.dev.headerBytes).arrayBuffer());
    return readImageInfo(head)?.takenAt;
  } catch {
    return undefined;
  }
}

/**
 * 저장할 사진 사본을 굽는다: EXIF 방향대로 돌려 긴 변을 album.photoMaxPx 이하로 줄이고 JPEG(album.photoQuality)로 만든다.
 * 돌린 결과를 굽기 때문에 사본에는 방향 정보가 필요 없고, 크기는 돌린 뒤 기준이다
 */
export async function bakePhotoCopy(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  const a = tuning.album;
  const full = await createImageBitmap(file);
  const scale = Math.min(1, a.photoMaxPx / Math.max(full.width, full.height));
  const width = Math.max(1, Math.round(full.width * scale));
  const height = Math.max(1, Math.round(full.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    full.close();
    throw new Error('사진을 그릴 수 없다');
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, width, height);
  full.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', a.photoQuality));
  if (!blob) throw new Error('사진을 저장할 수 없다');
  return { blob, width, height };
}
