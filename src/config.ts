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
    scanlineDensity: 180,
    scanlineSpeed: 1.2,
    scanlineStrength: 0.04,
    noiseStrength: 0.035,
    noiseFps: 24,
    focusEdgeWidth: 0.012,
    dimFloor: 0.28,
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
     * 창 모양 카드: 제목 줄과 아래 상태 줄 높이, 안쪽 여백, 테두리 선 굵기, 모서리 꺾쇠 길이(모두 텍스처 폭 대비).
     * 단순한 텍스처는 선이 뭉개지지 않게 simpleLineRatio 를 쓴다.
     * chamferRatio 는 메모의 깎은 모서리 크기, tabRatio 는 문서 제목 탭 폭, gutterRatio 는 문서 줄 번호 칸 폭이다
     */
    window: {
      titleRatio: 0.085,
      footerRatio: 0.075,
      paddingRatio: 0.04,
      lineRatio: 0.005,
      simpleLineRatio: 0.022,
      bracketRatio: 0.07,
      chamferRatio: 0.17,
      tabRatio: 0.58,
      gutterRatio: 0.1,
    },
    /**
     * 홀로그램 색. kinds 는 사진·문서의 선·글자 색, memoColors 는 메모가 고르는 포스트잇 색이다. 멀리서 흑백으로 바꿀 때도 그 카드 색으로 물든다.
     * fill 은 창 바탕, 나머지는 선 색에서 낸 흐린 선·옅은 선·제목 띠·메모 띠의 불투명도, glowRatio 는 선과 글자의 빛 번짐(폭 대비)이다
     */
    holo: {
      kinds: { photo: '#48d6ff', doc: '#7fa4ff' },
      memoColors: ['#5ef0c8', '#ffcf5a', '#ff7fbf'],
      fill: 'rgba(3, 13, 32, 0.74)',
      dimAlpha: 0.5,
      faintAlpha: 0.2,
      bandAlpha: 0.14,
      stripAlpha: 0.34,
      glowRatio: 0.014,
    },
    /** 멀리서 쓰는 단순한 모양: 사진 모자이크 가로 칸 수, 글 줄 막대 높이·간격(텍스처 폭 대비) */
    simple: { photoBlocks: 9, barRatio: 0.045, barGapRatio: 0.085 },
    /**
     * 멀고 가까움에 따른 모습. 값은 카드 높이가 화면 높이에서 차지하는 비율이다.
     * detail 범위에서 단순한 모양이 제대로 된 모양으로, color 범위에서 흑백이 제 색으로 바뀐다.
     * farAlpha 는 단순한 모양일 때의 불투명도 배율, focusAlpha 는 펼친 카드 바탕의 최소 불투명도(뒤가 비쳐 글이 흐려지지 않게),
     * glint 는 비스듬히 볼 때 가장자리가 밝아지는 정도다
     */
    lod: { detail: [0.045, 0.11], color: [0.12, 0.26], farAlpha: 0.7, focusAlpha: 0.94, glint: 0.5 },
    /** 홀로그램 깜빡임: 초당 판정 횟수, 한 번 판정에서 깜빡일 확률, 깜빡일 때 밝기. 훑는 띠: 속도(1/초), 밝기 */
    flicker: { rate: 14, chance: 0.025, depth: 0.55, sweepSpeed: 0.12, sweepStrength: 0.12 },
    /**
     * 짧은 노트(메모): 글 양에 맞춰 크기가 바뀐다. 폭은 기준 폭 대비 widthScales 범위에서 글 폭(어림, 글자 크기 단위)이 fullText 에 가까울수록 넓고,
     * 높이는 제목·본문 줄 수에 맞추되 폭 대비 aspect 범위로 자른다. 글자 크기는 텍스처 기준 폭 대비 titleRatio·bodyRatio, 줄 간격 배율 lineHeight
     */
    memo: { widthScales: [0.6, 0.92], fullText: 40, aspect: [0.5, 1.3], titleRatio: 0.07, bodyRatio: 0.058, lineHeight: 1.45 },
    /** 긴 문서는 1:√2 세로 비율이다. 기준 폭 대비 배율 */
    doc: { widthScale: 1.05 },
    /** 휨 격자 칸 수(가로·세로) */
    segments: 10,
    /**
     * 종이 휨: 카드 좌표(-0.5~0.5)에서 가로·세로 물결의 빈도·높이·빠르기, 가로 말림 크기와 빠르기.
     * 높이는 카드 폭 대비다
     */
    bend: { waveFreq: [5, 4], waveAmp: [0.05, 0.035], waveSpeed: [1.9, 1.5], curl: 0.32, curlSpeed: 0.6 },
    /** 실이 묶이는 자리(제목 줄 왼쪽 고리)가 앞면 위로 뜬 높이(폭 대비) */
    pin: { lift: 0.012 },
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
    /** 행성(시간 묶음 노드)의 반지름: 종이가 나는 띠의 안쪽 기준. 위성 수의 제곱근 × planetGrowth 를 더하고 planetMaxRadius 를 넘지 않는다 */
    planetRadius: 0.16,
    planetGrowth: 0.05,
    planetMaxRadius: 0.34,
    /** 행성 글자 높이(CSS px). 화면에 늘 같은 크기로 보인다 */
    planetLabelPx: 12,
    /**
     * 선 그래프. 선 굵기는 CSS px, 점·빛 크기는 월드 단위 지름이다.
     * burst: 노드에서 노트 점이 방사형으로 퍼지는 원판(안쪽 반지름, 간격, 앞뒤 흔들림, 회전 속도).
     * hourColors: 노트가 찍힌 시각(4시간 단위)별 점 색
     */
    graph: {
      branchWidth: 1.8,
      spokeWidth: 1.0,
      branchColor: '#7fd2ff',
      hubColor: '#e4f8ff',
      branchAlpha: 0.5,
      spokeAlpha: 0.55,
      nodeSize: 0.09,
      hubSize: 0.13,
      dotSize: 0.055,
      glowSize: 1.3,
      hubGlowSize: 2.4,
      glowAlpha: 0.16,
      /** 허브 글자 높이(CSS px) */
      hubLabelPx: 15,
      /** 종이에 꽂힌 압정 머리 크기 */
      pinSize: 0.05,
      /** 허브는 자식 행성 반지름의 이 비율인 안쪽 구면 껍질 위에 놓이고, 행성은 바깥으로 가지에 매달린다 */
      hubRadius: 0.72,
      tapRadius: 34,
      /** 종이 탭 판정 반경(CSS px). 화면에 보이는 종이 반지름이 이보다 크면 그쪽을 쓴다 */
      paperTapRadius: 38,
      burst: { inner: 0.06, spacing: 0.055, pullSpread: 0.85, pullCurve: 1.5, depthJitter: 0.05, spin: 0.06 },
      hourColors: ['#2a5cff', '#2f9dff', '#38d4ff', '#7fe9ff', '#5a7dff', '#8fb4ff'],
    },
    /**
     * 돌풍에 날리는 종이(위성).
     * capacityByUnit: 행성 단위별 큰 카드 수(넘친 위성은 overflowScale 크기 종잇조각).
     * gap·spread·pullCurve: 행성 표면에서 가장 강한 인력 거리와 관련도가 낮을수록 멀어지는 폭·곡선 지수.
     * speed·speedJitter: 공전 속도 계수(반지름^1.5 로 나눔)와 종이마다 배율 범위.
     * wobble·wobbleFreq: 난기류 흔들림 크기와 빈도 범위. wobbleInward: 흔들림이 궤도 안쪽(노드 쪽)으로 파고드는 최대 깊이(궤도 반지름 대비). rollAmp·rollFreq: 제 면 안에서 좌우로 흔들리는 최대 각도·빈도 범위.
     * flutterAmp·flutterAmp2·flutterFreq: 앞면이 바깥 방향에서 두 축으로 기우는 최대 각도와 빈도 범위. 둘을 더한 각도를 넘지 않아 뒤집히지 않는다.
     * poleUpBias: 종이가 노드 위·아래(극)를 지날 때 위쪽을 궤도면 법선으로 기울이는 정도. 클수록 극을 지날 때 천천히 돌고, 극에서 먼 곳은 덜 바로 선다.
     * gust: 돌풍 사인 둘의 빈도·위상, boost 는 돌풍이 가장 셀 때 더해지는 시간 배율, gustWobble 은 흔들림이 커지는 배율
     */
    swarm: {
      capacityByUnit: { year: 3, month: 3, day: 8, hour: 14, hour6: 8, min15: 14 },
      gap: 0.11,
      spread: 1.35,
      pullCurve: 1.6,
      speed: 0.065,
      speedJitter: [0.6, 1.4],
      wobble: 0.1,
      wobbleFreq: [0.35, 1.1],
      wobbleInward: 0.5,
      rollAmp: 0.16,
      rollFreq: [0.35, 0.85],
      flutterAmp: 0.24,
      flutterAmp2: 0.14,
      flutterFreq: [0.4, 1.0],
      poleUpBias: 0.5,
      gust: { freq: [0.11, 0.27], phase: [0.3, 2.1], boost: 0.7 },
      gustWobble: 1.4,
    },
    satelliteScale: 0.3,
    overflowScale: 0.09,
    /** 종이가 돌면서 빛을 받는 정도(0이면 끈다) */
    paperShade: 1,
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
    dust: { count: 9000, armRadiusFloor: 0.35, haloRadius: [0.35, 1.2], haloElevation: 1.4, coreRadius: 0.3, spread: 0.16, angleSpread: 0.18, halo: 0.14, maxArc: 5.0, size: 3.2, opacity: 0.68 },
    stars: { count: 2600, radius: 55, size: 1.8 },
    /**
     * 성운 배경. bakeSize 가 0 이면 매 프레임 화면 해상도로 계산하고, 양수면 그 크기(px)의 큐브맵에 구워 두고
     * refreshSeconds(게임 시간)마다 다시 굽는다
     */
    nebula: { visible: true, bakeSize: 0, refreshSeconds: 2, colors: ['#0b1f66', '#05445e', '#16127a'] },
  },

  /**
   * 지층 보기: 은하에서 노드를 고르면 그 노드가 속한 위 묶음(예: 달)을 아래 묶음(예: 날)별 수평 층으로 쌓아 내려다본다.
   * 최근 층이 위다. 층 안에서는 노트 창이 바닥에 눕혀 깔린다.
   */
  strata: {
    /** 층 사이 높이(월드) */
    layerGap: 1.4,
    /** 노트 창 배율(card.width 기준 크기 대비). 관련도가 낮은 노트부터 높은 노트까지 */
    cardScale: [0.42, 0.62],
    /** 칸 사이 여백(가장 큰 창 대각선 대비)과 칸 안에서 비트는 요의 최대각(라디안) */
    cellGap: 0.16,
    yawJitter: 0.2,
    /** 층 판이 창 무리보다 넓게 두르는 여백(월드)과 판 안 격자 간격(월드) */
    margin: 0.3,
    gridStep: 0.45,
    /** 판 바탕·테두리·격자의 불투명도, 날짜 글자 높이(월드) */
    fillAlpha: 0.035,
    frameAlpha: 0.55,
    gridAlpha: 0.1,
    labelHeight: 0.14,
    /** 바라보는 층이 아닌 층의 밝기 배율 */
    otherLayerAlpha: 0.45,
    /** 들어가고 나오는 전환 속도(1/초) */
    transitionRate: 3.2,
    /** 카메라가 층을 내려다보는 각(라디안)과 거리 */
    pitch: 0.8,
    distance: 5.2,
    /** 지층 보기 동안 은하 그래프의 밝기 배율과 종이 휨 배율 */
    galaxyDim: 0.03,
    bend: 0.2,
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
      low: { pr: 1, aa: false, dust: 3000, stars: 1200, nebula: 128, seg: 6, tex: 224 },
      mid: { pr: 1.5, aa: true, dust: 5500, stars: 1800, nebula: 256, seg: 8, tex: 288 },
      high: {},
    },
    options: {
      pr: [1, 1.5, 2, 3],
      dust: [0, 3000, 5500, 9000],
      stars: [600, 1200, 1800, 2600],
      nebula: ['off', 0, 128, 256, 512],
      seg: [4, 6, 8, 10],
      tex: [224, 288, 320],
    },
  },

  loop: {
    /** 탭 전환 등으로 프레임이 길게 멈췄을 때 한 번에 진행할 최대 게임 시간 */
    maxStep: 0.1,
  },
} as const;

export type Tuning = typeof tuning;
