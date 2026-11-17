import { CardListView } from '../widgets/cardList/CardListView';
import type { CardListSection } from '../widgets/cardList/cardListModel';

function isCardListHistoryState(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { cardList?: unknown }).cardList === true;
}

/**
 * 2D 카드 목록을 여닫고 방문 기록을 맞춘다. 열 때 지금 기록 상태에 cardList 표시를 더해 하나 쌓으므로
 * 브라우저·안드로이드 뒤로는 목록만 닫고 그 아래 화면(지층 보기)은 그대로 둔다. 닫기 단추와 close() 는 그 기록을 되돌린다.
 */
export class CardListMode {
  private readonly view: CardListView;
  private pushed = false;
  private readonly onPop = (e: PopStateEvent) => {
    if (!this.view.open || isCardListHistoryState(e.state)) return;
    this.pushed = false;
    this.view.hide();
  };

  constructor(closeLabel: string) {
    this.view = new CardListView({ closeLabel, onClose: () => this.close() });
    window.addEventListener('popstate', this.onPop);
  }

  get open(): boolean {
    return this.view.open;
  }

  stats(): { cards: number; waitingPhotos: number } {
    return this.view.stats();
  }

  show(sections: readonly CardListSection[], focusKey?: string): void {
    this.view.show(sections, focusKey);
    if (!this.pushed) {
      const state = typeof history.state === 'object' && history.state !== null ? history.state : {};
      if (!isCardListHistoryState(state)) history.pushState({ ...state, cardList: true }, '');
      this.pushed = true;
    }
  }

  /** 닫고 열 때 쌓은 방문 기록을 되돌린다 */
  close(): void {
    if (!this.view.open) return;
    this.view.hide();
    if (this.pushed) {
      this.pushed = false;
      history.back();
    }
  }

  /** 아래 화면이 먼저 나갈 때처럼 기록은 그대로 두고 닫는다 */
  dismiss(): void {
    this.pushed = false;
    this.view.hide();
  }

  dispose(): void {
    window.removeEventListener('popstate', this.onPop);
    this.view.dispose();
  }
}
