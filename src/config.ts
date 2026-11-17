/**
 * 튜닝 값을 모아 둔다. 문서와 테스트에는 값을 옮겨 적지 않고 이 모듈을 읽는다.
 * 시간 단위는 초, 거리 단위는 월드 단위, 각도는 라디안이다.
 */
export const tuning = {
  render: {
    /** 렌더러 픽셀 비율 상한. 기기의 devicePixelRatio 와 비교해 작은 쪽을 쓴다 */
    maxPixelRatio: 2,
    /** 다중 표본 계단 제거(MSAA) */
    antialias: true,
    /** 블룸 후처리(아래 bloom) */
    bloom: true,
  },

  /** 블룸: 밝기(선형)가 threshold 이상인 곳을 흐려 strength 배로 되더한다. radius 는 번짐 반경(0~1) */
  bloom: {
    strength: 0.6,
    radius: 0.6,
    threshold: 0.68,
  },

  camera: {
    fovDeg: 50,
    near: 0.1,
    far: 150,
  },

  /** 화면 전체의 색: 짙은 남색 바탕에 청록 강조, 푸른빛 흰 글자. HUD(CSS 변수)도 main.ts 가 이 값으로 맞춘다 */
  look: {
    background: '#020814',
    accent: '#38d4ff',
    text: '#d3f1ff',
    textDim: '#5e8aa6',
    fogNear: 6,
    fogFar: 22,
    focusEdgeWidth: 0.012,
    dimFloor: 0.28,
    /**
     * 화면 글자: outline·outlineAlpha 는 텍스처에 두르는 바탕색 테두리 굵기(글자 크기 대비)와 불투명도.
     * declutter 는 겹치는 글자 정리: padPx 는 글자 사이 여백(CSS px), blockAlpha 는 자리를 막는 최소 불투명도, rate 는 숨고 나타나는 빠르기(1/초)
     */
    label: { outline: 0.22, outlineAlpha: 0.8, declutter: { padPx: 2, blockAlpha: 0.25, rate: 8 } },
  },

  card: {
    /** 카드 기준 폭. 타입별 비율과 크기는 아래 설정으로 정해진다. */
    width: 1.2,
    /** 떠 있는 카드의 텍스처 폭(px) */
    textureWidth: 320,
    /** 펼친 카드에 따로 만들어 쓰는 선명한 텍스처 폭(px) */
    detailTextureWidth: 1024,
    /** 멀리서 쓰는 단순한 텍스처 폭(px). 글자 없이 틀·막대·모자이크만 그린다 */
    simpleTextureWidth: 96,
    /**
     * 카드 틀: 제목 줄과 아래 상태 줄 높이, 안쪽 여백, 테두리 선 굵기, 겉모양과 사진 칸의 모서리 둥글기(모두 텍스처 폭 대비).
     * 단순한 텍스처는 선이 뭉개지지 않게 simpleLineRatio 를 쓴다
     */
    window: {
      titleRatio: 0.085,
      footerRatio: 0.075,
      paddingRatio: 0.045,
      lineRatio: 0.005,
      simpleLineRatio: 0.022,
      cornerRatio: 0.07,
      innerCornerRatio: 0.035,
      /** 메모 오른쪽 아래 접힌 귀퉁이 크기(텍스처 폭 대비) */
      foldRatio: 0.11,
    },
    /**
     * 홀로그램 색. kinds 는 사진·문서의 선·글자 색, memoColors 는 메모가 고르는 포스트잇 색이다. 멀리서 흑백으로 바꿀 때도 그 카드 색으로 물든다.
     * fill 은 카드 바탕, 나머지는 선 색에서 낸 흐린 선·옅은 선·빈 사진 칸의 불투명도, glowRatio 는 선과 글자의 빛 번짐(폭 대비)이다
     */
    holo: {
      kinds: { photo: '#48d6ff', doc: '#7fa4ff' },
      memoColors: ['#5ef0c8', '#ffcf5a', '#ff7fbf'],
      fill: 'rgba(6, 22, 52, 0.78)',
      dimAlpha: 0.55,
      faintAlpha: 0.24,
      bandAlpha: 0.18,
      glowRatio: 0.016,
      /** 메모·문서 바탕에 까는 종류 색 유리 그라데이션의 위·아래 불투명도, 문서 괘선의 불투명도 */
      washAlpha: [0.5, 0.26],
      docWashAlpha: [0.4, 0.18],
      ruleAlpha: 0.18,
      /** 메모·문서 글자색이 카드 색에서 흰색 쪽으로 밝아지는 비율 */
      inkLift: 0.6,
    },
    /** 멀리서 쓰는 단순한 모양: 사진 모자이크 가로 칸 수, 글 줄 막대 높이·간격(텍스처 폭 대비) */
    simple: { photoBlocks: 9, barRatio: 0.045, barGapRatio: 0.085 },
    /**
     * 멀고 가까움에 따른 모습. 값은 카드 높이가 화면 높이에서 차지하는 비율이다.
     * detail 범위에서 단순한 모양이 제대로 된 모양으로, color 범위에서 흑백이 제 색으로 바뀐다.
     * farAlpha 는 단순한 모양일 때의 불투명도 배율, focusAlpha 는 펼친 카드 바탕의 최소 불투명도(뒤가 비쳐 글이 흐려지지 않게)다
     */
    lod: { detail: [0.045, 0.11], color: [0.04, 0.11], farAlpha: 0.78, focusAlpha: 0.94 },
    /**
     * 홀로그램 빛. stripe* 는 카드를 가로지르는 가는 줄무늬의 빈도(카드 높이당 줄 수)·세기(줄 사이가 투명해지는 정도)·
     * 위로 흐르는 속도(카드 높이/초), iridescence 는 비스듬히 볼수록 도는 무지개빛 막의 세기,
     * irisShift 는 무지개빛이 보는 각도에 따라 도는 정도, chroma 는 선의 빨강·파랑이 갈라지는 폭(텍스처 좌표),
     * glassSheen 은 시선 각도에 따라 카드 유리면에 비치는 은은한 광택 세기, bevel 은 둥근 모서리 안쪽 반사광 세기다
     */
    holoFx: {
      stripeFreq: 42,
      stripeStrength: 0.11,
      stripeSpeed: 0.035,
      iridescence: 0.045,
      irisShift: 1.4,
      chroma: 0.0022,
      glassSheen: 0.13,
      bevel: 0.34,
    },
    /**
     * 테두리 빛: 겉모양 선을 따라 종류 색을 더해 블룸이 걸리게 한다. width 는 빛이 퍼지는 폭(카드 높이 대비), strength 는 밝기.
     * runner* 는 테두리를 따라 도는 빛의 밝기·빠르기(초당 바퀴)·꼬리 길이(한 바퀴 대비)다.
     * runnerJitter 는 카드마다 그 셋에 곱하는 배율의 범위와 반대 방향으로 도는 카드의 비율이다
     */
    border: {
      width: 0.01,
      strength: 0.85,
      runnerStrength: 1.5,
      runnerSpeed: 0.16,
      runnerTail: 0.14,
      runnerJitter: { speed: [0.55, 1.6], tail: [0.6, 1.6], strength: [0.55, 1.15], reverse: 0.4 },
    },
    /**
     * 그림 밝기 누르기: 펼치지 않은 카드는 그림(사진·글) 밝기를 블룸 문턱 아래로 눌러 흰 바탕 사진이 번져 날아가지 않게 한다.
     * knee 아래 밝기는 그대로 두고, 그 위는 ceiling 에 다가갈 뿐 넘지 않게 부드럽게 누른다. 둘 다 bloom.threshold 대비 화면 밝기다.
     * 테두리 빛·도는 빛은 그 뒤에 더해 블룸이 그대로 걸린다. 펼친 카드는 제 밝기다
     */
    highlight: { knee: 0.55, ceiling: 0.9 },
    /**
     * 사진 홀로그램: 펼치지 않은 사진 카드의 사진 칸을 카드 색 가로 선으로 다시 그린다. 선은 사진 밝기만큼 위아래로 휘고 굵어진다.
     * lines 는 사진 높이당 선 수, warp 는 가장 밝은 곳에서 선이 밀리는 거리(선 간격 단위), width 는 어두운 곳~밝은 곳의 선 굵기(선 간격 대비),
     * base 는 선 사이에도 남는 사진 밝기의 비율, gain 은 전체 밝기, blur 는 밝기를 읽을 때 흐리는 정도(밉맵 단계),
     * speed 는 선이 아래로 흐르는 빠르기(선 간격/초)다. 선이 화면에서 너무 촘촘하면 선 대신 그 평균 밝기로 칠한다. 펼치면 원래 사진으로 돌아온다
     */
    photoFx: { lines: 44, warp: 1.6, width: [0.06, 0.45], base: 0.06, gain: 1.25, blur: 1.5, speed: 0.35 },
    /**
     * 사진 선화: 펼치지 않은 사진 카드의 사진 칸을 카드 색 선으로만 그리고 나머지는 비운다. 흰 바탕의 글자처럼 둘레보다 어두운 획(먹)과
     * 밝기가 갑자기 바뀌는 윤곽(가장자리)이 선이 된다. edge 는 윤곽 세기(3×3 소벨, 감마 밝기)가 선이 되기 시작해 다 되는 범위,
     * ink 는 둘레 평균보다 어두운 정도가 먹이 되기 시작해 다 되는 범위, inkBlur 는 둘레 평균을 낼 때 흐리는 정도(밉맵 단계),
     * spread 는 윤곽을 잴 때 이웃까지 거리(화면 px), bgAlpha 는 선이 아닌 자리의 불투명도, gain 은 선 밝기다
     */
    photoSketch: { edge: [0.12, 0.34], ink: [0.05, 0.16], inkBlur: 4, spread: 1, bgAlpha: 0.18, gain: 1.3 },
    /**
     * 짧은 노트(메모): 글 양에 맞춰 크기가 바뀐다. 폭은 기준 폭 대비 widthScales 범위에서 글 폭(어림, 글자 크기 단위)이 fullText 에 가까울수록 넓고,
     * 높이는 제목·본문 줄 수에 맞추되 폭 대비 aspect 범위로 자른다. 글자 크기는 텍스처 기준 폭 대비 titleRatio·bodyRatio, 줄 간격 배율 lineHeight
     */
    memo: { widthScales: [0.6, 0.92], fullText: 40, aspect: [0.5, 1.3], titleRatio: 0.07, bodyRatio: 0.058, lineHeight: 1.45 },
    /** 긴 문서는 1:√2 세로 비율이다. 기준 폭 대비 배율 */
    doc: { widthScale: 1.05 },
  },

  float: {
    amplitude: 0.06,
    periodMin: 4.5,
    periodMax: 7.5,
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

  /**
   * 카드 공간 보기(카드 보기의 3D 모드): field 배치로 흩은 카드 사이를 앞뒤로 날아 훑는다.
   * depthNear 는 가장 가까운 자리의 깊이, cardsPerDepth 는 깊이 1 에 놓는 카드 수(깊이 범위는 최소 minSpan),
   * spreadDepth 는 퍼지는 폭이 더 넓어지지 않는 깊이, spread 는 field.spreadX·spreadY 에 곱하는 배율,
   * fitWidth·fitHeight 는 카드 중심이 퍼지는 좌우·위아래 폭의 상한(화면 반폭·반높이 대비)이다. 세로 화면에서 깊이·위아래 퍼짐을 늘리는 규칙은 cardField.ts 에 있다.
   * dollyPerPx 는 세로 끌기 1px, wheelDolly 는 휠 deltaY 1, pinchDolly 는 핀치 배율 로그 1 만큼 들어가는 거리,
   * dollyRate 는 앞뒤 이동이 목표를 따라가는 속도(1/초), nearFade 는 카메라에서 이 거리 범위로 다가오면 카드가 사라지는 구간이다
   */
  cardField: {
    depthNear: 5.2,
    cardsPerDepth: 3,
    minSpan: 4,
    spreadDepth: 8,
    spread: 0.95,
    fitWidth: 0.7,
    fitHeight: 0.85,
    dollyPerPx: 0.04,
    wheelDolly: 0.012,
    pinchDolly: 6,
    dollyRate: 8,
    nearFade: [0.9, 2.4],
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
    fogNear: 24,
    fogFar: 75,
    nearDepth: 1.0,
    fadeNearStart: 2.2,
    farDepth: 90,
    /** 행성 단위는 간격이 이 깊이 이상인 가장 작은 단위(연·월·일·시)다. 다 넘으면 시 단위다 */
    planetMinSpacing: 0.6,
    /**
     * 구면 나선: 가장 최근 시점(s=0)이 원점(0,0,0)에 놓이고, 과거·미래로 갈수록 로그 곡선으로
     * 3차원 사방으로 감겨 퍼진다(radialScale, spiralKnee). twist 는 방위각 감김, elevationAmp·Freq 는 상하 물결.
     */
    radialScale: 4.5,
    spiralKnee: 0.25,
    twist: 2.2,
    elevationAmp: 0.72,
    elevationFreq: 1.25,
    /** 궤도 카메라 거리 범위·기본 거리·초기 각도(라디안) */
    initialDistance: 11.0,
    minDistance: 1.6,
    maxDistance: 36,
    initialOrbit: { yaw: 0.35, pitch: 0.28 },
    /**
     * 은하에서 처음 탭한 노드로 다가가기: 행성·허브별 카메라 거리 상한(이미 더 가까우면 그대로),
     * 다가간 노드의 빛 크기 배율과 그 빛이 커지는 빠르기
     */
    approach: { planetDistance: 4.2, hubDistance: 7.8, glowScale: 1.8, glowRate: 6 },
    /**
     * 노트가 행성에 끌리는 관련도: timeScale 은 시간 점수가 1/e 로 줄어드는 거리(행성 단위 길이 대비),
     * timeWeight 는 묶음에 태그가 있을 때 시간 점수의 비중(나머지는 태그 점수)
     */
    affinity: { timeScale: 0.25, timeWeight: 0.6 },
    /** 행성마다 구면 나선에서 벗어나는 정도: 반지름 비율, 방위각, 고도각 */
    radiusJitter: 0.16,
    angleJitter: 0.22,
    elevationJitter: 0.16,
    /** 나선 위 점의 고도각 상한(라디안). 노드·허브와 먼지가 함께 쓴다 */
    maxElevation: 1.45,
    /** 은하 전체가 도는 속도(라디안/초) */
    spin: 0.015,
    /** 행성(시간 묶음 노드)의 반지름: 카드가 도는 띠의 안쪽 기준. 위성 수의 제곱근 × planetGrowth 를 더하고 planetMaxRadius 를 넘지 않는다 */
    planetRadius: 0.16,
    planetGrowth: 0.05,
    planetMaxRadius: 0.34,
    /** 행성 글자 높이(CSS px). 화면에 늘 같은 크기로 보인다 */
    planetLabelPx: 13,
    /** 행성 위에 노드 색으로 뜨는 대표 태그 글자 높이(CSS px). 멀어져 워드 클라우드가 뜨면 그쪽으로 넘어간다 */
    planetTitlePx: 16,
    /**
     * 선 그래프. 선 굵기는 CSS px, 점·빛 크기는 월드 단위 지름이다.
     * branchBend: 허브에서 자식 행성으로 가는 곡선 가지의 제어점. 허브 쪽은 척추 접선 방향으로, 행성 쪽은 허브 쪽으로 허브-행성 거리의 이 비율만큼 당긴다.
     * nodeColor: 노드(행성·허브)마다 키로 고르는 색의 채도·명도 범위. 노드는 흰 코어를 그 색 테두리가 감싼 구슬이다.
     * burst: 노드에서 노트 점이 방사형으로 퍼지는 원판(안쪽 반지름, 간격, 앞뒤 흔들림, 회전 속도).
     * hourColors: 노트가 찍힌 시각(4시간 단위)별 점 색
     */
    graph: {
      branchWidth: 2.8,
      branchSegments: 14,
      branchBend: [0.38, 0.28],
      spokeWidth: 1.0,
      branchColor: '#5cd8ff',
      nodeColor: { saturation: [0.82, 1.0], lightness: [0.46, 0.6] },
      branchAlpha: 0.55,
      spokeAlpha: 0.55,
      nodeSize: 0.26,
      hubSize: 0.34,
      /** 노드 구슬이 화면에서 차지하는 지름의 하한·상한(CSS px). 가까이 가도 노드가 커지지 않는다 */
      orbPx: [6, 18],
      dotSize: 0.055,
      glowSize: 0.6,
      hubGlowSize: 0.9,
      glowAlpha: 0.4,
      /** 허브 글자 높이(CSS px) */
      hubLabelPx: 15,
      /** 허브는 자식 행성 반지름의 이 비율인 안쪽 구면 껍질 위에 놓이고, 행성은 바깥으로 가지에 매달린다 */
      hubRadius: 0.72,
      tapRadius: 34,
      /** 카드 탭 판정 반경(CSS px). 화면에 보이는 카드 반지름이 이보다 크면 그쪽을 쓴다 */
      cardTapRadius: 38,
      burst: { inner: 0.06, spacing: 0.055, pullSpread: 0.85, pullCurve: 1.5, depthJitter: 0.05, spin: 0.06 },
      hourColors: ['#2a5cff', '#2f9dff', '#38d4ff', '#7fe9ff', '#5a7dff', '#8fb4ff'],
    },
    /** 폴더 축(탐색기 폴더를 은하로 볼 때): 행성(폴더)마다 카드로 도는 파일 수, 폴더에서 가장 오래된 파일의 관련도 */
    folderAxis: { capacity: 8, minAffinity: 0.25 },
    /**
     * 노드 둘레를 도는 카드(위성). 카드는 기운 원 궤도를 일정한 빠르기로 돌고 늘 카메라를 바라본다.
     * capacityByUnit: 행성 단위별 카드 수(넘친 노트는 점으로만 보인다).
     * gap·spread·pullCurve: 행성 표면에서 가장 강한 인력 거리와 관련도가 낮을수록 멀어지는 폭·곡선 지수.
     * speed·speedJitter: 공전 속도 계수(반지름^1.5 로 나눔)와 카드마다 배율 범위.
     */
    swarm: {
      capacityByUnit: { year: 3, month: 3, day: 8, hour: 14, hour6: 8, min15: 14 },
      gap: 0.11,
      spread: 1.35,
      pullCurve: 1.6,
      speed: 0.065,
      speedJitter: [0.6, 1.4],
    },
    satelliteScale: 0.3,
    /** 묶임이 바뀔 때 위성이 새 행성으로 옮겨 가는 속도, 행성이 나타나고 사라지는 속도 */
    regroupRate: 5,
    planetFadeRate: 4,
    /** 손가락이 닿아 있는 동안 공전·은하 회전이 멈추고, 떼면 다시 도는 속도. 움직이는 위성을 탭하기 쉽게 한다 */
    holdRate: 30,
    /**
     * 먼지: 구면 나선팔 둘레 반지름 퍼짐, 각도 퍼짐, 구 전체에 흩어지는 비율.
     * armRadiusFloor: 팔 먼지 반지름 배율 하한, haloRadius·haloElevation: 흩어진 먼지의 반지름 배율 범위와 고도각 범위,
     * coreRadius: 원점 근처 먼지가 모이지 않게 두는 최소 월드 반지름
     */
    /** 먼지 색 두 가지(점마다 그 사이에서 고른다) */
    dustColors: ['#6fd6ff', '#4a6dff'],
    dust: { count: 9000, armRadiusFloor: 0.35, haloRadius: [0.35, 1.2], haloElevation: 1.4, coreRadius: 0.3, spread: 0.16, angleSpread: 0.18, halo: 0.14, maxArc: 5.0, size: 5.0, opacity: 0.78 },
    stars: { count: 2600, radius: 55, size: 1.8 },
    /**
     * 성운 배경. bakeSize 가 0 이면 매 프레임 화면 해상도로 계산하고, 양수면 그 크기(px)의 큐브맵에 구워 두고
     * refreshSeconds(게임 시간)마다 다시 굽는다. intensity 는 성운 밝기 배율이다
     */
    nebula: { visible: true, bakeSize: 0, refreshSeconds: 2, intensity: 0.26, colors: ['#0d2b80', '#075c7a', '#1e1894'] },
  },

  /**
   * 지층 보기: 은하에서 노드를 고르면 그 노드가 속한 위 묶음(예: 달)을 아래 묶음(예: 날)별 수평 층으로 쌓아 내려다본다.
   * 최근 층이 위다. 층 안에서는 노트 창이 바닥에 눕혀 깔린다.
   */
  strata: {
    /** 층 사이 높이(월드) */
    layerGap: 1.7,
    /** 노트 창 배율(card.width 기준 크기 대비). 관련도가 낮은 노트부터 높은 노트까지 */
    cardScale: [0.42, 0.62],
    /** 창 사이·고리 사이 여백(가장 큰 창 대각선 대비) */
    cellGap: 0.16,
    /** 지층에 깔리지 않는 카드가 들어가는 동안 사라지는 빠르기(들어간 정도 대비 배율) */
    leaveFade: 2.5,
    /** 층 원판이 가장 바깥 창보다 넓게 두르는 여백(월드)과 날짜 글자 높이(월드) */
    margin: 0.35,
    labelHeight: 0.2,
    /**
     * 층 원판의 HUD 링(반지름 1 기준). line 은 선 굵기, alpha 는 가장 밝을 때 불투명도, fillAlpha 는 가운데가 밝은 원판 바탕,
     * dashes 는 안쪽 점선 링의 점 수, dashSpeed·arcSpeed·dotSpeed 는 점선 링·바깥 호 조각·안쪽 점 링이 원판에 대해 더 도는 빠르기(초당 바퀴, 음수는 반대 방향)다
     */
    ring: { line: 0.006, alpha: 0.5, fillAlpha: 0.05, dashes: 96, dashSpeed: 0, arcSpeed: -0.045, dotSpeed: 0 },
    /** 원판(테이블)이 창을 얹은 채 도는 빠르기(라디안/초)와, 멈추고 다시 돌 때 빠르기가 따라가는 속도(1/초) */
    spin: { speed: 0.08, rate: 2.5 },
    /**
     * 아래에서 올라오는 빛기둥. emitterGap 은 가장 아래층에서 발광부까지 거리(layerGap 배), topGap 은 가장 위층 위로 더 뻗는 거리(layerGap 배),
     * spread 는 위쪽 반지름(가장 큰 층 반지름 배), base 는 발광부 반지름(월드), alpha 는 빛기둥 밝기, glow·glowAlpha 는 발광부 빛 무리 크기(월드)·밝기다
     */
    beam: { emitterGap: 0.9, topGap: 0.35, spread: 0.85, base: 0.12, alpha: 0.72, glow: 1.85, glowAlpha: 0.8 },
    /** 카메라가 고른 층에서 쌓인 층 전체의 가운데 쪽으로 겨눔을 옮기는 비율(0 이면 고른 층 중심) */
    stackBias: 0.35,
    /** 바라보는 층이 아닌 층의 밝기 배율 */
    otherLayerAlpha: 0.42,
    /** 들어가고 나오는 전환 속도(1/초) */
    transitionRate: 3.2,
    /** 카메라가 층을 내려다보는 각(라디안)과 거리, 판 반폭이 차지해도 되는 화면 반폭 비율(넘으면 물러난다) */
    pitch: 0.65,
    distance: 5.2,
    fitWidth: 0.88,
    /** 지층 보기 동안 은하 그래프의 밝기 배율 */
    galaxyDim: 0.008,
  },

  /**
   * 2D 카드 목록(지층 보기의 노트를 읽기 좋게 펼친 HTML 화면).
   * minColumnPx 는 칸의 최소 폭(CSS px), photoAspect 는 사진 칸 높이/폭 비율의 범위, preloadPx 는 화면 밖 얼마나 미리 사진을 디코딩할지(CSS px)다
   */
  cardList: {
    minColumnPx: 200,
    photoAspect: [0.6, 1.4],
    preloadPx: 480,
  },

  /**
   * 태그 워드 클라우드: 묶음(은하의 행성, 지층의 층)마다 많이 쓰인 태그가 낱말로 늘 떠 있다. 카드 공간 머리의 층 낱말도 px·alpha 를 같이 쓴다.
   * hide 는 카드 높이가 화면 높이에서 차지하는 비율로, 이 범위에서 작아질수록 멀리 있는 카드가 사라진다.
   * maxWords 는 묶음마다 보이는 낱말 수, px 는 가장 적게~가장 많이 쓰인 태그의 글자 높이(CSS px), gapPx 는 낱말 사이 여백,
   * liftPx 는 낱말 묶음 중심을 노드·층 판 위로 올리는 거리(CSS px), alpha 는 가장 또렷할 때의 불투명도,
   * tintLift 는 노드 색 낱말이 많이 쓰일수록 흰색 쪽으로 밝아지는 최대 비율이다
   */
  cloud: {
    maxWords: 5,
    px: [12, 17],
    gapPx: 4,
    hide: [0.04, 0.022],
    liftPx: 30,
    alpha: 0.92,
    tintLift: 0.3,
  },

  /**
   * 로컬 탐색기. tileMinPx 는 썸네일 격자 칸의 최소 폭(CSS px), thumbPx 는 썸네일을 디코딩하는 폭(CSS px, 기기 픽셀 비율을 곱해 쓴다),
   * decodeConcurrency 는 동시에 디코딩하는 썸네일 수, preloadPx 는 화면 밖 얼마나 미리 썸네일을 만들지(CSS px),
   * textMaxBytes 는 텍스트 뷰어가 앞에서부터 읽는 최대 바이트, swipePx 는 뷰어에서 다음·이전으로 넘기는 가로 끌기 거리(CSS px),
   * kindColors 는 칸 종류 색이다.
   * 은하로 보기: cosmosMaxFiles 는 하위 폴더까지 카드로 만드는 파일 수 상한, readConcurrency 는 동시에 읽는 파일 수,
   * cardTextBytes 는 텍스트 문서 카드에 담는 앞부분 바이트, videoThumbAt 은 동영상 카드에 쓰는 장면 자리(길이 대비),
   * videoTimeoutMs 는 동영상 크기·장면 읽기를 포기하는 시간(ms, 파일 읽기라 벽시계)이다
   */
  explorer: {
    tileMinPx: 150,
    thumbPx: 220,
    decodeConcurrency: 3,
    preloadPx: 480,
    textMaxBytes: 2_000_000,
    swipePx: 60,
    cosmosMaxFiles: 600,
    readConcurrency: 8,
    cardTextBytes: 4000,
    videoThumbAt: 0.1,
    videoTimeoutMs: 8000,
    kindColors: { folder: '#38d4ff', image: '#48d6ff', video: '#ff7fbf', audio: '#ffcf5a', text: '#7fa4ff', other: '#5e8aa6' },
  },

  dev: {
    /** 시간축 데모의 가짜 노트 */
    noteCount: 110,
    noteSeed: 1115,
    spanDays: 600,
    bursts: 22,
    /**
     * 실데이터 임시 불러오기: 킵 노트 본문이 docMinChars 자 이상이면 긴 문서,
     * 사진 디코딩 동시 작업 수(decodeConcurrency)와 크기·EXIF 를 찾을 때 읽는 파일 앞부분 바이트(headerBytes)
     */
    docMinChars: 160,
    decodeConcurrency: 2,
    headerBytes: 262144,
  },

  input: {
    /** 이 거리(CSS px) 안에서 떼면 탭으로 본다 */
    tapSlop: 10,
    /** 이 시간 안에 떼면 탭으로 본다 */
    tapMaxSeconds: 0.35,
    /** 끌기 속도를 재는 최근 입력 창(초)과 멈춤으로 보는 무입력 시간(초) */
    velocityWindowSeconds: 0.1,
    velocityStopSeconds: 0.08,
    /** 핀치 거리의 최소 하한(CSS px). 두 손가락이 가까울 때 비율이 튀지 않게 한다 */
    pinchMinDistance: 12,
  },

  gesture: {
    /** 화면 세로 한 폭을 끌었을 때 이동하는 깊이(월드 단위) */
    dragDepthPerScreen: 22,
    /** 튕겨 놓은 뒤 관성 속도가 줄어드는 비율(1/초) */
    inertiaDecay: 3.8,
    /** 이 깊이 속도(월드 단위/초)보다 느려지면 관성을 멈춘다 */
    inertiaStopSpeed: 0.05,
    /** 핀치 거리 비율의 로그에 곱하는 축척 배율 */
    pinchScale: 2.8,
    /** 축척 허용 여유(가장 바깥 단계에서 로그 축척으로 얼마나 더 벗어날 수 있는지) */
    scaleOvershoot: 1.0,
    /** 핀치 중심에서 시점 고정 대상 노드를 찾는 최대 거리(CSS px) */
    pinchAnchorRadius: 140,
    /** 휠 한 눈금(100px)당 로그 축척 변화량과 손 놓음 스냅 대기 시간(초) */
    wheelScalePer100: 1.15,
    wheelSnapDelay: 0.26,
    /** 궤도 카메라 회전·줌·포커스 속도(1/초), 휠·핀치 줌 감도, 최대 상하 각도 */
    lookDragScale: 2.2,
    lookInertiaDecay: 4.2,
    lookStopSpeed: 0.015,
    zoomRate: 14,
    focusRate: 7,
    wheelZoomSpeed: 0.18,
    pinchZoomScale: 1.0,
    maxPitch: 1.35,
  },

  /** 성능 표시: 통계를 내는 최근 프레임 수, 글자를 고치는 간격(초), 앞뒤 이웃 간격 중 짧은 쪽 대비 이 배율을 넘는 프레임 간격을 끊김으로 센다 */
  perf: {
    window: 240,
    refreshSeconds: 0.5,
    dropRatio: 1.5,
  },

  /**
   * 설정 화면의 품질. 키는 src/core/quality.ts 의 QualityValues 와 같다.
   * presets: 빠진 키는 위 기본값을 쓴다. options: 설정 화면에서 고르는 값 목록으로, 기본값과 프리셋 값이 모두 들어 있어야 한다.
   * nebula 의 'off' 는 끄기, 0 은 매 프레임 계산, 양수는 큐브맵 굽기 크기다
   */
  quality: {
    presets: {
      low: { pr: 1, aa: false, bloom: false, dust: 3000, stars: 1200, nebula: 128, tex: 224 },
      mid: { pr: 1.5, aa: true, dust: 5500, stars: 1800, nebula: 256, tex: 288 },
      high: {},
    },
    options: {
      pr: [1, 1.5, 2, 3],
      dust: [0, 3000, 5500, 9000],
      stars: [600, 1200, 1800, 2600],
      nebula: ['off', 0, 128, 256, 512],
      tex: [224, 288, 320],
    },
  },

  loop: {
    /** 탭 전환 등으로 프레임이 길게 멈췄을 때 한 번에 진행할 최대 게임 시간 */
    maxStep: 0.1,
  },
} as const;

export type Tuning = typeof tuning;
