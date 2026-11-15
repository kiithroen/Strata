# 개발

## 실행

```bash
npm install
npm run dev
```

<http://localhost:5173/>에서 위젯 갤러리가 열린다. `?w=<이름>`으로 위젯을 고르거나 왼쪽 위 탭으로 오간다(목록은 `src/gallery/registry.ts`). 이름이 없거나 틀리면 등록표의 첫 위젯이 열린다.

## 폰에서 열기

두 방법이 있다.

- **USB(권장)**: 폰을 USB 디버깅으로 연결하고 `adb reverse tcp:5173 tcp:5173`을 실행한 뒤 폰 브라우저에서 `http://localhost:5173/`을 연다. 주소가 localhost라 보안 컨텍스트가 필요한 API(저장소 영구화 등)도 쓸 수 있다. PC 크롬의 `chrome://inspect`로 폰 화면의 콘솔을 볼 수 있다.
- **같은 와이파이**: `npm run dev:lan`으로 띄우고 출력에 나온 Network 주소를 폰에서 연다. 주소가 localhost가 아니라서 보안 컨텍스트가 필요한 API는 막힌다.

## 배포

`main`에 푸시하면 `.github/workflows/pages.yml`이 `npm ci`, `npm test`, `npm run build`를 돌리고 `dist`를 GitHub Pages에 올린다. 주소는 <https://kiithroen.github.io/Strata/>다. 테스트나 빌드가 실패하면 올라가지 않는다.

- 빌드는 상대 경로(`vite.config.ts`의 `base: './'`)라 저장소 하위 경로에서도 열린다. 페이지 경로를 나누는 라우팅을 넣으면 이 설정을 다시 봐야 한다.
- 배포본에는 디버그 훅(`window.__strata`)이 없다.

## 구조

| 경로 | 내용 |
|---|---|
| `src/config.ts` | 튜닝 값(`tuning`) |
| `src/core/` | 위젯이 함께 쓰는 순수 로직: 지수 접근(`motion.ts`), 달력 단위(`calendar.ts`), 시드 난수, 날짜 표기 |
| `src/widgets/<위젯>/` | 위젯 하나. 움직임·배치는 순수 로직, 텍스처·재질·메시는 뷰 |
| `src/widgets/common/` | 위젯이 함께 쓰는 뷰 부품(글자 텍스처 캐시, 빛 무리 텍스처) |
| `src/input/` | 손가락 입력 해석 |
| `src/gallery/` | 위젯 갤러리: 공용 렌더러·장면·카메라(`stage.ts`), 위젯 데모, 펼치기 공용 상태(`cardFocus.ts`), 시점 표시(`timeReadout.ts`), 등록표 |
| `src/dev/` | 개발용 가짜 데이터 |
| `test/` | vitest 단위 테스트(노드 환경) |

게임 시간은 `main.ts`의 루프가 프레임 간격을 누적해 만든다. 긴 멈춤은 `loop.maxStep`으로 자른다.

## 검증

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

- 단위 테스트는 `tuning`을 읽어 기대를 계산한다. 주사율 무관성은 같은 게임 시간을 여러 주사율로 진행해 비교한다.
- 화면은 개발 서버를 띄워 캡처로 확인한다. 자동화 테스트는 렌더링 결과를 보지 않는다.

## 디버그 훅

개발 서버에서만 `window.__strata`가 열린다.

- `id`: 지금 위젯 이름
- `demo`: 위젯 데모 객체
  - 노트 카드: `cards`, `focus(card | null)`, `focusedId()`
  - 시간축: 위에 더해 `controller`(`AxisController`), `clusters()`
  - 우주 보기: 시간축에 더해 `hubs()`, `nodes()`(지난 프레임의 행성·허브 노드), `screenOf(월드 위치)`(탭할 화면 좌표)
- `time()`: 지금 게임 시간(초)
- `advance(seconds, hz = 60)`: 게임 시간을 고정 간격으로 진행하고 한 번 그린다

브라우저 창이 숨어 있으면 프레임이 멈추거나 느려져 게임 시간이 흐르지 않는다. 화면 확인 스크립트는 기다리지 말고 `advance`로 시간을 진행한 뒤 캡처한다.

움직이는 종이의 탭을 확인할 때는 화면 좌표를 구한 같은 스크립트 안에서 캔버스에 `pointerdown`·`pointerup`을 보낸다. 확인 도구의 클릭은 그 사이에 프레임이 지나 종이가 이미 날아가 있을 수 있다.
