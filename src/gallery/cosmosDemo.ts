import { Color, Vector3, type Fog } from 'three';
import { tuning } from '../config';
import { DAY_MS, floorTo } from '../core/calendar';
import { damp } from '../core/motion';
import { createRng, range } from '../core/random';
import { createFakeNotes } from '../dev/fakeNotes';
import { createPlaceholderPhotos } from '../dev/placeholderPhotos';
import { listenTap } from '../input/tap';
import { LabelCache } from '../widgets/common/labelCache';
import {
  RegroupBlend,
  buildHubs,
  burstOffset,
  clusterAffinities,
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
  spiralPoint,
  swarmCapacity,
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
  depthOf,
  depthPerDay,
  finerLevel,
  levelLogScale,
  type Cluster,
} from '../widgets/timeAxis/axisModel';
import { createAxisHud } from './axisHud';
import { CardFocus } from './cardFocus';
import type { Stage, WidgetDemo } from './stage';

export interface CosmosNode {
  kind: 'planet' | 'hub';
  key: string;
  anchorTime: number;
  position: Vector3;
}

export interface CosmosDemo extends WidgetDemo {
  readonly controller: AxisController;
  readonly cards: readonly NoteCard[];
  clusters(): readonly Cluster[];
  hubs(): readonly Hub[];
  /** 지난 프레임에 그린 행성·허브 노드 */
  nodes(): readonly CosmosNode[];
  focus(card: NoteCard | null): void;
  focusedId(): string | null;
  /** 월드 위치의 화면 좌표(CSS px). 브라우저 확인 스크립트가 탭할 자리를 구할 때 쓴다 */
  screenOf(position: Vector3): { x: number; y: number };
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
 * 노드를 탭하면 그 시점으로 다가가고, 종이를 탭하면 펼친다.
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
  const universe = new Universe(stage.renderer.getPixelRatio());
  stage.scene.add(universe.group);

