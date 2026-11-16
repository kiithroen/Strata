# 위젯

위젯은 하나씩 만들어 위젯 갤러리(`?w=<이름>`)에서 확인한다. 튜닝 값은 `src/config.ts`의 `tuning`에 있고, 아래에는 필드 이름과 규칙만 적는다.

| 위젯 | 갤러리 이름 | 상태 |
|---|---|---|
| 우주 보기 | `cosmos` | 구현됨. 앱의 주 화면이다 |
| 시간축 | `time-axis` | 구현됨. 우주 보기가 쓰는 시간 모델을 레일로 보여 주는 확인용 화면이다 |
| 노트 카드 | `note-card` | 구현됨 |
| 카메라·제스처 | | 구현됨. 우주 보기와 시간축에 붙어 동작한다 |
| 후처리 | | 할 일 |
| 노트 보기 | | 할 일 |

## 노트 카드

파일: `src/widgets/noteCard/`

노트 하나를 나타내는 양면 홀로그램 창이다. 반투명 바탕(`card.holo.fill`)에 위에서부터 제목 줄, 내용 칸, 상태 줄을 둔 창 모양을 캔버스에 그려 텍스처로 쓴다(`cardTexture.ts`). 선과 글자는 거의 무채색(`card.holo`)이고 사진만 제 색이다.
- 공통 틀: 흐린 테두리와 밝은 모서리 꺾쇠(`card.window.bracketRatio`), 제목 줄 띠(`card.holo.titleFill`). 제목 줄 왼쪽에 실을 묶는 고리, 가운데에 이름, 오른쪽 끝에 접기·닫기 단추를 그린다. 상태 줄에는 찍은 시각과 노트 번호를 적는다.
- **사진 (`photo`)**: 사진 비율 그대로 내용 칸을 채운다. 제목 줄 이름은 캡션, 없으면 `IMG_번호`다.
- **짧은 노트 (`memo`)**: 정사각 창에 굵은 제목과 큼직한 본문. 이름은 `MEMO_번호`다.
- **긴 문서 (`doc`)**: `1 : √2` 창에 제목·구분선·촘촘한 문단. 오른쪽 스크롤 막대의 손잡이 길이가 보이는 줄 수 / 전체 줄 수다. 이름은 `TXT_번호`다.

**멀고 가까움** (`cardMaterial.ts`, `createSimpleTexture`)
- 카드마다 텍스처가 둘이다. 가까이서 보는 텍스처(`card.textureWidth`)와 멀리서 보는 단순한 텍스처(`card.simpleTextureWidth`)다. 단순한 텍스처는 글자 없이 같은 틀에 사진은 굵은 모자이크(`card.simple.photoBlocks`), 글은 줄 막대(`card.simple`)로만 그린다.
- 정점 셰이더가 카드 중심에서 카드 높이가 화면 높이에서 차지하는 비율을 재고, `card.lod.detail` 범위에서 단순한 모양을 제대로 된 모양으로, `card.lod.color` 범위에서 흑백(`card.holo.line`으로 물든 밝기)을 제 색으로 섞는다. 한 장 안에서는 같은 값이다. 펼치는 카드는 둘 다 1이다.
- 단순한 모양일수록 옅어진다(`card.lod.farAlpha`). 펼친 카드는 바탕 불투명도를 `card.lod.focusAlpha` 이상으로 올려 뒤 카드가 글을 가리지 않게 한다.

**실 묶는 고리** (`paperPin.ts`)
- 노드에서 나온 실은 제목 줄 왼쪽 고리에 묶인다. 자리는 레이아웃 비율로 정해져 텍스처 해상도와 상관없다. `pinPoint`가 종이의 위치·회전·배율로 월드 자리를 구한다.
- 고리 자리는 앞면 위로 뜬다. 그 자리의 휨 높이(`paperBend.ts`의 `bendHeight`, 셰이더와 같은 식)에 `card.pin.lift`(폭 대비)를 더한다.

**사진 원본** (`cardTexture.ts`의 `PhotoSource`)
- 사진은 폭·높이와 `render(targetWidth)`를 가진다. 텍스처를 만들 때 필요한 해상도로 그려 받고, 결과는 들고 있지 않는다.

