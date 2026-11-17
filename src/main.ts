import './style.css';
import { tuning } from './config';
import { applyQuality, readQuality } from './core/quality';
import { importLocalNotes, photoQueue } from './dev/localNotes';
import { appHooks } from './gallery/appHooks';
import { mountCosmosDemo } from './gallery/cosmosDemo';
import { pickDemo, widgetDemos } from './gallery/registry';
import { PerfOverlay } from './gallery/perfOverlay';
import { loadSettings } from './gallery/settings';
import { SettingsPanel } from './gallery/settingsPanel';
import { Stage, type WidgetDemo } from './gallery/stage';

declare global {
  interface Window {
    /** 개발 서버에서만 연다. 브라우저 확인 스크립트가 위젯 상태를 읽고 조작한다 */
    __strata?: {
      id: string;
      demo: WidgetDemo;
      time: () => number;
      /** 게임 시간을 seconds 만큼 고정 간격으로 진행하고 한 번 그린다. 창이 숨어 프레임이 멈춰도 확인할 수 있다 */
      advance: (seconds: number, hz?: number) => number;
      /** 설정 화면의 실데이터 불러오기와 같다. 결과 글을 돌려준다 */
      importFiles: (files: File[]) => Promise<string>;
    };
  }
}

function byId(elementId: string): HTMLElement {
  const e = document.getElementById(elementId);
  if (!e) throw new Error('index.html 구조가 맞지 않는다');
  return e;
}
const container = byId('stage');
const tabsEl = byId('widget-tabs');
const hintEl = byId('hint');

// HUD 색은 tuning.look 을 따른다
const rootStyle = document.documentElement.style;
rootStyle.setProperty('--bg', tuning.look.background);
rootStyle.setProperty('--text', tuning.look.text);
rootStyle.setProperty('--text-dim', tuning.look.textDim);
rootStyle.setProperty('--accent', tuning.look.accent);
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tuning.look.background);

// 저장된 품질 설정은 위젯이 튜닝 값을 읽기 전에 적용한다
const settings = loadSettings();
applyQuality(settings.quality);

const stage = new Stage(container);
// 위젯 데모가 부르는 앱 동작은 데모를 만들기 전에 채운다(아래 importFiles 는 함수 선언이라 여기서 쓸 수 있다)
appHooks.showInCosmos = (files) => importFiles(files);
const picked = pickDemo(location.search);
let id = picked.id;
let demo: WidgetDemo = picked.factory(stage);
hintEl.textContent = demo.hint;

// 위젯 사이를 오가는 탭
for (const widgetId of Object.keys(widgetDemos)) {
  const a = document.createElement('a');
  a.href = `?w=${widgetId}`;
  a.textContent = widgetId.toUpperCase();
  if (widgetId === id) a.className = 'active';
  tabsEl.appendChild(a);
}
// 탭 줄이 넘쳐 가로로 밀리면 지금 탭이 보이게 한다
tabsEl.querySelector('a.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

/** 고른 파일을 노트로 읽어 우주 보기를 그 노트로 다시 띄운다. 다른 위젯을 보고 있었으면 우주 보기로 바꾼다 */
async function importFiles(files: File[], progress?: (text: string) => void): Promise<string> {
  const result = await importLocalNotes(files, (done, total) => progress?.(`읽는 중 ${done}/${total}`));
  const { photos, memos, skipped } = result;
  const summary = `사진 ${photos}장 · 메모 ${memos}장${skipped > 0 ? ` · 건너뜀 ${skipped}` : ''}`;
  if (result.data.notes.length === 0) return `띄울 노트가 없다 (${summary})`;
  demo.dispose();
  photoQueue.clear();
  demo = mountCosmosDemo(stage, result.data);
  id = 'cosmos';
  hintEl.textContent = demo.hint;
  for (const a of tabsEl.querySelectorAll('a')) a.className = a.textContent === id.toUpperCase() ? 'active' : '';
  history.replaceState(null, '', '?w=cosmos');
  return summary;
}

let perf: PerfOverlay | null = settings.perf ? new PerfOverlay(stage.renderer) : null;
new SettingsPanel(
  settings,
  readQuality(),
  (on) => {
    perf?.dispose();
    perf = on ? new PerfOverlay(stage.renderer) : null;
  },
  importFiles,
);

// 게임 시간: 프레임 간격을 누적하되 긴 멈춤은 loop.maxStep 으로 자른다
let time = 0;
let last: number | null = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) last = null;
});
stage.renderer.setAnimationLoop((now: number) => {
  const frameMs = last === null ? 0 : now - last;
  const dt = Math.min(frameMs / 1000, tuning.loop.maxStep);
  last = now;
  time += dt;
  if (!perf) {
    demo.update(dt, time);
    stage.render();
    return;
  }
  const t0 = performance.now();
  demo.update(dt, time);
  const t1 = performance.now();
  stage.render();
  const t2 = performance.now();
  if (frameMs > 0) perf.record(frameMs, t1 - t0, t2 - t1);
});

if (import.meta.env.DEV) {
  window.__strata = {
    get id() {
      return id;
    },
    get demo() {
      return demo;
    },
    time: () => time,
    importFiles: (files) => importFiles(files),
    advance(seconds, hz = 60) {
      const steps = Math.round(seconds * hz);
      for (let i = 0; i < steps; i++) {
        time += 1 / hz;
        demo.update(1 / hz, time);
      }
      stage.render();
      return time;
    },
  };
}
