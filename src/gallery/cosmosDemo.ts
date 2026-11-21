import { Color, Quaternion, Vector3, type Fog } from 'three';
import { tuning } from '../config';
import { DAY_MS } from '../core/calendar';
import { damp } from '../core/motion';
import { createRng, range } from '../core/random';
import { createFakeNoteData, type NoteData } from '../dev/noteData';
import { listenGestures } from '../input/gesture';
import { CameraRig } from '../widgets/camera/cameraRig';
import { drawCloud } from '../widgets/cloud/CloudView';
import { farCardHide, layoutCloud, screenFraction, topTags } from '../widgets/cloud/wordCloud';
import { LabelCache } from '../widgets/common/labelCache';
import { ScreenLabels } from '../widgets/common/screenLabels';
import {
  RegroupBlend,
  branchCubicControls,
  burstOffset,
  catmullRomPoint,
  cubicBezierPoint,
  facingQuaternion,
  hubPoint,
  pickNearest,
  cosmosFade,
  flightOffset,
  flightParams,
  hourColorIndex,
  nodeColor,
  planetJitter,
  planetRadius,
  galaxySpinAngle,
  spiralPoint,
  timeOffsetDepth,
  type PlanetJitter,
  type TapTarget,
} from '../widgets/cosmos/cosmosModel';
import { GraphView } from '../widgets/cosmos/GraphView';
import { dateGrouping, folderGrouping, type GroupHub, type Grouping } from '../widgets/cosmos/grouping';
import { TapApproach, approachDistance } from '../widgets/cosmos/tapApproach';
import { Universe } from '../widgets/cosmos/Universe';
import { createCardLook } from '../widgets/noteCard/cardMaterial';
import { CardField } from '../widgets/noteCard/cardField';
import { createPose } from '../widgets/noteCard/cardMotion';
import { NoteCard } from '../widgets/noteCard/NoteCard';
import { cardEdgePoint } from '../widgets/noteCard/cardEdge';
import {
  AxisController,
  depthPerDay,
  levelLogScale,
  type AxisState,
  type Cluster,
  type NoteRef,
} from '../widgets/timeAxis/axisModel';
import { createTimeReadout } from './timeReadout';
import { createTimeScrubber } from './timeScrubber';
import { CardFocus } from './cardFocus';
import { CardListMode } from './cardListMode';
import { NoteScreens, type AlbumActions } from './noteScreens';
import { searchNotes } from '../album/albumModel';
import { newestFirst } from '../widgets/noteView/noteNav';
import { buildCardSections } from '../widgets/cardList/cardListModel';
import type { CardLayerInfo, CardViewMode } from '../widgets/cardList/CardListView';
import { StrataMode } from './strataMode';
import type { StrataLayerInput } from '../widgets/strata/strataLayout';
import type { Stage, WidgetDemo } from './stage';

export interface CosmosNode {
  kind: 'planet' | 'hub';
  key: string;
  anchorTime: number;
  position: Vector3;
}

/**
 * 우주 보기에서 보던 화면. 노트를 저장·삭제해 앨범을 다시 띄울 때 되살린다. 노드·층은 키로 적어 노트가 바뀌어도 찾는다.
 * galaxy 는 은하 카메라(지층 보기 중이면 들어가기 전 자리)로, 피벗을 가장 가까운 노드에서 잰 차이로 적는다
 */
export interface CosmosView {
  orbitClock: number;
  galaxy: { anchor: string | null; offset: [number, number, number]; yaw: number; pitch: number; distance: number };
  approached: string | null;
  /** 지층 보기: 깔린 층 키들(최근 것부터), 바라보는 층 키, 지층 카메라 시선과 거리, 원판이 돈 각도 */
  strata: { layers: string[]; focus: string | null; yaw: number; pitch: number; distance: number; spin: number } | null;
  /** 카드 보기: 지층에서 열었는지 다가간 노드에서 열었는지, 모드, 공간 모드로 들어간 비율(0~1) */
  cards: { source: 'strata' | 'node'; mode: CardViewMode; progress: number } | null;
  /** 검색 화면의 검색어 */
  search: string | null;
}

export interface CosmosDemo extends WidgetDemo {
  readonly controller: AxisController;
  readonly cameraRig: CameraRig;
  readonly cards: readonly NoteCard[];
  clusters(): readonly Cluster[];
  hubs(): readonly GroupHub[];
  /** 노트를 묶은 축 */
  readonly axis: CosmosAxis;
  /** 지난 프레임에 그린 행성·허브 노드 */
  nodes(): readonly CosmosNode[];
  focus(card: NoteCard | null): void;
  focusedId(): string | null;
  /** 띄운 노트의 AI 요약·태그를 새 노트 데이터로 바꾼다. 카드·검색·목록·노트 보기가 바로 쓴다(워드 클라우드는 다시 띄울 때 바뀐다) */
  refreshSummary(note: NoteRef): void;
  /** 노트의 본문·체크리스트 변경을 3D 카드와 열린 2D 카드 목록·검색 화면에 즉시 부분 갱신한다 */
  refreshNote(note: NoteRef): void;
  /** 은하 시점을 최신 시점(원점·초기 궤도·초기 거리)으로 부드럽게 되돌린다 */
  resetView(): void;
  /** 월드 위치의 화면 좌표(CSS px). 브라우저 확인 스크립트가 탭할 자리를 구할 때 쓴다 */
  screenOf(position: Vector3): { x: number; y: number };
  /** 은하에서 노드를 탭한 것처럼 처리한다: 처음이면 다가가고, 다가간 노드면 지층 보기로 들어간다 */
  tapNode(node: CosmosNode): void;
  /** 지금 다가간 노드의 키 */
  approachedKey(): string | null;
  /** 노드가 속한 위 묶음을 지층 보기로 펼친다 */
  enterStrata(node: CosmosNode): void;
  exitStrata(): void;
  /** 지층 보기 상태: 들어간 정도, 층 수, 바라보는 층 */
  strataState(): { active: boolean; mix: number; layers: number; focus: number };
  /** 화면 좌표(CSS px)에서 처음 닿는 층 판 번호. 없으면 -1 */
  pickStrataLayer(x: number, y: number): number;
  /** 지층 보기의 노트를 카드 보기로 연다(`카드 보기` 단추와 같다) */
  openCardList(): void;
  /** 카드 보기의 공간(3D)/목록(2D) 모드를 바꾼다(머리의 토글과 같다) */
  setCardMode(mode: CardViewMode): void;
  /** 노트 보기·입력 화면 */
  readonly noteScreens: NoteScreens;
  /** 지금 보는 화면(되살릴 때 restore 로 넘긴다) */
  snapshot(): CosmosView;
  /** 검색 화면을 열고 query 로 찾는다(`검색` 단추와 같다). 찾은 노트 수를 돌려준다 */
  openSearch(query?: string): number;
  /** 은하에서 다가간 노드의 묶음을 카드 보기로 연다(`카드 보기` 단추와 같다) */
  openNodeCards(): void;
  /** 카드 보기 상태: 열림, 모드, 공간 모드로 들어간 정도·앞으로 들어간 거리, 목록 카드 수, 사진을 아직 받지 않은 칸 수 */
  cardListState(): {
    open: boolean;
    mode: CardViewMode;
    fieldMix: number;
    fieldOffset: number;
    fieldMaxOffset: number;
    cards: number;
    waitingPhotos: number;
  };
}

/**
 * 우주 보기 데모. 시간 묶음은 나선팔 위의 빛나는 노드이고, 노드에서 노트 점이 방사형 선으로 뻗는다.
 * 노드는 한 단계 위 묶음의 허브에 가지로 이어지고 허브끼리는 시간 순서로 이어진다.
 * 노트 몇 장은 카드로 노드 둘레를 천천히 돈다.
 * 은하에서 노드나 카드를 처음 탭하면 그 노드로 다가가고(카드는 그 행성), 다가간 노드를 한 번 더 탭하면
 * 그 묶음이 속한 위 묶음을 지층 보기로 펼친다(strataMode.ts). 카드는 지층 보기에서 탭해야 펼친다.
 */
