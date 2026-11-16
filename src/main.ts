import './style.css';
import { tuning } from './config';
import { applyQuality, parseQuality } from './core/quality';
import { pickDemo, widgetDemos } from './gallery/registry';
import { PerfOverlay } from './gallery/perfOverlay';
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
    };
  }
}

const container = document.getElementById('stage');
const tabsEl = document.getElementById('widget-tabs');
const hintEl = document.getElementById('hint');
if (!container || !tabsEl || !hintEl) throw new Error('index.html 구조가 맞지 않는다');

// 주소의 품질 덮어쓰기(?q=, ?dust= 등)는 위젯이 튜닝 값을 읽기 전에 적용한다
applyQuality(parseQuality(location.search));
const params = new URLSearchParams(location.search);

const stage = new Stage(container);
const { id, factory } = pickDemo(location.search);
const demo = factory(stage);
hintEl.textContent = demo.hint;

// 위젯 사이를 오가는 탭
for (const widgetId of Object.keys(widgetDemos)) {
  const a = document.createElement('a');
  a.href = `?w=${widgetId}`;
  a.textContent = widgetId.toUpperCase();
  if (widgetId === id) a.className = 'active';
  tabsEl.appendChild(a);
}

const perf = params.has('perf') ? new PerfOverlay(stage.renderer) : null;

// 게임 시간: 프레임 간격을 누적하되 긴 멈춤은 loop.maxStep 으로 자른다
let time = 0;
let last: number | null = null;
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
    id,
    demo,
    time: () => time,
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
