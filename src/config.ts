/**
 * 튜닝 값을 모아 둔다. 문서와 테스트에는 값을 옮겨 적지 않고 이 모듈을 읽는다.
 * 시간 단위는 초, 거리 단위는 월드 단위, 각도는 라디안이다.
 */
export const tuning = {
  camera: {
    fovDeg: 50,
    near: 0.1,
    far: 60,
  },

  look: {
    background: '#07070a',
    accent: '#d1222b',
    text: '#e9e6e1',
    textDim: '#8a8782',
    panel: 'rgba(10, 10, 14, 0.78)',
    frameLine: 'rgba(233, 230, 225, 0.55)',
    fogNear: 6,
    fogFar: 22,
    scanlineDensity: 180,
    scanlineSpeed: 1.2,
    scanlineStrength: 0.1,
    noiseStrength: 0.035,
    noiseFps: 24,
    focusEdgeWidth: 0.012,
    dimFloor: 0.28,
  },

  card: {
    /** 카드 전체 폭. 높이는 사진 비율과 라벨 띠로 정해진다. */
    width: 1.2,
    /** 떠 있는 카드의 텍스처 폭(px) */
    textureWidth: 320,
    /** 펼친 카드에 따로 만들어 쓰는 선명한 텍스처 폭(px) */
    detailTextureWidth: 1024,
    /** 텍스처 폭 대비 안쪽 여백 */
    paddingRatio: 0.035,
    /** 사진 폭 대비 라벨 띠 높이 */
    labelRatio: 0.13,
    /** 텍스처 폭 대비 모서리 괄호 길이 */
    bracketRatio: 0.07,
  },

  float: {
    amplitude: 0.06,
    periodMin: 4.5,
    periodMax: 7.5,
    tiltAmplitude: 0.05,
  },

  focus: {
    /** 카메라에서 펼친 카드까지 거리 */
    distance: 2.4,
    /** 화면 폭·높이 가운데 펼친 카드가 차지할 비율 */
    fill: 0.86,
    /** 펼치기·닫기 전환 속도(1/초) */
    rate: 9,
    dimRate: 7,
    /** 다른 카드가 펼쳐졌을 때 나머지 카드의 어둡기 */
    othersDim: 0.65,
  },

  field: {
    count: 36,
    seed: 20261115,
    /** 그 깊이에서 화면 반높이 대비 좌우로 퍼지는 폭 */
    spreadX: 1.1,
    /** 그 깊이에서 화면 반높이 대비 위아래로 퍼지는 폭 */
    spreadY: 0.75,
    depthNear: 5,
    depthFar: 16,
    /** 자리 하나를 고를 때 비교하는 후보 수(많을수록 고르게 퍼진다) */
    candidates: 24,
    /** 카드 기본 회전(요)의 최대 크기 */
    yawMax: 0.35,
  },

  axis: {
    /** 카메라에서 지금 시점(초점면)까지 거리 */
    focusDepth: 6,
    /** 이보다 가까운 눈금과 카드는 그리지 않는다 */
    nearDepth: 1.2,
    /** 카드가 이보다 가까워지면 옅어지기 시작해 nearDepth 에서 사라진다 */
    fadeNearStart: 3.2,
    /** 시간축은 멀리까지 보여야 해서 안개를 따로 둔다 */
    fogNear: 9,
    fogFar: 28,
    /** 눈금과 카드를 그리는 가장 먼 깊이. axis.fogFar 부터 여기까지 옅어진다 */
    farDepth: 32,
    /** 단계마다 그 단계 단위(연·월·일·시) 하나가 차지하는 깊이 */
    levelDepth: { year: 30, month: 24, day: 18, note: 7 },
    timeRate: 7,
    scaleRate: 6,
    /** 묶임이 바뀔 때 카드가 새 자리로 옮겨 가는 속도 */
    layoutRate: 8,
    /** 큰 눈금 단위는 간격이 이 깊이 이상인 가장 작은 단위다 */
    majorMinSpacing: 3,
    /** 작은 눈금은 간격이 이 깊이 이상일 때만 긋는다 */
    minorMinSpacing: 0.35,
    /** 작은 눈금에 글자를 붙이는 최소 간격 */
    minorLabelMinSpacing: 0.6,
    /** 화면에서 이웃 눈금 글자와 떨어져야 하는 최소 거리(시야 탄젠트 단위) */
    labelMinGap: 0.045,
    /** 노트 묶음 단위는 간격이 이 깊이 이상인 가장 작은 단위다. 가장 작은 단위도 넘으면 묶지 않는다 */
    clusterMinSpacing: 0.5,
    maxTicks: 400,
    railY: -1.7,
    railHalfWidth: 1.0,
    majorTickOverhang: 0.25,
    labelHeight: 0.2,
    minorLabelHeight: 0.13,
    /**
     * 카드가 떠 있는 고리. 반지름은 초점면에서 카드 중심이 움직일 수 있는 범위(placement.laneRoom) 대비 비율이라
     * 1이면 초점면의 카드가 화면 안에 다 들어온다. centerY 는 화면 반높이 대비 고리 중심 높이, innerRatio 는 안쪽 반지름 비율이다
     */
    lane: { centerY: 0.22, halfWidth: 0.95, halfHeight: 0.55, innerRatio: 0.35 },
    /** 묶음 안 카드가 뒤로 쌓이는 간격과 보이는 최대 장수 */
    stack: { dx: 0.06, dy: 0.06, dz: 0.14, visible: 4 },
    /** 시간축 위 카드 크기(card.width 대비 배율) */
    cardScale: 0.72,
    /** 카드가 카메라 쪽으로 몸을 트는 정도(0~1) */
    faceCamera: 0.6,
    badgeHeight: 0.16,
  },

  cosmos: {
    /** 우주는 깊이 끝까지 보여야 해서 안개를 따로 둔다 */
    fogNear: 14,
    fogFar: 44,
    nearDepth: 1.0,
    fadeNearStart: 2.6,
    farDepth: 52,
    /** 행성 단위는 간격이 이 깊이 이상인 가장 작은 단위(연·월·일·시)다. 다 넘으면 시 단위다 */
    planetMinSpacing: 0.6,
    /** 나선팔: 깊이 1 마다 도는 각도, 초점면에서 지금 행성이 놓이는 각도(-π/2 가 화면 아래), 나선 반지름 */
    twist: 0.21,
    focusAngle: -1.5708,
    armRadius: 1.3,
    /** 행성마다 나선에서 벗어나는 정도: 반지름 비율, 각도 */
    radiusJitter: 0.35,
    angleJitter: 0.3,
    /** 은하 전체가 도는 속도(라디안/초) */
    spin: 0.015,
    planetRadius: 0.16,
    /** 위성 수의 제곱근에 곱해 행성 반지름에 더한다 */
    planetGrowth: 0.05,
    glowScale: 7,
    planetLabelHeight: 0.13,
    planetMaxRadius: 0.34,
    /**
     * 위성 고리: 첫 고리 위성 수, 고리마다 늘어나는 수, 고리 간격, 공전 속도 계수, 고리 기울기 최대.
     * maxByUnit 은 행성 단위별 카드 고리 수다. 넘친 위성은 바깥 띠에 작게 돈다
     */
    ring: { base: 3, grow: 2, gap: 0.3, speed: 0.55, inclination: 0.55, maxByUnit: { year: 1, month: 1, day: 2, hour: 3, hour6: 2, min15: 3 } },
    satelliteScale: 0.3,
    ringOpacity: 0.35,
    /** 고리에 다 못 들어간 위성은 바깥 띠에 작게 돈다 */
    overflowScale: 0.07,
    /** 묶임이 바뀔 때 위성이 새 행성으로 옮겨 가는 속도, 행성이 나타나고 사라지는 속도 */
    regroupRate: 5,
    planetFadeRate: 4,
    /** 손가락이 닿아 있는 동안 공전·은하 회전이 멈추고, 떼면 다시 도는 속도. 움직이는 위성을 탭하기 쉽게 한다 */
    holdRate: 12,
    /** 먼지: 나선팔 둘레 반지름 퍼짐, 각도 퍼짐, 원반 전체에 흩어지는 비율 */
    dust: { count: 9000, arms: 2, spread: 0.16, angleSpread: 0.12, halo: 0.12, size: 2.4, opacity: 0.55 },
    stars: { count: 2600, radius: 55, size: 1.8 },
    coreSize: 9,
  },

  dev: {
    /** 시간축 데모의 가짜 노트 */
    noteCount: 110,
    noteSeed: 1115,
    spanDays: 600,
    bursts: 22,
  },

  input: {
    /** 이 거리(CSS px) 안에서 떼면 탭으로 본다 */
    tapSlop: 10,
    /** 이 시간 안에 떼면 탭으로 본다 */
    tapMaxSeconds: 0.35,
  },

  loop: {
    /** 탭 전환 등으로 프레임이 길게 멈췄을 때 한 번에 진행할 최대 게임 시간 */
    maxStep: 0.1,
  },
} as const;

export type Tuning = typeof tuning;
