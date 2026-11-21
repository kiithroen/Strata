import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { floorTo } from '../src/core/calendar';
import { buildHubs, choosePlanetUnit, clusterAffinities, parentUnit, planetLabel, swarmCapacity } from '../src/widgets/cosmos/cosmosModel';
import { dateGrouping, folderAffinities, folderGrouping } from '../src/widgets/cosmos/grouping';
import { clusterNotes, levelLogScale, type NoteRef } from '../src/widgets/timeAxis/axisModel';

const day = (d: number, h = 12) => new Date(2026, 10, d, h).getTime();

describe('dateGrouping', () => {
  it('달력 단위 묶음·허브·관련도·카드 수가 날짜 축 함수들과 같다', () => {
    const notes: NoteRef[] = [15, 15, 14, 9, 2].map((d, i) => ({ id: String(i), time: day(d, 20 - i) }));
    const state = { focusTime: notes[0].time, logScale: levelLogScale('month') };
    const g = dateGrouping(notes, state);
    const unit = choosePlanetUnit(state);
    const clusters = clusterNotes(notes, unit);
    expect(g.planets.map((p) => p.cluster)).toEqual(clusters);
    expect(g.planets.map((p) => p.affinities)).toEqual(clusters.map((c) => clusterAffinities(notes, c.members, unit)));
    expect(g.planets[0].label).toBe(planetLabel(unit, floorTo(unit, clusters[0].anchorTime), clusters[0].members.length));
    expect(g.planets.every((p) => p.title === null)).toBe(true);
    expect(g.hubs.map((h) => h.children)).toEqual(buildHubs(clusters, parentUnit(unit)).map((h) => h.children));
    expect(g.capacity).toBe(swarmCapacity(unit));
  });
});

describe('folderGrouping', () => {
  // 최근 것부터: 사진/여름(3), 사진(1), 원본(1), 사진/여름/바다(1), 문서(1)
  const notes: NoteRef[] = [
    { id: 'a', time: day(15) },
    { id: 'b', time: day(14) },
    { id: 'c', time: day(13) },
    { id: 'd', time: day(12) },
    { id: 'e', time: day(10) },
    { id: 'f', time: day(9) },
    { id: 'g', time: day(5) },
  ];
  const folders = ['사진/여름', '사진', '사진/여름', '', '사진/여름/바다', '사진/여름', '문서'];
  const g = folderGrouping(notes, folders, '내 폴더');

  it('파일이 바로 든 폴더 하나가 행성이고 가장 최근 파일 순으로 놓인다', () => {
    expect(g.planets.map((p) => p.cluster.key)).toEqual(['folder:사진/여름', 'folder:사진', 'folder:', 'folder:사진/여름/바다', 'folder:문서']);
    expect(g.planets[0].cluster.members).toEqual([0, 2, 5]);
    expect(g.planets[0].cluster.anchorTime).toBe(notes[0].time);
    expect(g.planets.map((p) => p.heading)).toEqual(['여름', '사진', '내 폴더', '바다', '문서']);
    expect(g.planets[0].title).toBe('여름');
    expect(g.planets[0].label).toBe(planetLabel('day', floorTo('day', notes[0].time), 3));
  });

  it('가장 최근 파일 시각이 같은 폴더는 이름 순(숫자는 값으로)이다', () => {
    const same: NoteRef[] = [{ id: 'x', time: day(3) }, { id: 'y', time: day(3) }, { id: 'z', time: day(3) }];
    const out = folderGrouping(same, ['폴더10', '폴더9', '가'], '원본');
    expect(out.planets.map((p) => p.heading)).toEqual(['가', '폴더9', '폴더10']);
  });

  it('잎 폴더는 부모 허브에 들고, 잎을 품은 폴더는 자기 파일 행성과 함께 자기 허브가 된다', () => {
    const byKey = new Map(g.hubs.map((h) => [h.key, h]));
    // 사진/여름: 자기 파일(0)과 잎 바다(3). 사진은 잎을 품지 않아 원본 허브에 든다. 원본: 사진(1), 원본 파일(2), 잎 문서(4)
    expect([...byKey.keys()].sort()).toEqual(['dir:', 'dir:사진/여름']);
    expect(byKey.get('dir:사진/여름')?.children).toEqual([0, 3]);
    expect(byKey.get('dir:')?.children).toEqual([1, 2, 4]);
    expect(byKey.get('dir:사진/여름')?.label).toBe('여름 · 4');
    expect(byKey.get('dir:')?.label).toBe('내 폴더 · 3');
    // 허브 수는 자식 행성의 파일 수를 모은 것이다
    for (const h of g.hubs) expect(h.notes).toBe(h.children.reduce((n, c) => n + g.planets[c].cluster.members.length, 0));
    // 허브도 가장 최근 자식 순서다
    expect(g.hubs.map((h) => h.anchorTime)).toEqual([...g.hubs.map((h) => h.anchorTime)].sort((x, y) => y - x));
  });

  it('폴더 안의 관련도는 최근 파일이 1, 가장 오래된 파일이 minAffinity 이고 카드 수는 폴더 축 설정이다', () => {
    const f = tuning.cosmos.folderAxis;
    expect(g.planets[0].affinities[0]).toBe(1);
    expect(g.planets[0].affinities[2]).toBeCloseTo(f.minAffinity, 12);
    expect(g.planets[0].affinities[1]).toBeCloseTo((1 + f.minAffinity) / 2, 12);
    expect(g.planets[1].affinities).toEqual([1]);
    expect(g.capacity).toBe(f.capacity);
  });

  it('파일이 카드 수보다 많으면 카드 수까지 직선으로 줄고 그 뒤는 minAffinity 라, 카드들의 관련도가 고루 퍼진다', () => {
    const f = tuning.cosmos.folderAxis;
    const many = folderAffinities(f.capacity * 20);
    expect(many[0]).toBe(1);
    expect(many[f.capacity - 1]).toBeCloseTo(f.minAffinity, 12);
    for (let k = 1; k < f.capacity; k++) expect(many[k]).toBeLessThan(many[k - 1]);
    for (let k = f.capacity; k < many.length; k++) expect(many[k]).toBeCloseTo(f.minAffinity, 12);
    // 카드 수 이하면 가장 오래된 파일이 minAffinity 인 직선이다
    const few = folderAffinities(3);
    expect(few[0]).toBe(1);
    expect(few[1]).toBeCloseTo((1 + f.minAffinity) / 2, 12);
    expect(few[2]).toBeCloseTo(f.minAffinity, 12);
  });
});
