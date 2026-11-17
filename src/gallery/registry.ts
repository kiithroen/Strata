import { mountAlbumDemo } from './albumDemo';
import { mountCardListDemo } from './cardListDemo';
import { mountExplorerDemo } from './explorerDemo';
import { mountNoteCardDemo } from './noteCardDemo';
import { mountNoteViewDemo } from './noteViewDemo';
import type { WidgetDemoFactory } from './stage';
import { mountTimeAxisDemo } from './timeAxisDemo';

/** 갤러리 주소의 ?w= 값과 위젯 데모를 잇는다. 첫 항목이 기본값이다. */
export const widgetDemos: Record<string, WidgetDemoFactory> = {
  cosmos: (stage) => mountAlbumDemo(stage),
  'time-axis': mountTimeAxisDemo,
  'note-card': mountNoteCardDemo,
  'card-list': mountCardListDemo,
  note: mountNoteViewDemo,
  explorer: mountExplorerDemo,
};

export function pickDemo(search: string): { id: string; factory: WidgetDemoFactory } {
  const id = new URLSearchParams(search).get('w') ?? '';
  const ids = Object.keys(widgetDemos);
  const chosen = ids.includes(id) ? id : ids[0];
  return { id: chosen, factory: widgetDemos[chosen] };
}
