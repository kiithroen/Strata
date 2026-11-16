import { tuning } from '../config';
import type { PhotoSource } from '../widgets/noteCard/cardTexture';
import type { NoteRef } from '../widgets/timeAxis/axisModel';
import { createFakeNotes } from './fakeNotes';
import { createPlaceholderPhotos } from './placeholderPhotos';

/** 우주 보기에 띄우는 노트와 각 노트의 사진(같은 순서). 노트는 최근 것부터다 */
export interface NoteData {
  notes: NoteRef[];
  photos: (PhotoSource | undefined)[];
}

/** 개발용 가짜 노트와 그림 사진 */
export function createFakeNoteData(newest: number): NoteData {
  const notes = createFakeNotes(newest);
  const placeholders = createPlaceholderPhotos(notes.length, tuning.dev.noteSeed + 1);
  return { notes, photos: notes.map((n, i) => (n.kind === 'photo' || !n.kind ? placeholders[i] : undefined)) };
}
