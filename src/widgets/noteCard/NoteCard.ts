import { Mesh, PlaneGeometry, Quaternion, ShaderMaterial, Vector3 } from 'three';
import { cardLayout, type CardLayout } from './cardLayout';
import { createCardMaterial, type CardLook } from './cardMaterial';
import { createCardTexture, type CardFace } from './cardTexture';
import { CardMotion, type FloatParams, type Pose } from './cardMotion';

export interface NoteCardOptions {
  face: CardFace;
  homePosition: Vector3;
  homeQuaternion: Quaternion;
  float: FloatParams;
  look: CardLook;
  anisotropy: number;
  time?: number;
}

/** 사진 노트 카드 위젯. 공간에 떠 있다가 펼치면 카메라 앞으로 나와 화면에 맞게 커진다. */
export class NoteCard {
  readonly id: string;
  readonly layout: CardLayout;
  readonly motion: CardMotion;
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;

  constructor(opts: NoteCardOptions) {
    this.id = opts.face.id;
    this.layout = cardLayout(opts.face.imageWidth, opts.face.imageHeight);
    const texture = createCardTexture(opts.face, this.layout, opts.anisotropy);
    const material = createCardMaterial(texture, opts.look, this.layout.worldWidth / this.layout.worldHeight);
    this.mesh = new Mesh(new PlaneGeometry(this.layout.worldWidth, this.layout.worldHeight), material);
    this.mesh.name = `note-card-${this.id}`;
    this.mesh.userData.card = this;
    this.motion = new CardMotion(opts.homePosition, opts.homeQuaternion, opts.float, opts.time ?? 0);
    this.apply();
  }

  get focused(): boolean {
    return this.motion.focused;
  }

  set focused(value: boolean) {
    this.motion.focused = value;
  }

  update(dt: number, time: number, focusPose: Pose | null): void {
    this.motion.step(dt, time, focusPose);
    this.apply();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const map = this.mesh.material.uniforms.map.value as { dispose?: () => void } | null;
    map?.dispose?.();
    this.mesh.material.dispose();
  }

  private apply(): void {
    const m = this.motion;
    this.mesh.position.copy(m.position);
    this.mesh.quaternion.copy(m.quaternion);
    this.mesh.scale.setScalar(m.scale);
    const u = this.mesh.material.uniforms;
    u.uDim.value = m.dim;
    u.uFocus.value = m.focus;
    // 펼치는 카드는 가까이 있어도 다른 카드보다 나중에 그려 가려지지 않게 한다
    this.mesh.renderOrder = m.focused ? 10 : 0;
  }
}
