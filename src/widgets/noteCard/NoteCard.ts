import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, ShaderMaterial } from 'three';
import { tuning } from '../../config';
import type { LabelCache } from '../common/labelCache';
import { runnerVariation } from './borderRunner';
import { cornerUv, faceLayout, type CardLayout } from './cardLayout';
import { createCardMaterial, type CardLook } from './cardMaterial';
import {
  createCardTexture,
  createSimpleTexture,
  holoTint,
  redrawCardTexture,
  redrawSimpleTexture,
  releasePhoto,
  type CardFace,
} from './cardTexture';
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
/** 펼치는 카드의 그리는 차례. 지층 층별 차례보다 늘 뒤다 */
const OPEN_ORDER = 1000;

/**
 * 노트 카드 위젯: 양면 홀로그램 창. 배치가 넘기는 자리에 떠 있다가 펼치면 카메라 앞으로 나와 화면에 맞게 커진다.
 * 멀리서는 단순한 텍스처, 가까이서는 작은 텍스처, 펼치는 동안에는 선명한 텍스처를 쓴다. 둘 사이 전환은 셰이더가 한다.
 * 사진을 디코딩해야 하면 사진 칸을 비워 두고 그렸다가 사진이 오면 다시 그린다. 선명한 텍스처는 사진이 온 뒤에 바꾼다.
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
  /** 펼치지 않았을 때의 그리는 차례. 지층에 깔리면 그 층 판 바로 다음 차례를 받는다 */
  layerOrder = 0;

  private readonly baseTexture: CanvasTexture;
  private readonly simpleTexture: CanvasTexture;
  private detailTexture: CanvasTexture | null = null;
  private readonly anisotropy: number;
  private readonly labels: LabelCache;
  private badge: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  private badgeText: string | null = null;
  private disposed = false;
  /** 선명한 텍스처용 사진을 기다리는 중인지 */
  private detailPending = false;
  /** 닫았다 다시 펼칠 때 앞서 기다리던 사진을 버리려고 펼칠 때마다 올린다 */
  private detailRequest = 0;

  constructor(opts: NoteCardOptions) {
    this.id = opts.face.id;
    this.face = opts.face;
    this.anisotropy = opts.anisotropy;
    this.labels = opts.labels;
    this.layout = faceLayout(opts.face);
    const simpleLayout = faceLayout(opts.face, tuning.card.simpleTextureWidth);
    const photo = opts.face.photo?.render(this.layout.content.width) ?? null;
    const ready = photo instanceof Promise ? null : photo;
    this.baseTexture = createCardTexture(opts.face, this.layout, opts.anisotropy, ready);
    this.simpleTexture = createSimpleTexture(opts.face, simpleLayout, opts.anisotropy, ready);
    if (ready) releasePhoto(ready);
    if (photo instanceof Promise) {
      photo.then(
        (image) => {
          if (!this.disposed) {
            redrawCardTexture(this.baseTexture, this.face, this.layout, image);
            redrawSimpleTexture(this.simpleTexture, this.face, simpleLayout, image);
          }
          releasePhoto(image);
        },
        () => {},
      );
    }
    let phase = 0;
    for (let i = 0; i < this.id.length; i++) phase = (phase * 31 + this.id.charCodeAt(i)) % 6283;
    const material = createCardMaterial({
      map: this.baseTexture,
      mapSimple: this.simpleTexture,
      look: opts.look,
      width: this.layout.worldWidth,
      height: this.layout.worldHeight,
      bendPhase: phase / 1000,
      corner: cornerUv(this.layout),
      runner: runnerVariation(this.id),
      tint: holoTint(opts.face),
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
    // 펼치는 카드는 다른 카드보다 나중에, 깊이 검사 없이 그려 카메라에 더 가까운 카드에도 가려지지 않고 맨 위에 보인다
    const opening = m.focused || m.focus > HIDDEN;
    this.mesh.renderOrder = opening ? (m.focused ? OPEN_ORDER + 1 : OPEN_ORDER) : this.layerOrder;
    this.mesh.material.depthTest = !opening;
    this.updateDetail();
    if (this.badge) this.badge.material.opacity = opacity * (1 - m.focus);
  }

  /** 묶음 장수 같은 배지를 카드 오른쪽 위에 붙인다. null 이면 뗀다 */
  setBadge(text: string | null): void {
    if (text === null) {
      this.badgeText = null;
      if (this.badge) this.badge.visible = false;
      return;
    }
    const label = this.labels.get(text, 'badge');
    if (text === this.badgeText && this.badge && this.badge.material.map === label.texture) return;
    this.badgeText = text;
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
    this.disposed = true;
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
    const opening = this.motion.focused || this.motion.focus > HIDDEN;
    if (opening && !this.detailTexture && !this.detailPending) {
      const detailLayout = faceLayout(this.face, tuning.card.detailTextureWidth);
      const photo = this.face.photo?.render(detailLayout.content.width, true) ?? null;
      if (!(photo instanceof Promise)) {
        this.showDetail(detailLayout, photo);
        return;
      }
      this.detailPending = true;
      const request = ++this.detailRequest;
      const settle = (image: CanvasImageSource | null) => {
        if (request !== this.detailRequest) {
          if (image) releasePhoto(image);
          return;
        }
        this.detailPending = false;
        if (!this.disposed) this.showDetail(detailLayout, image);
        else if (image) releasePhoto(image);
      };
      photo.then(settle, () => settle(null));
    } else if (!opening && (this.detailTexture || this.detailPending)) {
      this.detailRequest++;
      this.detailPending = false;
      this.mesh.material.uniforms.map.value = this.baseTexture;
      this.detailTexture?.dispose();
      this.detailTexture = null;
    }
  }

  private showDetail(layout: CardLayout, photo: CanvasImageSource | null): void {
    this.detailTexture = createCardTexture(this.face, layout, this.anisotropy, photo);
    if (photo) releasePhoto(photo);
    this.mesh.material.uniforms.map.value = this.detailTexture;
  }
}
