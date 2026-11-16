import type { WebGLRenderer } from 'three';
import { tuning } from '../config';
import { FrameStats } from '../core/frameStats';
import { qualityKeys } from '../core/quality';

/**
 * 실기기 성능 표시(?perf). 프레임 간격·CPU 시간 통계, 그리기 호출 수, 해상도, GPU 이름, 지금 품질 값을 보여 주고
 * 품질 프리셋으로 바로 옮겨 가는 링크를 단다. 렌더링 결과에는 끼어들지 않는다.
 */
export class PerfOverlay {
  private readonly el: HTMLDivElement;
  private readonly textEl: HTMLPreElement;
  private readonly stats = new FrameStats(tuning.perf.window, tuning.perf.dropRatio);
  private readonly gpu: string;
  /** 첫 프레임에 바로 그리도록 간격이 찬 상태로 시작한다 */
  private sinceRefresh: number = tuning.perf.refreshSeconds;

  constructor(private readonly renderer: WebGLRenderer) {
    this.gpu = gpuName(renderer);
    this.el = document.createElement('div');
    this.el.className = 'perf';
    this.textEl = document.createElement('pre');
    this.el.appendChild(this.textEl);
    this.el.appendChild(presetLinks());
    document.body.appendChild(this.el);
  }

  /** 한 프레임을 기록한다. frameMs 는 직전 프레임과의 벽시계 간격, 나머지는 이번 프레임의 갱신·그리기 CPU 시간이다 */
  record(frameMs: number, updateMs: number, renderMs: number): void {
    this.stats.push(frameMs, updateMs, renderMs);
    this.sinceRefresh += frameMs / 1000;
    if (this.sinceRefresh >= tuning.perf.refreshSeconds) {
      this.sinceRefresh = 0;
      this.draw();
    }
  }

  dispose(): void {
    this.el.remove();
  }

  private draw(): void {
    const s = this.stats.summary();
    const info = this.renderer.info;
    const canvas = this.renderer.domElement;
    const pr = this.renderer.getPixelRatio();
    const n = tuning.cosmos.nebula;
    const nebula = !n.visible ? 'off' : n.bakeSize > 0 ? `${n.bakeSize}` : 'live';
    const f = (v: number, d = 1) => v.toFixed(d);
    this.textEl.textContent = [
      `FPS ${f(s.fps)}  ${f(s.medianMs)}ms  p95 ${f(s.p95Ms)}  max ${f(s.maxMs)}`,
      `끊김 ${f(s.droppedRatio * 100)}% (${s.dropped}/${s.frames})`,
      `CPU 갱신 ${f(s.updateAvgMs)} (${f(s.updateMaxMs)})  그리기 ${f(s.renderAvgMs)} (${f(s.renderMaxMs)})`,
      `호출 ${info.render.calls}  삼각형 ${kilo(info.render.triangles)}  점 ${kilo(info.render.points)}  선 ${kilo(info.render.lines)}`,
      `텍스처 ${info.memory.textures}  형상 ${info.memory.geometries}`,
      `${canvas.width}×${canvas.height} @${f(pr, 2)} (dpr ${f(window.devicePixelRatio, 2)})  aa ${tuning.render.antialias ? 'on' : 'off'}`,
      `먼지 ${tuning.cosmos.dust.count}  별 ${tuning.cosmos.stars.count}  성운 ${nebula}  격자 ${tuning.card.segments}  텍스처 ${tuning.card.textureWidth}`,
      this.gpu,
    ].join('\n');
  }
}

function kilo(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`;
}

function gpuName(renderer: WebGLRenderer): string {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return String(name);
}

/** 품질 프리셋 링크. 위젯·성능 표시 같은 다른 주소 값은 남기고 품질 키만 바꾼다 */
function presetLinks(): HTMLElement {
  const nav = document.createElement('nav');
  const current = new URLSearchParams(location.search);
  const active = current.get('q');
  const custom = qualityKeys.some((k) => current.has(k));
  for (const name of [null, ...Object.keys(tuning.quality.presets)]) {
    const params = new URLSearchParams(location.search);
    params.delete('q');
    for (const k of qualityKeys) params.delete(k);
    if (name !== null) params.set('q', name);
    const a = document.createElement('a');
    // URLSearchParams 는 값 없는 키를 'perf=' 로 쓴다. 읽을 때는 같으니 그대로 둔다
    a.href = `?${params.toString()}`;
    a.textContent = (name ?? 'default').toUpperCase();
    if (name === active && !custom) a.className = 'active';
    nav.appendChild(a);
  }
  return nav;
}
