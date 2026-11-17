import type { NoteKind } from '../noteCard/cardLayout';
import type { PhotoSource } from '../noteCard/cardTexture';

/** 2D 카드 목록에 띄우는 노트 하나 */
export interface CardListItem {
  id: string;
  time: number;
  kind: NoteKind;
  title?: string;
  body?: string;
  tags: readonly string[];
  /** 메모 색 번호. 없으면 노트 번호로 고른다(3D 카드와 같은 색) */
  tint?: number;
  photo?: PhotoSource;
}

/** 목록의 한 묶음(지층의 층 하나). 노트는 최근 것부터다 */
export interface CardListSection {
  key: string;
  label: string;
  items: CardListItem[];
}

export interface CardListNote {
  id: string;
  time: number;
  kind?: NoteKind;
  title?: string;
  body?: string;
  tags?: readonly string[];
  tint?: number;
}

/** 묶음 하나의 입력: 열쇠, 날짜 글자, 노트 번호들 */
export interface CardListGroup {
  key: string;
  label: string;
  members: readonly number[];
}

/**
 * 묶음마다 노트 번호를 목록 항목으로 바꾼다. 묶음 안은 최근 것부터 정렬하고, 빈 묶음은 뺀다.
 * 묶음 순서는 들어온 그대로다.
 */
export function buildCardSections(
  groups: readonly CardListGroup[],
  notes: readonly CardListNote[],
  photos: readonly (PhotoSource | undefined)[],
): CardListSection[] {
  const sections: CardListSection[] = [];
  for (const group of groups) {
    const items = group.members
      .filter((m) => notes[m] !== undefined)
      .map((m): CardListItem => {
        const n = notes[m];
        return {
          id: n.id,
          time: n.time,
          kind: n.kind ?? 'photo',
          title: n.title,
          body: n.body,
          tags: n.tags ?? [],
          tint: n.tint,
          photo: photos[m],
        };
      })
      .sort((a, b) => b.time - a.time);
    if (items.length > 0) sections.push({ key: group.key, label: group.label, items });
  }
  return sections;
}

/** 목록 전체의 노트 수 */
export function countItems(sections: readonly CardListSection[]): number {
  return sections.reduce((sum, s) => sum + s.items.length, 0);
}

/** 사진 칸의 높이/폭 비율. 너무 길쭉한 사진은 aspect 범위로 자른다 */
export function photoBoxRatio(photo: Pick<PhotoSource, 'width' | 'height'>, aspect: readonly [number, number]): number {
  const ratio = photo.height / Math.max(1, photo.width);
  return Math.min(aspect[1], Math.max(aspect[0], ratio));
}
