import { Euler, Quaternion, Vector3 } from 'three';
import { tuning } from '../config';
import { sampleNoteText } from '../dev/fakeNotes';
import { createPlaceholderPhotos } from '../dev/placeholderPhotos';
import { listenTap } from '../input/tap';
import { LabelCache } from '../widgets/common/labelCache';
import type { NoteKind } from '../widgets/noteCard/cardLayout';
import { createCardLook } from '../widgets/noteCard/cardMaterial';
import type { Pose } from '../widgets/noteCard/cardMotion';
import { generateField } from '../widgets/noteCard/field';
import { NoteCard } from '../widgets/noteCard/NoteCard';
import { CardFocus } from './cardFocus';
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
  const labels = new LabelCache();
  const slots = generateField(f.count, f.seed, stage.camera.fov).sort((a, b) => a.depth - b.depth);
  const photos = createPlaceholderPhotos(slots.length, f.seed + 1);
  const newest = new Date(2026, 10, 15, 21, 30).getTime();

  let stamp = newest;
  const homes: Pose[] = [];
  const cards = slots.map((slot, i) => {
    // 가까운 카드가 최근 노트다
    stamp -= (1 + ((i * 7919) % 23)) * HOUR + ((i * 37) % 60) * MINUTE;
    homes.push({
      position: new Vector3(slot.x, slot.y, -slot.depth),
      quaternion: new Quaternion().setFromEuler(new Euler(0, slot.yaw, 0)),
      scale: 1,
    });
    const kind: NoteKind = i % 5 === 1 || i % 5 === 3 ? 'memo' : i % 5 === 4 ? 'doc' : 'photo';
    const sample = sampleNoteText(kind, i);
    const card = new NoteCard({
      face: {
        id: String(slots.length - i).padStart(4, '0'),
        createdAt: new Date(stamp),
        kind,
        photo: kind === 'photo' ? photos[i] : undefined,
        ...sample,
      },
      float: { phase: slot.floatPhase, period: slot.floatPeriod },
      look,
      labels,
      anisotropy: stage.anisotropy,
    });
    stage.scene.add(card.mesh);
    return card;
  });

  const focus = new CardFocus(stage, cards);
  const stopTap = listenTap(stage.renderer.domElement, (x, y) => {
    // 펼친 카드가 있으면 어디를 탭하든 닫는다
    if (focus.focused) focus.set(null);
    else focus.set(focus.pick(x, y));
  });

  return {
    title: 'NOTE CARD',
    hint: '탭: 노트 펼치기 · 다시 탭: 닫기',
    cards,
    focus: (card) => focus.set(card),
    focusedId: () => focus.focused?.id ?? null,
    update(dt, time) {
      look.uTime.value = time;
      const pose = focus.pose();
      cards.forEach((c, i) => c.update(dt, time, homes[i], c === focus.focused ? pose : null));
    },
    dispose() {
      stopTap();
      for (const c of cards) {
        stage.scene.remove(c.mesh);
        c.dispose();
      }
      labels.clear();
    },
  };
}
