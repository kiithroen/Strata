import { Color, Quaternion, Vector3, type Fog } from 'three';
import { tuning } from '../config';
import { DAY_MS, floorTo } from '../core/calendar';
import { damp } from '../core/motion';
import { createRng, range } from '../core/random';
import { createFakeNoteData, type NoteData } from '../dev/noteData';
import { listenGestures } from '../input/gesture';
import { CameraRig } from '../widgets/camera/cameraRig';
import { drawCloud } from '../widgets/cloud/CloudView';
import { cloudVisibility, layoutCloud, screenFraction, topTags } from '../widgets/cloud/wordCloud';
import { LabelCache } from '../widgets/common/labelCache';
import { ScreenLabels } from '../widgets/common/screenLabels';
import {
  RegroupBlend,
  branchCubicControls,
  buildHubs,
  bucketLabel,
  burstOffset,
  catmullRomPoint,
  clusterAffinities,
  cubicBezierPoint,
  facingQuaternion,
  hubPoint,
  pickNearest,
  choosePlanetUnit,
  cosmosFade,
  flightOffset,
  flightParams,
  flightQuaternion,
  gust,
  gustTime,
  hourColorIndex,
  nodeColor,
  parentUnit,
  planetJitter,
  planetLabel,
  planetRadius,
  galaxySpinAngle,
  spiralPoint,
  swarmCapacity,
  timeOffsetDepth,
  type Hub,
  type PlanetJitter,
  type TapTarget,
} from '../widgets/cosmos/cosmosModel';
import { GraphView } from '../widgets/cosmos/GraphView';
import { TapApproach, approachDistance } from '../widgets/cosmos/tapApproach';
import { Universe } from '../widgets/cosmos/Universe';
import { createCardLook } from '../widgets/noteCard/cardMaterial';
import { CardField } from '../widgets/noteCard/cardField';
import { createPose } from '../widgets/noteCard/cardMotion';
import { NoteCard } from '../widgets/noteCard/NoteCard';
import { bendHeight } from '../widgets/noteCard/paperBend';
import { pinPoint } from '../widgets/noteCard/paperPin';
import {
  AxisController,
  clusterNotes,
  depthPerDay,
  levelLogScale,
  type AxisState,
  type Cluster,
} from '../widgets/timeAxis/axisModel';
import { createTimeReadout } from './timeReadout';
import { createTimeScrubber } from './timeScrubber';
import { CardFocus } from './cardFocus';
import { CardListMode } from './cardListMode';
import { buildCardSections } from '../widgets/cardList/cardListModel';
import type { CardViewMode } from '../widgets/cardList/CardListView';
import { StrataMode } from './strataMode';
import type { StrataLayerInput } from '../widgets/strata/strataLayout';
import type { Stage, WidgetDemo } from './stage';

export interface CosmosNode {
  kind: 'planet' | 'hub';
  key: string;
  anchorTime: number;
  position: Vector3;
}

