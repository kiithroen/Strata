import { tuning } from '../../config';
import { floorTo } from '../../core/calendar';
import { clusterNotes, type AxisState, type Cluster, type NoteRef } from '../timeAxis/axisModel';
import {
  bucketLabel,
  buildHubs,
  choosePlanetUnit,
  clusterAffinities,
  parentUnit,
  planetLabel,
  swarmCapacity,
} from './cosmosModel';

/** 은하의 노드(행성) 하나: 묶인 노트와 글자, 노트마다의 관련도(0~1) */
export interface GroupPlanet {
  cluster: Cluster;
  /** 노드 아래 글자 */
  label: string;
  /** 지층 층 이름과 2D 카드 목록의 묶음 머리 */
  heading: string;
  /** 노드 위 글자. null 이면 묶음의 대표 태그를 쓴다 */
  title: string | null;
  affinities: number[];
}

/** 한 단계 위 노드(허브): 자식 행성 번호(최근 것부터)와 글자 */
export interface GroupHub {
  key: string;
  anchorTime: number;
  children: number[];
  notes: number;
  label: string;
}

/**
 * 노트를 은하의 노드로 묶는 방법. 날짜 축(달력 단위)과 폴더 축(폴더 트리)이 있다.
 * 행성은 최근 것부터이고, anchorTime(묶음에서 가장 최근 노트의 시각)이 나선 위 자리를 정한다.
 */
export interface Grouping {
  planets: GroupPlanet[];
  hubs: GroupHub[];
  /** 행성마다 카드로 도는 노트 수(관련도 높은 노트부터). 나머지는 점이다 */
  capacity: number;
}

/** 날짜 축: 고정 시계열 축척에 맞는 달력 단위로 묶고 한 단계 위 단위가 허브다 */
export function dateGrouping(notes: readonly NoteRef[], state: AxisState): Grouping {
  const unit = choosePlanetUnit(state);
  const parent = parentUnit(unit);
  const clusters = clusterNotes(notes, unit);
  return {
    planets: clusters.map((cluster) => {
      const bucket = floorTo(unit, cluster.anchorTime);
      return {
        cluster,
        label: planetLabel(unit, bucket, cluster.members.length),
        heading: bucketLabel(unit, bucket),
        title: null,
        affinities: clusterAffinities(notes, cluster.members, unit),
      };
    }),
    hubs: buildHubs(clusters, parent).map((h) => ({
      key: h.key,
      anchorTime: h.anchorTime,
      children: h.children,
      notes: h.notes,
      label: planetLabel(parent ?? unit, h.bucket, h.notes),
    })),
    capacity: swarmCapacity(unit),
  };
}

function folderName(path: string, rootName: string): string {
  return path === '' ? rootName : path.slice(path.lastIndexOf('/') + 1);
}

function parentFolder(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/**
 * 폴더 축: 파일이 바로 들어 있는 폴더 하나가 행성이고, 그 부모 폴더가 허브다(원본 폴더의 파일은 원본 폴더 허브에 든다).
 * folderOf 는 노트마다 들어 있는 폴더 경로(원본 기준, 원본은 '')이고 rootName 은 원본 폴더 이름이다.
 * 노드 위에는 폴더 이름, 아래에는 가장 최근 파일의 날짜와 파일 수를 적는다. 폴더 안의 관련도는 최근 파일일수록 높고
 * 가장 오래된 파일이 cosmos.folderAxis.minAffinity 다. notes 는 최근 것부터여야 한다.
 */
export function folderGrouping(notes: readonly NoteRef[], folderOf: readonly string[], rootName: string): Grouping {
  const f = tuning.cosmos.folderAxis;
  const members = new Map<string, number[]>();
  notes.forEach((_, i) => {
    const path = folderOf[i] ?? '';
    let list = members.get(path);
    if (!list) {
      list = [];
      members.set(path, list);
    }
    list.push(i);
  });
  const folders = [...members.entries()]
    .map(([path, list]) => ({ path, list, anchorTime: notes[list[0]].time }))
    .sort((a, b) => b.anchorTime - a.anchorTime || collator.compare(a.path, b.path));

  const planets: GroupPlanet[] = folders.map(({ path, list, anchorTime }) => {
    const n = list.length;
    const name = folderName(path, rootName);
    return {
      cluster: { key: `folder:${path}`, anchorTime, members: list },
      label: planetLabel('day', floorTo('day', anchorTime), n),
      heading: name,
      title: name,
      affinities: list.map((_, k) => (n === 1 ? 1 : 1 - (k / (n - 1)) * (1 - f.minAffinity))),
    };
  });

  const hubByPath = new Map<string, GroupHub>();
  const hubs: GroupHub[] = [];
  folders.forEach(({ path }, i) => {
    const parent = parentFolder(path);
    let hub = hubByPath.get(parent);
    if (!hub) {
      hub = { key: `dir:${parent}`, anchorTime: planets[i].cluster.anchorTime, children: [], notes: 0, label: '' };
      hubByPath.set(parent, hub);
      hubs.push(hub);
    }
    hub.children.push(i);
    hub.notes += planets[i].cluster.members.length;
  });
  for (const [path, hub] of hubByPath) hub.label = `${folderName(path, rootName)} · ${hub.notes}`;
  return { planets, hubs, capacity: f.capacity };
}
