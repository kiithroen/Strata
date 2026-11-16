import { Raycaster, Vector2, Vector3 } from 'three';
import { tuning } from '../config';
import { damp } from '../core/motion';
import type { CameraRig } from '../widgets/camera/cameraRig';
import type { LabelCache } from '../widgets/common/labelCache';
import { createPose, type Pose } from '../widgets/noteCard/cardMotion';
import {
  layoutStrata,
  nearestLayer,
  strataPoint,
  strataPose,
  type StrataFrame,
  type StrataLayer,
  type StrataLayerInput,
  type StrataTile,
} from '../widgets/strata/strataLayout';
import { StrataView } from '../widgets/strata/StrataView';
import type { Stage } from './stage';

interface Saved {
  target: Vector3;
  yaw: number;
  pitch: number;
  distance: number;
}

const AXIS_Y = new Vector3(0, 1, 0);

/**
 * 은하 ↔ 지층 두 단계 탐색. 은하에서 고른 묶음을 층으로 쌓아 내려다보고, 뒤로 가면 은하로 돌아온다.
 * 들어간 정도(mix)는 게임 시간으로 지수 접근하고, 노트 창은 은하 자세와 지층 자세를 mix 로 섞는다.
 * 브라우저 뒤로(안드로이드 뒤로 단추 포함)와 화면의 뒤로 단추, Esc 로 나온다.
 */
