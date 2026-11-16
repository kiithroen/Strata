import { tuning } from '../../config';

export type NodeKind = 'planet' | 'hub';
export type TapAction = 'approach' | 'enter';

/**
 * 은하 탭의 두 단계. 다가가지 않은 노드를 탭하면 그 노드로 다가가고,
 * 다가간 노드를 한 번 더 탭하면 들어간다. 시점을 손으로 옮기면(팬·핀치·시간 띠) 다가간 노드를 잊는다.
 */
export class TapApproach {
  private key: string | null = null;

  /** 지금 다가간 노드의 키 */
  get approached(): string | null {
    return this.key;
  }

  tap(key: string): TapAction {
    if (this.key === key) return 'enter';
    this.key = key;
    return 'approach';
  }

  clear(): void {
    this.key = null;
  }
}

/** 노드로 다가갈 때 카메라 거리 상한. 이미 더 가까우면 그대로 둔다(CameraRig.focusPoint) */
export function approachDistance(kind: NodeKind): number {
  const a = tuning.cosmos.approach;
  return kind === 'planet' ? a.planetDistance : a.hubDistance;
}
