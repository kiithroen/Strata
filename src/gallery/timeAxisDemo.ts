import type { Fog } from 'three';
import { tuning } from '../config';
import { createRng, range } from '../core/random';
import { createFakeNotes } from '../dev/fakeNotes';
import { createPlaceholderPhotos } from '../dev/placeholderPhotos';
import { listenTap } from '../input/tap';
import { LabelCache } from '../widgets/common/labelCache';
import { createCardLook } from '../widgets/noteCard/cardMaterial';
import { createPose } from '../widgets/noteCard/cardMotion';
import { NoteCard } from '../widgets/noteCard/NoteCard';
import {
  AxisController,
  chooseClusterUnit,
  clusterNotes,
  depthOf,
  finerLevel,
  generateTicks,
  levelLogScale,
  type Cluster,
} from '../widgets/timeAxis/axisModel';
import { AxisView } from '../widgets/timeAxis/AxisView';
import {
  createPlacement,
  depthFade,
  laneSpot,
  placementPose,
  placementTargets,
  stepPlacement,
} from '../widgets/timeAxis/placement';
import { createAxisHud } from './axisHud';
import { CardFocus } from './cardFocus';
import type { Stage, WidgetDemo } from './stage';

export interface TimeAxisDemo extends WidgetDemo {
  readonly controller: AxisController;
  readonly cards: readonly NoteCard[];
  clusters(): readonly Cluster[];
  focus(card: NoteCard | null): void;
  focusedId(): string | null;
}

/**
 * 시간축 위젯 데모: 가짜 사진 노트를 시간축 위에 놓는다.
 * 제스처 위젯이 생기기 전까지는 화면 아래 단추로 단계를 바꾸고 시간을 옮긴다.
 * 묶음을 탭하면 그 시점으로 한 단계 들어가고, 낱장을 탭하면 펼친다.
 */
export function mountTimeAxisDemo(stage: Stage): TimeAxisDemo {
  stage.grid.visible = false;
  const fog = stage.scene.fog as Fog;
  const savedFog = [fog.near, fog.far];
  fog.near = tuning.axis.fogNear;
  fog.far = tuning.axis.fogFar;
  const look = createCardLook();
  look.uFogNear.value = tuning.axis.fogNear;
  look.uFogFar.value = tuning.axis.fogFar;
  const labels = new LabelCache();
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

  const controller = new AxisController({ focusTime: newest, logScale: levelLogScale('month') });
  const view = new AxisView(labels);
  stage.scene.add(view.group);

  // 고리 자리는 화면비에 따라 바뀐다. 오래된 노트부터 센 순번으로 정한다
  let spots = notes.map((_, i) => laneSpot(notes.length - 1 - i, stage.camera.aspect, stage.camera.fov));
  const stopResize = stage.onResize(() => {
    spots = notes.map((_, i) => laneSpot(notes.length - 1 - i, stage.camera.aspect, stage.camera.fov));
  });

  const targets = notes.map(createPlacement);
  const current = notes.map(createPlacement);
  const homes = notes.map(createPose);
  let clusters: Cluster[] = [];
  const clusterOf = new Int32Array(notes.length);

  const regroup = () => {
    clusters = clusterNotes(notes, chooseClusterUnit(controller.current));
    clusters.forEach((c, ci) => {
      for (const m of c.members) clusterOf[m] = ci;
    });
    placementTargets(clusters, spots, targets);
  };
  regroup();
  targets.forEach((t, i) => Object.assign(current[i], t));

  const focus = new CardFocus(stage, cards);
  const stopTap = listenTap(stage.renderer.domElement, (x, y) => {
    if (focus.focused) {
      focus.set(null);
      return;
    }
    const card = focus.pick(x, y);
    if (!card) return;
    const cluster = clusters[clusterOf[cards.indexOf(card)]];
    if (cluster.members.length > 1) controller.focusOn(cluster.anchorTime, finerLevel(controller.level));
    else focus.set(card);
  });

  const hud = createAxisHud(controller, oldest, newest);

  return {
    title: 'TIME AXIS',
    hint: '묶음 탭: 들어가기 · 낱장 탭: 펼치기',
    controller,
    cards,
    clusters: () => clusters,
    focus: (card) => focus.set(card),
    focusedId: () => focus.focused?.id ?? null,
    update(dt, time) {
      look.uTime.value = time;
      controller.step(dt);
      const state = controller.current;
      regroup();

      const pose = focus.pose();
      for (let i = 0; i < cards.length; i++) {
        stepPlacement(current[i], targets[i], dt);
        const depth = placementPose(current[i], state, homes[i]);
        const card = cards[i];
        card.update(dt, time, homes[i], card === focus.focused ? pose : null, depthFade(depth) * current[i].visible);
      }
      for (const c of clusters) {
        c.members.forEach((m, k) => cards[m].setBadge(k === 0 && c.members.length > 1 ? `×${c.members.length}` : null));
      }

      view.update(generateTicks(state, tuning.axis.nearDepth, tuning.axis.farDepth, newest), depthOf(state, newest));
      hud.update();
    },
    dispose() {
      stopTap();
      stopResize();
      hud.dispose();
      stage.scene.remove(view.group);
      view.dispose();
      for (const c of cards) {
        stage.scene.remove(c.mesh);
        c.dispose();
      }
      labels.clear();
      stage.grid.visible = true;
      [fog.near, fog.far] = savedFog;
    },
  };
}
