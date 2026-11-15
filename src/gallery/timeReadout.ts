import { formatStamp } from '../core/format';
import { nearestLevel, type AxisController, type LevelId } from '../widgets/timeAxis/axisModel';

const LEVEL_NAMES: Record<LevelId, string> = { year: '연', month: '월', day: '일', note: '노트' };

/** 왼쪽 위에 지금 시점과 축척 단계를 표시한다 */
export function createTimeReadout(controller: AxisController) {
  const readout = document.createElement('div');
  readout.className = 'axis-readout';
  document.body.append(readout);

  let shownText = '';
  return {
    update() {
      const level = nearestLevel(controller.current.logScale);
      const text = `${formatStamp(new Date(controller.current.focusTime))} · ${LEVEL_NAMES[level]}`;
      if (text !== shownText) {
        shownText = text;
        readout.textContent = text;
      }
    },
    dispose() {
      readout.remove();
    },
  };
}