/** 은하 글자가 겹칠 때 남는 차례: 허브 날짜 > 행성 대표 태그 > 행성 날짜 */
const LABEL_PRIORITY = { hub: 3, title: 2, date: 1 } as const;

/** 가짜 노트의 가장 최근 시각 */
const FAKE_NEWEST = new Date(2026, 10, 15, 21, 30).getTime();

/** 은하가 노트를 묶는 축. 폴더 축은 탐색기 폴더에서 온 노트만 쓸 수 있다 */
export type CosmosAxis = 'date' | 'folder';

export interface CosmosOptions {
  /** 폴더 정보가 있는 노트의 기본 축은 폴더다 */
  axis?: CosmosAxis;
  /** 있으면 폴더 정보가 있는 노트에 폴더별·날짜별 전환 단추를 띄우고, 누르면 다른 축으로 부른다 */
  onAxis?: (axis: CosmosAxis) => void;
  /** 있으면 `← 탐색기로` 단추를 띄운다 */
  onBack?: () => void;
  /** 메모 앨범: 있으면 `+ 노트` 단추를 띄우고, 저장된 노트는 보기 화면에서 고치고 지울 수 있다 */
  album?: AlbumActions;
  /** 띄운 뒤 이 번호의 노트가 속한 묶음으로 다가간다(새로 쓴 노트를 보여 줄 때) */
  focusNote?: string;
  /** 띄운 뒤 이 화면을 움직임 없이 되살린다(고치거나 지운 뒤 보던 자리로) */
  restore?: CosmosView;
  /** 띄운 뒤 이 번호의 노트를 노트 보기로 연다 */
  openNote?: string;
  /** 저장된 노트가 없어 가짜 노트를 미리보기로 띄울 때 참. 시점 표시 옆에 `미리보기` 배지를 띄운다 */
  preview?: boolean;
}

const ORIGIN = new Vector3(0, 0, 0);

