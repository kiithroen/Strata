# 위젯

위젯은 하나씩 만들어 위젯 갤러리(`?w=<이름>`)에서 확인한다. 튜닝 값은 `src/config.ts`의 `tuning`에 있고, 아래에는 필드 이름과 규칙만 적는다.

| 위젯 | 갤러리 이름 | 상태 |
|---|---|---|
| 우주 보기 | `cosmos` | 구현됨. 앱의 주 화면이다 |
| 시간축 | `time-axis` | 구현됨. 우주 보기가 쓰는 시간 모델을 레일로 보여 주는 확인용 화면이다 |
| 노트 카드 | `note-card` | 구현됨 |
| 카메라·제스처 | | 할 일 |
| 후처리 | | 할 일 |
| 노트 보기 | | 할 일 |

## 노트 카드

파일: `src/widgets/noteCard/`

사진 노트 하나를 공간에 띄우는 카드다. 사진, 테두리, 모서리 괄호, 날짜·번호 라벨을 캔버스 하나에 그려 텍스처로 쓴다.

**사진 원본** (`cardTexture.ts`의 `PhotoSource`)
- 사진은 폭·높이와 `render(targetWidth)`를 가진다. 텍스처를 만들 때 필요한 해상도로 그려 받고, 결과는 들고 있지 않는다.

**크기와 텍스처** (`cardLayout.ts`, `NoteCard.ts`)
- 안쪽 여백은 텍스처 폭 × `card.paddingRatio`, 라벨 띠 높이는 사진 폭 × `card.labelRatio`다. 사진 칸은 사진 비율을 그대로 지키고 라벨 띠는 사진 아래에 붙는다.
- 월드 폭은 `card.width`, 월드 높이는 텍스처 비율로 정한다. 텍스처 폭을 바꿔도 월드 크기는 같다.
- 떠 있는 카드는 `card.textureWidth` 텍스처를 쓴다. 펼치기 시작하면 `card.detailTextureWidth` 텍스처를 따로 만들어 바꿔 끼우고, 다 닫히면 버린다.

**움직임** (`cardMotion.ts`의 `CardMotion`)
- 배치(필드·시간축)가 매 프레임 기본 자세(위치·회전·배율)를 넘긴다. 떠 있는 카드는 기본 자세에 흔들림을 더한 자세를 지연 없이 따라간다.
- 흔들림은 게임 시간의 사인 함수로 위아래(`float.amplitude`)와 기울기(`float.tiltAmplitude`)가 움직인다. 카드마다 위상과 주기(`float.periodMin`~`float.periodMax`)가 다르다.
- 펼치기는 떠 있는 자세와 펼친 자세를 `focus`(0~1)로 섞는다. `focus`는 `focus.rate`로 지수 접근하므로 같은 게임 시간이면 주사율과 상관없이 같은 자세다. 닫히는 동안에는 마지막 펼친 자세와 섞는다.
- 펼친 자세는 카메라 정면 `focus.distance` 지점에서 앞면이 카메라를 향한다. 배율은 화면 폭과 높이 중 좁은 쪽에 맞춰 `focus.fill` 비율을 차지한다. 매 프레임 다시 계산하므로 화면비가 바뀌어도 맞춰진다.
- 하나가 펼쳐지면 나머지는 `focus.othersDim`만큼 어두워진다(`focus.dimRate`로 접근, 가장 어두울 때 밝기는 `look.dimFloor`).

**그리기** (`cardMaterial.ts`, `NoteCard.ts`)
- 모든 카드가 `CardLook` 유니폼 객체를 함께 쓴다. 시간과 안개 범위는 데모가 한 번만 갱신한다.
- 배치가 넘기는 불투명도(`fade`)를 받는다. 펼치는 중인 카드는 불투명도와 상관없이 보이고, 거의 투명한 카드는 그리지 않는다.
- 펼친 카드는 테두리에 강조색 빛이 돌고 주사선과 잡음이 옅어진다. 깊이에 따라 안개 범위에서 배경색으로 녹는다.
- `setBadge(text)`로 카드 오른쪽 위에 배지를 붙인다(높이 `axis.badgeHeight`). 글자 텍스처는 `widgets/common/labelCache.ts`가 구워 재사용한다.

