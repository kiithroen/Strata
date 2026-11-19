import { CardListView, type CardLayerInfo, type CardListOptions, type CardViewMode } from '../widgets/cardList/CardListView';
import type { CardListSection } from '../widgets/cardList/cardListModel';

/**
 * 카드 보기(2D 목록. onModeChange 를 주면 3D 공간과 토글한다)를 여닫고 방문 기록을 맞춘다.
 * 열 때 지금 기록 상태에 historyKey 표시를 더해 하나 쌓으므로 브라우저·안드로이드 뒤로는 맨 위 화면만 닫고
 * 그 아래 화면(지층 보기·카드 보기)은 그대로 둔다. 닫기 단추와 close() 는 그 기록을 되돌린다. 모드를 바꿔도 기록은 쌓지 않는다.
 */
export class CardListMode {
  private readonly view: CardListView;
  private readonly historyKey: string;
  private pushed = false;
  private readonly onPop = (e: PopStateEvent) => {
    if (!this.view.open || this.hasState(e.state)) return;
    this.pushed = false;
    this.view.hide();
    this.onClose?.();
  };

  constructor(
    closeLabel: string,
    onModeChange?: (mode: CardViewMode) => void,
    private readonly onClose?: () => void,
    extra: Pick<CardListOptions, 'onOpen' | 'onTagClick' | 'search'> & { historyKey?: string } = {},
  ) {
    const { historyKey = 'cardList', ...viewOptions } = extra;
    this.historyKey = historyKey;
    this.view = new CardListView({ closeLabel, onClose: () => this.close(), onModeChange, ...viewOptions });
    window.addEventListener('popstate', this.onPop);
  }

  private hasState(state: unknown): boolean {
    return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[this.historyKey] === true;
  }

  get open(): boolean {
    return this.view.open;
  }

  /** 열 때 쌓은 방문 기록이 남아 있는지 */
  get historyPushed(): boolean {
    return this.pushed;
  }

  /** 검색 칸(있을 때) */
  get query(): string {
    return this.view.query;
  }

  setQuery(query: string): void {
    this.view.setQuery(query);
  }

  focusSearch(): void {
    this.view.focusSearch();
  }

  /** 닫기 단추 글자를 바꾼다(지층에서 열 때와 은하에서 열 때가 다르다) */
  setCloseLabel(text: string): void {
    this.view.setCloseLabel(text);
  }

  get mode(): CardViewMode {
    return this.view.mode;
  }

  setMode(mode: CardViewMode): void {
    this.view.setMode(mode);
  }

  /** 공간 모드 머리 아래에 지금 훑는 층을 적는다(null 이면 감춘다) */
  setLayer(info: CardLayerInfo | null): void {
    this.view.setLayer(info);
  }

  /** 공간 모드 깊이 진행 막대(0~1). null 이면 감춘다 */
  setProgress(ratio: number | null): void {
    this.view.setProgress(ratio);
  }

  /** 띄운 노트 하나의 본문 DOM 만 즉시 갱신한다 */
  updateBody(id: string, body: string | undefined): void {
    this.view.updateBody(id, body);
  }

  stats(): { cards: number; waitingPhotos: number } {
    return this.view.stats();
  }

  show(sections: readonly CardListSection[], focusKey?: string): void {
    this.view.show(sections, focusKey);
    if (!this.pushed) {
      const state = typeof history.state === 'object' && history.state !== null ? history.state : {};
      if (!this.hasState(state)) history.pushState({ ...state, [this.historyKey]: true }, '');
      this.pushed = true;
    }
  }

  /** 닫고 열 때 쌓은 방문 기록을 되돌린다 */
  close(): void {
    if (!this.view.open) return;
    this.view.hide();
    this.onClose?.();
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
