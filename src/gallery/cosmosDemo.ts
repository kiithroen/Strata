import { Vector3, type Fog } from 'three';
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
  choosePlanetUnit,
  cosmosFade,
  facingQuaternion,
  orbitOffset,
  planetJitter,
  planetLabel,
  planetRadius,
  maxRings,
  ringCount,
  ringLayout,
  spiralPoint,
  type PlanetJitter,
} from '../widgets/cosmos/cosmosModel';
import { PlanetView, createPlanetShared } from '../widgets/cosmos/PlanetView';
import { Universe } from '../widgets/cosmos/Universe';
import { createCardLook } from '../widgets/noteCard/cardMaterial';
import { createPose } from '../widgets/noteCard/cardMotion';
import { NoteCard } from '../widgets/noteCard/NoteCard';
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

export interface CosmosDemo extends WidgetDemo {
  readonly controller: AxisController;
  readonly cards: readonly NoteCard[];
  clusters(): readonly Cluster[];
  planets(): readonly PlanetView[];
  focus(card: NoteCard | null): void;
  focusedId(): string | null;
  /** 월드 위치의 화면 좌표(CSS px). 브라우저 확인 스크립트가 탭할 자리를 구할 때 쓴다 */
  screenOf(position: Vector3): { x: number; y: number };
}

interface PlanetEntry {
  view: PlanetView;
  jitter: PlanetJitter;
}

/**
 * 우주 보기 데모: 시간 묶음은 나선팔 위의 행성, 노트는 그 둘레를 도는 위성(사진 카드)이다.
 * 행성을 탭하면 그 시점으로 한 단계 들어가고, 위성을 탭하면 펼친다.
 * 제스처 위젯이 생기기 전까지는 화면 아래 단추로 단계를 바꾸고 시간을 옮긴다.
 */
export function mountCosmosDemo(stage: Stage): CosmosDemo {
  const c = tuning.cosmos;
  stage.grid.visible = false;
  const fog = stage.scene.fog as Fog;
  const savedFog = [fog.near, fog.far];
  fog.near = c.fogNear;
  fog.far = c.fogFar;

  const look = createCardLook();
  look.uFogNear.value = c.fogNear;
  look.uFogFar.value = c.fogFar;
  const labels = new LabelCache();
  const universe = new Universe(stage.renderer.getPixelRatio());
  stage.scene.add(universe.group);
  const planetShared = createPlanetShared(labels);

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

  const controller = new AxisController({ focusTime: newest, logScale: levelLogScale('month') });
  const planets = new Map<string, PlanetEntry>();
  const blends = notes.map(() => new RegroupBlend());
  const homes = notes.map(createPose);
  let clusters: Cluster[] = [];
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
  const planetPos = new Vector3();
  const offset = new Vector3();
  const target = new Vector3();

  const focus = new CardFocus(stage, cards);
  const stopTap = listenTap(stage.renderer.domElement, (x, y) => {
    if (focus.focused) {
      focus.set(null);
      return;
    }
    const cardHit = focus.pickHit(x, y);
    const raycaster = focus.aim(x, y);
    const tappable = [...planets.values()].filter((p) => p.view.tappable).map((p) => p.view);
    // 카드에 맞았으면 카드를 고른다. 단, 보이는 행성 몸체가 카드보다 앞을 가리고 있으면 행성이다
    const bodyHit = raycaster.intersectObjects(
      tappable.map((v) => v.body),
      false,
    )[0];
    let planet: PlanetView | null = null;
    if (cardHit) {
      if (!bodyHit || cardHit.distance <= bodyHit.distance) {
        focus.set(cardHit.card);
        return;
      }
      planet = tappable.find((v) => v.body === bodyHit.object) ?? null;
    } else {
      // 카드가 없으면 행성보다 넉넉한 판정 구로 고른다(멀리 있는 작은 행성도 누르기 쉽게)
      const hit = raycaster.intersectObjects(
        tappable.map((v) => v.hit),
        false,
      )[0];
      planet = hit ? (hit.object.userData.planet as PlanetView) : null;
    }
    if (planet) {
      const key = planet.key;
      const cluster = clusters.find((cl) => cl.key === key);
      if (cluster) controller.focusOn(cluster.anchorTime, finerLevel(controller.level));
    }
  });

  const hud = createAxisHud(controller, oldest, newest);

  return {
    title: 'COSMOS',
    hint: '행성 탭: 다가가기 · 위성 탭: 펼치기',
    controller,
    cards,
    clusters: () => clusters,
    planets: () => [...planets.values()].map((p) => p.view),
    focus: (card) => focus.set(card),
    focusedId: () => focus.focused?.id ?? null,
    screenOf(position) {
      const rect = canvas.getBoundingClientRect();
      const p = position.clone().project(stage.camera);
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    },
    update(dt, time) {
      look.uTime.value = time;
      planetShared.uniforms.uTime.value = time;
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
      for (const entry of planets.values()) entry.view.fadeTarget = 0;

      const pose = focus.pose();
      clusters.forEach((cluster) => {
        let entry = planets.get(cluster.key);
        if (!entry) {
          entry = { view: new PlanetView(cluster.key, planetShared), jitter: planetJitter(cluster.key) };
          planets.set(cluster.key, entry);
          stage.scene.add(entry.view.group);
        }
        const n = cluster.members.length;
        entry.view.fadeTarget = 1;
        entry.view.setLabel(planetLabel(unit, floorTo(unit, cluster.anchorTime), n));
        const depth = depthOf(state, cluster.anchorTime);
        spiralPoint(depth, orbitClock, entry.jitter, planetPos);
        const r = planetRadius(n);
        const rings = maxRings(unit);
        const slots = ringLayout(n, rings);
        entry.view.update(dt, planetPos, r, cosmosFade(depth), cameraPosition, ringCount(slots));

        cluster.members.forEach((m, k) => {
          orbitOffset(cluster.key, r, slots[k], orbitClock, offset);
          target.copy(planetPos).add(offset);
          const p = blends[m].step(dt, cluster.key, target);
          const home = homes[m];
          home.position.copy(p);
          facingQuaternion(p, cameraPosition, home.quaternion);
          home.scale = slots[k].ring === rings ? c.overflowScale : c.satelliteScale;
          const card = cards[m];
          card.update(dt, time, home, card === focus.focused ? pose : null, cosmosFade(-p.z) * entry.view.fade);
        });
      });

      // 이번 묶음에 없는 행성은 그 자리에서 사라진다
      for (const [key, entry] of planets) {
        if (entry.view.fadeTarget !== 0) continue;
        const v = entry.view;
        v.update(dt, v.position, v.radius, cosmosFade(-v.position.z), cameraPosition, 0);
        if (v.fade < 0.002) {
          stage.scene.remove(v.group);
          v.dispose();
          planets.delete(key);
        }
      }

      hud.update();
    },
    dispose() {
      stopTap();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      hud.dispose();
      for (const entry of planets.values()) {
        stage.scene.remove(entry.view.group);
        entry.view.dispose();
      }
      planets.clear();
      planetShared.sphere.dispose();
      planetShared.circle.dispose();
      planetShared.labelGeometry.dispose();
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
