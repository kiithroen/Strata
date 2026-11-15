import type { AxisController } from '../widgets/timeAxis/axisModel';

export interface TimeScrubberOptions {
  controller: AxisController;
  minTime: number;
  maxTime: number;
  noteTimes: readonly number[];
  onScrub: (time: number) => void;
  onTouchingChange?: (touching: boolean) => void;
}

/**
 * 화면 오른쪽 가장자리의 얇은 시간 띠.
 * 끌면 시간축을 따라 연속으로 시점을 옮기며, 빨강 표시자가 지금 시점 위치를 나타낸다.
 */
export function createTimeScrubber(options: TimeScrubberOptions) {
  const { controller, minTime, maxTime, noteTimes, onScrub, onTouchingChange } = options;
  const span = Math.max(1, maxTime - minTime);

  const root = document.createElement('div');
  root.className = 'time-scrubber';

  const track = document.createElement('div');
  track.className = 'time-scrubber-track';

  for (const t of noteTimes) {
    const tick = document.createElement('span');
    tick.className = 'time-scrubber-tick';
    tick.style.top = `${((maxTime - t) / span) * 100}%`;
    track.appendChild(tick);
  }

  const marker = document.createElement('div');
  marker.className = 'time-scrubber-marker';
  track.appendChild(marker);
  root.appendChild(track);
  document.body.appendChild(root);

  let activePointer: number | null = null;

  const scrubFromClientY = (clientY: number) => {
    const rect = track.getBoundingClientRect();
    const frac = rect.height > 0 ? Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)) : 0;
    onScrub(maxTime - frac * span);
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (activePointer !== null) return;
    activePointer = e.pointerId;
    root.classList.add('active');
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      // 합성 PointerEvent 등 캡처 불가 환경 무시
    }
    onTouchingChange?.(true);
    scrubFromClientY(e.clientY);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) return;
    scrubFromClientY(e.clientY);
  };

  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    root.classList.remove('active');
    onTouchingChange?.(false);
  };

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);

  let lastTop = '';
  return {
    update() {
      const frac = Math.min(1, Math.max(0, (maxTime - controller.current.focusTime) / span));
      const top = `${(frac * 100).toFixed(3)}%`;
      if (top !== lastTop) {
        lastTop = top;
        marker.style.top = top;
      }
    },
    dispose() {
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.remove();
    },
  };
}