**크기와 텍스처** (`cardLayout.ts`, `NoteCard.ts`)
- 제목 줄·상태 줄 높이와 안쪽 여백은 텍스처 폭 대비(`card.window`)다. 사진은 사진 비율을 지키고 폭이 `card.width`, 메모는 정사각에 폭 `card.width × card.memo.widthScale`, 문서는 `1 : √2`에 폭 `card.width × card.doc.widthScale`이다. 텍스처 폭을 바꿔도 월드 크기와 칸 비율은 같다.
- 떠 있는 카드는 단순한 텍스처와 `card.textureWidth` 텍스처를 쓴다. 펼치기 시작하면 `card.detailTextureWidth` 텍스처를 따로 만들어 바꿔 끼우고, 다 닫히면 버린다.

**움직임** (`cardMotion.ts`의 `CardMotion`)
- 배치(필드·시간축)가 매 프레임 기본 자세(위치·회전·배율)를 넘긴다. 떠 있는 카드는 기본 자세에 흔들림을 더한 자세를 지연 없이 따라간다.
- 흔들림은 게임 시간의 사인 함수로 위아래(`float.amplitude`)와 기울기(`float.tiltAmplitude`)가 움직인다. 카드마다 위상과 주기(`float.periodMin`~`float.periodMax`)가 다르다.
- 펼치기는 떠 있는 자세와 펼친 자세를 `focus`(0~1)로 섞는다. `focus`는 `focus.rate`로 지수 접근하므로 같은 게임 시간이면 주사율과 상관없이 같은 자세다. 닫히는 동안에는 마지막 펼친 자세와 섞는다.
- 펼친 자세는 카메라 정면 `focus.distance` 지점에서 앞면이 카메라를 향한다. 배율은 화면 폭과 높이 중 좁은 쪽에 맞춰 `focus.fill` 비율을 차지한다. 매 프레임 다시 계산하므로 화면비가 바뀌어도 맞춰진다.
- 하나가 펼쳐지면 나머지는 `focus.othersDim`만큼 어두워진다(`focus.dimRate`로 접근, 가장 어두울 때 밝기는 `look.dimFloor`).

**그리기** (`cardMaterial.ts`, `NoteCard.ts`)
- 모든 카드가 `CardLook` 유니폼 객체를 함께 쓴다. 시간과 안개 범위는 데모가 한 번만 갱신한다.
- 배치가 넘기는 불투명도(`fade`)를 받는다. 펼치는 중인 카드는 불투명도와 상관없이 보이고, 거의 투명한 카드는 그리지 않는다.
- 펼친 카드는 테두리에 홀로그램 선 색 빛이 돌고 주사선·잡음·깜빡임이 옅어진다. 깊이에 따라 안개 범위에서 배경색으로 녹는다.
- 양면 홀로그램이다. 따로 그린 뒷면이 없고, 뒤에서 보면 가로를 뒤집어 글자가 바로 읽힌다.
- 홀로그램 효과: 위에서 아래로 훑는 밝은 띠(`card.flicker.sweepSpeed`, `sweepStrength`), 카드마다 때가 다른 깜빡임(`card.flicker.rate`, `chance`, `depth`), 주사선(`look.scanline*`).
- 휨(`CardLook.uBend`, 0~1): 메시를 `card.segments` 칸 격자로 나누고, 정점 셰이더가 카드 좌표의 가로·세로 물결과 가로 말림(`card.bend`)을 더한 높이만큼 앞뒤로 민다. 종이마다 노트 번호로 정한 위상만큼 어긋나게 출렁이고, 펼치는 동안에는 평평해진다.
- 반짝임(`CardLook.uShade`, 0~1): 휜 면을 비스듬히 볼수록 가장자리가 밝아진다(`card.lod.glint`). 펼치는 동안에는 꺼진다. 우주 보기만 휨과 반짝임을 켠다.
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
- 끌기와 핀치(또는 마우스 휠)로 시간 이동과 축척을 조종하고, 왼쪽 위에 지금 시점과 단계를 보인다(`src/gallery/timeReadout.ts`).
- 묶음을 탭하면 그 대표 시각으로 한 단계 들어가고, 낱장을 탭하면 펼친다. 펼친 상태에서 아무 데나 탭하면 닫는다.

