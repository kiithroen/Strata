import { Euler, Quaternion, Raycaster, Vector2, Vector3 } from 'three';
import { tuning } from '../config';
import { createPlaceholderPhotos } from '../dev/placeholderPhotos';
import { listenTap } from '../input/tap';
import { createCardLook } from '../widgets/noteCard/cardMaterial';
import { computeFocusPose, createPose } from '../widgets/noteCard/cardMotion';
import { generateField } from '../widgets/noteCard/field';
import { NoteCard } from '../widgets/noteCard/NoteCard';
import type { Stage, WidgetDemo } from './stage';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export interface NoteCardDemo extends WidgetDemo {
  readonly cards: readonly NoteCard[];
  focus(card: NoteCard | null): void;
  focusedId(): string | null;
}

/** 노트 카드 위젯 데모: 가짜 사진 노트를 공간에 흩어 두고 탭으로 펼치고 닫는다. */
export function mountNoteCardDemo(stage: Stage): NoteCardDemo {
  const f = tuning.field;
  const look = createCardLook();
  const slots = generateField(f.count, f.seed, stage.camera.fov).sort((a, b) => a.depth - b.depth);
  const photos = createPlaceholderPhotos(slots.length, f.seed + 1);
  const newest = new Date(2026, 10, 15, 21, 30).getTime();

  let stamp = newest;
  const cards = slots.map((slot, i) => {
    // 가까운 카드가 최근 노트다. 시간축 위젯이 생기면 깊이가 곧 시간이 된다
    stamp -= (1 + ((i * 7919) % 23)) * HOUR + ((i * 37) % 60) * MINUTE;
    const photo = photos[i];
    const card = new NoteCard({
      face: {
        id: String(slots.length - i).padStart(4, '0'),
        createdAt: new Date(stamp),
        image: photo.canvas,
        imageWidth: photo.width,
        imageHeight: photo.height,
      },
      homePosition: new Vector3(slot.x, slot.y, -slot.depth),
      homeQuaternion: new Quaternion().setFromEuler(new Euler(0, slot.yaw, 0)),
      float: { phase: slot.floatPhase, period: slot.floatPeriod },
      look,
      anisotropy: stage.anisotropy,
    });
    stage.scene.add(card.mesh);
    return card;
  });

  let focused: NoteCard | null = null;
  const focusPose = createPose();
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const meshes = cards.map((c) => c.mesh);

  const focus = (card: NoteCard | null) => {
    if (focused) focused.focused = false;
    focused = card;
    if (card) card.focused = true;
    for (const c of cards) c.motion.dimTarget = focused && c !== focused ? tuning.focus.othersDim : 0;
  };

  const canvas = stage.renderer.domElement;
  const stopTap = listenTap(canvas, (x, y) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, stage.camera);
    // 펼친 카드가 있으면 그 카드만 받는다. 펼친 카드나 빈 곳을 탭하면 닫는다
    if (focused) {
      focus(null);
      return;
    }
    const hit = raycaster.intersectObjects(meshes, false)[0];
    focus(hit ? (hit.object.userData.card as NoteCard) : null);
  });

  return {
    title: 'NOTE CARD',
    hint: '탭: 노트 펼치기 · 다시 탭: 닫기',
    cards,
    focus,
    focusedId: () => focused?.id ?? null,
    update(dt, time) {
      look.uTime.value = time;
      const pose = focused ? computeFocusPose(stage.camera, focused.layout.worldWidth, focused.layout.worldHeight, focusPose) : null;
      for (const c of cards) c.update(dt, time, c === focused ? pose : null);
    },
    dispose() {
      stopTap();
      for (const c of cards) {
        stage.scene.remove(c.mesh);
        c.dispose();
      }
    },
  };
}
