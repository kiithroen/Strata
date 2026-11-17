import { Raycaster, Vector2, Vector3 } from 'three';
import { tuning } from '../config';
import { damp } from '../core/motion';
import type { CameraRig } from '../widgets/camera/cameraRig';
import { drawCloud } from '../widgets/cloud/CloudView';
import { cloudVisibility, screenFraction } from '../widgets/cloud/wordCloud';
import type { ScreenLabels } from '../widgets/common/screenLabels';
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
  strataDistance,
} from '../widgets/strata/strataLayout';
import { StrataView } from '../widgets/strata/StrataView';
import type { Stage } from './stage';

interface Saved {
  target: Vector3;
  yaw: number;
  pitch: number;
  distance: number;
}

export interface StrataModeHooks {
  /** Esc 를 눌렀을 때 지층을 나가기 전에 먼저 닫을 것(펼친 카드 등)이 있으면 true 를 낸다 */
  onEscape?: () => boolean;
  onLeave?: () => void;
  /** 있으면 `카드로 보기` 단추를 띄우고, 누르면 부른다 */
  onCards?: () => void;
}

const AXIS_Y = new Vector3(0, 1, 0);

function isStrataHistoryState(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { strata?: unknown }).strata === true;
}

/**
 * 은하 ↔ 지층 두 단계 탐색. 은하에서 고른 묶음을 층으로 쌓아 내려다보고, 뒤로 가면 은하로 돌아온다.
 * 들어간 정도(mix)는 게임 시간으로 지수 접근하고, 노트 창은 은하 자세와 지층 자세를 mix 로 섞는다.
 * 브라우저 뒤로(안드로이드 뒤로 단추 포함)와 화면의 뒤로 단추, Esc 로 나온다.
 */
