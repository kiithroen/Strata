import { describe, expect, it } from 'vitest';
import { checklistText, checklistToLines, cleanChecklist, linesToChecklist } from '../src/core/checklist';

describe('checklistText', () => {
  it('항목마다 한 줄이고 끝낸 항목은 표시가 다르다', () => {
    const lines = checklistText([
      { text: '우유', done: false },
      { text: '빵', done: true },
    ]).split('\n');
    expect(lines).toHaveLength(2);
    const [openMark, openText] = lines[0].split(' ');
    const [doneMark, doneText] = lines[1].split(' ');
    expect([openText, doneText]).toEqual(['우유', '빵']);
    expect(openMark).not.toBe(doneMark);
  });
});

describe('cleanChecklist', () => {
  it('앞뒤 빈칸을 떼고 빈 항목은 뺀다', () => {
    expect(
      cleanChecklist([
        { text: ' 우유 ', done: true },
        { text: '   ', done: false },
        { text: '', done: true },
      ]),
    ).toEqual([{ text: '우유', done: true }]);
  });
});

describe('linesToChecklist · checklistToLines', () => {
  it('본문 줄을 항목으로 바꾸고 목록 표시를 떼며 끝낸 표시는 체크로 읽는다', () => {
    expect(linesToChecklist('- 우유\n* 계란\n\n[x] 빵\n[ ] 잼\n☑ 사과\n• 배\n그냥 줄')).toEqual([
      { text: '우유', done: false },
      { text: '계란', done: false },
      { text: '빵', done: true },
      { text: '잼', done: false },
      { text: '사과', done: true },
      { text: '배', done: false },
      { text: '그냥 줄', done: false },
    ]);
  });

  it('checklistText 로 쓴 글을 다시 읽으면 같은 항목이다', () => {
    const items = [
      { text: '우유', done: false },
      { text: '빵', done: true },
    ];
    expect(linesToChecklist(checklistText(items))).toEqual(items);
  });

  it('항목을 본문 줄로 되돌리면 빈 항목은 빠지고 체크는 버린다', () => {
    expect(
      checklistToLines([
        { text: '우유', done: true },
        { text: ' ', done: false },
        { text: '빵', done: false },
      ]),
    ).toBe('우유\n빵');
  });
});
