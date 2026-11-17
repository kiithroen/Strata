import { tuning } from '../config';

/**
 * 설정 화면에서 고르는 품질 값. 실기기에서 무거운 부분을 하나씩 끄고 줄여 보려고 둔다.
 * - pr: 렌더러 픽셀 비율 상한(render.maxPixelRatio)
 * - aa: MSAA(render.antialias)
 * - bloom: 블룸 후처리(render.bloom)
 * - dust, stars: 먼지·별 개수(cosmos.dust.count, cosmos.stars.count)
 * - nebula: 'off' 면 성운을 끄고, 0 이면 매 프레임 계산, 양수면 그 크기 큐브맵에 굽는다(cosmos.nebula)
 * - tex: 떠 있는 카드 텍스처 폭(card.textureWidth)
 */
export interface QualityValues {
  pr: number;
  aa: boolean;
  bloom: boolean;
  dust: number;
  stars: number;
  nebula: number | 'off';
  tex: number;
}

export type QualityKey = keyof QualityValues;
export type QualityPreset = keyof typeof tuning.quality.presets;

export const qualityKeys: readonly QualityKey[] = ['pr', 'aa', 'bloom', 'dust', 'stars', 'nebula', 'tex'];
export const qualityPresets = Object.keys(tuning.quality.presets) as QualityPreset[];

/** target 의 지금 품질 값을 읽는다 */
export function readQuality(target: typeof tuning = tuning): QualityValues {
  const n = target.cosmos.nebula;
  return {
    pr: target.render.maxPixelRatio,
    aa: target.render.antialias,
    bloom: target.render.bloom,
    dust: target.cosmos.dust.count,
    stars: target.cosmos.stars.count,
    nebula: n.visible ? n.bakeSize : 'off',
    tex: target.card.textureWidth,
  };
}

/** 덮어쓰기 전 config 기본값. applyQuality 가 tuning 을 바꾸기 전, 모듈을 읽을 때 떠 둔다 */
export const qualityDefaults: QualityValues = readQuality();

/** 저장소 등 믿을 수 없는 값에서 읽을 수 있는 키만 골라낸다 */
export function sanitizeQuality(raw: unknown): Partial<QualityValues> {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<QualityValues> = {};
  const pr = num(r.pr);
  if (pr !== undefined && pr > 0) out.pr = pr;
  if (typeof r.aa === 'boolean') out.aa = r.aa;
  if (typeof r.bloom === 'boolean') out.bloom = r.bloom;
  const dust = int(r.dust);
  if (dust !== undefined && dust >= 0) out.dust = dust;
  const stars = int(r.stars);
  if (stars !== undefined && stars >= 0) out.stars = stars;
  if (r.nebula === 'off') out.nebula = 'off';
  else {
    const n = int(r.nebula);
    if (n !== undefined && n >= 0) out.nebula = n;
  }
  const tex = int(r.tex);
  if (tex !== undefined && tex >= 1) out.tex = tex;
  return out;
}

/** 프리셋의 전체 값. 프리셋에 빠진 키는 기본값이다 */
export function presetValues(name: QualityPreset): QualityValues {
  return { ...qualityDefaults, ...sanitizeQuality(tuning.quality.presets[name]) };
}

/** 값이 어느 프리셋과 똑같은지. 아무것도 아니면 null(직접 고른 값) */
export function matchPreset(values: QualityValues): QualityPreset | null {
  return qualityPresets.find((name) => sameQuality(presetValues(name), values)) ?? null;
}

export function sameQuality(a: QualityValues, b: QualityValues): boolean {
  return qualityKeys.every((k) => a[k] === b[k]);
}

/** 저장할 값: 기본값과 다른 키만 남긴다. config 기본값이 바뀌면 고르지 않은 항목은 새 기본값을 따른다 */
export function qualityDiff(values: QualityValues, base: QualityValues = qualityDefaults): Partial<QualityValues> {
  const out: Partial<QualityValues> = {};
  for (const k of qualityKeys) if (values[k] !== base[k]) Object.assign(out, { [k]: values[k] });
  return out;
}

/** 설정 화면이 보여 줄 값 목록. aa·bloom 은 켜고 끄기뿐이다 */
export function qualityOptions(key: QualityKey): readonly (number | boolean | 'off')[] {
  if (key === 'aa' || key === 'bloom') return [false, true];
  return tuning.quality.options[key];
}

/**
 * 고른 값을 튜닝 값에 적용한다. 위젯이 tuning 을 읽기 전, 시작할 때 한 번만 부른다.
 * 테스트는 target 에 사본을 넘긴다.
 */
export function applyQuality(o: Partial<QualityValues>, target: typeof tuning = tuning): void {
  if (o.pr !== undefined) set(target.render, 'maxPixelRatio', o.pr);
  if (o.aa !== undefined) set(target.render, 'antialias', o.aa);
  if (o.bloom !== undefined) set(target.render, 'bloom', o.bloom);
  if (o.dust !== undefined) set(target.cosmos.dust, 'count', o.dust);
  if (o.stars !== undefined) set(target.cosmos.stars, 'count', o.stars);
  if (o.nebula === 'off') set(target.cosmos.nebula, 'visible', false);
  else if (o.nebula !== undefined) {
    set(target.cosmos.nebula, 'visible', true);
    set(target.cosmos.nebula, 'bakeSize', o.nebula);
  }
  if (o.tex !== undefined) set(target.card, 'textureWidth', o.tex);
}

function set(obj: object, key: string, value: unknown): void {
  (obj as Record<string, unknown>)[key] = value;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function int(v: unknown): number | undefined {
  const n = num(v);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
}