**갤러리 데모** (`src/gallery/noteCardDemo.ts`)
- 가짜 사진 노트 `field.count`장을 시야 원뿔 안에 흩는다(`field.ts`). 화면 좌표에서 기존 자리와 가장 먼 후보(`field.candidates`개 중)를 고르는 방식이라 겹침이 적다.
- 카드를 탭하면 펼치고, 펼친 상태에서 아무 데나 탭하면 닫는다.

## 시간축

파일: `src/widgets/timeAxis/`, 달력 계산은 `src/core/calendar.ts`

시간을 화면 안쪽 깊이로 펼친 축이다. 카메라는 원점에서 -Z를 보고, 지금 시점(`focusTime`)은 `axis.focusDepth` 깊이(초점면)에 있다. 과거일수록 멀다.

**시간 ↔ 깊이** (`axisModel.ts`)
- 축척은 `logScale = ln(하루가 차지하는 깊이)`다. 확대·축소는 로그 공간에서 움직인다.
- `depth = focusDepth + (focusTime − t) / 하루 × e^logScale`이고, `timeAtDepth`는 그 역이다.
- 단계는 연·월·일·노트 넷이다. 단계 축척에서는 그 단계 단위(연·월·일·시) 하나가 `axis.levelDepth[단계]` 깊이를 차지한다. `nearestLevel`은 로그 축척이 가장 가까운 단계다.

**눈금** (`chooseTickUnits`, `generateTicks`)
- 달력 단위는 연·월·일·6시간·1시간·15분이다. 큰 눈금 단위는 간격이 `axis.majorMinSpacing` 이상인 가장 작은 단위, 작은 눈금은 그 다음 단위이고 간격이 `axis.minorMinSpacing` 이상일 때만 긋는다. 단계와 상관없이 축척만 보고 고른다.
- 눈금 위치는 달력 경계(현지 시각)다. `axis.nearDepth`~`axis.farDepth` 사이만 내고, 가장 최근 노트보다 미래인 눈금은 내지 않는다.
- 큰 눈금에는 늘 글자를, 작은 눈금에는 간격이 `axis.minorLabelMinSpacing` 이상일 때 글자를 붙인다. 화면에서 이웃 글자와 `axis.labelMinGap`보다 가까우면 생략하는데, 큰 눈금 글자가 먼저 자리를 잡는다.
- 글자: 연 `2026`, 월 `2026.11`(작은 눈금 `11`), 일 `11.15`(작은 눈금 `15`), 시 `21:00`(작은 눈금 `21`, 15분 작은 눈금 `:15`). 자정 눈금은 날짜로 쓴다.

**묶음** (`chooseClusterUnit`, `clusterNotes`)
- 묶음 단위는 간격이 `axis.clusterMinSpacing` 이상인 가장 작은 달력 단위다. 가장 작은 단위(15분)도 넘으면 묶지 않는다. 확대할수록 묶음 단위는 촘촘해지기만 한다.
- 같은 단위 칸의 노트가 한 묶음이다. 대표는 칸에서 가장 최근 노트이고, 묶음은 대표 시각에 놓인다.

