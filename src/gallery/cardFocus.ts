import { Raycaster, Vector2 } from 'three';
import { tuning } from '../config';
import { computeFocusPose, createPose, type Pose } from '../widgets/noteCard/cardMotion';
import type { NoteCard } from '../widgets/noteCard/NoteCard';
import type { Stage } from './stage';

/** 카드 데모들이 함께 쓰는 펼치기 상태: 펼친 카드 하나, 나머지 어둡게, 탭 위치의 카드 찾기. */
export class CardFocus {
  focused: NoteCard | null = null;
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly focusPose = createPose();

  constructor(
    private readonly stage: Stage,
    private readonly cards: readonly NoteCard[],
  ) {}

  set(card: NoteCard | null): void {
    if (this.focused) this.focused.focused = false;
    this.focused = card;
    if (card) card.focused = true;
    for (const c of this.cards) c.motion.dimTarget = card && c !== card ? tuning.focus.othersDim : 0;
  }

  /** 화면 좌표에 보이는 가장 가까운 카드 */
  pick(clientX: number, clientY: number): NoteCard | null {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    const visible = this.cards.filter((c) => c.visible).map((c) => c.mesh);
    const hit = this.raycaster.intersectObjects(visible, false)[0];
    return hit ? (hit.object.userData.card as NoteCard) : null;
  }

  /** 펼친 카드의 목표 자세. 펼친 카드가 없으면 null */
  pose(): Pose | null {
    const f = this.focused;
    if (!f) return null;
    return computeFocusPose(this.stage.camera, f.layout.worldWidth, f.layout.worldHeight, this.focusPose);
  }
}
