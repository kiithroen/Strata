import { Capacitor } from '@capacitor/core';
import { Album } from '../album/album';
import { draftFromRecord } from '../album/albumModel';
import type { BackupControls } from '../album/nativeNoteStore';
import { MemoryNoteStore, openNoteStore } from '../album/noteStore';
import { bakePhotoCopy, readTakenAt } from '../album/photoCopy';
import { geminiSummarizer } from '../album/geminiSummarizer';
import { SummaryRunner, type SummaryStatus } from '../album/summaries';
import { tuning } from '../config';
import type { NoteRecord } from '../sync/noteRecord';
import { appHooks } from './appHooks';
import { mountCosmosDemo, type CosmosDemo } from './cosmosDemo';
import type { AlbumActions, AlbumReload } from './noteScreens';
import type { Stage } from './stage';

/** 메모 앨범. openAlbum 전에는 빈 메모리 저장소다 */
let album = new Album(new MemoryNoteStore());
/** 안드로이드 앱의 노트 백업(앱 밖 폴더). 브라우저와 저장소를 못 열었을 때는 null */
let backup: BackupControls | null = null;

/** 노트 백업 상태와 권한 요청. 안드로이드 앱에서만 있다 */
export function albumBackup(): BackupControls | null {
  return backup;
}

/** 메모 앨범 저장소를 열고 노트를 읽는다. 앱이 첫 화면을 띄우기 전에 부른다. 저장소를 못 쓰면 이번 실행에만 남는 메모리 저장소다 */
export async function openAlbum(): Promise<void> {
  const pendingExternal: NoteRecord[] = [];
  let loaded = false;
  const { store, persistent, backup: storeBackup } = await openNoteStore({
    onDownload: (records) => {
      if (loaded) album.applyExternal(records);
      else pendingExternal.push(...records);
    },
  });
  if (!persistent) warnNotSaved();
  const opened = new Album(store);
  try {
    await opened.load();
    if (pendingExternal.length > 0) opened.applyExternal(pendingExternal);
    album = opened;
    loaded = true;
    backup = storeBackup ?? null;
  } catch (err) {
    console.error(err);
    warnNotSaved();
    album = new Album(new MemoryNoteStore());
    backup = null;
  }
}

/** 저장소를 못 열어 메모리 저장소로 대신할 때 알린다. 앱에서는 콘솔을 볼 수 없어 창으로 알린다 */
function warnNotSaved(): void {
  const message = '노트 저장소를 열 수 없다. 지금 쓰는 노트는 앱을 닫으면 사라진다.';
  if (Capacitor.isNativePlatform()) window.alert(message);
  else console.warn(message);
}

/** 지금 띄운 메모 앨범 우주 보기. 새 요약이 오면 그 카드를 바꾼다 */
let mounted: CosmosDemo | null = null;
let runner: SummaryRunner | null = null;
let summaryTimer: number | null = null;
/** 저장한 노트가 settleSec 을 지나면 돌릴 차례 */
let settleTimer: number | null = null;
let summaryListener: ((status: SummaryStatus | null) => void) | null = null;

/** 요약을 어디로 보내는지: 설정의 키로 Gemini API 에 바로, 개발 서버 프록시(GEMINI_API_KEY)로, 아니면 끔 */
export function summaryRoute(apiKey: string): 'key' | 'dev' | null {
  if (apiKey) return 'key';
  return __GEMINI_PROXY__ ? 'dev' : null;
}

/**
 * AI 요약을 시작한다(키도 개발 서버 프록시도 없으면 멈춘다). 바로 한 차례 돌리고, 그 뒤 album.summary.intervalSec 마다 돌린다.
 * 노트를 저장하면 settleSec 뒤에 한 차례 돌린다. 만든 요약은 저장하고 띄운 카드에 바로 반영한다
 */
export function startSummaries(apiKey: string): void {
  if (summaryTimer !== null) window.clearInterval(summaryTimer);
  summaryTimer = null;
  runner = null;
  const route = summaryRoute(apiKey);
  if (route) {
    const current = new SummaryRunner(
      album,
      geminiSummarizer(route === 'key' ? apiKey : null),
      (id) => {
        const note = album.data()?.notes.find((n) => n.id === id);
        if (note) mounted?.refreshSummary(note);
      },
      (status) => summaryListener?.(status),
    );
    runner = current;
    const firstRun = () => {
      if (runner === current) void current.runOnce();
    };
    if (backup) void backup.whenSynced.then(firstRun);
    else firstRun();
    summaryTimer = window.setInterval(() => void runner?.runOnce(), tuning.album.summary.intervalSec * 1000);
  }
  summaryListener?.(summaryStatus());
}

/** 요약 상태. 요약을 켜지 않았으면 null */
export function summaryStatus(): SummaryStatus | null {
  return runner?.status() ?? null;
}

/** 요약 상태가 바뀔 때 부를 함수(설정 화면). null 이면 뗀다 */
export function onSummaryStatus(listener: ((status: SummaryStatus | null) => void) | null): void {
  summaryListener = listener;
}

/** 요약 차례를 바로 한 번 돌린다 */
export function runSummariesNow(): void {
  void runner?.runOnce();
}

/** 노트를 저장한 뒤: 더 고치지 않고 settleSec 이 지나면 한 차례 돌린다. 이어서 저장하면 다시 기다린다 */
function summarizeAfterSettle(): void {
  if (!runner) return;
  if (settleTimer !== null) window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => {
    settleTimer = null;
    runSummariesNow();
  }, (tuning.album.summary.settleSec + 1) * 1000);
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
    const saved = await album.save(next, blob, id);
    summarizeAfterSettle();
    return saved.id;
  },
  remove: (id) => album.remove(id),
  check: async (id, index, done) => {
    await album.check(id, index, done);
  },
  reload: (target) => appHooks.showAlbum?.(target),
  readTakenAt,
};

/**
 * 메모 앨범의 우주 보기: 저장된 노트가 있으면 그 노트를, 없으면 가짜 노트를 미리보기로 띄운다.
 * `+ 노트`로 노트를 쓰고, 저장된 노트는 보기 화면에서 고치고 지운다. reload 는 저장·삭제 뒤 보여 줄 것이다
 */
export function mountAlbumDemo(stage: Stage, reload: AlbumReload = {}): CosmosDemo {
  const data = album.data() ?? undefined;
  const demo = mountCosmosDemo(stage, data, {
    album: actions,
    preview: data === undefined,
    focusNote: reload.focusNote,
    restore: reload.view,
    openNote: reload.openNote,
  });
  mounted = demo;
  const dispose = demo.dispose.bind(demo);
  demo.dispose = () => {
    if (mounted === demo) mounted = null;
    dispose();
  };
  return demo;
}
