import { type QualityValues, sanitizeQuality } from '../core/quality';
import { PHOTO_STYLES, type PhotoStyle } from '../widgets/noteCard/cardMaterial';

/** 기기마다 따로 남는 앱 설정. 품질은 기본값과 다른 항목만 저장한다 */
export interface AppSettings {
  perf: boolean;
  /** 사진 카드의 사진 칸을 그리는 방식. 기본은 홀로그램 선 */
  photoStyle: PhotoStyle;
  quality: Partial<QualityValues>;
}

const KEY = 'strata.settings';

/** 저장소를 못 쓰거나(사생활 보호 창 등) 값이 깨져 있으면 기본 설정을 낸다 */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { perf: false, photoStyle: 'lines', quality: {} };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return { perf: parsed.perf === true, photoStyle: readPhotoStyle(parsed), quality: sanitizeQuality(parsed.quality) };
  } catch {
    return { perf: false, photoStyle: 'lines', quality: {} };
  }
}

/** 저장된 사진 표현. 예전 켜고 끄기 값(photoFx: false)은 원래 사진으로 읽는다 */
function readPhotoStyle(parsed: Record<string, unknown>): PhotoStyle {
  const s = parsed.photoStyle;
  if (typeof s === 'string' && (PHOTO_STYLES as readonly string[]).includes(s)) return s as PhotoStyle;
  return parsed.photoFx === false ? 'off' : 'lines';
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 저장하지 못하면 이번 실행에만 적용된다
  }
}
