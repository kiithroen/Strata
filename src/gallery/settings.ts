import { type QualityValues, sanitizeQuality } from '../core/quality';

/** 기기마다 따로 남는 앱 설정. 품질은 기본값과 다른 항목만 저장한다 */
export interface AppSettings {
  perf: boolean;
  quality: Partial<QualityValues>;
}

const KEY = 'strata.settings';

/** 저장소를 못 쓰거나(사생활 보호 창 등) 값이 깨져 있으면 기본 설정을 낸다 */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { perf: false, quality: {} };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return { perf: parsed.perf === true, quality: sanitizeQuality(parsed.quality) };
  } catch {
    return { perf: false, quality: {} };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 저장하지 못하면 이번 실행에만 적용된다
  }
}
