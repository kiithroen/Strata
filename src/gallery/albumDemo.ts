import { Album } from '../album/album';
import { draftFromRecord } from '../album/albumModel';
import { MemoryNoteStore, openNoteStore } from '../album/noteStore';
import { bakePhotoCopy, readTakenAt } from '../album/photoCopy';
import { appHooks } from './appHooks';
import { mountCosmosDemo, type CosmosDemo } from './cosmosDemo';
import type { AlbumActions, AlbumReload } from './noteScreens';
import type { Stage } from './stage';

/** 메모 앨범. openAlbum 전에는 빈 메모리 저장소다 */
let album = new Album(new MemoryNoteStore());

/** 메모 앨범 저장소를 열고 노트를 읽는다. 앱이 첫 화면을 띄우기 전에 부른다. 저장소를 못 쓰면 이번 실행에만 남는 메모리 저장소다 */
export async function openAlbum(): Promise<void> {
  const { store, persistent } = await openNoteStore();
  if (!persistent) console.warn('IndexedDB 를 쓸 수 없어 노트가 이번 실행에만 남는다');
  const opened = new Album(store);
  try {
    await opened.load();
    album = opened;
  } catch (err) {
    console.error(err);
    album = new Album(new MemoryNoteStore());
  }
}

/** 저장된 노트 수(확인 스크립트용) */
export function albumCount(): number {
  return album.count;
}

const actions: AlbumActions = {
  editable: (id) => album.record(id) !== undefined,
  draft: (id) => {
    const r = album.record(id);
    return r ? draftFromRecord(r) : undefined;
  },
  async save({ draft, photo }, id) {
    // 새 사진은 줄인 사본을 구워 저장하고, 그 크기를 노트에 적는다
    let blob: Blob | null | undefined;
    let next = draft;
    if (photo) {
      const baked = await bakePhotoCopy(photo);
      blob = baked.blob;
      next = { ...draft, photo: { width: baked.width, height: baked.height } };
    } else if (photo === null) blob = null;
    return (await album.save(next, blob, id)).id;
  },
  remove: (id) => album.remove(id),
  reload: (target) => appHooks.showAlbum?.(target),
  readTakenAt,
};

/**
 * 메모 앨범의 우주 보기: 저장된 노트가 있으면 그 노트를, 없으면 가짜 노트를 미리보기로 띄운다.
 * `+ 노트`로 노트를 쓰고, 저장된 노트는 보기 화면에서 고치고 지운다. reload 는 저장·삭제 뒤 보여 줄 것이다
 */
export function mountAlbumDemo(stage: Stage, reload: AlbumReload = {}): CosmosDemo {
  return mountCosmosDemo(stage, album.data() ?? undefined, { album: actions, focusNote: reload.focusNote, restore: reload.view, openNote: reload.openNote });
}
