import { formatStamp } from '../core/format';
import type { AxisController } from '../widgets/timeAxis/axisModel';

export interface TimeScrubberRange {
  minTime: number;
  maxTime: number;
  noteTimes: readonly number[];
  formatLabel?: (time: number) => string;
  hidden?: boolean;
}

export interface TimeScrubberOptions extends TimeScrubberRange {
  controller: AxisController;
  onScrub: (time: number) => void;
  onTouchingChange?: (touching: boolean) => void;
}

/**
 * 화면 오른쪽 가장자리의 얇은 시간 띠.
 * 끌면 시간축이나 지층 범위를 따라 시점을 옮기며, 표시자와 손가락 옆 툴팁으로 지금 시점을 나타낸다.
 */
export function createTimeScrubber(options: TimeScrubberOptions) {
  const { controller, onScrub, onTouchingChange } = options;
  let minTime = options.minTime;
  let maxTime = options.maxTime;
  let span = Math.max(0, maxTime - minTime);
  let formatLabel = options.formatLabel;

  const root = document.createElement('div');
  root.className = 'time-scrubber';

  const track = document.createElement('div');
  track.className = 'time-scrubber-track';

  const marker = document.createElement('div');
  marker.className = 'time-scrubber-marker';
  const tip = document.createElement('div');
  tip.className = 'time-scrubber-tip';

  const renderTicks = (times: readonly number[]) => {
    track.replaceChildren();
    if (span > 0) {
      for (const t of times) {
        const tick = document.createElement('span');
        tick.className = 'time-scrubber-tick';
        tick.style.top = `${(((maxTime - t) / span) * 100).toFixed(3)}%`;
        track.appendChild(tick);
      }
    }
    track.append(marker, tip);
  };

  root.hidden = Boolean(options.hidden) || span <= 0;
  renderTicks(options.noteTimes);
  root.appendChild(track);
  document.body.appendChild(root);

  let activePointer: number | null = null;

  const scrubFromClientY = (clientY: number) => {
    const rect = track.getBoundingClientRect();
    const frac = rect.height > 0 ? Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)) : 0;
    const t = maxTime - frac * span;
    tip.textContent = formatLabel ? formatLabel(t) : formatStamp(new Date(t)).slice(0, 10);
    tip.style.top = `${(frac * 100).toFixed(3)}%`;
    onScrub(t);
  };

  const onDown = (e: PointerEvent) => {
    if (span <= 0) return;
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
  const update = () => {
    const frac = span > 0 ? Math.min(1, Math.max(0, (maxTime - controller.current.focusTime) / span)) : 0;
    const top = `${(frac * 100).toFixed(3)}%`;
    if (top !== lastTop) {
      lastTop = top;
      marker.style.top = top;
    }
  };

  return {
    setRange(range: TimeScrubberRange) {
      minTime = range.minTime;
      maxTime = range.maxTime;
      span = Math.max(0, maxTime - minTime);
      formatLabel = range.formatLabel;
      root.hidden = Boolean(range.hidden) || span <= 0;
      renderTicks(range.noteTimes);
      lastTop = '';
      update();
    },
    update,
    dispose() {
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.remove();
    },
  };
}