**배치** (`placement.ts`)
- 카드 자리는 축 공간(시각, 고리 위 x·y, 쌓인 순번)으로 들고 있다가 매 프레임 월드 자세로 바꾼다. 축이 움직이면 카드가 지연 없이 함께 움직이고, 묶임이 바뀔 때만 축 공간에서 `axis.layoutRate`로 옮겨 간다.
- 고리 자리는 오래된 것부터 센 순번에 황금각을 곱해 정한다. 새 노트가 생겨도 기존 자리는 바뀌지 않는다. 고리 반지름은 초점면에서 카드 중심이 움직일 수 있는 범위(`laneRoom`: 화면 반폭·반높이에서 카드 반폭을 뺀 값) 대비 `axis.lane` 비율이다. 화면비가 바뀌면 다시 계산한다.
- 묶음 안 카드는 대표의 고리 자리에서 `axis.stack` 간격으로 뒤에 쌓이고, `axis.stack.visible`장까지만 보인다. 대표 카드에 `×장수` 배지가 붙는다.
- 카드 크기는 `card.width × axis.cardScale`이고, `axis.faceCamera`만큼 카메라 쪽으로 몸을 튼다.
- 불투명도는 `axis.nearDepth`~`axis.fadeNearStart`에서 차오르고 `axis.fogFar`~`axis.farDepth`에서 사라진다.

**조종** (`AxisController`)
- 지금 시점과 축척을 목표로 각각 `axis.timeRate`, `axis.scaleRate`로 지수 접근한다.
- `setLevel`, `focusOn(time, level)`, `shift(±1)`(지금 단계 단위의 평균 길이만큼, 주어진 범위 안에서)이 있다.

**그리기** (`AxisView.ts`)
- 바닥 높이 `axis.railY`에 폭 `axis.railHalfWidth`의 양옆 레일을 가장 최근 노트 깊이부터 `axis.farDepth`까지 깐다. 큰 눈금은 레일 밖으로 `axis.majorTickOverhang`만큼 나오고, 초점면에는 강조색 선이 지난다.
- 눈금 글자는 왼쪽 레일 안쪽에 서 있고 높이는 `axis.labelHeight`(작은 눈금 `axis.minorLabelHeight`)다.
- 시간축 데모는 장면 안개를 `axis.fogNear`~`axis.fogFar`로 바꾸고 바닥 격자를 숨긴다.

**갤러리 데모** (`src/gallery/timeAxisDemo.ts`)
- 가짜 노트 `dev.noteCount`장(`src/dev/fakeNotes.ts`: 최근일수록 촘촘하고, `dev.bursts`번은 몇 시간 안에 몰아 찍음)을 시간축에 놓는다. 처음에는 가장 최근 노트를 초점면에 두고 월 단계로 연다.
- 제스처 위젯이 생기기 전까지는 화면 아래 단추로 조종한다: ◀(과거로)·▶(최근으로), 연·월·일·노트. 왼쪽 위에 지금 시점을 보인다.
- 묶음을 탭하면 그 대표 시각으로 한 단계 들어가고, 낱장을 탭하면 펼친다. 펼친 상태에서 아무 데나 탭하면 닫는다.

## 우주 보기

파일: `src/widgets/cosmos/`. 시간 ↔ 깊이, 단계, 묶음, 조종은 시간축(`timeAxis/axisModel.ts`)을 그대로 쓴다.

시간 묶음은 행성, 노트는 행성 둘레를 도는 위성(사진 카드)이다. 행성은 시간축(깊이)을 따라 화면 안쪽으로 감겨 드는 나선팔 위에 흩어져 있어 정면에서 보면 은하처럼 보인다. 나선은 카메라 공간에 고정돼 있고, 시간을 옮기면 행성과 먼지가 나선을 타고 소용돌이치며 다가오거나 멀어진다.

