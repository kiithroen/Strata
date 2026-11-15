import { formatStamp } from '../core/format';
import { LEVELS, type AxisController, type LevelId } from '../widgets/timeAxis/axisModel';

const LEVEL_NAMES: Record<LevelId, string> = { year: '연', month: '월', day: '일', note: '노트' };

/** 제스처 위젯 전까지 쓰는 임시 단추와 지금 시점 표시 */
export function createAxisHud(controller: AxisController, oldest: number, newest: number) {
  const nav = document.createElement('nav');
  nav.className = 'axis-controls';
  const button = (text: string, label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    nav.appendChild(b);
    return b;
  };
  button('◀', '과거로', () => controller.shift(-1, oldest, newest));
  const levelButtons = LEVELS.map((level) => {
    const b = button(LEVEL_NAMES[level], `${LEVEL_NAMES[level]} 단계`, () => controller.setLevel(level));
    b.dataset.level = level;
    return b;
  });
  button('▶', '최근으로', () => controller.shift(1, oldest, newest));

  const readout = document.createElement('div');
  readout.className = 'axis-readout';
  document.body.append(nav, readout);

  let shownLevel: LevelId | null = null;
  let shownText = '';
  return {
    update() {
      const level = controller.level;
      if (level !== shownLevel) {
        shownLevel = level;
        for (const b of levelButtons) b.classList.toggle('active', b.dataset.level === level);
      }
      const text = formatStamp(new Date(controller.current.focusTime));
      if (text !== shownText) {
        shownText = text;
        readout.textContent = text;
      }
    },
    dispose() {
      nav.remove();
      readout.remove();
    },
  };
}
