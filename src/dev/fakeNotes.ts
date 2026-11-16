import { tuning } from '../config';
import { DAY_MS, floorTo } from '../core/calendar';
import { createRng } from '../core/random';
import type { NoteKind } from '../widgets/noteCard/cardLayout';
import type { NoteRef } from '../widgets/timeAxis/axisModel';

const HOUR_MS = 3_600_000;
const TAG_POOL = [
  '여행', '일상', '메모', '작업', '음식', '산책', '영수증', '아이디어',
  '카페', '가족', '운동', '독서', '회의', '사진', '바다', '쇼핑',
] as const;

const MEMO_SAMPLES: readonly { title: string; body?: string }[] = [
  { title: '장보기 목록', body: '우유, 계란 한 판, 방울토마토, 드립백 원두 사기' },
  { title: '화면 비율 체크', body: '폴더블 펼쳤을 때 폰트 크기랑 여백 다시 재 보기' },
  { title: '읽을 책', body: '인터페이스 역사와 공간 기억에 관한 단상 메모' },
  { title: '약속 확인', body: '금요일 19시 시청역 3번 출구 앞 카페에서 만나기' },
  { title: '산책길 발견', body: '골목 끝 오래된 서점 간판 색감이 꽤 좋았음' },
  { title: '우산 챙기기' },
  { title: '비밀번호 힌트', body: '첫 고양이 이름' },
  {
    title: '이번 주 할 일',
    body: '세탁소 맡긴 코트 찾기, 치과 예약 변경, 보고서 초안 금요일까지, 엄마 생신 선물 고르기, 화분 분갈이, 자전거 바람 넣기',
  },
];

const DOC_SAMPLES: readonly { title: string; body: string }[] = [
  {
    title: '주간 작업 정리 및 다음 단계 메모',
    body:
      '우주 보기에서 노드를 중심으로 관련도가 높은 노트가 더 가까이 모이고 빠르게 도는 구조를 점검했다.\n' +
      '사진은 폴라로이드 인화지, 짧은 메모는 포스트잇, 긴 글은 A4 용지로 형태를 나누어 한눈에 성격을 구분할 수 있게 정리한다.\n' +
      '다음 단계에서는 터치 제스처와 실기기 프레임 예산을 확인한 뒤 2D 카드 목록으로 자연스럽게 연결할 예정이다.',
  },
  {
    title: '여행 경비 및 일정 기록',
    body:
      '첫째 날 오전 도착 후 숙소에 짐을 맡기고 시장 골목부터 걸었다. 사진과 영수증을 날짜별로 묶어 두고 나중에 태그로 다시 엮는다.\n' +
      '둘째 날에는 바닷가 산책로를 따라 이동하며 틈틈이 짧은 메모를 남겼다. 해 질 녘 노을 사진이 가장 중심 기억으로 남는다.\n' +
      '전체 지출은 카드 내역 기준으로 정산 완료했고, 남은 영수증 두 건만 확인하면 마무리된다.',
  },
  {
    title: '아이디어 스케치: 공간 기반 노트 탐색',
    body:
      '일반적인 목록 화면에서는 과거 기록이 시간순으로만 쌓여 맥락을 떠올리기 어렵다.\n' +
      '3D 나선팔에서는 눈에 띄는 기억과 연결 강도를 직관적으로 훑어보고, 자세히 읽거나 수정할 때만 2D 카드 모드로 전환한다.\n' +
      '인력 거리와 공전 속도의 대비가 과하지 않게 천천히 흐르도록 튜닝 값을 다듬는다.',
  },
];

/** 개발용 샘플 노트 본문(메모·문서)을 고른다. */
export function sampleNoteText(kind: NoteKind, pick: number): { title?: string; body?: string } {
  if (kind === 'memo') return MEMO_SAMPLES[pick % MEMO_SAMPLES.length];
  if (kind === 'doc') return DOC_SAMPLES[pick % DOC_SAMPLES.length];
  return {};
}

/**
 * 개발용 가짜 노트 시각. 최근일수록 촘촘하고, 몇몇 날에는 몇 시간 안에 여러 장을 몰아 찍는다.
 * 가장 최근 노트는 newest 이고, 결과는 최근 것부터 정렬된다. 번호는 오래된 것부터 매긴다.
 */
export function createFakeNotes(newest: number): NoteRef[] {
  const d = tuning.dev;
  const rng = createRng(d.noteSeed);
  const daysBack = () => Math.pow(rng(), 1.6) * d.spanDays;
  const clamp = (t: number) => (t > newest ? newest - rng() * HOUR_MS : t);
  const times: number[] = [newest];

  for (let b = 0; b < d.bursts && times.length < d.noteCount; b++) {
    const day = floorTo('day', newest - daysBack() * DAY_MS);
    const start = day + (9 + rng() * 13) * HOUR_MS;
    const n = 2 + Math.floor(rng() * 6);
    for (let i = 0; i < n && times.length < d.noteCount; i++) times.push(clamp(start + rng() * 2 * HOUR_MS));
  }
  while (times.length < d.noteCount) {
    const day = floorTo('day', newest - daysBack() * DAY_MS);
    times.push(clamp(day + (7 + rng() * 16) * HOUR_MS));
  }

  times.sort((p, q) => q - p);
  const metaRng = createRng(d.noteSeed + 7);
  return times.map((time, i) => {
    const dayKey = floorTo('day', time);
    const dayTopic = TAG_POOL[Math.abs(Math.floor(dayKey / DAY_MS)) % TAG_POOL.length];
    const count = metaRng() < 0.15 ? 0 : metaRng() < 0.65 ? 1 : 2 + Math.floor(metaRng() * 2);
    const tags: string[] = [];
    for (let t = 0; t < count; t++) {
      const pick = t === 0 && metaRng() < 0.7 ? dayTopic : TAG_POOL[Math.floor(metaRng() * TAG_POOL.length)];
      if (!tags.includes(pick)) tags.push(pick);
    }
    const roll = metaRng();
    const kind: NoteKind = roll < 0.55 ? 'photo' : roll < 0.85 ? 'memo' : 'doc';
    const sample = sampleNoteText(kind, Math.floor(metaRng() * 100));
    return { id: String(times.length - i).padStart(4, '0'), time, tags, kind, ...sample };
  });
}
