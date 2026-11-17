/** 탐색기가 다루는 파일 종류. 뷰어와 칸 모양을 고른다 */
export type FileKind = 'folder' | 'image' | 'video' | 'audio' | 'text' | 'other';

/** 폴더 안의 항목 하나. path 는 원본 폴더 기준 '/' 로 이은 경로이고, 원본 폴더 자신은 '' 이다 */
export interface FileEntry {
  name: string;
  path: string;
  kind: FileKind;
  /** 바이트 수. 폴더는 0 */
  size: number;
  /** 마지막 수정 시각(ms). 모르면 0 */
  modified: number;
}

/**
 * 탐색기의 파일 접근. 실행 환경(브라우저·Capacitor·Electron)마다 구현을 갈아 끼우고, 탐색기는 이것으로만 파일을 읽는다.
 * 경로는 모두 원본 폴더 기준이다.
 */
export interface FileSource {
  /** 원본 폴더 이름(경로 막대 맨 앞) */
  readonly name: string;
  /** 폴더 하나의 바로 아래 항목. 정렬하지 않은 채 낸다 */
  list(path: string): Promise<FileEntry[]>;
  /** 파일 하나를 읽는다 */
  file(path: string): Promise<File>;
}
