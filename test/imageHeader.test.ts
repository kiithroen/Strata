import { describe, expect, it } from 'vitest';
import { parseExifDate, readImageInfo } from '../src/dev/imageHeader';

interface JpegOptions {
  width: number;
  height: number;
  orientation?: number;
  dateTime?: string;
  original?: string;
  little?: boolean;
}

/** 테스트용 JPEG 앞부분: EXIF(방향·파일 시각·원본 촬영 시각)와 SOF0 */
function jpeg(opts: JpegOptions): Uint8Array {
  const little = opts.little ?? true;
  const u16 = (n: number) => (little ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) =>
    little ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const ifd0Count = (opts.orientation ? 1 : 0) + (opts.dateTime ? 1 : 0) + (opts.original ? 1 : 0);
  const exifAt = 8 + 2 + ifd0Count * 12 + 4;
  let dataAt = exifAt + (opts.original ? 2 + 12 + 4 : 0);
  const texts: string[] = [];
  const dateEntry = (tag: number, text: string) => {
    const at = dataAt;
    dataAt += 20;
    texts.push(text);
    return [...u16(tag), ...u16(2), ...u32(20), ...u32(at)];
  };
  const ifd0: number[][] = [];
  const exif: number[][] = [];
  if (opts.orientation) ifd0.push([...u16(0x0112), ...u16(3), ...u32(1), ...u16(opts.orientation), 0, 0]);
  if (opts.dateTime) ifd0.push(dateEntry(0x0132, opts.dateTime));
  if (opts.original) {
    ifd0.push([...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifAt)]);
    exif.push(dateEntry(0x9003, opts.original));
  }
  const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8)];
  tiff.push(...u16(ifd0.length), ...ifd0.flat(), ...u32(0));
  if (exif.length) tiff.push(...u16(exif.length), ...exif.flat(), ...u32(0));
  for (const t of texts) tiff.push(...[...t].map((ch) => ch.charCodeAt(0)), 0);
  const app1Body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const app1Len = app1Body.length + 2;
  const app1 = [0xff, 0xe1, app1Len >> 8, app1Len & 255, ...app1Body];
  const sof = [0xff, 0xc0, 0, 17, 8, opts.height >> 8, opts.height & 255, opts.width >> 8, opts.width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app1, ...sof, 0xff, 0xda]);
}

describe('readImageInfo', () => {
  it('JPEG 의 크기와 원본 촬영 시각을 현지 시각으로 읽는다', () => {
    const info = readImageInfo(jpeg({ width: 4000, height: 3000, original: '2025:08:03 14:05:09', dateTime: '2025:09:01 00:00:00' }));
    expect(info).toEqual({ width: 4000, height: 3000, orientation: 1, takenAt: new Date(2025, 7, 3, 14, 5, 9).getTime() });
  });

  it('원본 촬영 시각이 없으면 파일 시각을 쓰고, 빅 엔디언도 읽는다', () => {
    const info = readImageInfo(jpeg({ width: 640, height: 480, dateTime: '2024:12:31 23:59:58', little: false }));
    expect(info?.takenAt).toBe(new Date(2024, 11, 31, 23, 59, 58).getTime());
  });

  it('방향 5~8 이면 가로·세로를 바꾼다', () => {
    expect(readImageInfo(jpeg({ width: 4000, height: 3000, orientation: 6 }))).toMatchObject({ width: 3000, height: 4000, orientation: 6 });
    expect(readImageInfo(jpeg({ width: 4000, height: 3000, orientation: 3 }))).toMatchObject({ width: 4000, height: 3000 });
  });

  it('EXIF 가 없는 JPEG 와 PNG 의 크기를 읽는다', () => {
    const plain = new Uint8Array([0xff, 0xd8, 0xff, 0xc2, 0, 17, 8, 0, 100, 0, 200, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    expect(readImageInfo(plain)).toEqual({ width: 200, height: 100, orientation: 1, takenAt: undefined });
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 1280);
    new DataView(png.buffer).setUint32(20, 720);
    expect(readImageInfo(png)).toEqual({ width: 1280, height: 720, orientation: 1 });
  });

  it('형식이 다르거나 크기 표지 전에 잘리면 null 이다', () => {
    expect(readImageInfo(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    const cut = jpeg({ width: 10, height: 10 });
    expect(readImageInfo(cut.slice(0, cut.length - 21))).toBeNull();
  });

  it('세그먼트 길이가 2보다 작은 손상된 JPEG 나 잘못된 EXIF 헤더에도 멈추지 않는다', () => {
    const zeroLen = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xc0]);
    expect(readImageInfo(zeroLen)).toBeNull();
    const badExif = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe1, 0, 16, 0x45, 0x78, 0x69, 0x66, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0xff, 0xc0, 0, 17, 8, 0, 100, 0, 200, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    ]);
    expect(readImageInfo(badExif)).toEqual({ width: 200, height: 100, orientation: 1, takenAt: undefined });
  });
});

describe('parseExifDate', () => {
  it('비어 있거나 형식이 다른 날짜는 버린다', () => {
    expect(parseExifDate('0000:00:00 00:00:00')).toBeUndefined();
    expect(parseExifDate('2025-08-03 14:05:09')).toBeUndefined();
  });
});
