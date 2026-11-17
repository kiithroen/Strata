import {
  matchPreset,
  presetValues,
  type QualityKey,
  type QualityPreset,
  type QualityValues,
  qualityDiff,
  qualityKeys,
  qualityOptions,
  qualityPresets,
  sameQuality,
} from '../core/quality';
import type { PhotoStyle } from '../widgets/noteCard/cardMaterial';
import { type AppSettings, saveSettings } from './settings';

const KEY_LABEL: Record<QualityKey, string> = {
  pr: '해상도 배율',
  aa: '계단 제거',
  bloom: '블룸',
  dust: '먼지',
  stars: '별',
  nebula: '성운',
  tex: '카드 텍스처',
};

const PHOTO_STYLE_LABEL: Record<PhotoStyle, string> = { off: '원본', lines: '홀로그램', sketch: '선화' };

const PRESET_LABEL: Record<QualityPreset, string> = { low: '낮음', mid: '중간', high: '높음' };

function optionLabel(key: QualityKey, v: number | boolean | 'off'): string {
  if (v === false || v === 'off') return '끄기';
  if (v === true) return '켜기';
  if (key === 'nebula' && v === 0) return '실시간';
  if (key === 'pr') return `${v}×`;
  return String(v);
}

/**
 * 오른쪽 위 설정 버튼과 설정 화면. 성능 표시는 바로 켜고 끄고, 품질은 고른 뒤 적용하면 저장하고 다시 불러온다
 * (렌더러·텍스처·형상을 처음부터 다시 만들어야 해서). 실데이터는 고른 파일을 onImport 에 넘기고 그 결과 글을 보여 준다.
 */
export class SettingsPanel {
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private draft: QualityValues;
  /** 실데이터 불러오기 상태 글. 다시 그려도 남는다 */
  private importStatus = '';
  private importing = false;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  constructor(
    private readonly settings: AppSettings,
    /** 지금 적용된 품질 값 */
    private readonly current: QualityValues,
    private readonly onPerfChange: (on: boolean) => void,
    /** 사진 표현을 바꿀 때 바로 부른다 */
    private readonly onPhotoStyleChange: (style: PhotoStyle) => void,
    private readonly onImport: (files: File[], progress: (text: string) => void) => Promise<string>,
  ) {
    this.draft = { ...current };
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'settings-button';
    this.button.textContent = '설정';
    this.button.addEventListener('click', () => (this.panel.hidden ? this.open() : this.close()));
    document.body.appendChild(this.button);

    this.panel = document.createElement('div');
    this.panel.className = 'settings-panel';
    this.panel.hidden = true;
    document.body.appendChild(this.panel);
    window.addEventListener('keydown', this.onKey);
  }

  open(): void {
    this.draft = { ...this.current };
    this.panel.hidden = false;
    this.button.classList.add('active');
    this.render();
  }

  close(): void {
    this.panel.hidden = true;
    this.button.classList.remove('active');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.button.remove();
    this.panel.remove();
  }

  private render(): void {
    const p = this.panel;
    p.replaceChildren();

    const head = el('div', 'settings-head');
    head.append(el('span', 'settings-title', '설정'));
    const close = button('닫기', () => this.close());
    close.className = 'settings-close';
    head.append(close);
    p.append(head);

    p.append(
      row('성능 표시', [
        choice('끄기', !this.settings.perf, () => this.setPerf(false)),
        choice('켜기', this.settings.perf, () => this.setPerf(true)),
      ]),
    );

    p.append(
      row(
        '사진 표현',
        (Object.entries(PHOTO_STYLE_LABEL) as [PhotoStyle, string][]).map(([style, label]) =>
          choice(label, this.settings.photoStyle === style, () => this.setPhotoStyle(style)),
        ),
      ),
    );

    const pickFiles = choice('파일', false, () => this.pick(false));
    const pickFolder = choice('폴더', false, () => this.pick(true));
    pickFiles.disabled = pickFolder.disabled = this.importing;
    p.append(row('실데이터', [pickFiles, pickFolder]));
    p.append(
      el(
        'p',
        'settings-note',
        this.importStatus || '사진(EXIF 촬영 시각)과 구글 킵 테이크아웃 JSON 을 은하에 띄운다. 다시 불러오면 가짜 노트로 돌아간다.',
      ),
    );

    const active = matchPreset(this.draft);
    const presets = qualityPresets.map((name) =>
      choice(PRESET_LABEL[name], active === name, () => {
        this.draft = presetValues(name);
        this.render();
      }),
    );
    const custom = el('span', active === null ? 'settings-custom active' : 'settings-custom', '직접');
    p.append(row('품질', [...presets, custom], 'settings-row-preset'));

    for (const key of qualityKeys) {
      const opts = qualityOptions(key);
      const buttons = opts.map((v) =>
        choice(optionLabel(key, v), this.draft[key] === v, () => {
          this.draft = { ...this.draft, [key]: v };
          this.render();
        }),
      );
      p.append(row(KEY_LABEL[key], buttons));
    }

    const changed = !sameQuality(this.draft, this.current);
    p.append(
      el(
        'p',
        'settings-note',
        `해상도 배율은 기기 배율(${window.devicePixelRatio.toFixed(2)}×)을 넘지 않는다. 품질은 적용하면 화면을 다시 불러온다.`,
      ),
    );
    const apply = button(changed ? '적용하고 다시 불러오기' : '바뀐 품질 없음', () => this.apply());
    apply.className = 'settings-apply';
    apply.disabled = !changed;
    p.append(apply);
  }

  private pick(folder: boolean): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (folder) input.webkitdirectory = true;
    else input.accept = 'image/*,.json,application/json';
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      if (files.length > 0) void this.runImport(files);
    });
    input.click();
  }

  private async runImport(files: File[]): Promise<void> {
    this.importing = true;
    const show = (text: string) => {
      this.importStatus = text;
      if (!this.panel.hidden) this.render();
    };
    try {
      show(await this.onImport(files, show));
    } catch (e) {
      show(`불러오지 못했다: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.importing = false;
      if (!this.panel.hidden) this.render();
    }
  }

  private setPhotoStyle(style: PhotoStyle): void {
    if (this.settings.photoStyle === style) return;
    this.settings.photoStyle = style;
    saveSettings(this.settings);
    this.onPhotoStyleChange(style);
    this.render();
  }

  private setPerf(on: boolean): void {
    if (this.settings.perf === on) return;
    this.settings.perf = on;
    saveSettings(this.settings);
    this.onPerfChange(on);
    this.render();
  }

  private apply(): void {
    this.settings.quality = qualityDiff(this.draft);
    saveSettings(this.settings);
    location.reload();
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function choice(text: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const b = button(text, onClick);
  b.className = active ? 'settings-choice active' : 'settings-choice';
  b.setAttribute('aria-pressed', String(active));
  return b;
}

function row(label: string, items: HTMLElement[], extraClass = ''): HTMLElement {
  const r = el('div', extraClass ? `settings-row ${extraClass}` : 'settings-row');
  r.append(el('span', 'settings-label', label));
  const group = el('div', 'settings-choices');
  group.append(...items);
  r.append(group);
  return r;
}
