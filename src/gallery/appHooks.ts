import type { NoteData } from '../dev/noteData';
import type { FileSource } from '../widgets/explorer/fileSource';

/** 탐색기로 돌아올 때 다시 열 원본과 폴더 */
export interface ExplorerResume {
  source: FileSource;
  dir: string;
}

/**
 * 위젯 데모가 앱 쪽 동작을 부르는 자리. main.ts 가 채운다.
 * showNotes: 노트를 우주 보기로 띄우고 결과 글을 낸다. resume 을 주면 우주 보기의 `← 탐색기로`가 그 폴더로 돌아간다.
 * showAlbum: 메모 앨범을 다시 띄운다(노트를 저장·삭제한 뒤). focusId 가 있으면 그 노트의 묶음으로 다가간다.
 * explorerResume: 탐색기 모드를 띄울 때 이어서 열 원본·폴더
 */
export const appHooks: {
  showNotes: ((data: NoteData, resume?: ExplorerResume) => string) | null;
  showAlbum: ((focusId?: string) => void) | null;
  explorerResume: ExplorerResume | null;
} = { showNotes: null, showAlbum: null, explorerResume: null };
