import { tuning } from '../config';

/**
 * 주소로 품질을 덮어쓰는 키. 실기기에서 무거운 부분을 하나씩 끄고 줄여 보려고 둔다.
 * - pr: 렌더러 픽셀 비율 상한(render.maxPixelRatio)
 * - aa: 0 이면 MSAA 를 끈다(render.antialias)
 * - dust, stars: 먼지·별 개수(cosmos.dust.count, cosmos.stars.count)
 * - nebula: off 면 성운을 끄고, 0 이면 매 프레임 계산, 양수면 그 크기 큐브맵에 굽는다(cosmos.nebula)
 * - seg: 종이 휨 격자 칸 수(card.segments)
 * - tex: 떠 있는 카드 텍스처 폭(card.textureWidth)
 */
export interface QualityOverrides {
  pr?: number;
  aa?: boolean;
  dust?: number;
  stars?: number;
  nebula?: number | 'off';
  seg?: number;
  tex?: number;
}

export const qualityKeys = ['pr', 'aa', 'dust', 'stars', 'nebula', 'seg', 'tex'] as const;

type PresetValues = Partial<Record<(typeof qualityKeys)[number], number | string>>;

/** ?q=<프리셋> 을 먼저 깔고, 개별 키가 있으면 그 위에 덮어쓴다. 읽을 수 없는 값은 무시한다 */
export function parseQuality(
  search: string,
  presets: Readonly<Record<string, PresetValues>> = tuning.quality.presets,
): QualityOverrides {
  const params = new URLSearchParams(search);
  const raw: PresetValues = {};
  const preset = params.get('q');
  if (preset !== null && Object.hasOwn(presets, preset)) Object.assign(raw, presets[preset]);
  for (const key of qualityKeys) {
    const v = params.get(key);
    if (v !== null) raw[key] = v;
  }

  const out: QualityOverrides = {};
  const pr = positive(raw.pr);
  if (pr !== undefined) out.pr = pr;
  if (raw.aa !== undefined) {
    const s = String(raw.aa).toLowerCase();
    if (s === '0' || s === 'off' || s === 'false') out.aa = false;
    else if (s === '1' || s === 'on' || s === 'true') out.aa = true;
  }
  const dust = count(raw.dust);
  if (dust !== undefined) out.dust = dust;
  const stars = count(raw.stars);
  if (stars !== undefined) out.stars = stars;
  if (raw.nebula !== undefined) {
    if (String(raw.nebula).toLowerCase() === 'off') out.nebula = 'off';
    else {
      const n = count(raw.nebula);
      if (n !== undefined) out.nebula = n;
    }
  }
  const seg = count(raw.seg);
  if (seg !== undefined && seg >= 1) out.seg = seg;
  const tex = count(raw.tex);
  if (tex !== undefined && tex >= 1) out.tex = tex;
  return out;
}

/**
 * 덮어쓰기를 튜닝 값에 적용한다. 위젯이 tuning 을 읽기 전, 시작할 때 한 번만 부른다.
 * 테스트는 target 에 사본을 넘긴다.
 */
export function applyQuality(o: QualityOverrides, target: typeof tuning = tuning): void {
  if (o.pr !== undefined) set(target.render, 'maxPixelRatio', o.pr);
  if (o.aa !== undefined) set(target.render, 'antialias', o.aa);
  if (o.dust !== undefined) set(target.cosmos.dust, 'count', o.dust);
  if (o.stars !== undefined) set(target.cosmos.stars, 'count', o.stars);
  if (o.nebula === 'off') set(target.cosmos.nebula, 'visible', false);
  else if (o.nebula !== undefined) {
    set(target.cosmos.nebula, 'visible', true);
    set(target.cosmos.nebula, 'bakeSize', o.nebula);
  }
  if (o.seg !== undefined) set(target.card, 'segments', o.seg);
  if (o.tex !== undefined) set(target.card, 'textureWidth', o.tex);
}

function set(obj: object, key: string, value: unknown): void {
  (obj as Record<string, unknown>)[key] = value;
}

function positive(v: number | string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function count(v: number | string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}
