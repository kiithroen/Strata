import { Color, Quaternion, Vector3, type Fog } from 'three';
import { tuning } from '../config';
import { DAY_MS, floorTo } from '../core/calendar';
import { damp } from '../core/motion';
import { createRng, range } from '../core/random';
import { createFakeNotes } from '../dev/fakeNotes';
import { createPlaceholderPhotos } from '../dev/placeholderPhotos';
import { listenGestures } from '../input/gesture';
import { CameraRig } from '../widgets/camera/cameraRig';
import { drawCloud } from '../widgets/cloud/CloudView';
import { cloudVisibility, layoutCloud, screenFraction, topTags } from '../widgets/cloud/wordCloud';
import { LabelCache } from '../widgets/common/labelCache';
import { ScreenLabels } from '../widgets/common/screenLabels';
import {
  RegroupBlend,
  buildHubs,
  burstOffset,
  clusterAffinities,
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
  parentUnit,
  planetJitter,
  planetLabel,
  planetRadius,
  galaxySpinAngle,
  spiralPoint,
  swarmCapacity,
  timeOffsetDepth,
  type Hub,
  type TapTarget,
  type PlanetJitter,
} from '../widgets/cosmos/cosmosModel';
import { GraphView } from '../widgets/cosmos/GraphView';
import { Universe } from '../widgets/cosmos/Universe';
import { createCardLook } from '../widgets/noteCard/cardMaterial';
import { createPose } from '../widgets/noteCard/cardMotion';
import { NoteCard } from '../widgets/noteCard/NoteCard';
import { bendHeight } from '../widgets/noteCard/paperBend';
import { paperPin, pinPoint } from '../widgets/noteCard/paperPin';
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
  /** 노드가 속한 위 묶음을 지층 보기로 펼친다 */
  enterStrata(node: CosmosNode): void;
  exitStrata(): void;
  /** 지층 보기 상태: 들어간 정도, 층 수, 바라보는 층 */
  strataState(): { active: boolean; mix: number; layers: number; focus: number };
  /** 화면 좌표(CSS px)에서 처음 닿는 층 판 번호. 없으면 -1 */
  pickStrataLayer(x: number, y: number): number;
}

/** 행성 노드가 나타나고 사라지는 상태. 묶음에서 빠진 노드는 마지막 자리에서 옅어진다 */
interface NodeState {
  jitter: PlanetJitter;
  fade: number;
  present: boolean;
  position: Vector3;
  color: Color;
  size: number;
}

/**
 * 우주 보기 데모. 시간 묶음은 나선팔 위의 빛나는 노드이고, 노드에서 노트 점이 방사형 선으로 뻗는다.
 * 노드는 한 단계 위 묶음의 허브에 가지로 이어지고 허브끼리는 시간 순서로 이어진다.
 * 노트 몇 장은 노드 둘레를 돌풍에 날리는 종이로 날아다닌다.
 * 은하에서는 노드든 종이든 탭하면 그 묶음이 속한 위 묶음을 지층 보기로 펼친다(strataMode.ts). 종이는 지층 보기에서 탭해야 펼친다.
 */
