import './style.css';
import { tuning } from './config';
import { pickDemo } from './gallery/registry';
import { Stage, type WidgetDemo } from './gallery/stage';

declare global {
  interface Window {
    /** 개발 서버에서만 연다. 브라우저 확인 스크립트가 위젯 상태를 읽고 조작한다 */
    __strata?: { id: string; demo: WidgetDemo; time: () => number };
  }
}

const container = document.getElementById('stage');
const titleEl = document.getElementById('widget-title');
const hintEl = document.getElementById('hint');
if (!container || !titleEl || !hintEl) throw new Error('index.html 구조가 맞지 않는다');

const stage = new Stage(container);
const { id, factory } = pickDemo(location.search);
const demo = factory(stage);
titleEl.textContent = `// ${demo.title}`;
hintEl.textContent = demo.hint;

// 게임 시간: 프레임 간격을 누적하되 긴 멈춤은 loop.maxStep 으로 자른다
let time = 0;
let last: number | null = null;
stage.renderer.setAnimationLoop((now: number) => {
  const dt = last === null ? 0 : Math.min((now - last) / 1000, tuning.loop.maxStep);
  last = now;
  time += dt;
  demo.update(dt, time);
  stage.render();
});

if (import.meta.env.DEV) window.__strata = { id, demo, time: () => time };
