# 개발

## 실행

```bash
npm install
npm run dev
```

<http://localhost:5173/>에서 위젯 갤러리가 열린다. `?w=<이름>`으로 위젯을 고른다(목록은 `src/gallery/registry.ts`). 이름이 없거나 틀리면 첫 위젯이 열린다.

## 폰에서 열기

두 방법이 있다.

- **USB(권장)**: 폰을 USB 디버깅으로 연결하고 `adb reverse tcp:5173 tcp:5173`을 실행한 뒤 폰 브라우저에서 `http://localhost:5173/`을 연다. 주소가 localhost라 보안 컨텍스트가 필요한 API(저장소 영구화 등)도 쓸 수 있다. PC 크롬의 `chrome://inspect`로 폰 화면의 콘솔을 볼 수 있다.
- **같은 와이파이**: `npm run dev:lan`으로 띄우고 출력에 나온 Network 주소를 폰에서 연다. 주소가 localhost가 아니라서 보안 컨텍스트가 필요한 API는 막힌다.

## 구조

| 경로 | 내용 |
|---|---|
| `src/config.ts` | 튜닝 값(`tuning`) |
| `src/core/` | 위젯이 함께 쓰는 순수 로직: 지수 접근(`motion.ts`), 시드 난수, 날짜 표기 |
| `src/widgets/<위젯>/` | 위젯 하나. 움직임·배치는 순수 로직, 텍스처·재질·메시는 뷰 |
| `src/input/` | 손가락 입력 해석 |
| `src/gallery/` | 위젯 갤러리: 공용 렌더러·장면·카메라(`stage.ts`), 위젯 데모, 등록표 |
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
- `demo`: 위젯 데모 객체. 노트 카드 데모는 `cards`, `focus(card | null)`, `focusedId()`를 가진다
- `time()`: 지금 게임 시간(초)

브라우저 창이 숨어 있으면 프레임이 느려져 게임 시간이 덜 흐른다. 전환이 끝났는지는 기다린 시간이 아니라 이 훅으로 상태를 읽어 판단한다.