## 우주 보기

파일: `src/widgets/cosmos/`. 시간 ↔ 깊이, 단계, 묶음, 조종은 시간축(`timeAxis/axisModel.ts`)을 그대로 쓴다.

시간 묶음은 빛나는 노드(행성)이고, 노드에서 노트 점이 방사형 선으로 뻗는다. 노드는 한 단계 위 묶음의 허브에 가지로 이어지고 허브끼리는 시간 순서로 이어진다. 노드들은 가장 최근 시점을 원점(`s = 0`)에 두고 3차원 사방에 감겨 퍼지는 로그 구면 나선 위에 안정적으로 자리하며, 카메라는 표준 3D 궤도 조작(회전·팬·연속 줌·노드 포커스)으로 이 시계열 공간을 탐색한다. 노트 몇 장은 노드 둘레를 돌풍에 날리는 종이로 날아다닌다.

**행성 노드** (`cosmosModel.ts`)
- 행성 단위는 `month` 기준 고정 시계열 축척(`choosePlanetUnit`)으로 정하고, 같은 단위 칸의 노트가 한 행성이 되어 그 칸에서 가장 최근 노트의 시각에 놓인다. 줌·이동 중에도 노드 배치와 묶음은 흔들리지 않는다.
- 로그 나선 진행도는 `spiralArc(s) = sign(s) × ln(1 + cosmos.spiralKnee × |s|)`다. 반지름 `cosmos.radialScale × |spiralArc(s)|`, 방위각 `cosmos.twist × spiralArc(s) + cosmos.spin × 공전 시계`, 고도각 `cosmos.elevationAmp × sin(cosmos.elevationFreq × spiralArc(s))`(`cosmos.maxElevation` 안으로 자름)로 3차원 구면 나선 위에 놓는다.
- 나선 위 자리는 묶음 키로 정한 난수 편차(`cosmos.radiusJitter`, `cosmos.angleJitter`, `cosmos.elevationJitter`)만큼 벗어난다. 같은 묶음은 늘 같은 자리다.
- 노드는 흰 점(`graph.nodeSize`, 노트 수에 따라 조금 커짐)과 가장 최근 노트 색의 빛 무리(`graph.glowSize`, `graph.glowAlpha`), 아래쪽 `날짜 · 노트 수` 글자(`cosmos.planetLabelHeight`)로 그린다. 묶음이 바뀌면 빠진 노드는 마지막 자리에서 옅어지고 새 노드는 나타난다(`cosmos.planetFadeRate`).

**노트 점과 살** (`clusterAffinities`, `burstOffset`, `hourColorIndex`)
- `clusterAffinities`가 묶음 안 각 노트의 관련도(0~1)를 절대 기준으로 구한다. 시간 점수는 묶음 중앙값 시각과의 거리로 `exp(−|dt| / (행성 단위 길이 × cosmos.affinity.timeScale))`이다. 묶음에 태그가 있으면 태그 점수(노트 태그마다 그 태그를 가진 묶음 노트 비율의 평균 ÷ √태그 수)와 `cosmos.affinity.timeWeight` 비율로 섞는다. 몰아 찍은 노트는 모두 노드 가까이에, 흩어진 노트는 멀리 놓인다.
- k 번째(관련도 높은 순) 노트 점은 노드 둘레의 카메라를 마주 보는 원판에 황금각으로 놓인다. 반지름은 `burst.inner + burst.spacing × √(k + ½) + burst.pullSpread × (1 − 관련도)^burst.pullCurve`이고, 앞뒤로 `burst.depthJitter`만큼 흔들리며 원판 전체가 `burst.spin`으로 돈다. 관련도가 높을수록 노드 가까이에 모이고 낮을수록 긴 살 끝에 놓인다.
- 노드에서 그 노드의 모든 노트로 살(`graph.spokeWidth`, `graph.spokeAlpha`)을 그어 어느 노드 소속인지 보인다. 종이로 나는 노트는 살이 창 제목 줄의 고리(`noteCard/paperPin.ts`)에 실로 묶여 함께 끌려다니고, 묶인 자리에 점(`graph.pinSize`)을 그 노트 색으로 그린다. 그 노트의 점은 감춘다. 종이가 아닌 노트는 살이 점에 닿는다. 종이가 나타나고 사라지거나 펼쳐지는 동안에는 살 끝이 점과 고리 사이를 그만큼 옮겨 간다.
- 점과 살 색은 노트가 찍힌 시각을 하루를 `graph.hourColors` 개수로 나눈 칸으로 고른다.
- 묶음이 바뀌어 다른 노드로 옮겨 갈 때 점은 `RegroupBlend`로 잇는다.

