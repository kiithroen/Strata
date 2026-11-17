import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config';
import { formatStamp } from '../src/core/format';
import { applyQuality, qualityDefaults } from '../src/core/quality';
import { cardLayout, cornerRadius, cornerUv, faceLayout, type LayoutFace } from '../src/widgets/noteCard/cardLayout';

const FACES: LayoutFace[] = [
  { kind: 'photo', photo: { width: 640, height: 480 } },
  { kind: 'memo', title: '약속 확인', body: '금요일 19시 시청역 3번 출구 앞 카페에서 만나기' },
  { kind: 'doc', title: '문서', body: '본문' },
];

describe('cardLayout', () => {
  it.each([
    [640, 480],
    [480, 640],
    [560, 560],
    [640, 360],
  ])('%ix%i 사진의 비율을 지키고 제목 줄·사진·상태 줄이 위에서부터 이어진다', (w, h) => {
    const l = cardLayout(w, h);
    expect(l.kind).toBe('photo');
    expect(l.textureWidth).toBe(tuning.card.textureWidth);
    expect(Math.abs(l.content.height - (l.content.width * h) / w)).toBeLessThanOrEqual(0.5);
    expect(l.titleBar.y).toBe(0);
    expect(l.content.y).toBe(l.titleBar.height + l.padding);
    expect(l.footer.y).toBe(l.content.y + l.content.height);
    expect(l.footer.y + l.footer.height).toBe(l.textureHeight);
    expect(l.worldWidth).toBe(tuning.card.width);
    expect(l.worldWidth / l.worldHeight).toBeCloseTo(l.textureWidth / l.textureHeight, 12);
  });

  it('텍스처 폭을 바꿔도 칸의 비율은 같다', () => {
    const tw = [tuning.card.simpleTextureWidth, tuning.card.textureWidth, tuning.card.detailTextureWidth];
    for (const face of FACES) {
      const [a, b, c] = tw.map((t) => faceLayout(face, t));
      for (const l of [a, c]) {
        // 픽셀로 반올림하므로 가장 작은 텍스처의 한 칸 정도는 어긋날 수 있다
        const tol = 1.5 / Math.min(l.textureWidth, b.textureWidth);
        expect(l.content.y / l.textureHeight).toBeCloseTo(b.content.y / b.textureHeight, 1);
        expect(Math.abs(l.ring.x / l.textureWidth - b.ring.x / b.textureWidth)).toBeLessThanOrEqual(tol);
        expect(l.worldWidth).toBe(b.worldWidth);
      }
    }
  });
});

describe('cornerRadius', () => {
  it('모서리 반지름은 기준 폭 대비 비율이고, 카드 반 크기를 넘지 않는다', () => {
    for (const face of FACES) {
      const l = faceLayout(face);
      const r = cornerRadius(l);
      expect(r).toBeCloseTo(Math.min(l.unit * tuning.card.window.cornerRatio, l.textureWidth / 2, l.textureHeight / 2), 9);
      expect(r).toBeLessThanOrEqual(Math.min(l.textureWidth, l.textureHeight) / 2);
      expect(cornerUv(l)).toBeCloseTo(r / l.textureHeight, 12);
    }
  });

  it('텍스처 폭을 바꿔도 카드 대비 둥글기는 같다', () => {
    for (const face of FACES) {
      const a = faceLayout(face, tuning.card.simpleTextureWidth);
      const b = faceLayout(face, tuning.card.detailTextureWidth);
      expect(cornerRadius(a) / a.textureWidth).toBeCloseTo(cornerRadius(b) / b.textureWidth, 2);
    }
  });
});

describe('faceLayout', () => {
  it('긴 문서(doc)는 A4 비율이다', () => {
    const doc = faceLayout({ kind: 'doc' });
    expect(doc.kind).toBe('doc');
    expect(doc.worldWidth).toBeCloseTo(tuning.card.width * tuning.card.doc.widthScale, 12);
    expect(doc.worldHeight / doc.worldWidth).toBeCloseTo(Math.SQRT2, 2);
  });

  it('메모는 글이 길수록 넓고 높아지며, 폭과 높이는 정한 범위 안이다', () => {
    const m = tuning.card.memo;
    const short = faceLayout({ kind: 'memo', title: '우유' });
    const mid = faceLayout({ kind: 'memo', title: '약속 확인', body: '금요일 19시 시청역 3번 출구 앞 카페' });
    const long = faceLayout({ kind: 'memo', title: '장보기 목록', body: '우유, 계란 한 판, 방울토마토, 드립백 원두, 식빵, 버터, 세제, 키친타월, 건전지 사기. 영수증은 따로 챙기기' });
    expect(short.worldWidth).toBeLessThan(mid.worldWidth);
    expect(mid.worldWidth).toBeLessThanOrEqual(long.worldWidth);
    expect(short.worldHeight).toBeLessThan(long.worldHeight);
    for (const l of [short, mid, long]) {
      const scale = l.worldWidth / tuning.card.width;
      expect(scale).toBeGreaterThanOrEqual(m.widthScales[0] - 1e-9);
      expect(scale).toBeLessThanOrEqual(m.widthScales[1] + 1e-9);
      const aspect = l.textureHeight / l.textureWidth;
      expect(aspect).toBeGreaterThanOrEqual(m.aspect[0] - 0.02);
      expect(aspect).toBeLessThanOrEqual(m.aspect[1] + 0.02);
    }
  });

  it('메모 크기가 달라도 글자와 틀은 같은 월드 크기다', () => {
    const a = faceLayout({ kind: 'memo', title: '우유' });
    const b = faceLayout({ kind: 'memo', title: '장보기 목록', body: '우유, 계란 한 판, 방울토마토, 드립백 원두 사기' });
    // 텍스처 폭은 픽셀로 반올림하므로 1% 안에서 같다
    const ra = a.worldWidth / a.textureWidth;
    const rb = b.worldWidth / b.textureWidth;
    expect(Math.abs(ra - rb) / rb).toBeLessThan(0.01);
    expect(a.titleBar.height).toBe(b.titleBar.height);
    expect(a.unit).toBe(b.unit);
  });

  it('텍스처 품질 설정을 바꿔도 메모의 월드 크기는 변하지 않는다', () => {
    const memo: LayoutFace = { kind: 'memo', title: '장보기 목록', body: '우유, 계란 한 판, 방울토마토, 드립백 원두 사기' };
    const before = faceLayout(memo);
    const otherTex = tuning.quality.options.tex.find((v) => v !== qualityDefaults.tex) ?? qualityDefaults.tex;
    try {
      applyQuality({ tex: otherTex });
      const after = faceLayout(memo);
      expect(after.worldWidth).toBe(before.worldWidth);
      expect(after.worldHeight).toBeCloseTo(before.worldHeight, 2);
    } finally {
      applyQuality({ tex: qualityDefaults.tex });
    }
  });

  it('고리는 제목 줄 안 왼쪽에 있다', () => {
    for (const face of FACES) {
      const l = faceLayout(face);
      expect(l.ring.y).toBeCloseTo(l.titleBar.height / 2, 9);
      expect(l.ring.x - l.ring.size / 2).toBeGreaterThanOrEqual(0);
      expect(l.ring.x + l.ring.size / 2).toBeLessThan(l.textureWidth / 2);
      expect(l.ring.size).toBeLessThan(l.titleBar.height);
    }
  });
});

describe('formatStamp', () => {
  it('YYYY.MM.DD HH:mm 로 두 자리를 채운다', () => {
    expect(formatStamp(new Date(2026, 0, 5, 7, 3))).toBe('2026.01.05 07:03');
  });
});
