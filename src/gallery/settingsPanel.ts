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
import type { BackupControls } from '../album/nativeNoteStore';
import type { SummaryStatus } from '../album/summaries';
import type { PhotoStyle } from '../widgets/noteCard/cardMaterial';
import { type AppSettings, saveSettings } from './settings';

/** 설정 화면이 다루는 AI 요약 동작 */
export interface SummaryControls {
  /** 키를 바꾼 뒤 요약을 다시 시작한다(빈 키면 개발 서버 프록시로, 그것도 없으면 멈춘다) */
  restart(apiKey: string): void;
  /** 이 키로 요약을 어디로 보내는지 */
  route(apiKey: string): 'key' | 'dev' | null;
  status(): SummaryStatus | null;
  /** 상태가 바뀔 때 부를 함수를 건다. null 이면 뗀다 */
  listen(listener: ((status: SummaryStatus | null) => void) | null): void;
  runNow(): void;
}

function summaryStatusText(status: SummaryStatus | null, route: 'key' | 'dev' | null): string {
  if (!status) return 'Gemini API 키를 넣으면 긴 메모·문서를 요약하고 태그를 붙인다. 요약은 카드가 멀 때 본문 대신 보인다. 키는 이 기기 브라우저에만 저장한다.';
  const parts = [status.running ? '요약하는 중' : `요약 대기 ${status.pending}`, `이번 실행에 만든 요약 ${status.done}`];
  if (route === 'dev') parts.unshift('개발 서버의 GEMINI_API_KEY 로 요약한다');
  if (status.error) parts.push(`마지막 오류: ${status.error}`);
  return parts.join(' · ');
}

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
  /** 요약 상태 글. 상태가 바뀔 때 이 글만 고친다(입력 칸이 다시 그려지지 않게) */
  private summaryNote: HTMLParagraphElement | null = null;
  /** 노트 백업 줄 갱신 함수. 상태가 바뀔 때 백업 줄만 고친다 */
  private syncBackupRow: (() => void) | null = null;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !this.isVisible()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.close();
  };
  /** 바깥을 눌러 닫았을 때 뒤따르는 click 을 아래 단추·링크에 넘기지 않는다. 다음 누름이나 키 입력에서 풀린다 */
  private swallowClick = false;
  private readonly onOutsideDown = (e: PointerEvent) => {
    this.swallowClick = false;
    if (!this.isVisible()) return;
    if (e.target instanceof Node && !this.panel.contains(e.target) && !this.button.contains(e.target)) {
      e.stopPropagation();
      this.swallowClick = true;
      this.close();
    }
  };
  private readonly onOutsideClick = (e: MouseEvent) => {
    if (!this.swallowClick) return;
    this.swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  };
  private readonly onAnyKeyDown = () => {
    this.swallowClick = false;
  };

  constructor(
    private readonly settings: AppSettings,
    /** 지금 적용된 품질 값 */
    private readonly current: QualityValues,
    private readonly onPerfChange: (on: boolean) => void,
    /** 사진 표현을 바꿀 때 바로 부른다 */
    private readonly onPhotoStyleChange: (style: PhotoStyle) => void,
    private readonly onImport: (files: File[], progress: (text: string) => void) => Promise<string>,
    private readonly summary: SummaryControls,
    /** 안드로이드 앱의 노트 백업. 없으면(브라우저) 줄을 띄우지 않는다 */
    private readonly backup: () => BackupControls | null = () => null,
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
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('pointerdown', this.onOutsideDown, true);
    window.addEventListener('click', this.onOutsideClick, true);
    window.addEventListener('keydown', this.onAnyKeyDown, true);
    summary.listen((status) => {
      if (this.summaryNote) this.summaryNote.textContent = summaryStatusText(status, this.summary.route(this.settings.geminiKey));
    });
  }

  private isVisible(): boolean {
    const c = document.body.classList;
    return !this.panel.hidden && !c.contains('card-view-open') && !c.contains('note-viewer-open') && !c.contains('note-editor-open') && !c.contains('viewer-open');
  }

  /** 설정 화면이 맨 위에 열려 있으면 닫고 true 를 돌려준다 */
  closeIfVisible(): boolean {
    if (!this.isVisible()) return false;
    this.close();
    return true;
  }

  open(): void {
    this.draft = { ...this.current };
    this.panel.hidden = false;
    this.button.classList.add('active');
    this.backup()?.listen(() => {
      if (!this.panel.hidden) this.syncBackupRow?.();
    });
    this.render();
  }

  close(): void {
    this.panel.hidden = true;
    this.button.classList.remove('active');
    this.backup()?.listen(null);
    this.syncBackupRow = null;
  }

  dispose(): void {
    this.summary.listen(null);
    this.backup()?.listen(null);
    this.syncBackupRow = null;
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('pointerdown', this.onOutsideDown, true);
    window.removeEventListener('click', this.onOutsideClick, true);
    window.removeEventListener('keydown', this.onAnyKeyDown, true);
    this.button.remove();
    this.panel.remove();
  }

  private render(): void {
    const p = this.panel;
    this.syncBackupRow = null;
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

    this.renderBackup(p);
    this.renderSummary(p);

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

  /** 노트 백업(앱 밖 폴더): 상태 글과, 권한이 없으면 권한 설정 단추 */
  private renderBackup(p: HTMLElement): void {
    const backup = this.backup();
    if (!backup) return;
    const rowEl = row('노트 백업', []);
    const noteEl = el('p', 'settings-note', '');
    const syncRow = () => {
      const group = rowEl.querySelector('.settings-choices')!;
      if (backup.needsAccess()) {
        let btn = group.querySelector('button');
        if (!btn) {
          btn = choice('권한 설정', false, () => {
            void backup.requestAccess().then(syncRow);
          });
          group.replaceChildren(btn);
        }
        btn.disabled = backup.busy();
      } else {
        group.replaceChildren();
      }
      noteEl.textContent = backup.text();
    };
    syncRow();
    this.syncBackupRow = syncRow;
    p.append(rowEl, noteEl);
  }

  /** AI 요약: 키가 있으면 지금 요약과 키 지우기, 없으면 입력 칸과 저장(개발 서버 프록시가 있으면 지금 요약도) */
  private renderSummary(p: HTMLElement): void {
    const route = this.summary.route(this.settings.geminiKey);
    if (this.settings.geminiKey) {
      p.append(
        row('AI 요약', [
          choice('지금 요약', false, () => this.summary.runNow()),
          choice('키 지우기', false, () => this.setSummaryKey('')),
        ]),
      );
    } else {
      const input = el('input', 'settings-input');
      input.type = 'password';
      input.placeholder = 'Gemini API 키';
      input.autocomplete = 'off';
      input.spellcheck = false;
      const save = choice('저장', false, () => this.setSummaryKey(input.value.trim()));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save.click();
        e.stopPropagation();
      });
      const items = route === 'dev' ? [choice('지금 요약', false, () => this.summary.runNow()), input, save] : [input, save];
      p.append(row('AI 요약', items));
    }
    this.summaryNote = el('p', 'settings-note', summaryStatusText(this.summary.status(), route));
    p.append(this.summaryNote);
  }

  private setSummaryKey(key: string): void {
    if (this.settings.geminiKey === key) return;
    this.settings.geminiKey = key;
    saveSettings(this.settings);
    this.summary.restart(key);
    this.render();
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