export interface CosmosDemo extends WidgetDemo {
  readonly controller: AxisController;
  readonly cameraRig: CameraRig;
  readonly cards: readonly NoteCard[];
  clusters(): readonly Cluster[];
  hubs(): readonly Hub[];
  /** 지난 프레임에 그린 행성·허브 노드 */
  nodes(): readonly CosmosNode[];
  focus(card: NoteCard | null): void;
  focusedId(): string | null;
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
 * 노트 몇 장은 노드 둘레를 돌풍에 날리는 종이로 날아다닌다.
 * 은하에서 노드나 종이를 처음 탭하면 그 노드로 다가가고(종이는 그 행성), 다가간 노드를 한 번 더 탭하면
 * 그 묶음이 속한 위 묶음을 지층 보기로 펼친다(strataMode.ts). 종이는 지층 보기에서 탭해야 펼친다.
 */
/** 가짜 노트의 가장 최근 시각 */
const FAKE_NEWEST = new Date(2026, 10, 15, 21, 30).getTime();

/** data 를 넘기면 그 노트로 띄운다(실데이터 임시 주입). 비었거나 없으면 가짜 노트다 */
export function mountCosmosDemo(stage: Stage, data?: NoteData): CosmosDemo {
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
  look.uShade.value = c.paperShade;
  look.uBend.value = 1;
  const labels = new LabelCache();
  const universe = new Universe(stage.renderer);
  stage.scene.add(universe.group);

  const { notes, photos } = data && data.notes.length > 0 ? data : createFakeNoteData(FAKE_NEWEST);
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
      },
      float: { phase: range(rng, 0, Math.PI * 2), period: range(rng, tuning.float.periodMin, tuning.float.periodMax) },
      look,
      labels,
      anisotropy: stage.anisotropy,
    });
    stage.scene.add(card.mesh);
    return card;
  });

  const graph = new GraphView(labels, notes.length * 3, notes.length * 3);
  stage.scene.add(graph.group);
  /** 태그 워드 클라우드 글자. 지층 보기에서도 은하처럼 옅어지지 않게 그래프와 따로 둔다 */
  const cloudLabels = new ScreenLabels(labels);
  stage.scene.add(cloudLabels.group);
  const syncViewport = () => {
    const el = stage.renderer.domElement;
    graph.setViewport(el.clientWidth, el.clientHeight, stage.renderer.getPixelRatio(), stage.camera.fov);
    cloudLabels.setViewport(el.clientHeight, stage.camera.fov);
  };
  syncViewport();
  const stopResize = stage.onResize(syncViewport);

  const palette = g.hourColors.map((hex) => new Color(hex));
  const noteColors = notes.map((n) => palette[hourColorIndex(n.time)]);
  const branchColor = new Color(g.branchColor);
  const hubColor = new Color(g.hubColor);

  /** 3차원 구면 나선의 기준 시계열 공간(줌·이동 중에도 노드 배치와 묶음이 흔들리지 않도록 고정한다) */
  const spiralState: AxisState = { focusTime: newest, logScale: levelLogScale('month') };
  const controller = new AxisController({ focusTime: newest, logScale: spiralState.logScale });
  const paperBlends = notes.map(() => new RegroupBlend());
  const dotBlends = notes.map(() => new RegroupBlend());
  const paperFade = new Float64Array(notes.length);
  const flights = notes.map((n) => flightParams(n.id));
  const homes = notes.map(createPose);

  // 시계열 공간이 고정돼 있어 묶음·허브·관련도·글자는 한 번만 구하고, 노드 위치 벡터도 재사용한다
  const unit = choosePlanetUnit(spiralState);
  const parent = parentUnit(unit);
  const capacity = swarmCapacity(unit);
  const clusters: Cluster[] = clusterNotes(notes, unit);
  const hubs: Hub[] = buildHubs(clusters, parent);
  const planets = clusters.map((cluster) => {
    const n = cluster.members.length;
    const affinities = clusterAffinities(notes, cluster.members, unit);
    const color = nodeColor(cluster.key);
    return {
      cluster,
      offsetS: timeOffsetDepth(spiralState, cluster.anchorTime),
      jitter: planetJitter(cluster.key),
      fade: 0,
      color,
      coreColor: color.clone().lerp(hubColor, g.nodeColor.coreMix),
      radius: planetRadius(n),
      size: g.nodeSize * (1 + 0.15 * Math.sqrt(n)),
      glowSize: g.glowSize * (0.6 + 0.12 * Math.sqrt(n)),
      label: planetLabel(unit, floorTo(unit, cluster.anchorTime), n),
      /** 2D 카드 목록의 묶음 머리 글자(장수는 목록이 따로 붙인다) */
      date: bucketLabel(unit, floorTo(unit, cluster.anchorTime)),
      /** 멀리서 보이는 태그 워드 클라우드 */
      words: layoutCloud(topTags(cluster.members.map((m) => notes[m].tags), tuning.cloud.maxWords)),
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
      coreColor: color.clone().lerp(hubColor, g.nodeColor.coreMix),
      label: planetLabel(parent ?? unit, hub.bucket, hub.notes),
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
  const cardList = new CardListMode(
    '← 지층으로',
    () => focus.set(null),
    () => focus.set(null),
  );
  let field: CardField | null = null;
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
  /** 목록은 층별로 펼치고 바라보는 층을 맨 위에 둔다 */
  const openCardList = () => {
    if (!strata.active) return;
    focus.set(null);
    const groups = strata.groups().map((g) => ({ ...g, label: planetByKey.get(g.key)?.date ?? g.label }));
    const members = groups.flatMap((g) => g.members).sort((a, b) => notes[b].time - notes[a].time);
    field = buildField(members.length);
    fieldSlotOf.fill(-1);
    members.forEach((m, i) => (fieldSlotOf[m] = i));
    cardList.show(buildCardSections(groups, notes, photos), strata.focusKey ?? undefined);
  };
  const strata = new StrataMode(stage, cameraRig, labels, {
    onEscape: () => {
      if (focus.focused) {
        focus.set(null);
        return true;
      }
      if (cardList.open) {
        cardList.close();
        return true;
      }
      return false;
    },
    onLeave: () => {
      cardList.dismiss();
      focus.set(null);
    },
    onCards: () => openCardList(),
  });
  let strataWasActive = false;

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
      if (count > 0) cameraRig.cancelInertia();
    },
    // 카드 공간 보기에서는 카메라가 멈추고, 세로 끌기·핀치·휠이 카드 사이를 앞뒤로 날게 한다
    onDragStart: () => {
      if (focus.focused || fieldOn()) return;
      cameraRig.onDragStart();
    },
    onDragMove: (e) => {
      if (focus.focused) return;
      if (fieldOn()) field?.dolly(-e.dy * tuning.cardField.dollyPerPx);
      else cameraRig.onDragMove(e.dx, e.dy);
    },
    onDragEnd: (e) => {
      if (focus.focused || fieldOn()) return;
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
        field?.dolly(e.deltaY * tuning.cardField.wheelDolly);
        return;
      }
      cameraRig.zoomByFactor(Math.exp((e.deltaY / 100) * tuning.gesture.wheelZoomSpeed));
    },
    onTap: ({ x, y }) => {
      if (focus.focused) {
        focus.set(null);
        return;
      }
      // 카드 공간 보기에서는 공간의 카드만 펼친다
      if (fieldOn()) {
        const hit = focus.pickHit(x, y, (card) => fieldSlotOf[cardIndex.get(card) ?? -1] >= 0);
        if (hit) focus.set(hit.card);
        return;
      }
      // 광선이 종이에 정확히 맞으면 그 종이다. 지층 보기에서는 현재 지층 카드만 펼치고, 은하에서는 그 종이의 행성을 탭한 것으로 친다
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
      // 지층 보기에서 카드를 빗나간 탭은 빈 곳 층 판 선택으로만 넘긴다(종이 여유 반경이 층 전환을 가로채지 않게)
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
      // 은하에서는 탭 자리에서 판정 반경 안의 가장 가까운 종이나 노드를 고른다
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
        targets.push({ x: sp.x, y: sp.y, radius: Math.max(g.paperTapRadius, (half * pxPerUnit) / depth) });
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

  const readout = createTimeReadout(controller);
  const scrubber = createTimeScrubber({
    controller,
    minTime: oldest,
    maxTime: newest,
    noteTimes: notes.map((n) => n.time),
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

  return {
    title: 'COSMOS',
    hint: '끌기: 회전 · 핀치/휠: 줌 · 우클릭/두손가락: 이동 · 탭: 노드/종이',
    controller,
    cameraRig,
    cards,
    clusters: () => clusters,
    hubs: () => hubs,
    nodes: () => nodes,
    focus: (card) => focus.set(card),
    focusedId: () => focus.focused?.id ?? null,
    screenOf,
    tapNode,
    approachedKey: () => approach.approached,
    enterStrata,
    exitStrata: () => strata.exit(),
    pickStrataLayer: (x, y) => strata.pickLayer(x, y),
    openCardList,
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
      look.uTime.value = time;
      // 지층 원판은 손가락이 닿아 있거나 카드를 펼쳤거나 카드 보기를 열면 멈춘다
      strata.spinning = touchCount === 0 && !focus.focused && !cardList.open;
      // 지층 보기 동안에는 은하가 멈춰 있어 돌아왔을 때 보던 자리 그대로다
      strata.update(dt);
      const mix = strata.mix;
      fieldMix = damp(fieldMix, fieldOn() ? 1 : 0, tuning.strata.transitionRate, dt);
      if (!fieldOn() && fieldMix < 0.002) fieldMix = 0;
      field?.step(dt);
      // 카드 공간 보기 동안에는 층 판·층 낱말·은하 그래프를 걷고 별 배경만 남긴다
      strata.veil = 1 - fieldMix;
      graph.alphaScale = (1 - mix * (1 - tuning.strata.galaxyDim)) * (1 - fieldMix);
      // 지층에 눕힌 창은 종이 휨과 떠 있는 흔들림 없이 판 위에 가만히 놓인다
      look.uBend.value = 1 - mix;
      if (strata.active) {
        pinnedTime = strata.focusTime;
        if (pinnedTime !== null) controller.target.focusTime = pinnedTime;
      } else if (strataWasActive) {
        // 은하로 돌아오면 다시 궤도 중심과 가장 가까운 노드의 시각을 따른다
        pinnedTime = null;
      }
      strataWasActive = strata.active;
      orbitPace = damp(orbitPace, touchCount > 0 || scrubbing || panning || strata.active ? 0 : 1, c.holdRate, dt);
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
      cloudLabels.begin();
      strata.measure(cameraPosition, p11, cloudLabels);
      // 시점이 옮겨 간 시간 거리만큼 먼지가 나선팔을 따라 흐른다(과거로 가면 음수)
      const focusNow = controller.current.focusTime;
      const scrollS = ((focusNow - lastFocusTime) / DAY_MS) * depthPerDay(spiralState);
      lastFocusTime = focusNow;
      universe.update(orbitClock, scrollS, cameraPosition);

      const tau = gustTime(orbitClock);
      const gustNow = gust(orbitClock);
      const spin = g.burst.spin * orbitClock;
      const pose = focus.pose();
      approachGlow = damp(approachGlow, approach.approached ? 1 : 0, c.approach.glowRate, dt);
      /** 다가간 노드의 빛 크기 배율 */
      const glowOf = (key: string) => (key === approach.approached ? 1 + (c.approach.glowScale - 1) * approachGlow : 1);
      graph.begin();
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
        graph.dot(pos, planet.coreColor, planet.size, alpha);
        graph.glow(pos, planet.color, planet.glowSize * glowOf(planet.node.key), g.glowAlpha * alpha);
        graph.label(pos, planet.label, c.planetLabelPx, alpha * 0.85, cameraPosition, -c.planetLabelPx * 1.2);
        const far = cloudVisibility(screenFraction(satelliteHeight, dist, p11));
        drawCloud(cloudLabels, pos, planet.words, far.words * alpha * (1 - mix), cameraPosition);

        facingQuaternion(pos, cameraPosition, burstQuat);
        const r = planet.radius;
        order.forEach((idx, rank) => {
          const m = cluster.members[idx];
          const affinity = affinities[idx];
          // 종이: 행성 단위별 큰 카드 수까지만 관련도 순으로 날린다
          paperFade[m] = damp(paperFade[m], rank < capacity ? 1 : 0, c.regroupRate, dt);
          flightOffset(flights[m], r, affinity, tau, gustNow, offset);
          target.copy(pos).add(offset);
          const p = paperBlends[m].step(dt, cluster.key, target);
          const home = homes[m];
          home.position.copy(p);
          flightQuaternion(flights[m], tau, offset, home.quaternion);
          home.scale = c.satelliteScale;
          const card = cards[m];
          const baseFade = cosmosFade(p.distanceTo(cameraPosition)) * planet.fade * paperFade[m] * (1 - far.cards);
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

          // 살: 노드에서 그 노트로 뻗는다. 종이로 나는 노트는 카드 중심 뒷면에 이어져 그래프 간선처럼 보이고,
          // 아니면 노드 둘레 원판의 점에 닿는다. 펼치는 종이는 실을 풀고 점으로 돌아간다
          burstOffset(rank, spin, offset, affinity).applyQuaternion(burstQuat);
          target.copy(pos).add(offset);
          const dotP = dotBlends[m].step(dt, cluster.key, target);
          const tied = paperFade[m] * (1 - card.motion.focus);
          const bent = bendHeight(0, 0, time, card.bendPhase) * look.uBend.value * (1 - card.motion.focus);
          pinPoint(
            card.mesh.position,
            card.mesh.quaternion,
            card.mesh.scale.x,
            card.layout.worldWidth,
            bent - tuning.card.pin.lift,
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
        graph.dot(hp, view.coreColor, g.hubSize, hubAlpha);
        graph.glow(hp, view.color, g.hubGlowSize * glowOf(view.node.key), g.glowAlpha * hubAlpha);
        graph.label(hp, view.label, g.hubLabelPx, hubAlpha, cameraPosition, g.hubLabelPx * 1.1);
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
        graph.branchCurve(spinePoints.slice(0, idx), spineAlphas.slice(0, idx), branchColor);
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
      cloudLabels.end();
      readout.update();
      scrubber.update();
    },
    dispose() {
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
      stage.scene.remove(cloudLabels.group);
      cloudLabels.dispose();
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