  const newest = new Date(2026, 10, 15, 21, 30).getTime();
  const notes = createFakeNotes(newest);
  const oldest = notes[notes.length - 1].time;
  const photos = createPlaceholderPhotos(notes.length, tuning.dev.noteSeed + 1);
  const rng = createRng(tuning.dev.noteSeed + 2);
  const cards = notes.map((note, i) => {
    const card = new NoteCard({
      face: { id: note.id, createdAt: new Date(note.time), photo: photos[i] },
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
  const syncViewport = () => {
    const el = stage.renderer.domElement;
    graph.setViewport(el.clientWidth, el.clientHeight, stage.renderer.getPixelRatio(), stage.camera.fov);
  };
  syncViewport();
  const stopResize = stage.onResize(syncViewport);

  const palette = g.hourColors.map((hex) => new Color(hex));
  const noteColors = notes.map((n) => palette[hourColorIndex(n.time)]);
  const branchColor = new Color(g.branchColor);
  const hubColor = new Color('#ffffff');

  const controller = new AxisController({ focusTime: newest, logScale: levelLogScale('month') });
  const nodeStates = new Map<string, NodeState>();
  const paperBlends = notes.map(() => new RegroupBlend());
  const dotBlends = notes.map(() => new RegroupBlend());
  const paperFade = new Float64Array(notes.length);
  const flights = notes.map((n) => flightParams(n.id));
  const pins = notes.map((n) => paperPin(n.id));
  const homes = notes.map(createPose);
  let clusters: Cluster[] = [];
  let hubs: Hub[] = [];
  let nodes: CosmosNode[] = [];
  let lastFocusTime = controller.current.focusTime;

  // 공전 시계: 손가락이 닿아 있으면 멈추고 떼면 다시 흐른다
  let orbitClock = 0;
  let orbitPace = 1;
  const touching = new Set<number>();
  const canvas = stage.renderer.domElement;
  const onDown = (e: PointerEvent) => touching.add(e.pointerId);
  const onUp = (e: PointerEvent) => touching.delete(e.pointerId);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const cameraPosition = new Vector3();
  const offset = new Vector3();
  const target = new Vector3();
  const labelPos = new Vector3();
  const pinWorld = new Vector3();
  const spokeEnd = new Vector3();

  const screenOf = (position: Vector3) => {
    const rect = canvas.getBoundingClientRect();
    const p = position.clone().project(stage.camera);
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  };

  const focus = new CardFocus(stage, cards);
  const stopTap = listenTap(canvas, (x, y) => {
    if (focus.focused) {
      focus.set(null);
      return;
    }
    // 광선이 종이에 정확히 맞으면 그 종이다
    const cardHit = focus.pickHit(x, y);
    if (cardHit) {
      focus.set(cardHit.card);
      return;
    }
    // 아니면 탭 자리에서 판정 반경 안의 가장 가까운 종이나 노드를 고른다
    const rect = canvas.getBoundingClientRect();
    const pxPerUnit = rect.height / (2 * Math.tan((stage.camera.fov * Math.PI) / 360));
    const targets: TapTarget[] = [];
    const picks: Array<{ card: NoteCard } | { node: CosmosNode }> = [];
    for (const card of cards) {
      if (!card.visible || card.mesh.material.uniforms.uFade.value < 0.3) continue;
      const depth = -card.mesh.position.z;
      if (depth < 0.5) continue;
      const half = (Math.hypot(card.layout.worldWidth, card.layout.worldHeight) / 2) * card.mesh.scale.x;
      const sp = screenOf(card.mesh.position);
      targets.push({ x: sp.x, y: sp.y, radius: Math.max(g.paperTapRadius, (half * pxPerUnit) / depth) });
      picks.push({ card });
    }
    for (const node of nodes) {
      if (node.position.z > -0.5) continue;
      const sp = screenOf(node.position);
      targets.push({ x: sp.x, y: sp.y, radius: g.tapRadius });
      picks.push({ node });
    }
    const i = pickNearest(targets, x, y);
    if (i < 0) return;
    const chosen = picks[i];
    if ('card' in chosen) {
      focus.set(chosen.card);
      return;
    }
    const node = chosen.node;
    if (node.kind === 'planet') controller.focusOn(node.anchorTime, finerLevel(controller.level));
    else controller.focusOn(node.anchorTime, controller.level);
  });

  const hud = createAxisHud(controller, oldest, newest);

  return {
    title: 'COSMOS',
    hint: '노드 탭: 다가가기 · 종이 탭: 펼치기',
    controller,
    cards,
    clusters: () => clusters,
    hubs: () => hubs,
    nodes: () => nodes,
    focus: (card) => focus.set(card),
    focusedId: () => focus.focused?.id ?? null,
    screenOf,
    update(dt, time) {
      look.uTime.value = time;
      orbitPace = damp(orbitPace, touching.size > 0 ? 0 : 1, c.holdRate, dt);
      orbitClock += dt * orbitPace;
      controller.step(dt);
      const state = controller.current;
      stage.camera.getWorldPosition(cameraPosition);

      // 시간축이 움직인 만큼 먼지를 흘려 보낸다
      const scroll = ((state.focusTime - lastFocusTime) / DAY_MS) * depthPerDay(state);
      lastFocusTime = state.focusTime;
      universe.update(orbitClock, scroll);

      const unit = choosePlanetUnit(state);
      clusters = clusterNotes(notes, unit);
      const parent = parentUnit(unit);
      hubs = buildHubs(clusters, parent);
      const capacity = swarmCapacity(unit);
      const tau = gustTime(orbitClock);
      const gustNow = gust(orbitClock);
      const spin = g.burst.spin * orbitClock;
      const pose = focus.pose();
      nodes = [];
      graph.begin();

      for (const st of nodeStates.values()) st.present = false;
      const planetPositions: Vector3[] = [];

      clusters.forEach((cluster) => {
        let st = nodeStates.get(cluster.key);
        if (!st) {
          st = { jitter: planetJitter(cluster.key), fade: 0, present: true, position: new Vector3(), color: new Color(), size: 0 };
          nodeStates.set(cluster.key, st);
        }
        st.present = true;
        st.fade = damp(st.fade, 1, c.planetFadeRate, dt);
        const n = cluster.members.length;
        const depth = depthOf(state, cluster.anchorTime);
        spiralPoint(depth, orbitClock, st.jitter, st.position);
        st.color.copy(noteColors[cluster.members[0]]);
        st.size = g.nodeSize * (1 + 0.15 * Math.sqrt(n));
        planetPositions.push(st.position);
        nodes.push({ kind: 'planet', key: cluster.key, anchorTime: cluster.anchorTime, position: st.position.clone() });

        const alpha = st.fade * cosmosFade(depth);
        graph.dot(st.position, hubColor, st.size, alpha);
        graph.glow(st.position, st.color, g.glowSize * (0.6 + 0.12 * Math.sqrt(n)), g.glowAlpha * alpha);
        labelPos.copy(st.position);
        labelPos.y -= st.size + c.planetLabelHeight * 0.9;
        graph.label(labelPos, planetLabel(unit, floorTo(unit, cluster.anchorTime), n), c.planetLabelHeight, alpha * 0.85, cameraPosition);

        const r = planetRadius(n);
        const affinities = clusterAffinities(notes, cluster.members);
        const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => affinities[b] - affinities[a]);
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
          card.update(dt, time, home, card === focus.focused ? pose : null, cosmosFade(-p.z) * st.fade * paperFade[m]);

          // 살: 노드에서 그 노트로 뻗는다. 종이로 나는 노트는 수사 보드처럼 종이에 꽂힌 압정에 실로 묶이고,
          // 아니면 노드 둘레 원판의 점에 닿는다. 펼치는 종이는 실을 풀고 점으로 돌아간다
          burstOffset(rank, spin, offset, affinity);
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
          const endAlpha = alpha * cosmosFade(-spokeEnd.z);
          graph.spoke(st.position, spokeEnd, noteColors[m], g.spokeAlpha * endAlpha);
          graph.dot(dotP, noteColors[m], g.dotSize, alpha * cosmosFade(-dotP.z) * (1 - tied));
          graph.dot(pinWorld, noteColors[m], g.pinSize * card.mesh.scale.x / c.satelliteScale, cosmosFade(-pinWorld.z) * st.fade * tied);
        });
      });

      // 허브: 안쪽 줄기에 놓이고 자식 행성으로 가지를 뻗는다. 허브끼리는 시간 순서로 잇는다
      let prevHub: Vector3 | null = null;
      for (const hub of hubs) {
        const hp = hubPoint(
          hub.children.map((ci) => -planetPositions[ci].z),
          orbitClock,
          new Vector3(),
        );
        const hubAlpha = cosmosFade(-hp.z);
        for (const ci of hub.children) {
          const childAlpha = Math.min(hubAlpha, cosmosFade(-planetPositions[ci].z));
          graph.branch(hp, planetPositions[ci], branchColor, g.branchAlpha * childAlpha);
        }
        if (prevHub) graph.branch(prevHub, hp, branchColor, g.branchAlpha * Math.min(hubAlpha, cosmosFade(-prevHub.z)));
        graph.dot(hp, hubColor, g.hubSize, hubAlpha);
        graph.glow(hp, branchColor, g.hubGlowSize, g.glowAlpha * hubAlpha);
        labelPos.copy(hp);
        labelPos.y += g.hubSize + g.hubLabelHeight * 0.6;
        graph.label(labelPos, planetLabel(parent ?? unit, hub.bucket, hub.notes), g.hubLabelHeight, hubAlpha, cameraPosition);
        nodes.push({ kind: 'hub', key: hub.key, anchorTime: hub.anchorTime, position: hp });
        prevHub = hp;
      }
      // 허브가 없으면(가장 큰 단위) 행성끼리 시간 순서로 잇는다
      if (hubs.length === 0) {
        for (let i = 1; i < planetPositions.length; i++) {
          const a = planetPositions[i - 1];
          const b = planetPositions[i];
          graph.branch(a, b, branchColor, g.branchAlpha * Math.min(cosmosFade(-a.z), cosmosFade(-b.z)));
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
        const alpha = st.fade * cosmosFade(-st.position.z);
        graph.dot(st.position, hubColor, st.size, alpha);
        graph.glow(st.position, st.color, g.glowSize * 0.6, g.glowAlpha * alpha);
      }

      graph.end();
      hud.update();
    },
    dispose() {
      stopTap();
      stopResize();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      hud.dispose();
      stage.scene.remove(graph.group);
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
