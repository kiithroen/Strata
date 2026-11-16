/** 이미지 파일 앞부분에서 읽은 정보. 크기는 EXIF 방향을 적용한 뒤의 가로·세로다 */
export interface ImageInfo {
  width: number;
  height: number;
  /** EXIF 방향(1~8). 없으면 1 */
  orientation: number;
  /** EXIF 촬영 시각(현지 시각 ms). 없으면 undefined */
  takenAt?: number;
}

/**
 * JPEG·PNG 파일 앞부분 바이트에서 크기·방향·촬영 시각을 읽는다. 디코딩하지 않는다.
 * 크기를 찾지 못하면 null 이다(형식이 다르거나 앞부분이 모자라면).
 */
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: v.getUint32(16), height: v.getUint32(20), orientation: 1 };
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  return readJpeg(bytes);
}

function readJpeg(bytes: Uint8Array): ImageInfo | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let orientation = 1;
  let takenAt: number | undefined;
  let p = 2;
  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) return null;
    const marker = bytes[p + 1];
    // 채움 바이트와 길이 없는 표지
    if (marker === 0xff) {
      p++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      p += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const len = v.getUint16(p + 2);
    const body = p + 4;
    if (marker === 0xe1 && body + 6 <= bytes.length && ascii(bytes, body, 4) === 'Exif') {
      const exif = readExif(v, body + 6, Math.min(bytes.length, p + 2 + len));
      orientation = exif.orientation;
      takenAt = exif.takenAt;
    }
    // SOF0~SOF15 가운데 허프만 표(C4)·산술 부호(C8, CC)가 아닌 것
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (body + 5 > bytes.length) return null;
      const height = v.getUint16(body + 1);
      const width = v.getUint16(body + 3);
      const swap = orientation >= 5 && orientation <= 8;
      return { width: swap ? height : width, height: swap ? width : height, orientation, takenAt };
    }
    p += 2 + len;
  }
  return null;
}

const TAG_ORIENTATION = 0x0112;
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME_ORIGINAL = 0x9003;

/** TIFF 머리(start)부터 end 앞까지에서 방향과 촬영 시각을 읽는다. 원본 촬영 시각이 없으면 파일 시각을 쓴다 */
function readExif(v: DataView, start: number, end: number): { orientation: number; takenAt?: number } {
  const out: { orientation: number; takenAt?: number } = { orientation: 1 };
  if (start + 8 > end) return out;
  const little = v.getUint16(start) === 0x4949;
  const u16 = (o: number) => v.getUint16(o, little);
  const u32 = (o: number) => v.getUint32(o, little);
  let dateTime: number | undefined;
  let original: number | undefined;

  const readIfd = (offset: number, visit: (tag: number, entry: number) => void) => {
    const at = start + offset;
    if (offset <= 0 || at + 2 > end) return;
    const count = u16(at);
    for (let i = 0; i < count; i++) {
      const entry = at + 2 + i * 12;
      if (entry + 12 > end) return;
      visit(u16(entry), entry);
    }
  };
  const readDate = (entry: number) => {
    const n = u32(entry + 4);
    const o = start + u32(entry + 8);
    if (n < 19 || o + 19 > end) return undefined;
    return parseExifDate(ascii(new Uint8Array(v.buffer, v.byteOffset), o, 19));
  };

  let exifIfd = 0;
  readIfd(u32(start + 4), (tag, entry) => {
    if (tag === TAG_ORIENTATION) {
      const o = u16(entry + 8);
      if (o >= 1 && o <= 8) out.orientation = o;
    } else if (tag === TAG_DATETIME) dateTime = readDate(entry);
    else if (tag === TAG_EXIF_IFD) exifIfd = u32(entry + 8);
  });
  readIfd(exifIfd, (tag, entry) => {
    if (tag === TAG_DATETIME_ORIGINAL) original = readDate(entry);
  });
  out.takenAt = original ?? dateTime;
  return out;
}

/** "YYYY:MM:DD HH:MM:SS" 를 현지 시각 ms 로 바꾼다. 형식이 다르거나 0000 이면 undefined */
export function parseExifDate(s: string): number | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return undefined;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return new Date(y, mo - 1, d, h, mi, se).getTime();
}

function ascii(bytes: Uint8Array, at: number, n: number): string {
  let s = '';
  for (let i = 0; i < n && at + i < bytes.length; i++) s += String.fromCharCode(bytes[at + i]);
  return s;
}
