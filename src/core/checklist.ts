/** 체크리스트 노트의 항목 하나 */
export interface ChecklistItem {
  text: string;
  done: boolean;
}

/** 카드·목록에 쓰는 항목 앞 표시 */
const MARK = { open: '☐', done: '☑' } as const;

/** 항목을 카드·목록·검색에 쓰는 글로 바꾼다: 한 줄에 하나, 앞에 체크 표시 */
export function checklistText(items: readonly ChecklistItem[]): string {
  return items.map((item) => `${item.done ? MARK.done : MARK.open} ${item.text}`).join('\n');
}

/** 항목 글을 다듬는다: 앞뒤 빈칸을 떼고 빈 항목은 뺀다 */
export function cleanChecklist(items: readonly ChecklistItem[]): ChecklistItem[] {
  return items.map((item) => ({ text: item.text.trim(), done: item.done })).filter((item) => item.text !== '');
}

/**
 * 본문 줄을 항목으로 바꾼다(체크리스트로 바꿀 때). 빈 줄은 빼고, 앞의 `-`·`*`·`•`·`☐`·`[ ]` 표시는 떼며
 * `☑`·`[x]`로 시작하면 끝낸 항목이다
 */
export function linesToChecklist(text: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    let done = false;
    const mark = /^(☑|✅|\[[xX]\])\s*/.exec(line);
    if (mark) {
      done = true;
      line = line.slice(mark[0].length);
    } else line = line.replace(/^([-*•☐]|\[ \])\s*/, '');
    line = line.trim();
    if (line) items.push({ text: line, done });
  }
  return items;
}

/** 항목을 본문 줄로 되돌린다(체크리스트를 끌 때). 체크 상태는 버린다 */
export function checklistToLines(items: readonly ChecklistItem[]): string {
  return cleanChecklist(items)
    .map((item) => item.text)
    .join('\n');
}