**허브와 가지** (`parentUnit`, `buildHubs`, `hubPoint`)
- 허브 단위는 행성 단위의 한 단계 위다(연이면 허브가 없다). 같은 허브 칸의 행성이 한 허브에 이어진다.
- 허브는 자식 행성들의 평균 시간 오프셋(`s`)과 평균 나선 반지름에 `graph.hubRadius` 비율을 곱한 안쪽 구면 껍질 위에 놓인다. 허브에서 자식 행성으로 가지(`graph.branchWidth`, `graph.branchColor`, `graph.branchAlpha`)를 뻗고, 허브끼리는 시간 순서로 잇는다. 허브가 없으면 행성끼리 시간 순서로 잇는다.
- 허브는 큰 흰 점(`graph.hubSize`)과 빛 무리(`graph.hubGlowSize`), 위쪽 글자(`graph.hubLabelHeight`)로 그린다.
- 선은 화면 px 굵기 선분(`LineSegments2`), 점과 빛 무리는 거리에 따라 작아지는 점 묶음이다. 모두 가산 합성이라 겹칠수록 밝다(`GraphView.ts`).

**날리는 종이** (`flightParams`, `flightOffset`, `flightQuaternion`, `gust`, `gustTime`)
- 행성 단위별로 `swarm.capacityByUnit`장까지(관련도 높은 노트부터) 종이로 날린다. 나머지는 점으로만 보인다. 종이가 나타나고 사라지는 것은 `cosmos.regroupRate`로 옅어진다.
- 종이마다 노트 번호로 궤도면(아무 방향으로나 기욺), 공전 방향과 속도 배율(`swarm.speedJitter`), 흔들림 빈도, 제 면 안에서 살짝 흔들리는 빈도(`swarm.rollFreq`), 팔랑이는 축 방향과 빈도(`swarm.flutterFreq`)가 정해진다.
- 궤도 반지름은 노드 반지름(`cosmos.planetRadius`, 노트 수의 제곱근 × `cosmos.planetGrowth`, 상한 `cosmos.planetMaxRadius`) + `swarm.gap` + `swarm.spread × (1 − 관련도)^swarm.pullCurve`다. 각속도는 `swarm.speed × 속도 배율 / 반지름^1.5`(케플러 3법칙)라 관련도가 높은 종이일수록 짧은 실로 노드 가까이에서 빠르게 돈다.
- 은하 전체에 돌풍이 분다. 세기 `gust(t)`는 느린 사인 둘의 합(0~1, `swarm.gust.freq`, `swarm.gust.phase`)이고, 종이의 움직임은 `1 + gust.boost × gust`를 미리 적분한 돌풍 시계 `gustTime`으로 잰다. 돌풍이 셀수록 빨리 돌고 더 흔들리며, 난기류 흔들림도 `swarm.wobble × (1 + swarm.gustWobble × gust)`로 커진다. 흔들림의 궤도 안쪽(노드 쪽) 성분은 `−한계 × tanh(깊이 / 한계)`로 눌러 궤도 반지름 × `swarm.wobbleInward`보다 깊이 들어가지 않는다. 종이가 노드 중심을 파고들어 바깥 방향이 사라지는 일을 막는다.
- 종이 자세: 앞면이 노드 바깥쪽(노드에서 종이로 향하는 방향을 궤도면에 투영한 방향)을 향하고 위아래로 바로 선 채, 제 면 안의 작은 기울기(`swarm.rollAmp`)와 수직인 두 축 팔랑임(`swarm.flutterAmp`, `swarm.flutterAmp2`)으로 적당히 흔들린다. 앞면은 바깥 방향에서 두 각도를 더한 만큼까지만 기울어 뒤집히지 않는다. 카메라를 보지 않으므로 노드 뒤쪽 종이는 뒤에서 본 홀로그램이다. 크기는 `card.width × cosmos.satelliteScale`이다.
- 위쪽은 월드 +Y를 앞면에 수직으로 투영한 벡터에 `swarm.poleUpBias × (앞면·Y)² ×` 궤도면 법선(+Y 쪽)을 더한 방향이다. 노드 위·아래(극)를 지나는 종이도 자세가 끊기지 않고 이어진다.
- 다른 노드로 옮겨 갈 때만 `RegroupBlend`로 잇고, 그 밖에는 목표 위치를 지연 없이 따른다.

