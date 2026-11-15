import { tuning } from '../config';

interface Down {
  x: number;
  y: number;
  t: number;
}

/**
 * 짧게 누르고 거의 움직이지 않고 뗀 손가락 하나를 탭으로 본다.
 * 두 손가락 이상이 닿았던 조작은 탭이 아니다. 핀치·드래그는 이후 제스처 위젯이 맡는다.
 * 누른 시간은 실제 입력 시간이라 이벤트 타임스탬프로 잰다.
 */
export function listenTap(el: HTMLElement, onTap: (clientX: number, clientY: number) => void): () => void {
  const downs = new Map<number, Down>();
  let multi = false;
  const slop2 = tuning.input.tapSlop * tuning.input.tapSlop;
  const maxMs = tuning.input.tapMaxSeconds * 1000;

  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    downs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (downs.size > 1) multi = true;
  };
  const up = (e: PointerEvent) => {
    const d = downs.get(e.pointerId);
    downs.delete(e.pointerId);
    if (!d) return;
    const wasMulti = multi;
    if (downs.size === 0) multi = false;
    if (wasMulti) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (dx * dx + dy * dy <= slop2 && e.timeStamp - d.t <= maxMs) onTap(e.clientX, e.clientY);
  };
  const cancel = (e: PointerEvent) => {
    downs.delete(e.pointerId);
    if (downs.size === 0) multi = false;
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
  };
}
