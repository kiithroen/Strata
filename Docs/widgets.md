# 위젯

위젯은 하나씩 만들어 위젯 갤러리(`?w=<이름>`)에서 확인한다. 튜닝 값은 `src/config.ts`의 `tuning`에 있고, 아래에는 필드 이름과 규칙만 적는다.

| 위젯 | 갤러리 이름 | 상태 |
|---|---|---|
| 노트 카드 | `note-card` | 구현됨 |
| 시간축 | | 할 일 |
| 카메라·제스처 | | 할 일 |
| 후처리 | | 할 일 |
| 노트 보기 | | 할 일 |

## 노트 카드

파일: `src/widgets/noteCard/`

사진 노트 하나를 공간에 띄우는 카드다. 사진, 테두리, 모서리 괄호, 날짜·번호 라벨을 캔버스 하나에 그려 텍스처로 쓴다.

**크기** (`cardLayout.ts`)
- 텍스처 폭은 `card.textureWidth`, 안쪽 여백은 폭 × `card.paddingRatio`다.
- 사진 칸은 사진 비율을 그대로 지킨다. 라벨 띠는 사진 아래에 붙고 높이는 사진 폭 × `card.labelRatio`다.
- 월드 폭은 `card.width`, 월드 높이는 텍스처 비율로 정한다.

**떠 있기** (`cardMotion.ts`의 `floatOffset`)
- 게임 시간의 사인 함수로 위아래(`float.amplitude`)와 기울기(`float.tiltAmplitude`)가 흔들린다.
- 카드마다 위상과 주기(`float.periodMin`~`float.periodMax`)가 달라 함께 출렁이지 않는다.

**펼치기** (`CardMotion`, `computeFocusPose`)
- 펼치면 카메라 정면 `focus.distance` 지점으로 와서 앞면이 카메라를 향한다.
- 배율은 화면 폭과 높이 중 좁은 쪽에 맞춰 `focus.fill` 비율을 차지하게 한다. 화면비가 바뀌면 매 프레임 다시 계산하므로 접기·펼치기에도 맞춰진다.
- 위치·회전·배율은 각각 `focus.positionRate`, `focus.rotationRate`, `focus.scaleRate`로 지수 접근한다. 같은 게임 시간이면 주사율과 상관없이 같은 자세다.
- 하나가 펼쳐지면 나머지는 `focus.othersDim`만큼 어두워진다(`focus.dimRate`로 접근, 가장 어두울 때 밝기는 `look.dimFloor`).
- 펼친 카드는 테두리에 강조색 빛이 돌고, 주사선과 잡음이 옅어진다.

**셰이더** (`cardMaterial.ts`)
- 모든 카드가 `CardLook` 유니폼 객체를 함께 쓴다. 시간은 갤러리가 한 번만 갱신한다.
- 깊이에 따라 `look.fogNear`~`look.fogFar` 사이에서 배경색으로 녹는다.

**갤러리 데모** (`src/gallery/noteCardDemo.ts`)
- 가짜 사진 노트 `field.count`장을 시야 원뿔 안에 흩는다(`field.ts`). 화면 좌표에서 기존 자리와 가장 먼 후보(`field.candidates`개 중)를 고르는 방식이라 겹침이 적다.
- 가까운 카드일수록 최근 노트다.
- 카드를 탭하면 펼치고, 펼친 상태에서 아무 데나 탭하면 닫는다.