**배경** (`Universe.ts`)
- 먼지: `dust.count`개 점이 과거(`-s`)와 미래(`+s`) 두 갈래 3D 구면 나선팔(반지름 퍼짐 `dust.spread`, 각도 퍼짐 `dust.angleSpread`, 최대 진행도 `dust.maxArc`)을 따라 원점 주위에 모이고, `dust.halo` 비율은 구 전체에 흩어진다. 시간축이 움직인 거리만큼 흘러가 비행하는 느낌을 준다.
- 별(`stars.count`, 반지름 `stars.radius`)과 성운 셰이더는 매 프레임 카메라 위치를 따라 이동해 어느 궤도 거리에서도 잘리지 않는다.
- 성운(`nebula`)은 `bakeSize`가 0이면 매 프레임 화면 해상도로 계산하고, 양수면 원점의 큐브 카메라로 그 크기 큐브맵에 구워 두고 `refreshSeconds`(게임 시간)마다 다시 굽는다. 큐브맵은 sRGB로 저장해 어두운 그러데이션이 띠지지 않게 한다.
- 우주 보기는 장면 안개를 `cosmos.fogNear`~`cosmos.fogFar`로 바꾸고 바닥 격자를 숨긴다. 노드·종이는 카메라에서 잰 거리(`distanceTo(cameraPosition)`) 기준으로 `cosmos.nearDepth`~`cosmos.fadeNearStart`에서 차오르고 `cosmos.fogFar`~`cosmos.farDepth`에서 사라진다.

**탭과 공전 시계** (`src/gallery/cosmosDemo.ts`)
- 손가락이 화면에 닿아 있거나 팬 중에는 공전·뒹굴기·은하 회전이 멈추고, 떼면 다시 돈다(`cosmos.holdRate`). 움직이는 종이를 누르기 쉽게 하려는 것이다.
- 은하가 도는 만큼(`galaxySpinAngle`) 피벗(`target`, `goalTarget`)도 원점 Y축 둘레로 함께 돈다(`rotateTargetsAroundY`). 포커스한 노드·시점은 화면 가운데에 머물고, 시선 각도는 그대로라 주변 은하가 피벗 둘레로 도는 것처럼 보인다.
- 한 손가락·마우스 왼쪽 끌기로 중심 피벗(`target`) 둘레를 궤도 회전(`CameraRig`)하고, 두 손가락 이동·마우스 오른쪽·가운데·`Shift` 끌기로 화면 평면을 따라 팬(`pan`)하며, 핀치·마우스 휠·트랙패드 핀치로 스냅 없이 연속 거리 줌(`zoomByFactor`)한다. 오른쪽 시간 띠(`src/gallery/timeScrubber.ts`)를 끌거나 누르면 해당 시각의 나선 좌표로 피벗을 부드럽게 옮긴다.
- 탭 광선이 종이에 정확히 맞으면 지금 카메라 정면으로 그 종이를 펼친다. 아니면 탭 자리에서 판정 반경 안의 가장 가까운 종이나 보이는 노드를 고른다(`pickNearest`, 투명해졌거나 카메라 뒤쪽인 노드는 제외). 종이 반경은 `graph.paperTapRadius`와 화면에 보이는 종이 반지름 가운데 큰 쪽, 노드 반경은 `graph.tapRadius`(모두 CSS px)다. 노드를 탭하면 3D 피벗이 그 노드 좌표로 부드럽게 옮겨 가며 행성은 `cosmos.planetFocusDistance`, 허브는 `cosmos.hubFocusDistance` 안쪽으로 다가간다.
- 펼친 상태에서 아무 데나 탭하면 닫는다. 왼쪽 위 시점 표시(`src/gallery/timeReadout.ts`)와 시간 띠 빨간 눈금은 선택한 노드·시간 띠 시각이나 수동 팬 중 피벗에 가장 가까운 노드 시각을 따른다.

