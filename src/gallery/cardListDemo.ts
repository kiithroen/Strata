import { formatStamp } from '../core/format';
import { createFakeNoteData } from '../dev/noteData';
import { buildCardSections, type CardListSection } from '../widgets/cardList/cardListModel';
import { CardListView } from '../widgets/cardList/CardListView';
import { clusterNotes } from '../widgets/timeAxis/axisModel';
import type { Stage, WidgetDemo } from './stage';

export interface CardListDemo extends WidgetDemo {
  readonly view: CardListView;
  readonly sections: readonly CardListSection[];
}

/** 데모에 펼치는 날 묶음 수 */
const DAYS = 8;

/** 2D 카드 목록 데모: 가짜 노트를 날마다 묶어 펼친다. 닫은 뒤 화면을 탭하면 다시 연다 */
export function mountCardListDemo(stage: Stage): CardListDemo {
  const { notes, photos } = createFakeNoteData(new Date(2026, 10, 15, 21, 30).getTime());
  const groups = clusterNotes(notes, 'day')
    .slice(0, DAYS)
    .map((c) => ({ key: c.key, label: formatStamp(new Date(c.anchorTime)).slice(0, 10), members: c.members }));
  const sections = buildCardSections(groups, notes, photos);
  const view = new CardListView({ closeLabel: '← 닫기', onClose: () => view.hide() });
  view.show(sections);
  const canvas = stage.renderer.domElement;
  const reopen = () => {
    if (!view.open) view.show(sections);
  };
  canvas.addEventListener('pointerup', reopen);
  return {
    title: 'CARD LIST',
    hint: '스크롤: 넘기기 · 닫은 뒤 탭: 다시 열기',
    view,
    sections,
    update() {},
    dispose() {
      canvas.removeEventListener('pointerup', reopen);
      view.dispose();
    },
  };
}
