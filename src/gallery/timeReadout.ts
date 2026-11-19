import { formatStamp } from '../core/format';
import { nearestLevel, type AxisController, type LevelId } from '../widgets/timeAxis/axisModel';

const LEVEL_NAMES: Record<LevelId, string> = { year: '연', month: '월', day: '일', note: '노트' };

export interface TimeReadoutOptions {
  /** 축척 단계(· 월 등)를 함께 적을지. 기본은 참이다 */
  showLevel?: boolean;
}

/** 왼쪽 위에 지금 시점(과 선택적 축척 단계)을 표시한다 */
export function createTimeReadout(controller: AxisController, options: TimeReadoutOptions = {}) {
  const showLevel = options.showLevel ?? true;
  const readout = document.createElement('div');
  readout.className = 'axis-readout';
  document.body.append(readout);

  let shownText = '';
  let overrideText: string | null = null;
  const render = () => {
    const stamp = formatStamp(new Date(controller.current.focusTime));
    const text =
      overrideText ?? (showLevel ? `${stamp} · ${LEVEL_NAMES[nearestLevel(controller.current.logScale)]}` : stamp);
    if (text !== shownText) {
      shownText = text;
      readout.textContent = text;
    }
  };
  return {
    setOverride(text: string | null) {
      if (overrideText !== text) {
        overrideText = text;
        render();
      }
    },
    update: render,
    dispose() {
      readout.remove();
    },
  };
}