export class StrataMode {
  /** 지층 보기로 들어간 정도(0~1) */
  mix = 0;
  active = false;
  private layers: StrataLayer[] = [];
  private frame: StrataFrame = { origin: new Vector3(), yaw: 0 };
  private focus = 0;
  private readonly placed = new Map<number, { layer: StrataLayer; tile: StrataTile }>();
  private saved: Saved | null = null;
  private pushed = false;
  /** 화면 단추·Esc 로 나가며 되돌린 방문 기록의 popstate 는 이미 처리했으니 한 번 건너뛴다 */
  private skipPop = false;
  private readonly view: StrataView;
  private readonly back: HTMLButtonElement;
  private readonly pose = createPose();
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly hit = new Vector3();
  private readonly onPop = () => {
    if (this.skipPop) {
      this.skipPop = false;
      return;
    }
    this.pushed = false;
    if (this.active) this.leave();
  };
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.active) this.exit();
  };

  constructor(
    private readonly stage: Stage,
    private readonly rig: CameraRig,
    labels: LabelCache,
  ) {
    this.view = new StrataView(labels);
    stage.scene.add(this.view.group);
    this.back = document.createElement('button');
    this.back.type = 'button';
    this.back.className = 'strata-back';
    this.back.textContent = '← 은하로';
    this.back.hidden = true;
    this.back.addEventListener('click', () => this.exit());
    document.body.appendChild(this.back);
    window.addEventListener('popstate', this.onPop);
    window.addEventListener('keydown', this.onKey);
  }

  /** layers 는 최근 것부터, focusIndex 는 고른 층, origin 은 고른 층 판의 중심(고른 노드 자리)이다 */
  enter(layers: readonly StrataLayerInput[], focusIndex: number, origin: Vector3): void {
    if (layers.length === 0) return;
    const s = tuning.strata;
    if (!this.active) {
      this.saved = { target: this.rig.goalTarget.clone(), yaw: this.rig.yaw, pitch: this.rig.pitch, distance: this.rig.goalDistance };
    }
    this.active = true;
    this.frame = { origin: origin.clone(), yaw: this.rig.yaw };
    this.layers = layoutStrata(layers, focusIndex);
    this.placed.clear();
    for (const layer of this.layers) for (const tile of layer.tiles) this.placed.set(tile.index, { layer, tile });
    this.focus = focusIndex;
    this.view.build(this.layers, this.frame);
    this.rig.focusPoint(origin);
    this.rig.setGoalDistance(s.distance);
    this.rig.orbitTo(s.pitch, this.frame.yaw);
    this.back.hidden = false;
    if (!this.pushed) {
      history.pushState({ strata: true }, '');
      this.pushed = true;
    }
  }

  /** 은하로 바로 돌아가고, 들어갈 때 쌓은 방문 기록도 되돌린다 */
  exit(): void {
    if (!this.active) return;
    if (this.pushed) {
      this.pushed = false;
      this.skipPop = true;
      history.back();
    }
    this.leave();
  }

  get focusTime(): number | null {
    return this.active ? this.layers[this.focus]?.anchorTime ?? null : null;
  }

  get layerCount(): number {
    return this.layers.length;
  }

  get focusIndex(): number {
    return this.focus;
  }

  /** 층 하나를 바라본다: 그 층 판 중심으로 피벗을 옮긴다 */
  focusLayer(index: number): void {
    const layer = this.layers[index];
    if (!layer) return;
    this.focus = index;
    this.rig.focusPoint(strataPoint(this.frame, 0, layer.y, 0, this.hit));
  }

  /** 시간 띠로 고른 시각에 가장 가까운 층을 바라본다 */
  focusNearestTime(time: number): void {
    this.focusLayer(nearestLayer(this.layers, time));
  }

  /** 화면 좌표(CSS px)에서 나간 광선이 처음 닿는 층 판의 번호. 없으면 -1 */
  pickLayer(x: number, y: number): number {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    const ray = this.raycaster.ray;
    let best = -1;
    let bestT = Infinity;
    this.layers.forEach((layer, i) => {
      if (Math.abs(ray.direction.y) < 1e-6) return;
      const t = (this.frame.origin.y + layer.y - ray.origin.y) / ray.direction.y;
      if (t <= 0 || t >= bestT) return;
      ray.at(t, this.hit).sub(this.frame.origin).applyAxisAngle(AXIS_Y, -this.frame.yaw);
      if (Math.abs(this.hit.x) <= layer.halfWidth && Math.abs(this.hit.z) <= layer.halfDepth) {
        best = i;
        bestT = t;
      }
    });
    return best;
  }

  /**
   * 노트 창 하나의 기본 자세와 불투명도를 지층 쪽으로 섞는다. 지층에 깔리는 노트는 지층 자세로 옮겨 가며 또렷해지고,
   * 아닌 노트는 옅어진다. home 은 은하 자세가 담긴 채로 들어와 섞인 자세로 바뀐다.
   */
  blendCard(index: number, home: Pose, fade: number): number {
    if (this.mix <= 0) return fade;
    const p = this.placed.get(index);
    if (!p) return fade * (1 - this.mix);
    strataPose(this.frame, p.layer, p.tile, this.pose);
    const w = this.mix;
    home.position.lerp(this.pose.position, w);
    home.quaternion.slerp(this.pose.quaternion, w);
    home.scale += (this.pose.scale - home.scale) * w;
    return fade + (1 - fade) * w;
  }

  update(dt: number): void {
    const s = tuning.strata;
    this.mix = damp(this.mix, this.active ? 1 : 0, s.transitionRate, dt);
    if (!this.active && this.mix < 0.002) {
      this.mix = 0;
      if (this.layers.length > 0) {
        this.layers = [];
        this.placed.clear();
        this.view.clear();
      }
    }
    this.view.update(dt, this.mix, this.focus);
  }

  dispose(): void {
    window.removeEventListener('popstate', this.onPop);
    window.removeEventListener('keydown', this.onKey);
    this.back.remove();
    this.stage.scene.remove(this.view.group);
    this.view.dispose();
  }

  private leave(): void {
    this.active = false;
    this.back.hidden = true;
    const saved = this.saved;
    if (saved) {
      this.rig.focusPoint(saved.target);
      this.rig.setGoalDistance(saved.distance);
      this.rig.orbitTo(saved.pitch, saved.yaw);
    }
    this.saved = null;
  }
}