/** data 를 넘기면 그 노트로 띄운다(실데이터 임시 주입). 비었거나 없으면 가짜 노트다 */
export function mountCosmosDemo(stage: Stage, data?: NoteData, options: CosmosOptions = {}): CosmosDemo {
  const c = tuning.cosmos;
  const g = c.graph;
  stage.grid.visible = false;
  const fog = stage.scene.fog as Fog;
  const savedFog = [fog.near, fog.far];
  fog.near = c.fogNear;
  fog.far = c.fogFar;

  const look = createCardLook();
  look.uFogNear.value = c.fogNear;
  look.uFogFar.value = c.fogFar;
  const labels = new LabelCache();
  const universe = new Universe(stage.renderer);
  stage.scene.add(universe.group);

  const hasData = data !== undefined && data.notes.length > 0;
  const { notes, photos } = hasData ? data : createFakeNoteData(FAKE_NEWEST);
  const newest = notes[0].time;
  const oldest = notes[notes.length - 1].time;
  const rng = createRng(tuning.dev.noteSeed + 2);
  const cards = notes.map((note, i) => {
    const card = new NoteCard({
      face: {
        id: note.id,
        createdAt: new Date(note.time),
        kind: note.kind,
        photo: photos[i],
        title: note.title,
        body: note.body,
        summary: note.summary,
        tint: note.tint,
      },
      float: { phase: range(rng, 0, Math.PI * 2), period: range(rng, tuning.float.periodMin, tuning.float.periodMax) },
      look,
      labels,
      anisotropy: stage.anisotropy,
    });
    stage.scene.add(card.mesh);
    return card;
  });

  /**
   * 화면 글자(은하 날짜·대표 태그·워드 클라우드, 지층 낱말). 한 묶음이라 서로 겹치면 차례대로 정리된다.
   * 은하 글자만 graph.label 로 넣어 지층 보기에서 옅어지고, 낱말은 바로 넣어 지층에서도 또렷하다
   */
  const screenLabels = new ScreenLabels(labels);
  stage.scene.add(screenLabels.group);
  const graph = new GraphView(screenLabels, notes.length * 3, notes.length * 3);
  stage.scene.add(graph.group);
  const syncViewport = () => {
    const el = stage.renderer.domElement;
    graph.setViewport(el.clientWidth, el.clientHeight, stage.renderer.getPixelRatio(), stage.camera.fov);
    screenLabels.setViewport(el.clientWidth, el.clientHeight, stage.camera.fov);
  };
  syncViewport();
  const stopResize = stage.onResize(syncViewport);

  const palette = g.hourColors.map((hex) => new Color(hex));
  const noteColors = notes.map((n) => palette[hourColorIndex(n.time)]);
  const branchColor = new Color(g.branchColor);

  /** 3차원 구면 나선의 기준 시계열 공간(줌·이동 중에도 노드 배치와 묶음이 흔들리지 않도록 고정한다) */
  const spiralState: AxisState = { focusTime: newest, logScale: levelLogScale('month') };
  const controller = new AxisController({ focusTime: newest, logScale: spiralState.logScale });
  const orbitBlends = notes.map(() => new RegroupBlend());
  const dotBlends = notes.map(() => new RegroupBlend());
  const orbitFade = new Float64Array(notes.length);
  const flights = notes.map((n) => flightParams(n.id));
  const homes = notes.map(createPose);

  // 시계열 공간이 고정돼 있어 묶음·허브·관련도·글자는 한 번만 구하고, 노드 위치 벡터도 재사용한다
  const folders = data?.folders && data.notes.length > 0 ? data.folders : null;
  const axis: CosmosAxis = folders && options.axis !== 'date' ? 'folder' : 'date';
  const grouping: Grouping = axis === 'folder' && folders ? folderGrouping(notes, folders.paths, folders.rootName) : dateGrouping(notes, spiralState);
  const { capacity, hubs } = grouping;
  const planets = grouping.planets.map((group) => {
    const { cluster, affinities } = group;
    const n = cluster.members.length;
    const color = nodeColor(cluster.key);
    const tags = topTags(cluster.members.map((m) => notes[m].tags), tuning.cloud.maxWords);
    return {
      cluster,
      /** 노드 위 글자색: 노드 색에서 흰색 쪽으로 cloud.tintLift 만큼 밝힌다(클라우드의 가장 많이 쓰인 낱말과 같은 색) */
      titleColor: color.clone().lerp(new Color(1, 1, 1), tuning.cloud.tintLift),
      offsetS: timeOffsetDepth(spiralState, cluster.anchorTime),
      jitter: planetJitter(cluster.key),
      fade: 0,
      color,
      radius: planetRadius(n),
      size: g.nodeSize * (1 + 0.15 * Math.sqrt(n)),
      glowSize: g.glowSize * (0.6 + 0.12 * Math.sqrt(n)),
      label: group.label,
      /** 지층 층 이름과 2D 카드 목록의 묶음 머리 글자(장수는 목록이 따로 붙인다) */
      date: group.heading,
      /** 노드 위에 뜨는 글자(폴더 축의 폴더 이름. 날짜 축은 없고 워드 클라우드가 대표 태그를 맡는다)와 늘 떠 있는 태그 워드 클라우드 */
      title: group.title,
      words: layoutCloud(tags),
      affinities,
      /** 관련도 높은 순서의 묶음 안 번호 */
      order: Array.from({ length: n }, (_, i) => i).sort((a, b) => affinities[b] - affinities[a]),
      node: { kind: 'planet', key: cluster.key, anchorTime: cluster.anchorTime, position: new Vector3() } as CosmosNode,
    };
  });
  const hubViews = hubs.map((hub) => {
    const color = nodeColor(hub.key);
    return {
      hub,
      childOffsets: hub.children.map((ci) => planets[ci].offsetS),
      color,
      label: hub.label,
      node: { kind: 'hub', key: hub.key, anchorTime: hub.anchorTime, position: new Vector3() } as CosmosNode,
    };
  });
  const planetByKey = new Map(planets.map((p) => [p.cluster.key, p]));
  const nodes: CosmosNode[] = [...planets.map((p) => p.node), ...hubViews.map((h) => h.node)];
  let pinnedTime: number | null = newest;
  /** 먼지 흐름을 재는 지난 프레임의 시점 */
  let lastFocusTime = controller.current.focusTime;

  // 공전 시계: 손가락이 닿아 있으면 멈추고 떼면 다시 흐른다
  let orbitClock = 0;
  let orbitPace = 1;
  let touchCount = 0;
  let scrubbing = false;
  let panning = false;
  let lastPinchX = 0;
  let lastPinchY = 0;
  const zeroJitter: PlanetJitter = { radiusScale: 1, angleOffset: 0, elevationOffset: 0 };
  const canvas = stage.renderer.domElement;

  const cameraPosition = new Vector3();
  const camSpace = new Vector3();
  const offset = new Vector3();
  const target = new Vector3();
  const pinWorld = new Vector3();
  const spokeEnd = new Vector3();
  const scrubPoint = new Vector3();
  const burstQuat = new Quaternion();
  const branchC1 = new Vector3();
  const branchC2 = new Vector3();
  const branchTangent = new Vector3();
  const branchSegs = g.branchSegments;
  /** 노드 구슬의 가장 큰 화면 반지름(CSS px). 글자는 그 바깥에 놓는다 */
  const orbRadiusPx = g.orbPx[1] / 2;
  const branchPoints = Array.from({ length: branchSegs + 1 }, () => new Vector3());
  const branchAlphas = new Array<number>(branchSegs + 1);
  const spineCount = Math.max(hubViews.length, planets.length);
  const spinePoints = Array.from({ length: Math.max(2, (spineCount - 1) * branchSegs + 1) }, () => new Vector3());
  const spineAlphas = new Array<number>(spinePoints.length);
  const hubAlphas = new Array<number>(hubViews.length);
  const planetAlphas = new Array<number>(planets.length);

  const cameraDepth = (position: Vector3) =>
    -camSpace.copy(position).applyMatrix4(stage.camera.matrixWorldInverse).z;

  const screenOf = (position: Vector3) => {
    const rect = canvas.getBoundingClientRect();
    const p = position.clone().project(stage.camera);
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  };

  const focus = new CardFocus(stage, cards);

  const cameraRig = new CameraRig({
    fovDeg: () => stage.camera.fov,
    viewportHeight: () => canvas.clientHeight,
    initialYaw: c.initialOrbit.yaw,
    initialPitch: c.initialOrbit.pitch,
    initialDistance: c.initialDistance,
  });

  // 카드 보기: 지층에 깔린 노트만 3D 카드 공간(field 배치) 또는 2D 카드 목록으로 본다
  const noteIndex = new Map(notes.map((n, i) => [n.id, i]));
  /** group 은 넘길 차례의 노트 번호들(목록 순서). 없으면 노트가 속한 행성이다 */
  const openNoteById = (id: string, group?: readonly string[]) => {
    const i = noteIndex.get(id);
    if (i === undefined) return;
    const members = group?.map((g) => noteIndex.get(g)).filter((m): m is number => m !== undefined);
    screens.openNote(i, members);
  };
  const openTagSearch = (tag: string) => {
    if (searchList.open) {
      if (screens.open) void screens.closeForTag(tag, (q) => searchList.setQuery(q));
      else searchList.setQuery(`#${tag}`);
      return;
    }
    if (screens.open) void screens.closeForTag(tag, (q) => void openSearch(q, false));
    else openSearch(`#${tag}`, false);
  };
  const cardList = new CardListMode(
    '← 지층으로',
    () => {
      focus.set(null);
      field?.cancelInertia();
    },
    () => {
      focus.set(null);
      field?.cancelInertia();
    },
    { onOpen: openNoteById, onTagClick: openTagSearch },
  );
  // 검색: 제목·본문·태그로 찾은 노트를 묶음(행성)별 2D 목록으로 펼친다
  const runSearch = (query: string): number => {
    const found = searchNotes(notes, query);
    const byPlanet = new Map<number, number[]>();
    for (const m of found) {
      const pi = planetOfNote[m];
      const list = byPlanet.get(pi);
      if (list) list.push(m);
      else byPlanet.set(pi, [m]);
    }
    const groups = [...byPlanet.keys()]
      .sort((a, b) => a - b)
      .map((pi) => ({ key: planets[pi].cluster.key, label: planets[pi].date, members: byPlanet.get(pi) ?? [] }));
    searchList.show(buildCardSections(groups, notes, photos));
    return found.length;
  };
  const searchList = new CardListMode('← 은하로', undefined, undefined, {
    historyKey: 'searchList',
    onOpen: openNoteById,
    onTagClick: openTagSearch,
    search: {
      placeholder: '제목·본문·#태그',
      empty: (q) => (q.trim() ? `'${q.trim()}'에 맞는 노트가 없다` : '제목·본문·태그로 찾는다. #태그는 태그만 찾는다'),
      onQuery: (q) => void runSearch(q),
    },
  });
  /** focusInput 이 거짓이면 검색 칸에 입력 초점을 두지 않는다(폰에서 가상 키보드가 뜨지 않게, 되살릴 때) */
  const openSearch = (query?: string, focusInput = true): number => {
    focus.set(null);
    searchList.setCloseLabel(cardList.open ? '← 카드로' : strata.active ? '← 지층으로' : '← 은하로');
    const n = runSearch(query ?? searchList.query);
    if (query !== undefined) searchList.setQuery(query);
    if (focusInput) searchList.focusSearch();
    return n;
  };
  let field: CardField | null = null;
  /** 카드 공간의 층들(최근 것부터)과 자리 번호 → 층 번호. 공간 모드 머리에 맨 앞 카드의 층을 적는다 */
  let fieldLayers: CardLayerInfo[] = [];
  let fieldLayerOfSlot = new Int32Array(0);
  /** 머리에 적은 층 번호(-1 이면 비움) */
  let shownLayer = -1;
  /** 노트 번호 → 카드 공간 자리 번호(-1 이면 공간에 없음). 최근 노트가 앞자리다 */
  const fieldSlotOf = new Int32Array(notes.length).fill(-1);
  /** 카드 공간 보기로 들어간 정도(0~1) */
  let fieldMix = 0;
  const fieldPose = createPose();
  const buildField = (count: number) => new CardField(count, tuning.field.seed, stage.camera.fov, stage.camera.aspect);
  // 화면 비율이 바뀌면(회전, 폴더블 접기·펼치기) 같은 카드로 다시 배치하고 들어간 비율을 이어 간다
  const stopFieldResize = stage.onResize(() => {
    if (!field || !cardList.open) return;
    const old = field;
    field = buildField(old.slots.length);
    if (old.maxOffset > 0) field.dolly((old.goalOffset / old.maxOffset) * field.maxOffset);
    field.offset = field.goalOffset;
  });
  const fieldOn = (): boolean => field !== null && cardList.open && cardList.mode === 'space';
  /** 카드 보기를 어디서 열었는지 */
  let cardSource: 'strata' | 'node' = 'strata';
  /** 카드 보기를 연다. 목록은 묶음(층)별로 펼치고 focusKey 묶음을 맨 위에 둔다 */
  const showCards = (
    groups: readonly { key: string; label: string; members: readonly number[]; words: CardLayerInfo['words'] }[],
    focusKey: string | undefined,
    closeLabel: string,
  ) => {
    if (groups.length === 0) return;
    focus.set(null);
    cardList.setCloseLabel(closeLabel);
    const members = groups.flatMap((g) => g.members).sort((a, b) => notes[b].time - notes[a].time);
    field = buildField(members.length);
    fieldSlotOf.fill(-1);
    members.forEach((m, i) => (fieldSlotOf[m] = i));
    fieldLayerOfSlot = new Int32Array(members.length);
    groups.forEach((grp, li) => grp.members.forEach((m) => (fieldLayerOfSlot[fieldSlotOf[m]] = li)));
    fieldLayers = groups.map((grp, li) => ({
      label: grp.label,
      index: li,
      total: groups.length,
      count: grp.members.length,
      words: grp.words,
    }));
    cardList.show(buildCardSections(groups, notes, photos), focusKey);
    shownLayer = -1;
  };
  /** 지층 보기의 층들 */
  const openCardList = () => {
    if (!strata.active) return;
    const groups = strata.groups().map((g) => ({ ...g, label: planetByKey.get(g.key)?.date ?? g.label }));
    cardSource = 'strata';
    showCards(groups, strata.focusKey ?? undefined, '← 지층으로');
  };
  /** 행성들의 카드 보기 묶음 */
  const planetGroups = (indices: readonly number[]) =>
    indices.map((pi) => ({ key: planets[pi].cluster.key, label: planets[pi].date, members: planets[pi].cluster.members, words: planets[pi].words }));
  /** 은하에서 다가간 노드: 그 노드가 속한 위 묶음의 행성들(지층 보기에 깔릴 노트와 같다) */
  const openNodeCards = () => {
    const key = approach.approached;
    if (strata.active || !key) return;
    cardSource = 'node';
    const hubView = hubViews.find((h) => h.hub.key === key);
    if (hubView) {
      showCards(planetGroups(hubView.hub.children), undefined, '← 은하로');
      return;
    }
    const pi = planets.findIndex((p) => p.cluster.key === key);
    if (pi < 0) return;
    const hub = hubs.find((h) => h.children.includes(pi));
    showCards(planetGroups(hub ? hub.children : [pi]), planets[pi].cluster.key, '← 은하로');
  };
  /** 체크리스트 체크처럼 시각·종류·묶음이 그대로인 본문 변경을 3D 카드와 열린 2D 목록·검색 DOM 에 즉시 반영한다 */
  const refreshNote = (note: NoteRef) => {
    const i = noteIndex.get(note.id);
    if (i === undefined) return;
    Object.assign(notes[i], { title: note.title, body: note.body, checklist: note.checklist });
    cards[i].refreshFace(note.body);
    if (cardList.open) cardList.updateBody(note.id, note.body);
    if (searchList.open) searchList.updateBody(note.id, note.body);
  };
  /**
   * 노트 보기·입력 화면. 저장·삭제 뒤 앨범을 다시 띄우기 전에 카드 보기·검색·지층 보기를 기록은 둔 채 닫고,
   * 그 화면들이 쌓았던 기록 수를 알려 한꺼번에 되돌리게 한다
   */
  const screens = new NoteScreens(notes, photos, options.album, () => snapshot(), () => {
    let pushed = 0;
    for (const list of [cardList, searchList]) {
      if (list.historyPushed) pushed++;
      list.dismiss();
    }
    if (strata.historyPushed) pushed++;
    strata.dismiss();
    return pushed;
  }, (index) => {
    const pi = planetOfNote[index];
    return pi >= 0 ? newestFirst(planets[pi].cluster.members, (m) => notes[m].time) : [index];
  }, {
    onTagClick: openTagSearch,
    suggestedTags: () => topTags(notes.map((n) => n.tags), tuning.album.suggestedTags).map((w) => w.text),
    onNoteChange: refreshNote,
  });
  // Esc 는 맨 위 화면부터 닫는다. 지층 보기의 Esc 처리보다 먼저 받는다(창의 캡처 단계)
  const onEscapeKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    let handled = screens.back();
    if (!handled && !strata.active) {
      if (searchList.open) {
        searchList.close();
        handled = true;
      } else if (cardList.open) {
        if (focus.focused) focus.set(null);
        else cardList.close();
        handled = true;
      }
    }
    if (handled) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  window.addEventListener('keydown', onEscapeKey, true);
  const strata = new StrataMode(stage, cameraRig, labels, {
    onEscape: () => {
      if (focus.focused) {
        focus.set(null);
        return true;
      }
      if (searchList.open) {
        searchList.close();
        return true;
      }
      if (cardList.open) {
        cardList.close();
        return true;
      }
      return false;
    },
    isBlocked: () => focus.focused !== null || cardList.open || searchList.open || screens.open,
    onFocusChange: () => {
      pinnedTime = strata.focusTime;
    },
    onLeave: () => {
      searchList.dismiss();
      cardList.dismiss();
      focus.set(null);
      syncScrubberRange();
    },
    onCards: () => openCardList(),
    // 지층 보기에서도 노트를 쓰고 찾는다. 검색은 지층 위에 열고 닫으면 지층으로 돌아온다
    buttons: [
      ...(options.album ? [{ label: '+ 노트', onClick: () => screens.compose() }] : []),
      { label: '검색', onClick: () => void openSearch() },
    ],
  });
  let strataWasActive = false;

  // 탐색기에서 온 노트: 탐색기로 돌아가기와 폴더별·날짜별 전환 단추(지층 단추와 같은 자리·모양)
  const actions = document.createElement('div');
  actions.className = 'strata-actions cosmos-actions';
  const actionButton = (text: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', onClick);
    actions.append(b);
  };
  if (options.onBack) actionButton('← 탐색기로', options.onBack);
  const onAxis = options.onAxis;
  if (folders && onAxis) actionButton(axis === 'folder' ? '날짜별로 보기' : '폴더별로 보기', () => onAxis(axis === 'folder' ? 'date' : 'folder'));
  if (options.album) actionButton('+ 노트', () => screens.compose());
  actionButton('검색', () => void openSearch());
  // 최신 시점에서 벗어났거나 노드에 다가갔을 때만 보인다
  const resetView = () => {
    if (strata.active) return;
    approach.clear();
    pinnedTime = newest;
    controller.target.focusTime = newest;
    cameraRig.focusPoint(ORIGIN);
    cameraRig.setGoalDistance(c.initialDistance);
    cameraRig.orbitTo(c.initialOrbit.pitch, c.initialOrbit.yaw);
  };
  actionButton('최근으로', resetView);
  const resetViewButton = actions.lastElementChild as HTMLButtonElement;
  resetViewButton.hidden = true;
  // 다가간 노드가 있을 때만 보인다
  actionButton('지층 보기', () => {
    const n = nodeByKey(approach.approached);
    if (n) enterStrata(n);
  });
  const nodeStrataButton = actions.lastElementChild as HTMLButtonElement;
  nodeStrataButton.hidden = true;
  actionButton('카드 보기', () => openNodeCards());
  const nodeCardsButton = actions.lastElementChild as HTMLButtonElement;
  nodeCardsButton.hidden = true;
  document.body.appendChild(actions);

  const onHomeKey = (e: KeyboardEvent) => {
    if (e.key !== 'Home' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (strata.active || cardList.open || searchList.open || screens.open || focus.focused !== null) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    e.preventDefault();
    resetView();
  };
  window.addEventListener('keydown', onHomeKey);

  /** 노드가 속한 위 묶음(허브)의 아래 묶음들을 층으로 쌓는다. 허브가 없으면 그 행성 하나가 층이다 */
  const enterStrata = (node: CosmosNode) => {
    focus.set(null);
    let children: number[];
    let focusIndex = 0;
    if (node.kind === 'hub') {
      children = hubViews.find((h) => h.node === node)?.hub.children ?? [];
    } else {
      const pi = planets.findIndex((p) => p.node === node);
      const hub = hubs.find((h) => h.children.includes(pi));
      children = hub ? hub.children : [pi];
      focusIndex = Math.max(0, children.indexOf(pi));
    }
    const layers: StrataLayerInput[] = children.map((ci) => {
      const planet = planets[ci];
      return {
        key: planet.cluster.key,
        label: planet.label,
        anchorTime: planet.cluster.anchorTime,
        words: planet.words,
        tiles: planet.cluster.members.map((m, k) => ({
          index: m,
          id: notes[m].id,
          width: cards[m].layout.worldWidth,
          height: cards[m].layout.worldHeight,
          affinity: planet.affinities[k],
        })),
      };
    });
    if (layers.length === 0) return;
    const origin = node.kind === 'hub' ? planets[children[focusIndex]].node.position : node.position;
    strata.enter(layers, focusIndex, origin);
    pinnedTime = strata.focusTime;
    syncScrubberRange();
  };

  /** 노트가 속한 행성 번호와 카드 번호 */
  const cardIndex = new Map(cards.map((card, i) => [card, i]));
  const planetOfNote = new Int32Array(notes.length).fill(-1);
  planets.forEach((p, pi) => {
    for (const m of p.cluster.members) planetOfNote[m] = pi;
  });
  const planetNodeOfCard = (card: NoteCard): CosmosNode | null => {
    const ci = cardIndex.get(card);
    const pi = ci === undefined ? -1 : planetOfNote[ci];
    return pi >= 0 ? planets[pi].node : null;
  };

  // 은하 탭 두 단계: 처음 탭한 노드로 다가가고, 다가간 노드를 다시 탭하면 지층 보기로 들어간다
  const approach = new TapApproach();
  /** 다가간 노드의 빛이 커진 정도(0~1). 다른 노드로 다가가면 0부터 다시 커진다 */
  let approachGlow = 0;
  const tapNode = (node: CosmosNode | null) => {
    if (!node) return;
    if (approach.tap(node.key) === 'enter') {
      enterStrata(node);
      return;
    }
    approachGlow = 0;
    pinnedTime = node.anchorTime;
    controller.target.focusTime = node.anchorTime;
    cameraRig.focusPoint(node.position, approachDistance(node.kind));
  };

  const stopGestures = listenGestures(canvas, {
    onTouchCountChange: (count) => {
      touchCount = count;
      if (count > 0) {
        cameraRig.cancelInertia();
        if (fieldOn()) field?.cancelInertia();
      }
    },
    // 카드 공간 보기에서는 카메라가 멈추고, 세로 끌기·핀치·휠이 카드 사이를 앞뒤로 날게 한다
    onDragStart: () => {
      if (focus.focused) return;
      if (fieldOn()) {
        field?.cancelInertia();
        return;
      }
      cameraRig.onDragStart();
    },
    onDragMove: (e) => {
      if (focus.focused) return;
      if (fieldOn()) field?.dolly(-e.dy * tuning.cardField.dollyPerPx);
      else cameraRig.onDragMove(e.dx, e.dy);
    },
    onDragEnd: (e) => {
      if (focus.focused) return;
      if (fieldOn()) {
        field?.flick(-e.vy * tuning.cardField.dollyPerPx);
        return;
      }
      cameraRig.onDragEnd(e.vx, e.vy);
    },
    onPanStart: () => {
      if (focus.focused || fieldOn()) return;
      approach.clear();
      panning = true;
      pinnedTime = null;
      cameraRig.cancelInertia();
    },
    onPanMove: (e) => {
      if (focus.focused || fieldOn()) return;
      cameraRig.pan(e.dx, e.dy);
    },
    onPanEnd: () => {
      panning = false;
    },
    onPinchStart: (e) => {
      if (focus.focused) return;
      if (fieldOn()) {
        field?.cancelInertia();
        return;
      }
      approach.clear();
      pinnedTime = null;
      lastPinchX = e.x;
      lastPinchY = e.y;
    },
    onPinchMove: (e) => {
      if (focus.focused) return;
      if (fieldOn()) {
        field?.dolly(Math.log(e.ratio) * tuning.cardField.pinchDolly);
        return;
      }
      cameraRig.zoomByFactor(Math.pow(1 / e.ratio, tuning.gesture.pinchZoomScale));
      cameraRig.pan(e.x - lastPinchX, e.y - lastPinchY);
      lastPinchX = e.x;
      lastPinchY = e.y;
    },
    onWheel: (e) => {
      if (focus.focused) return;
      if (fieldOn()) {
        field?.cancelInertia();
        field?.dolly(e.deltaY * tuning.cardField.wheelDolly);
        return;
      }
      cameraRig.zoomByFactor(Math.exp((e.deltaY / 100) * tuning.gesture.wheelZoomSpeed));
    },
    onTap: ({ x, y }) => {
      // 펼친 카드를 다시 누르면 노트 보기로 열고, 다른 곳을 누르면 닫는다
      if (focus.focused) {
        const opened = focus.focused;
        const hit = focus.pickHit(x, y, (card) => card === opened);
        if (hit) screens.openNote(cardIndex.get(opened) ?? -1);
        else focus.set(null);
        return;
      }
      // 카드 공간 보기에서는 공간의 카드만 펼친다
      if (fieldOn()) {
        const hit = focus.pickHit(x, y, (card) => fieldSlotOf[cardIndex.get(card) ?? -1] >= 0);
        if (hit) focus.set(hit.card);
        return;
      }
      // 광선이 카드에 정확히 맞으면 그 카드다. 지층 보기에서는 현재 지층 카드만 펼치고, 은하에서는 그 카드의 행성을 탭한 것으로 친다
      const cardHit = focus.pickHit(
        x,
        y,
        strata.active ? (card) => strata.hasCard(cardIndex.get(card) ?? -1) : undefined,
      );
      if (cardHit) {
        if (strata.active) focus.set(cardHit.card);
        else tapNode(planetNodeOfCard(cardHit.card));
        return;
      }
      // 지층 보기에서 카드를 빗나간 탭은 빈 곳 층 판 선택으로만 넘긴다(카드 여유 반경이 층 전환을 가로채지 않게)
      if (strata.active) {
        const li = strata.pickLayer(x, y);
        if (li >= 0) {
          strata.focusLayer(li);
          pinnedTime = strata.focusTime;
        } else {
          // 층 판 바깥을 탭하면 은하로 나간다
          strata.exit();
        }
        return;
      }
      // 은하에서는 탭 자리에서 판정 반경 안의 가장 가까운 카드나 노드를 고른다
      const rect = canvas.getBoundingClientRect();
      const pxPerUnit = rect.height / (2 * Math.tan((stage.camera.fov * Math.PI) / 360));
      const targets: TapTarget[] = [];
      const picks: Array<{ card: NoteCard } | { node: CosmosNode }> = [];
      for (const card of cards) {
        if (!card.visible || card.mesh.material.uniforms.uFade.value < 0.3) continue;
        const depth = cameraDepth(card.mesh.position);
        if (depth < 0.5) continue;
        const half = (Math.hypot(card.layout.worldWidth, card.layout.worldHeight) / 2) * card.mesh.scale.x;
        const sp = screenOf(card.mesh.position);
        targets.push({ x: sp.x, y: sp.y, radius: Math.max(g.cardTapRadius, (half * pxPerUnit) / depth) });
        picks.push({ card });
      }
      for (const node of nodes) {
        if (cameraDepth(node.position) < c.nearDepth) continue;
        if (cosmosFade(node.position.distanceTo(cameraPosition)) <= 0.05) continue;
        const sp = screenOf(node.position);
        targets.push({ x: sp.x, y: sp.y, radius: g.tapRadius });
        picks.push({ node });
      }
      const i = pickNearest(targets, x, y);
      if (i < 0) return;
      const chosen = picks[i];
      tapNode('card' in chosen ? planetNodeOfCard(chosen.card) : chosen.node);
    },
  });

  const readout = createTimeReadout(controller, {
    showLevel: false,
    badge: options.preview && !hasData ? '미리보기' : undefined,
  });
  const noteTimes = notes.map((n) => n.time);
  const scrubber = createTimeScrubber({
    controller,
    minTime: oldest,
    maxTime: newest,
    noteTimes,
    onScrub: (t) => {
      if (strata.active) {
        strata.focusNearestTime(t);
        pinnedTime = strata.focusTime;
        return;
      }
      approach.clear();
      pinnedTime = t;
      controller.current.focusTime = t;
      controller.target.focusTime = t;
      spiralPoint(timeOffsetDepth(spiralState, t), orbitClock, zeroJitter, scrubPoint);
      cameraRig.focusPoint(scrubPoint);
    },
    onTouchingChange: (t) => {
      scrubbing = t;
    },
  });
  const syncScrubberRange = () => {
    if (strata.active) {
      const times = strata.layerTimes();
      const min = Math.min(...times);
      const max = Math.max(...times);
      scrubber.setRange({
        minTime: min,
        maxTime: max,
        noteTimes: times,
        formatLabel: (t) => strata.nearestLayerLabel(t),
        hidden: times.length <= 1 || max <= min,
      });
      return;
    }
    scrubber.setRange({ minTime: oldest, maxTime: newest, noteTimes, hidden: false });
  };

  /** 노드 자리를 지금 공전 시계로 구한다(첫 프레임 전에 다가가거나 되살릴 때) */
  const placeNodes = () => {
    for (const p of planets) spiralPoint(p.offsetS, orbitClock, p.jitter, p.node.position);
    for (const h of hubViews) hubPoint(h.childOffsets, orbitClock, h.node.position);
  };
  const nodeByKey = (key: string | null) => (key === null ? undefined : nodes.find((n) => n.key === key));

  function snapshot(): CosmosView {
    const saved = strata.galaxyCamera;
    const target = saved ? saved.target : cameraRig.goalTarget;
    let anchor: CosmosNode | null = null;
    let best = Infinity;
    for (const node of nodes) {
      const d = node.position.distanceToSquared(target);
      if (d < best) {
        best = d;
        anchor = node;
      }
    }
    const offsetV = anchor ? target.clone().sub(anchor.position) : target.clone();
    return {
      orbitClock,
      galaxy: {
        anchor: anchor?.key ?? null,
        offset: [offsetV.x, offsetV.y, offsetV.z],
        yaw: saved ? saved.yaw : cameraRig.yaw,
        pitch: saved ? saved.pitch : cameraRig.pitch,
        distance: saved ? saved.distance : cameraRig.goalDistance,
      },
      approached: approach.approached,
      strata: strata.active
        ? {
            layers: strata.groups().map((g) => g.key),
            focus: strata.focusKey,
            yaw: cameraRig.yaw,
            pitch: cameraRig.pitch,
            distance: cameraRig.goalDistance,
            spin: strata.spinAngle,
          }
        : null,
      cards: cardList.open
        ? { source: cardSource, mode: cardList.mode, progress: field && field.maxOffset > 0 ? field.goalOffset / field.maxOffset : 0 }
        : null,
      search: searchList.open ? searchList.query : null,
    };
  }

  /** 보던 화면을 움직임 없이 되살린다. 없어진 노드·층은 건너뛴다 */
  const restoreView = (view: CosmosView) => {
    orbitClock = view.orbitClock;
    placeNodes();
    const g = view.galaxy;
    // 기준 노드가 없어졌으면(그 묶음의 마지막 노트를 지움) 처음 카메라로 둔다
    const anchor = nodeByKey(g.anchor);
    if (anchor) {
      cameraRig.focusPoint(new Vector3(...g.offset).add(anchor.position));
      cameraRig.setGoalDistance(g.distance);
      cameraRig.orbitTo(g.pitch, g.yaw);
      cameraRig.snap();
    }
    const approached = nodeByKey(view.approached);
    if (approached) {
      approach.tap(approached.key);
      approachGlow = 1;
      pinnedTime = approached.anchorTime;
      controller.target.focusTime = approached.anchorTime;
      controller.current.focusTime = approached.anchorTime;
    }
    const s = view.strata;
    if (s) {
      // 바라보던 층의 행성으로 들어가면 같은 허브의 층들이 다시 깔린다. 그 층이 없어졌으면 남은 층으로 들어간다
      const keys = [s.focus, ...s.layers].filter((k): k is string => k !== null);
      const planet = keys.map((k) => planetByKey.get(k)).find((p) => p !== undefined);
      if (planet) {
        enterStrata(planet.node);
        strata.spinAngle = s.spin;
        cameraRig.orbitTo(s.pitch, s.yaw);
        cameraRig.setGoalDistance(s.distance);
        cameraRig.snap();
        strata.snapIn();
        orbitPace = 0;
      }
    }
    const cv = view.cards;
    if (cv) {
      if (cv.source === 'strata') openCardList();
      else openNodeCards();
      if (cardList.open) {
        if (cardList.mode !== cv.mode) cardList.setMode(cv.mode);
        if (field) {
          field.dolly(cv.progress * field.maxOffset - field.goalOffset);
          field.offset = field.goalOffset;
        }
        if (cv.mode === 'space') fieldMix = 1;
        orbitPace = 0;
      }
    }
    if (view.search !== null) openSearch(view.search, false);
  };

  if (options.restore) restoreView(options.restore);
  else {
    // 새로 쓴 노트를 보여 줄 때는 그 노트의 묶음으로 다가간다
    const focusNoteIndex = options.focusNote === undefined ? undefined : noteIndex.get(options.focusNote);
    if (focusNoteIndex !== undefined && planetOfNote[focusNoteIndex] >= 0) {
      placeNodes();
      tapNode(planets[planetOfNote[focusNoteIndex]].node);
    }
  }
  const openNoteIndex = options.openNote === undefined ? undefined : noteIndex.get(options.openNote);
  if (openNoteIndex !== undefined) screens.openNote(openNoteIndex);

  return {
    title: 'COSMOS',
    get hint() {
      if (focus.focused !== null) return '카드 다시 탭: 노트 보기 · 바깥 탭/Esc: 닫기';
      if (strata.active) return '카드 탭: 펼치기 · 층 탭/▲▼: 층 이동 · 바깥 탭: 은하로';
      if (approach.approached !== null) return '한 번 더 탭: 지층 보기 · 끌기: 회전 · 우클릭/두손가락: 이동';
      return '끌기: 회전 · 핀치/휠: 줌 · 우클릭/두손가락: 이동 · 탭: 노드/카드';
    },
    controller,
    cameraRig,
    cards,
    clusters: () => planets.map((p) => p.cluster),
    axis,
    hubs: () => hubs,
    nodes: () => nodes,
    focus: (card) => focus.set(card),
    focusedId: () => focus.focused?.id ?? null,
    refreshSummary(note) {
      const i = noteIndex.get(note.id);
      if (i === undefined) return;
      Object.assign(notes[i], { summary: note.summary, tags: note.tags, autoTags: note.autoTags });
      cards.find((card) => card.id === note.id)?.setSummary(note.summary);
    },
    refreshNote,
    resetView,
    screenOf,
    tapNode,
    approachedKey: () => approach.approached,
    enterStrata,
    exitStrata: () => strata.exit(),
    pickStrataLayer: (x, y) => strata.pickLayer(x, y),
    openCardList,
    noteScreens: screens,
    snapshot,
    openSearch: (query) => openSearch(query),
    openNodeCards,
    setCardMode: (mode) => {
      if (!cardList.open || cardList.mode === mode) return;
      focus.set(null);
      cardList.setMode(mode);
    },
    cardListState: () => ({
      open: cardList.open,
      mode: cardList.mode,
      fieldMix,
      fieldOffset: field?.offset ?? 0,
      fieldMaxOffset: field?.maxOffset ?? 0,
      ...cardList.stats(),
    }),
    strataState: () => ({ active: strata.active, mix: strata.mix, layers: strata.layerCount, focus: strata.focusIndex }),
    update(dt, time) {
      // 은하 단추는 지층 보기 동안 지층 단추에 자리를 내준다
      const hideApproached = approach.approached === null;
      if (nodeStrataButton.hidden !== hideApproached) nodeStrataButton.hidden = hideApproached;
      if (nodeCardsButton.hidden !== hideApproached) nodeCardsButton.hidden = hideApproached;
      const hideReset = hideApproached && cameraRig.goalTarget.lengthSq() <= c.planetMaxRadius * c.planetMaxRadius;
      if (resetViewButton.hidden !== hideReset) resetViewButton.hidden = hideReset;
      if (actions.hidden !== strata.active) actions.hidden = strata.active;
      look.uTime.value = time;
      // 지층 원판은 손가락이 닿아 있거나 카드를 펼쳤거나 카드 보기를 열면 멈춘다
      strata.spinning = touchCount === 0 && !focus.focused && !cardList.open && !searchList.open;
      // 지층 보기 동안에는 은하가 멈춰 있어 돌아왔을 때 보던 자리 그대로다
      strata.update(dt);
      const mix = strata.mix;
      fieldMix = damp(fieldMix, fieldOn() ? 1 : 0, tuning.strata.transitionRate, dt);
      if (!fieldOn() && fieldMix < 0.002) fieldMix = 0;
      field?.step(dt);
      // 카드 공간 보기 동안에는 층 판·층 낱말·은하 그래프를 걷고 별 배경만 남긴다
      strata.veil = 1 - fieldMix;
      graph.alphaScale = (1 - mix * (1 - tuning.strata.galaxyDim)) * (1 - fieldMix);
      if (strata.active) {
        pinnedTime = strata.focusTime;
        if (pinnedTime !== null) controller.target.focusTime = pinnedTime;
      } else if (strataWasActive) {
        // 은하로 돌아오면 다시 궤도 중심과 가장 가까운 노드의 시각을 따른다
        pinnedTime = null;
      }
      strataWasActive = strata.active;
      const hold = touchCount > 0 || scrubbing || panning || strata.active || cardList.open || searchList.open;
      orbitPace = damp(orbitPace, hold ? 0 : 1, c.holdRate, dt);
      const clockStep = dt * orbitPace;
      orbitClock += clockStep;
      // 은하가 도는 만큼 피벗도 함께 돌아 포커스한 노드·시점이 화면 가운데에 머문다
      cameraRig.rotateTargetsAroundY(galaxySpinAngle(clockStep));
      cameraRig.step(dt);
      cameraRig.applyTo(stage.camera);
      stage.camera.getWorldPosition(cameraPosition);
      // 카드가 멀어 작아지면 묶음 위에 태그 낱말이 떠오르고, 더 작아지면 카드가 사라진다
      const p11 = 1 / Math.tan((stage.camera.fov * Math.PI) / 360);
      const satelliteHeight = tuning.card.width * c.satelliteScale;
      graph.begin();
      screenLabels.begin();
      strata.measure(cameraPosition, p11, screenLabels);
      // 카드 공간 머리 아래에 맨 앞에 보이는 카드의 층 이름과 태그를 적는다
      const front = fieldOn() && field ? field.frontSlot() : -1;
      const layerNow = front >= 0 ? fieldLayerOfSlot[front] : -1;
      if (layerNow !== shownLayer) {
        shownLayer = layerNow;
        cardList.setLayer(layerNow >= 0 ? fieldLayers[layerNow] : null);
      }
      cardList.setProgress(fieldOn() && field && field.maxOffset > 0 ? field.offset / field.maxOffset : null);
      // 시점이 옮겨 간 시간 거리만큼 먼지가 나선팔을 따라 흐른다(과거로 가면 음수)
      const focusNow = controller.current.focusTime;
      const scrollS = ((focusNow - lastFocusTime) / DAY_MS) * depthPerDay(spiralState);
      lastFocusTime = focusNow;
      universe.update(orbitClock, scrollS, cameraPosition);

      const spin = g.burst.spin * orbitClock;
      const pose = focus.pose();
      approachGlow = damp(approachGlow, approach.approached ? 1 : 0, c.approach.glowRate, dt);
      /** 다가간 노드의 빛 크기 배율 */
      const glowOf = (key: string) => (key === approach.approached ? 1 + (c.approach.glowScale - 1) * approachGlow : 1);
      /** 가장 많이 펼친 카드의 펼친 정도. 그만큼 블룸을 줄인다 */
      let opened = 0;

      for (let pi = 0; pi < planets.length; pi++) {
        const planet = planets[pi];
        const { cluster, affinities, order } = planet;
        planet.fade = damp(planet.fade, 1, c.planetFadeRate, dt);
        const pos = planet.node.position;
        spiralPoint(planet.offsetS, orbitClock, planet.jitter, pos);
        const dist = pos.distanceTo(cameraPosition);

        const alpha = planet.fade * cosmosFade(dist);
        planetAlphas[pi] = alpha;
        graph.orb(pos, planet.color, planet.size, alpha);
        graph.glow(pos, planet.color, planet.glowSize * glowOf(planet.node.key), g.glowAlpha * alpha);
        // 글자 위계: 위에 태그 워드 클라우드(가장 많이 쓰인 태그가 대표, 노드 색)와 폴더 이름, 아래에 날짜 · 노트 수
        const cardHide = farCardHide(screenFraction(satelliteHeight, dist, p11));
        // 겹치면 허브 날짜 > 대표 태그·폴더 이름 > 행성 날짜 > 나머지 낱말 차례로 남는다(LABEL_PRIORITY)
        graph.label(pos, planet.label, c.planetLabelPx, alpha * 0.85, cameraPosition, {
          offsetYPx: -(orbRadiusPx + c.planetLabelPx * 0.8),
          priority: LABEL_PRIORITY.date,
          key: `${cluster.key}:date`,
        });
        if (planet.title) {
          graph.label(pos, planet.title, c.planetTitlePx, alpha, cameraPosition, {
            offsetYPx: orbRadiusPx + c.planetTitlePx * 0.75,
            color: planet.titleColor,
            style: 'title',
            priority: LABEL_PRIORITY.title,
            key: `${cluster.key}:title`,
          });
        }
        drawCloud(screenLabels, pos, planet.words, alpha * (1 - mix), cameraPosition, cluster.key, { tint: planet.color, leadPriority: LABEL_PRIORITY.title });

        facingQuaternion(pos, cameraPosition, burstQuat);
        const r = planet.radius;
        order.forEach((idx, rank) => {
          const m = cluster.members[idx];
          const affinity = affinities[idx];
          // 카드: 행성 단위별 큰 카드 수까지만 관련도 순으로 노드 둘레 궤도를 돈다. 제자리 회전 없이 늘 카메라를 바라본다
          orbitFade[m] = damp(orbitFade[m], rank < capacity ? 1 : 0, c.regroupRate, dt);
          flightOffset(flights[m], r, affinity, orbitClock, offset);
          target.copy(pos).add(offset);
          const p = orbitBlends[m].step(dt, cluster.key, target);
          const home = homes[m];
          home.position.copy(p);
          facingQuaternion(p, cameraPosition, home.quaternion);
          home.scale = c.satelliteScale;
          const card = cards[m];
          const baseFade = cosmosFade(p.distanceTo(cameraPosition)) * planet.fade * orbitFade[m] * (1 - cardHide);
          let fade = strata.blendCard(m, home, baseFade);
          if (fieldMix > 0 && field) {
            // 카드 공간: 카메라 앞 자리로 날아가고, 공간에 없는 카드는 사라진다
            const slot = fieldSlotOf[m];
            if (slot >= 0) {
              field.localPose(slot, fieldPose);
              fieldPose.position.applyQuaternion(stage.camera.quaternion).add(stage.camera.position);
              fieldPose.quaternion.premultiply(stage.camera.quaternion);
              home.position.lerp(fieldPose.position, fieldMix);
              home.quaternion.slerp(fieldPose.quaternion, fieldMix);
              home.scale += (fieldPose.scale - home.scale) * fieldMix;
              fade = fade * (1 - fieldMix) + field.fade(slot) * fieldMix;
            } else {
              fade *= 1 - fieldMix;
            }
          }
          // 지층에 눕힌 창은 흔들리지 않고, 카드 공간에서는 노트 카드처럼 다시 떠 흔들린다
          card.motion.floatScale = 1 - mix * (1 - fieldMix);
          // 지층에 깔린 창은 층별 차례로 그려 위층 판과 카드가 아래층을 덮는다. 카드 공간에서는 거리 정렬로 돌아간다
          card.layerOrder = mix > 0.5 && fieldMix < 0.5 ? strata.cardOrder(m) : 0;
          card.update(dt, time, home, card === focus.focused ? pose : null, Math.max(card.motion.focus, fade));
          opened = Math.max(opened, card.motion.focus);

          // 살: 노드에서 그 노트로 뻗는다. 카드로 도는 노트는 카드 중심을 향하되 화면에서 카드 테두리에서 멈추고,
          // 아니면 노드 둘레 원판의 점에 닿는다. 펼치는 카드는 실을 풀고 점으로 돌아간다.
          // 관련도 순으로 graph.maxSpokes 개까지만 긋는다. 나머지 양은 노드 크기와 노트 수 글자로 보인다
          if (rank >= Math.max(capacity, g.maxSpokes)) return;
          burstOffset(rank, spin, offset, affinity).applyQuaternion(burstQuat);
          target.copy(pos).add(offset);
          const dotP = dotBlends[m].step(dt, cluster.key, target);
          const tied = orbitFade[m] * (1 - card.motion.focus);
          const cardScale = card.mesh.scale.x;
          cardEdgePoint(
            pos,
            cameraPosition,
            card.mesh.position,
            card.mesh.quaternion,
            (card.layout.worldWidth * cardScale) / 2,
            (card.layout.worldHeight * cardScale) / 2,
            pinWorld,
          );
          spokeEnd.copy(dotP).lerp(pinWorld, tied);
          // 지층 보기 동안에는 창이 은하 노드에서 멀리 옮겨 가므로 실을 걷는다
          const endAlpha = alpha * cosmosFade(spokeEnd.distanceTo(cameraPosition)) * (1 - strata.mix);
          graph.spoke(pos, spokeEnd, noteColors[m], g.spokeAlpha * endAlpha);
          graph.dot(dotP, noteColors[m], g.dotSize, alpha * cosmosFade(dotP.distanceTo(cameraPosition)) * (1 - tied));
        });
      }

      // 허브: 안쪽 구면 껍질에 놓이고 자식 행성으로 부드럽게 갈라져 나가는 가지를 뻗는다. 척추는 스플라인 한 줄로 잇는다
      for (let hi = 0; hi < hubViews.length; hi++) {
        const view = hubViews[hi];
        const hp = hubPoint(view.childOffsets, orbitClock, view.node.position);
        const hubAlpha = cosmosFade(hp.distanceTo(cameraPosition));
        hubAlphas[hi] = hubAlpha;
        graph.orb(hp, view.color, g.hubSize, hubAlpha);
        graph.glow(hp, view.color, g.hubGlowSize * glowOf(view.node.key), g.glowAlpha * hubAlpha);
        graph.label(hp, view.label, g.hubLabelPx, hubAlpha, cameraPosition, {
          offsetYPx: -(orbRadiusPx + g.hubLabelPx * 0.8),
          priority: LABEL_PRIORITY.hub,
          key: view.hub.key,
        });
      }
      const drawSpine = (spineNodes: readonly { node: CosmosNode }[], alphas: readonly number[]) => {
        const n = spineNodes.length;
        if (n < 2) return;
        let idx = 0;
        for (let i = 0; i < n - 1; i++) {
          const p0 = spineNodes[Math.max(0, i - 1)].node.position;
          const p1 = spineNodes[i].node.position;
          const p2 = spineNodes[i + 1].node.position;
          const p3 = spineNodes[Math.min(n - 1, i + 2)].node.position;
          const a1 = alphas[i];
          const a2 = alphas[i + 1];
          const start = i === 0 ? 0 : 1;
          for (let s = start; s <= branchSegs; s++) {
            const t = s / branchSegs;
            catmullRomPoint(p0, p1, p2, p3, t, spinePoints[idx]);
            spineAlphas[idx] = g.branchAlpha * (a1 + (a2 - a1) * t);
            idx++;
          }
        }
        graph.branchCurve(spinePoints, spineAlphas, branchColor, idx);
      };
      if (hubViews.length > 0) {
        drawSpine(hubViews, hubAlphas);
        for (let hi = 0; hi < hubViews.length; hi++) {
          const view = hubViews[hi];
          const hp = view.node.position;
          const hubAlpha = hubAlphas[hi];
          const prev = hubViews[Math.max(0, hi - 1)].node.position;
          const next = hubViews[Math.min(hubViews.length - 1, hi + 1)].node.position;
          branchTangent.copy(next).sub(prev);
          if (branchTangent.lengthSq() > 1e-8) branchTangent.normalize();
          for (const ci of view.hub.children) {
            const child = planets[ci].node.position;
            const childAlpha = planetAlphas[ci];
            branchCubicControls(hp, branchTangent, child, branchC1, branchC2);
            for (let s = 0; s <= branchSegs; s++) {
              const t = s / branchSegs;
              cubicBezierPoint(hp, branchC1, branchC2, child, t, branchPoints[s]);
              branchAlphas[s] = g.branchAlpha * (hubAlpha + (childAlpha - hubAlpha) * t);
            }
            graph.branchCurve(branchPoints, branchAlphas, branchColor);
          }
        }
      } else {
        drawSpine(planets, planetAlphas);
      }

      // 수동 팬 중에는 궤도 중심과 가장 가까운 노드의 시각을 시점 표시·시간 띠에 반영한다
      if (pinnedTime === null && nodes.length > 0) {
        let bestTime = controller.target.focusTime;
        let bestDist = Infinity;
        for (const node of nodes) {
          const d = node.position.distanceToSquared(cameraRig.target);
          if (d < bestDist) {
            bestDist = d;
            bestTime = node.anchorTime;
          }
        }
        controller.target.focusTime = bestTime;
      }
      controller.step(dt);

      stage.bloomScale = 1 - opened;
      graph.end();
      screenLabels.end(stage.camera, dt);
      if (strata.active) {
        const info = strata.focusInfo();
        readout.setOverride(info ? (info.total > 1 ? `${info.label} · ${info.index + 1}/${info.total}층` : info.label) : null);
      } else {
        readout.setOverride(null);
      }
      readout.update();
      scrubber.update();
    },
    dispose() {
      window.removeEventListener('keydown', onHomeKey);
      window.removeEventListener('keydown', onEscapeKey, true);
      screens.dispose();
      searchList.dispose();
      actions.remove();
      stage.bloomScale = 1;
      stopFieldResize();
      cardList.dispose();
      strata.dispose();
      stopGestures();
      stopResize();
      scrubber.dispose();
      readout.dispose();
      stage.camera.position.set(0, 0, 0);
      stage.camera.rotation.set(0, 0, 0);
      stage.camera.quaternion.identity();
      stage.camera.updateMatrixWorld();
      stage.scene.remove(graph.group);
      stage.scene.remove(screenLabels.group);
      screenLabels.dispose();
      graph.dispose();
      stage.scene.remove(universe.group);
      universe.dispose();
      for (const card of cards) {
        stage.scene.remove(card.mesh);
        card.dispose();
      }
      labels.clear();
      stage.grid.visible = true;
      [fog.near, fog.far] = savedFog;
    },
  };
}
