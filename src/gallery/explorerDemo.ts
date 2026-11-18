import {
  canPickDirectory,
  HandleSource,
  ListSource,
  pickDirectory,
  recentDirectory,
  rememberDirectory,
  reopenDirectory,
} from '../widgets/explorer/browserSources';
import { ExplorerView } from '../widgets/explorer/ExplorerView';
import { folderNotes } from '../widgets/explorer/explorerNotes';
import type { FileSource } from '../widgets/explorer/fileSource';
import { appHooks } from './appHooks';
import type { Stage, WidgetDemo } from './stage';

export interface ExplorerDemo extends WidgetDemo {
  readonly view: ExplorerView;
  /** 확인 스크립트용: 파일 목록(webkitRelativePath)으로 원본을 연다 */
  openFiles(files: File[]): Promise<void>;
}

/** 폴더 고르기 API 가 없을 때 쓰는 폴더 입력. 고른 파일 목록으로 원본을 만든다 */
function pickWithInput(): Promise<FileSource | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    input.addEventListener('change', () => resolve(input.files && input.files.length > 0 ? new ListSource([...input.files]) : null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** 로컬 탐색기 모드: 폴더를 골라 2D 격자로 훑고 사진·동영상·음악·텍스트를 뷰어로 연다. 은하로 보기는 하위 폴더까지 폴더 축으로 띄운다 */
export function mountExplorerDemo(_stage: Stage): ExplorerDemo {
  const view = new ExplorerView({
    pickSource: () => (canPickDirectory() ? pickDirectory() : pickWithInput()),
    recent: async () => {
      if (!canPickDirectory()) return null;
      const handle = await recentDirectory();
      return handle ? { name: handle.name, reopen: () => reopenDirectory(handle) } : null;
    },
    onSource: (source) => {
      if (source instanceof HandleSource) void rememberDirectory(source.root);
    },
    showInCosmos: async (source, dir, progress) => {
      const show = appHooks.showNotes;
      if (!show) return '';
      const result = await folderNotes(source, dir, (done, total) => progress(`은하로 여는 중 ${done}/${total}`));
      if (result.files === 0) return '은하에 띄울 파일이 없다';
      return show(result.data, { source, dir });
    },
  });
  // 은하에서 돌아왔으면 보던 원본·폴더를 다시 연다
  const resume = appHooks.explorerResume;
  if (resume) void view.setSource(resume.source, resume.dir);
  return {
    title: 'EXPLORER',
    hint: '폴더: 들어가기 · 파일: 열기 · 방향키: 칸 옮기기 · 엔터: 열기 · 백스페이스: 위로',
    view,
    openFiles: (files) => view.setSource(new ListSource(files)),
    update() {},
    dispose() {
      view.dispose();
    },
  };
}
