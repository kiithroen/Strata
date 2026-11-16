import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, ShaderMaterial } from 'three';
import { tuning } from '../../config';
import type { LabelCache } from '../common/labelCache';
import { faceLayout, type CardLayout } from './cardLayout';
import { createCardMaterial, type CardLook } from './cardMaterial';
import { createCardTexture, createSimpleTexture, type CardFace } from './cardTexture';
import { CardMotion, type FloatParams, type Pose } from './cardMotion';

export interface NoteCardOptions {
  face: CardFace;
  float: FloatParams;
  look: CardLook;
  labels: LabelCache;
  anisotropy: number;
}

/** 이 아래로 옅어지면 그리지 않는다 */
const HIDDEN = 0.002;

/**
 * 노트 카드 위젯: 양면 홀로그램 창. 배치가 넘기는 자리에 떠 있다가 펼치면 카메라 앞으로 나와 화면에 맞게 커진다.
 * 멀리서는 단순한 텍스처, 가까이서는 작은 텍스처, 펼치는 동안에는 선명한 텍스처를 쓴다. 둘 사이 전환은 셰이더가 한다.
 */
export class NoteCard {
  readonly id: string;
  readonly face: CardFace;
  /** 월드 크기는 떠 있는 텍스처 기준 배치로 정한다 */
  readonly layout: CardLayout;
  readonly motion: CardMotion;
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  /** 종이마다 다르게 출렁이도록 어긋낸 휨 위상. 휜 높이를 셰이더 밖에서 구할 때(paperBend) 쓴다 */
  readonly bendPhase: number;

  private readonly baseTexture: CanvasTexture;
  private readonly simpleTexture: CanvasTexture;
  private detailTexture: CanvasTexture | null = null;
  private readonly anisotropy: number;
  private readonly labels: LabelCache;
  private badge: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  private badgeText: string | null = null;

  constructor(opts: NoteCardOptions) {
    this.id = opts.face.id;
    this.face = opts.face;
    this.anisotropy = opts.anisotropy;
    this.labels = opts.labels;
    const kind = opts.face.kind ?? 'photo';
    this.layout = faceLayout(kind, opts.face.photo);
    this.baseTexture = createCardTexture(opts.face, this.layout, opts.anisotropy);
    const simpleLayout = faceLayout(kind, opts.face.photo, tuning.card.simpleTextureWidth);
    this.simpleTexture = createSimpleTexture(opts.face, simpleLayout, opts.anisotropy);
    let phase = 0;
    for (let i = 0; i < this.id.length; i++) phase = (phase * 31 + this.id.charCodeAt(i)) % 6283;
    const material = createCardMaterial({
      map: this.baseTexture,
      mapSimple: this.simpleTexture,
      look: opts.look,
      width: this.layout.worldWidth,
      height: this.layout.worldHeight,
      bendPhase: phase / 1000,
    });
    this.bendPhase = phase / 1000;
    const seg = tuning.card.segments;
    this.mesh = new Mesh(new PlaneGeometry(this.layout.worldWidth, this.layout.worldHeight, seg, seg), material);
    this.mesh.name = `note-card-${this.id}`;
    this.mesh.userData.card = this;
    this.motion = new CardMotion(opts.float);
  }

  get focused(): boolean {
    return this.motion.focused;
  }

  set focused(value: boolean) {
    this.motion.focused = value;
  }

  /** 지금 화면에 그려지는지. 탭 판정은 그려지는 카드만 받는다 */
  get visible(): boolean {
    return this.mesh.visible;
  }

  /**
   * home 은 배치가 정한 기본 자세, fade 는 배치가 정한 불투명도(0~1)다.
   * 펼치는 중인 카드는 fade 와 상관없이 보인다.
   */
  update(dt: number, time: number, home: Pose, focusPose: Pose | null, fade = 1): void {
    const m = this.motion;
    m.step(dt, time, home, focusPose);
    this.mesh.position.copy(m.position);
    this.mesh.quaternion.copy(m.quaternion);
    this.mesh.scale.setScalar(m.scale);

    const opacity = Math.max(fade, m.focus);
    const u = this.mesh.material.uniforms;
    u.uDim.value = m.dim;
    u.uFocus.value = m.focus;
    u.uFade.value = opacity;
    this.mesh.visible = opacity > HIDDEN;
    // 펼치는 카드는 다른 카드보다 나중에 그려 가려지지 않게 한다
    this.mesh.renderOrder = m.focused || m.focus > HIDDEN ? 10 : 0;
    this.updateDetail();
    if (this.badge) this.badge.material.opacity = opacity * (1 - m.focus);
  }

  /** 묶음 장수 같은 배지를 카드 오른쪽 위에 붙인다. null 이면 뗀다 */
  setBadge(text: string | null): void {
    if (text === this.badgeText) return;
    this.badgeText = text;
    if (text === null) {
      if (this.badge) this.badge.visible = false;
      return;
    }
    const label = this.labels.get(text, 'badge');
    if (!this.badge) {
      this.badge = new Mesh(
        new PlaneGeometry(1, 1),
        new MeshBasicMaterial({ transparent: true, depthWrite: false, fog: true }),
      );
      this.badge.renderOrder = 1;
      this.mesh.add(this.badge);
    }
    const h = tuning.axis.badgeHeight;
    const w = h * label.aspect;
    this.badge.material.map = label.texture;
    this.badge.material.needsUpdate = true;
    this.badge.scale.set(w, h, 1);
    this.badge.position.set(this.layout.worldWidth / 2 - w / 2, this.layout.worldHeight / 2 + h * 0.6, 0.002);
    this.badge.visible = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.baseTexture.dispose();
    this.simpleTexture.dispose();
    this.detailTexture?.dispose();
    this.mesh.material.dispose();
    if (this.badge) {
      this.badge.geometry.dispose();
      this.badge.material.dispose();
    }
  }

  /** 펼치기 시작하면 선명한 텍스처로 바꾸고, 다 닫히면 버린다 */
  private updateDetail(): void {
    const u = this.mesh.material.uniforms;
    const opening = this.motion.focused || this.motion.focus > HIDDEN;
    if (opening && !this.detailTexture) {
      const detailLayout = faceLayout(this.layout.kind, this.face.photo, tuning.card.detailTextureWidth);
      this.detailTexture = createCardTexture(this.face, detailLayout, this.anisotropy);
      u.map.value = this.detailTexture;
    } else if (!opening && this.detailTexture) {
      u.map.value = this.baseTexture;
      this.detailTexture.dispose();
      this.detailTexture = null;
    }
  }
}
