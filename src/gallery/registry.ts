import { mountNoteCardDemo } from './noteCardDemo';
import type { WidgetDemoFactory } from './stage';

/** 갤러리 주소의 ?w= 값과 위젯 데모를 잇는다. 첫 항목이 기본값이다. */
export const widgetDemos: Record<string, WidgetDemoFactory> = {
  'note-card': mountNoteCardDemo,
};

export function pickDemo(search: string): { id: string; factory: WidgetDemoFactory } {
  const id = new URLSearchParams(search).get('w') ?? '';
  const ids = Object.keys(widgetDemos);
  const chosen = ids.includes(id) ? id : ids[0];
  return { id: chosen, factory: widgetDemos[chosen] };
}