export function mountCosmosDemo(stage: Stage): CosmosDemo {
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

  const newest = new Date(2026, 10, 15, 21, 30).getTime();
  const notes = createFakeNotes(newest);
  const oldest = notes[notes.length - 1].time;
  const photos = createPlaceholderPhotos(notes.length, tuning.dev.noteSeed + 1);
  const rng = createRng(tuning.dev.noteSeed + 2);
  const cards = notes.map((note, i) => {
    const card = new NoteCard({
      face: {
        id: note.id,
        createdAt: new Date(note.time),
        kind: note.kind,
        photo: note.kind === 'photo' || !note.kind ? photos[i] : undefined,
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
  const nodeStates = new Map<string, NodeState>();
  const paperBlends = notes.map(() => new RegroupBlend());
  const dotBlends = notes.map(() => new RegroupBlend());
  const paperFade = new Float64Array(notes.length);
  const flights = notes.map((n) => flightParams(n.id));
  const pins = cards.map((card) => paperPin(card.layout));
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
    return {
      cluster,
      offsetS: timeOffsetDepth(spiralState, cluster.anchorTime),
      radius: planetRadius(n),
      size: g.nodeSize * (1 + 0.15 * Math.sqrt(n)),
      glowSize: g.glowSize * (0.6 + 0.12 * Math.sqrt(n)),
      label: planetLabel(unit, floorTo(unit, cluster.anchorTime), n),
      /** 멀리서 보이는 태그 워드 클라우드 */
      words: layoutCloud(topTags(cluster.members.map((m) => notes[m].tags), tuning.cloud.maxWords)),
      affinities,
      /** 관련도 높은 순서의 묶음 안 번호 */
      order: Array.from({ length: n }, (_, i) => i).sort((a, b) => affinities[b] - affinities[a]),
      node: { kind: 'planet', key: cluster.key, anchorTime: cluster.anchorTime, position: new Vector3() } as CosmosNode,
    };
  });
  const hubViews = hubs.map((hub) => ({
    hub,
    childOffsets: hub.children.map((ci) => planets[ci].offsetS),
    label: planetLabel(parent ?? unit, hub.bucket, hub.notes),
    node: { kind: 'hub', key: hub.key, anchorTime: hub.anchorTime, position: new Vector3() } as CosmosNode,
  }));
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

  const strata = new StrataMode(stage, cameraRig, labels);
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

  /** 노트가 속한 행성 번호 */
  const planetOfNote = new Int32Array(notes.length).fill(-1);
  planets.forEach((p, pi) => {
    for (const m of p.cluster.members) planetOfNote[m] = pi;
  });
  const enterStrataOfCard = (card: NoteCard) => {
    const pi = planetOfNote[cards.indexOf(card)];
    if (pi >= 0) enterStrata(planets[pi].node);
  };

  const stopGestures = listenGestures(canvas, {
    onTouchCountChange: (count) => {
      touchCount = count;
      if (count > 0) cameraRig.cancelInertia();
    },
    onDragStart: () => {
      if (focus.focused) return;
      cameraRig.onDragStart();
    },
    onDragMove: (e) => {
      if (focus.focused) return;
      cameraRig.onDragMove(e.dx, e.dy);
    },
    onDragEnd: (e) => {
      if (focus.focused) return;
      cameraRig.onDragEnd(e.vx, e.vy);
    },
    onPanStart: () => {
      if (focus.focused) return;
      panning = true;
      pinnedTime = null;
      cameraRig.cancelInertia();
    },
    onPanMove: (e) => {
      if (focus.focused) return;
      cameraRig.pan(e.dx, e.dy);
    },
    onPanEnd: () => {
      panning = false;
    },
    onPinchStart: (e) => {
      if (focus.focused) return;
      pinnedTime = null;
      lastPinchX = e.x;
      lastPinchY = e.y;
    },
    onPinchMove: (e) => {
      if (focus.focused) return;
      cameraRig.zoomByFactor(Math.pow(1 / e.ratio, tuning.gesture.pinchZoomScale));
      cameraRig.pan(e.x - lastPinchX, e.y - lastPinchY);
      lastPinchX = e.x;
      lastPinchY = e.y;
    },
    onWheel: (e) => {
      if (focus.focused) return;
      cameraRig.zoomByFactor(Math.exp((e.deltaY / 100) * tuning.gesture.wheelZoomSpeed));
    },
    onTap: ({ x, y }) => {
      if (focus.focused) {
        focus.set(null);
        return;
      }
      // 광선이 종이에 정확히 맞으면 그 종이다. 은하에서는 펼치지 않고 그 종이의 묶음으로 지층 보기에 들어간다
      const cardHit = focus.pickHit(x, y);
      if (cardHit) {
        if (strata.active) focus.set(cardHit.card);
        else enterStrataOfCard(cardHit.card);
        return;
      }
      // 아니면 탭 자리에서 판정 반경 안의 가장 가까운 종이나 노드를 고른다. 지층 보기에서는 노드를 고르지 않는다
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
      for (const node of strata.active ? [] : nodes) {
        if (cameraDepth(node.position) < c.nearDepth) continue;
        if (cosmosFade(node.position.distanceTo(cameraPosition)) <= 0.05) continue;
        const sp = screenOf(node.position);
        targets.push({ x: sp.x, y: sp.y, radius: g.tapRadius });
        picks.push({ node });
      }
      const i = pickNearest(targets, x, y);
      if (i < 0) {
        // 지층 보기에서 빈 곳을 탭하면 그 자리의 층을 바라본다
        if (strata.active) {
          const li = strata.pickLayer(x, y);
          if (li >= 0) {
            strata.focusLayer(li);
            pinnedTime = strata.focusTime;
          }
        }
        return;
      }
      const chosen = picks[i];
      if ('card' in chosen) {
        if (strata.active) focus.set(chosen.card);
        else enterStrataOfCard(chosen.card);
        return;
      }
      enterStrata(chosen.node);
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
    enterStrata,
    exitStrata: () => strata.exit(),
    pickStrataLayer: (x, y) => strata.pickLayer(x, y),
    strataState: () => ({ active: strata.active, mix: strata.mix, layers: strata.layerCount, focus: strata.focusIndex }),
    update(dt, time) {
      look.uTime.value = time;
      // 지층 보기 동안에는 은하가 멈춰 있어 돌아왔을 때 보던 자리 그대로다
      strata.update(dt);
      const mix = strata.mix;
      graph.alphaScale = 1 - mix * (1 - tuning.strata.galaxyDim);
      look.uBend.value = 1 - mix * (1 - tuning.strata.bend);
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
      graph.begin();

      for (const st of nodeStates.values()) st.present = false;

      for (const planet of planets) {
        const { cluster, affinities, order } = planet;
        let st = nodeStates.get(cluster.key);
        if (!st) {
          st = { jitter: planetJitter(cluster.key), fade: 0, present: true, position: new Vector3(), color: new Color(), size: 0 };
          nodeStates.set(cluster.key, st);
        }
        st.present = true;
        st.fade = damp(st.fade, 1, c.planetFadeRate, dt);
        spiralPoint(planet.offsetS, orbitClock, st.jitter, st.position);
        planet.node.position.copy(st.position);
        const dist = st.position.distanceTo(cameraPosition);
        st.color.copy(noteColors[cluster.members[0]]);
        st.size = planet.size;

        const alpha = st.fade * cosmosFade(dist);
        graph.dot(st.position, hubColor, st.size, alpha);
        graph.glow(st.position, st.color, planet.glowSize, g.glowAlpha * alpha);
        graph.label(st.position, planet.label, c.planetLabelPx, alpha * 0.85, cameraPosition, -c.planetLabelPx * 1.2);
        const far = cloudVisibility(screenFraction(satelliteHeight, dist, p11));
        drawCloud(cloudLabels, st.position, planet.words, far.words * alpha * (1 - mix), cameraPosition);

        facingQuaternion(st.position, cameraPosition, burstQuat);
        const r = planet.radius;
        order.forEach((idx, rank) => {
          const m = cluster.members[idx];
          const affinity = affinities[idx];
          // 종이: 행성 단위별 큰 카드 수까지만 관련도 순으로 날린다
          paperFade[m] = damp(paperFade[m], rank < capacity ? 1 : 0, c.regroupRate, dt);
          flightOffset(flights[m], r, affinity, tau, gustNow, offset);
          target.copy(st.position).add(offset);
          const p = paperBlends[m].step(dt, cluster.key, target);
          const home = homes[m];
          home.position.copy(p);
          flightQuaternion(flights[m], tau, offset, home.quaternion);
          home.scale = c.satelliteScale;
          const card = cards[m];
          const baseFade = cosmosFade(p.distanceTo(cameraPosition)) * st.fade * paperFade[m] * (1 - far.cards);
          const fade = strata.blendCard(m, home, baseFade);
          card.update(dt, time, home, card === focus.focused ? pose : null, Math.max(card.motion.focus, fade));

          // 살: 노드에서 그 노트로 뻗는다. 종이로 나는 노트는 창 제목 줄의 고리에 실로 묶이고,
          // 아니면 노드 둘레 원판의 점에 닿는다. 펼치는 종이는 실을 풀고 점으로 돌아간다
          burstOffset(rank, spin, offset, affinity).applyQuaternion(burstQuat);
          target.copy(st.position).add(offset);
          const dotP = dotBlends[m].step(dt, cluster.key, target);
          const tied = paperFade[m] * (1 - card.motion.focus);
          const pin = pins[m];
          const bent = bendHeight(pin.u, pin.v, time, card.bendPhase) * look.uBend.value * (1 - card.motion.focus);
          pinPoint(
            card.mesh.position,
            card.mesh.quaternion,
            card.mesh.scale.x,
            card.layout.worldWidth,
            card.layout.worldHeight,
            pin,
            bent + tuning.card.pin.lift,
            pinWorld,
          );
          spokeEnd.copy(dotP).lerp(pinWorld, tied);
          // 지층 보기 동안에는 창이 은하 노드에서 멀리 옮겨 가므로 실을 걷는다
          const endAlpha = alpha * cosmosFade(spokeEnd.distanceTo(cameraPosition)) * (1 - strata.mix);
          graph.spoke(st.position, spokeEnd, noteColors[m], g.spokeAlpha * endAlpha);
          graph.dot(dotP, noteColors[m], g.dotSize, alpha * cosmosFade(dotP.distanceTo(cameraPosition)) * (1 - tied));
          graph.dot(
            pinWorld,
            noteColors[m],
            (g.pinSize * card.mesh.scale.x) / c.satelliteScale,
            cosmosFade(pinWorld.distanceTo(cameraPosition)) * st.fade * tied * (1 - strata.mix),
          );
        });
      }

      // 허브: 안쪽 구면 껍질에 놓이고 자식 행성으로 가지를 뻗는다. 허브끼리는 시간 순서로 잇는다
      let prevHub: Vector3 | null = null;
      for (const view of hubViews) {
        const { hub } = view;
        const hp = hubPoint(view.childOffsets, orbitClock, view.node.position);
        const hubAlpha = cosmosFade(hp.distanceTo(cameraPosition));
        for (const ci of hub.children) {
          const child = planets[ci].node.position;
          const childAlpha = Math.min(hubAlpha, cosmosFade(child.distanceTo(cameraPosition)));
          graph.branch(hp, child, branchColor, g.branchAlpha * childAlpha);
        }
        if (prevHub) {
          graph.branch(prevHub, hp, branchColor, g.branchAlpha * Math.min(hubAlpha, cosmosFade(prevHub.distanceTo(cameraPosition))));
        }
        graph.dot(hp, hubColor, g.hubSize, hubAlpha);
        graph.glow(hp, branchColor, g.hubGlowSize, g.glowAlpha * hubAlpha);
        graph.label(hp, view.label, g.hubLabelPx, hubAlpha, cameraPosition, g.hubLabelPx * 1.1);
        prevHub = hp;
      }
      // 허브가 없으면(가장 큰 단위) 행성끼리 시간 순서로 잇는다
      if (hubs.length === 0) {
        for (let i = 1; i < planets.length; i++) {
          const a = planets[i - 1].node.position;
          const b = planets[i].node.position;
          const linkAlpha = Math.min(cosmosFade(a.distanceTo(cameraPosition)), cosmosFade(b.distanceTo(cameraPosition)));
          graph.branch(a, b, branchColor, g.branchAlpha * linkAlpha);
        }
      }

      // 묶음에서 빠진 노드는 마지막 자리에서 옅어진다
      for (const [key, st] of nodeStates) {
        if (st.present) continue;
        st.fade = damp(st.fade, 0, c.planetFadeRate, dt);
        if (st.fade < 0.002) {
          nodeStates.delete(key);
          continue;
        }
        const alpha = st.fade * cosmosFade(st.position.distanceTo(cameraPosition));
        graph.dot(st.position, hubColor, st.size, alpha);
        graph.glow(st.position, st.color, g.glowSize * 0.6, g.glowAlpha * alpha);
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

      graph.end();
      cloudLabels.end();
      readout.update();
      scrubber.update();
    },
    dispose() {
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