## 카메라·제스처

파일: `src/input/gesture.ts`, `src/widgets/camera/axisNavigation.ts`, `src/widgets/camera/cameraRig.ts`, `src/gallery/timeScrubber.ts`

**제스처 해석** (`GestureRecognizer`, `listenGestures`)
- 포인터 이벤트 열을 탭, 한 손가락 끌기, 두 손가락 핀치, 마우스 휠·트랙패드 핀치(`ctrlKey` 배율 적용), `listenGestures`의 보조 버튼·`Shift` 팬으로 나눈다.
- 한 손가락을 `input.tapMaxSeconds`와 `input.tapSlop` 안에서 떼면 탭이다. 두 손가락 이상이 닿았던 조작은 탭이 되지 않는다.
- `input.tapSlop`을 넘게 움직이면 끌기다. 최근 `input.velocityWindowSeconds` 창에서 릴리스 속도를 계산하며, `input.velocityStopSeconds` 이상 멈춘 뒤 떼면 관성 속도는 0이다.
- 두 손가락이 닿으면 끌기를 관성 없이 끝내고 핀치로 전환한다. 두 손가락 거리는 `input.pinchMinDistance` 이상으로 잡아 비율이 튀지 않게 한다.

**표준 3D 궤도 제어** (`CameraRig`)
- 궤도 중심(`target`)에서 `distance` 만큼 떨어진 구면 위 좌표로 카메라를 배치하고 중심을 바라본다(`lookAt(target)`).
- 화면 높이 대비 세로 시야각(`fovDeg`)과 `gesture.lookDragScale` 비율로 px 이동량을 궤도 각도(`yaw`·`pitch`)로 바꾸고, `pitch`는 `gesture.maxPitch` 안에서 제한한다. 한 손가락 릴리스 속도가 `gesture.lookStopSpeed` 이상이면 `gesture.lookInertiaDecay`로 감쇠하는 관성 회전이 이어진다.
- `pan`은 현재 거리와 시야각 비율로 화면 이동량을 카메라 오른쪽·위쪽 벡터 이동으로 바꿔 `target`을 평행 이동한다.
- `zoomByFactor`는 `goalDistance`를 `cosmos.minDistance`~`cosmos.maxDistance` 범위에서 스냅 없이 연속 조절하고 `gesture.zoomRate`로 수렴한다.
- `focusPoint`는 `goalTarget`과 최대 거리를 설정해 `gesture.focusRate`로 부드럽게 이동한다.

**시간축 탐색** (`AxisNavigation`, `time-axis` 데모)
- `time-axis` 데모(`dragTime: true`)에서는 세로 끌기(`gesture.dragDepthPerScreen`)와 관성(`gesture.inertiaDecay`, `gesture.inertiaStopSpeed`)으로 이동하고, 핀치(`gesture.pinchScale`)와 마우스 휠(`gesture.wheelScalePer100`, `gesture.wheelSnapDelay`)로 축척을 바꾸고 놓으면 `nearestLevel` 단계로 스냅한다.
- 핀치·휠 중심에서 `gesture.pinchAnchorRadius`(CSS px) 안의 가장 가까운 보이는 카드(`pickAnchorTime`)가 지금 놓인 시각을 같은 깊이에 고정한다. 카드가 없으면 초점면을 고정한다.
- 우주 보기는 `AxisNavigation` 대신 `CameraRig`와 `timeScrubber.ts`로 3D 탐색을 처리하며, 펼쳐진 카드가 있을 때(`isBlocked`)는 조작을 막고 탭 닫기만 허용한다.