**행성** (`cosmosModel.ts`, `PlanetView.ts`)
- 행성 단위는 연·월·일·시 가운데 간격이 `cosmos.planetMinSpacing` 이상인 가장 작은 단위다(다 넘으면 시). 같은 단위 칸의 노트가 한 행성이고, 행성은 그 칸에서 가장 최근 노트의 시각(깊이)에 놓인다.
- 나선 각도는 `cosmos.focusAngle + cosmos.twist × (깊이 − axis.focusDepth) + cosmos.spin × 공전 시계`다. 지금 시점의 행성이 초점면에서 `focusAngle` 쪽(화면 아래)에 놓인다.
- 나선 위 자리는 반지름 `cosmos.armRadius`에서 묶음 키로 정한 만큼(`cosmos.radiusJitter`, `cosmos.angleJitter`) 벗어난다. 같은 묶음은 늘 같은 자리다.
- 반지름은 `cosmos.planetRadius`에 위성 수의 제곱근 × `cosmos.planetGrowth`를 더하고 `cosmos.planetMaxRadius`를 넘지 않는다.
- 셰이더 구체(띠 무늬, 자전, 테두리 빛), 가산 합성 빛 무리(`cosmos.glowScale`), 아래쪽 `날짜 · 위성 수` 글자(`cosmos.planetLabelHeight`)로 그린다. 묶음이 바뀌면 사라지는 행성은 그 자리에서 옅어지고(`cosmos.planetFadeRate`) 새 행성은 나타난다.

**위성** (`ringLayout`, `orbitOffset`)
- 위성은 고리에 안쪽부터 채운다. k번째 고리에는 `ring.base + ring.grow × k`개가 들어가고, 카드 고리 수는 행성 단위별로 `ring.maxByUnit`이다. 넘친 위성은 바깥 띠에서 `cosmos.overflowScale` 크기로 작게 돈다.
- 고리 반지름은 행성 반지름 + `ring.gap × (k + 1)`이다. 고리 평면은 화면을 마주 보는 평면에서 묶음 키로 정한 만큼(`ring.inclination` 안) 기울어 있고, 같은 평면에 궤도 선(`cosmos.ringOpacity`)을 긋는다.
- 같은 고리의 위성은 같은 간격으로 함께 돈다. 각속도는 `ring.speed / 반지름^1.5`(케플러 3법칙)다.
- 카드는 늘 카메라를 향하고 크기는 `card.width × cosmos.satelliteScale`이다. 깊이에 따라 `cosmos.nearDepth`~`cosmos.fadeNearStart`에서 차오르고 `cosmos.fogFar`~`cosmos.farDepth`에서 사라진다.
- 묶음이 바뀌어 다른 행성으로 옮겨 갈 때만 그 순간의 어긋남을 `cosmos.regroupRate`로 줄이며 잇는다(`RegroupBlend`). 묶음이 그대로면 목표 위치를 지연 없이 따른다.

**배경** (`Universe.ts`)
- 먼지: `dust.count`개 점이 `dust.arms`개 나선팔 둘레(반지름 퍼짐 `dust.spread`, 각도 퍼짐 `dust.angleSpread`)에 모이고, `dust.halo` 비율은 은하 원반 전체에 흩어진다. 시간축이 움직인 깊이만큼 흘러가 비행하는 느낌을 준다.
- 별(`stars.count`, 반지름 `stars.radius`)은 반짝이고, 그 바깥 구에 성운 셰이더를 그린다. 먼 가운데에 은하 중심 빛(`cosmos.coreSize`)이 있다.
- 우주 보기는 장면 안개를 `cosmos.fogNear`~`cosmos.fogFar`로 바꾸고 바닥 격자를 숨긴다.

**탭과 공전 시계** (`src/gallery/cosmosDemo.ts`)
- 손가락이 화면에 닿아 있는 동안 공전과 은하 회전이 멈추고, 떼면 다시 돈다(`cosmos.holdRate`). 움직이는 위성을 누르기 쉽게 하려는 것이다.
- 탭이 위성 카드에 맞으면 그 카드를 펼친다. 단, 보이는 행성 몸체가 카드보다 앞을 가리면 행성이다. 카드가 없으면 행성보다 넉넉한 판정 구로 행성을 고른다.
- 행성을 탭하면 그 행성의 시각으로 한 단계 들어간다. 펼친 상태에서 아무 데나 탭하면 닫는다.
- 데이터와 임시 단추는 시간축 데모와 같다(`src/gallery/axisHud.ts`).