export class StrataMode {
  /** 지층 보기로 들어간 정도(0~1) */
  mix = 0;
  /** 층 판과 층 낱말의 밝기 배율(0~1). 카드 공간 보기가 지층 위를 덮을 때 줄인다 */
  veil = 1;
  active = false;
  private layers: StrataLayer[] = [];
  private frame: StrataFrame = { origin: new Vector3(), yaw: 0 };
  private focus = 0;
  /** 원판(테이블)이 돈 각도와 지금 빠르기 배율(0~1) */
  private spin = 0;
  private spinPace = 1;
  /** 원판이 돌아도 되는지. 데모가 펼친 카드·손가락·카드 보기를 보고 정한다 */
  spinning = true;
  private readonly placed = new Map<number, { layer: StrataLayer; tile: StrataTile }>();
  /** 층마다 카드가 멀어 사라진 정도(0~1). measure 가 매 프레임 구한다 */
  private readonly hidden = new Map<StrataLayer, number>();
  private readonly center = new Vector3();
  private saved: Saved | null = null;
  private pushed = false;
  private readonly view: StrataView;
  private readonly actions: HTMLDivElement;
  private readonly pose = createPose();
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly hit = new Vector3();
  private readonly stopResize: () => void;
  private readonly onPop = (e: PopStateEvent) => {
    if (!this.active) return;
    // 빠른 exit → enter 직후 지난 history.back() 의 popstate 가 뒤늦게 도착해도 현재 상태가 지층이면 유지한다
    if (isStrataHistoryState(e.state)) {
      this.pushed = true;
      return;
    }
    this.pushed = false;
    this.leave();
  };
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !this.active) return;
    if (this.hooks?.onEscape?.()) return;
    this.exit();
  };

  constructor(
    private readonly stage: Stage,
    private readonly rig: CameraRig,
    labels: LabelCache,
    private readonly hooks?: StrataModeHooks,
  ) {
    this.view = new StrataView(labels);
    stage.scene.add(this.view.group);
    this.actions = document.createElement('div');
    this.actions.className = 'strata-actions';
    this.actions.hidden = true;
    const button = (text: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', onClick);
      this.actions.appendChild(b);
    };
    button('← 은하로', () => this.exit());
    const onCards = hooks?.onCards;
    if (onCards) button('카드 보기', onCards);
    document.body.appendChild(this.actions);
    window.addEventListener('popstate', this.onPop);
    window.addEventListener('keydown', this.onKey);
    // 화면 비율이 바뀌면(회전, 폴더블) 판이 화면 폭에 들어오도록 거리를 다시 잡는다
    this.stopResize = stage.onResize(() => {
      if (this.active) this.rig.setGoalDistance(this.fitDistance());
    });
  }

  private fitDistance(): number {
    const layer = this.layers[this.focus];
    return layer ? strataDistance([layer], this.stage.camera.fov, this.stage.camera.aspect) : tuning.strata.distance;
  }

  /** layers 는 최근 것부터, focusIndex 는 고른 층, origin 은 고른 층 판의 중심(고른 노드 자리)이다 */
  enter(layers: readonly StrataLayerInput[], focusIndex: number, origin: Vector3): void {
    if (layers.length === 0) return;
    const s = tuning.strata;
    if (!this.active) {
      this.saved = { target: this.rig.goalTarget.clone(), yaw: this.rig.yaw, pitch: this.rig.pitch, distance: this.rig.goalDistance };
      this.spin = 0;
      this.spinPace = 1;
    }
    this.active = true;
    this.frame = { origin: origin.clone(), yaw: this.rig.yaw };
    this.layers = layoutStrata(layers, focusIndex);
    this.placed.clear();
    for (const layer of this.layers) for (const tile of layer.tiles) this.placed.set(tile.index, { layer, tile });
    this.focus = focusIndex;
    this.view.build(this.layers, this.frame);
    this.rig.focusPoint(origin);
    this.rig.setGoalDistance(this.fitDistance());
    this.rig.orbitTo(s.pitch, this.frame.yaw);
    this.actions.hidden = false;
    if (!this.pushed) {
      if (!isStrataHistoryState(history.state)) history.pushState({ strata: true }, '');
      this.pushed = true;
    }
  }

  /** 은하로 바로 돌아가고, 들어갈 때 쌓은 방문 기록도 되돌린다 */
  exit(): void {
    if (!this.active) return;
    this.leave();
    if (this.pushed) {
      this.pushed = false;
      history.back();
    }
  }

  hasCard(index: number): boolean {
    return this.placed.has(index);
  }

  /** 층마다 열쇠, 날짜 글자, 깔린 노트 번호(최근 층부터) */
  groups(): { key: string; label: string; members: number[] }[] {
    return this.layers.map((layer) => ({ key: layer.key, label: layer.label, members: layer.tiles.map((t) => t.index) }));
  }

  /** 바라보는 층의 열쇠 */
  get focusKey(): string | null {
    return this.layers[this.focus]?.key ?? null;
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
    this.rig.setGoalDistance(this.fitDistance());
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
      if (Math.hypot(this.hit.x, this.hit.z) <= layer.radius) {
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
    if (!p) return fade * Math.max(0, 1 - this.mix * 2.5);
    strataPose(this.frame, p.layer, p.tile, this.pose, this.spin);
    const w = this.mix;
    home.position.lerp(this.pose.position, w);
    home.quaternion.slerp(this.pose.quaternion, w);
    home.scale += (this.pose.scale - home.scale) * w;
    const shown = 1 - (this.hidden.get(p.layer) ?? 0);
    return fade * (1 - w) + shown * w;
  }

  /**
   * 층마다 카드가 화면에서 차지하는 크기를 재서, 멀면 층 위에 태그 워드 클라우드를 그리고 더 멀면 카드를 감춘다(blendCard).
   * p11 은 투영 행렬의 [1][1] 이다
   */
  measure(cameraPosition: Vector3, p11: number, labels: ScreenLabels): void {
    if (this.mix <= 0) return;
    const height = tuning.card.width * tuning.strata.cardScale[1];
    for (const layer of this.layers) {
      strataPoint(this.frame, 0, layer.y, 0, this.center);
      const far = cloudVisibility(screenFraction(height, this.center.distanceTo(cameraPosition), p11));
      this.hidden.set(layer, far.cards);
      drawCloud(labels, this.center, layer.words, far.words * this.mix * this.veil, cameraPosition);
    }
  }

  update(dt: number): void {
    const s = tuning.strata;
    this.mix = damp(this.mix, this.active ? 1 : 0, s.transitionRate, dt);
    if (!this.active && this.mix < 0.002) {
      this.mix = 0;
      if (this.layers.length > 0) {
        this.layers = [];
        this.placed.clear();
        this.hidden.clear();
        this.view.clear();
      }
    }
    const sp = s.spin;
    this.spinPace = damp(this.spinPace, this.spinning ? 1 : 0, sp.rate, dt);
    if (this.active) this.spin += sp.speed * this.spinPace * dt;
    this.view.update(dt, this.mix * this.veil, this.focus, this.spin);
  }

  dispose(): void {
    window.removeEventListener('popstate', this.onPop);
    window.removeEventListener('keydown', this.onKey);
    this.stopResize();
    this.actions.remove();
    this.stage.scene.remove(this.view.group);
    this.view.dispose();
  }

  private leave(): void {
    this.active = false;
    this.actions.hidden = true;
    this.hooks?.onLeave?.();
    const saved = this.saved;
    if (saved) {
      this.rig.focusPoint(saved.target);
      this.rig.setGoalDistance(saved.distance);
      this.rig.orbitTo(saved.pitch, saved.yaw);
    }
    this.saved = null;
  }
}
