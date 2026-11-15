function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** 카드 라벨의 날짜 표기: YYYY.MM.DD HH:mm (현지 시각) */
export function formatStamp(date: Date): string {
  return (
    `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  );
}
