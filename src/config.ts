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
    textureWidth: 512,
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
    positionRate: 9,
    rotationRate: 9,
    scaleRate: 9,
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
