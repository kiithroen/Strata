# 개발

## 실행

```bash
npm install
npm run dev
```

윈도우에서는 저장소 루트의 `run.bat`을 더블클릭해도 된다. 패키지가 없으면 설치하고 개발 서버를 띄워 브라우저를 연다(`run.bat explorer`처럼 위젯 이름을 주면 그 위젯으로 연다). 서버가 이미 떠 있으면 브라우저만 연다. 배치 파일은 CP949로 저장한다(cmd가 UTF-8 배치 파일의 한글 줄을 잘못 읽는다).

<http://localhost:5173/>에서 위젯 갤러리가 열린다. `?w=<이름>`으로 위젯을 고르거나 왼쪽 위 탭으로 오간다(목록은 `src/gallery/registry.ts`). 이름이 없거나 틀리면 등록표의 첫 위젯이 열린다.

## 폰에서 열기

두 방법이 있다.

- **USB(권장)**: 폰을 USB 디버깅으로 연결하고 `adb reverse tcp:5173 tcp:5173`을 실행한 뒤 폰 브라우저에서 `http://localhost:5173/`을 연다. 주소가 localhost라 보안 컨텍스트가 필요한 API(저장소 영구화 등)도 쓸 수 있다. PC 크롬의 `chrome://inspect`로 폰 화면의 콘솔을 볼 수 있다.
- **같은 와이파이**: `npm run dev:lan`으로 띄우고 출력에 나온 Network 주소를 폰에서 연다. 주소가 localhost가 아니라서 보안 컨텍스트가 필요한 API는 막힌다.

## 설정 화면(성능 표시·사진 표현·품질·실데이터)

오른쪽 위 `설정` 버튼이 설정 화면을 연다(`src/gallery/settingsPanel.ts`). 고른 값은 기기의 `localStorage`(`strata.settings`)에 남고, 저장소를 못 쓰면 이번 실행에만 적용된다(`src/gallery/settings.ts`). 개발 서버와 배포본이 같다.

- **성능 표시**: 켜면 바로 왼쪽 위에 뜬다(`src/gallery/perfOverlay.ts`).
  - 최근 `perf.window` 프레임의 FPS, 프레임 간격 중앙값·p95·최대, 끊김 비율(앞뒤 이웃 간격 중 짧은 쪽 × `perf.dropRatio`를 넘는 간격. 적응형 주사율의 60↔120Hz 전환은 전환 지점 하나만 걸린다)
  - CPU 시간: 위젯 갱신과 그리기 명령 각각의 평균(최대). GPU가 실제로 그리는 시간은 프레임 간격에만 드러난다
  - 그리기 호출·삼각형·점·선 수, 텍스처·형상 수, 사진 디코딩 큐(돌고 있는 수와 기다리는 수), 화면 CSS 크기, 캔버스 크기와 적용된 픽셀 비율, MSAA, 지금 품질 값, GPU 이름
- **사진 표현**: 사진 카드의 사진 칸을 원본·홀로그램 선(`card.photoFx`)·선화(`card.photoSketch`) 가운데 하나로 바로 바꾼다. 기본은 홀로그램이다.
- **실데이터**: `파일`·`폴더`로 고른 파일을 노트로 읽어 우주 보기를 그 노트로 다시 띄운다(`src/dev/localNotes.ts`). 메모리에만 두는 임시 주입이라 다시 불러오면 가짜 노트로 돌아간다.
  - 사진(JPEG·PNG 등): 파일 앞부분(`dev.headerBytes`)에서 크기·EXIF 방향·촬영 시각을 읽는다(`src/dev/imageHeader.ts`). 원본 촬영 시각, 없으면 EXIF 파일 시각, 그것도 없으면 파일 수정 시각에 놓는다. 앞부분으로 크기를 모르는 형식은 한 번 디코딩해서 잰다. 제목은 파일 이름이다.
  - 구글 킵 테이크아웃 JSON: 제목·본문(체크리스트는 항목마다 한 줄)·라벨(태그)·만든 시각을 읽고, 본문이 `dev.docMinChars`자 이상이면 긴 문서, 아니면 메모다(`src/dev/keepNote.ts`). 휴지통 노트는 버린다.
  - 사진 디코딩은 `createImageBitmap`을 `dev.decodeConcurrency`개씩만 돌리는 큐(`src/core/taskQueue.ts`)로 하고, 노트 순서(최근 것부터)대로 처리한다. 펼친 카드의 선명한 사진은 줄 맨 앞에 끼운다.
- **품질**: 프리셋(`quality.presets`)이나 항목별 값(`quality.options`)을 고르고 적용하면 저장하고 다시 불러온다. 렌더러·텍스처·형상을 처음부터 다시 만들어야 해서다. 시작할 때 `main.ts`가 위젯보다 먼저 `tuning`에 적용한다(`src/core/quality.ts`). 기본값과 다른 항목만 저장하므로 고르지 않은 항목은 `config.ts` 기본값을 따른다.

| 항목 | 바꾸는 값 |
|---|---|
| 해상도 배율 | 픽셀 비율 상한(`render.maxPixelRatio`). 기기 배율을 넘지 않는다 |
| 계단 제거 | MSAA(`render.antialias`) |
| 블룸 | 블룸 후처리(`render.bloom`). 낮음 프리셋은 끈다 |
| 먼지, 별 | 개수(`cosmos.dust.count`, `cosmos.stars.count`) |
| 성운 | 끄기, 매 프레임 계산, 그 크기 큐브맵에 굽기(`cosmos.nebula`) |
| 카드 텍스처 | 떠 있는 카드 텍스처 폭(`card.textureWidth`) |

`quality.options`에는 기본값과 모든 프리셋 값이 들어 있어야 한다(테스트가 확인한다). 맞는 값을 찾으면 `src/config.ts`의 기본값과 프리셋을 고친다.

## 배포

`main`에 푸시하면 `.github/workflows/pages.yml`이 `npm ci`, `npm test`, `npm run build`를 돌리고 `dist`를 GitHub Pages에 올린다. 주소는 <https://kiithroen.github.io/Strata/>다. 테스트나 빌드가 실패하면 올라가지 않는다.

- 빌드는 상대 경로(`vite.config.ts`의 `base: './'`)라 저장소 하위 경로에서도 열린다. 페이지 경로를 나누는 라우팅을 넣으면 이 설정을 다시 봐야 한다.
- 배포본에는 디버그 훅(`window.__strata`)이 없다.

## 구조

| 경로 | 내용 |
|---|---|
| `src/config.ts` | 튜닝 값(`tuning`) |
| `src/core/` | 위젯이 함께 쓰는 순수 로직: 지수 접근(`motion.ts`), 달력 단위(`calendar.ts`), 시드 난수, 날짜 표기, 프레임 통계(`frameStats.ts`), 품질 값(`quality.ts`), 동시 작업 제한 큐(`taskQueue.ts`) |
| `src/widgets/<위젯>/` | 위젯 하나. 움직임·배치는 순수 로직, 텍스처·재질·메시는 뷰 |
| `src/widgets/common/` | 위젯이 함께 쓰는 뷰 부품(글자 텍스처 캐시, 빛 무리 텍스처) |
| `src/input/` | 손가락 입력 해석 |
| `src/gallery/` | 위젯 갤러리: 공용 렌더러·장면·카메라(`stage.ts`), 위젯 데모, 은하 ↔ 지층 전환(`strataMode.ts`), 펼치기 공용 상태(`cardFocus.ts`), 시점 표시(`timeReadout.ts`), 시간 띠(`timeScrubber.ts`), 성능 표시(`perfOverlay.ts`), 블룸 후처리(`bloom.ts`), 설정 저장·화면(`settings.ts`, `settingsPanel.ts`), 등록표 |
| `src/dev/` | 개발용 가짜 데이터(`noteData.ts`)와 실데이터 임시 불러오기(`localNotes.ts`, `imageHeader.ts`, `keepNote.ts`) |
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
- 화면 기준은 **폴드 펼친 화면**이다. 배치·간격·글자 크기는 이 크기에서 먼저 맞추고, 접은 화면(세로로 긴 폰)과 데스크톱은 깨지지 않는지만 본다. 기준 CSS 크기는 **936×858**이다(갤럭시 폴드 펼친 화면, 크롬 주소창이 있을 때 성능 표시의 `화면` 값. 가로가 조금 긴 정사각형에 가깝다). 접은 화면은 **514×1076**이다. 앱으로 감싸 주소창이 없어지면 세로가 늘어나니 그때 다시 읽는다. 폰 크롬이 '데스크톱 사이트' 모드면 넓은 가상 폭으로 그려 값이 틀어진다.
- 로컬 탐색기(`?w=explorer`)는 데스크톱이 기준이다. 기준 CSS 크기는 **1440×900**이고, 폴드 펼친 화면과 접은 화면은 깨지지 않는지만 본다(좁은 화면에서는 경로 막대가 단추 아래 줄로 내려간다).

## 디버그 훅

개발 서버에서만 `window.__strata`가 열린다.

- `id`: 지금 위젯 이름
- `demo`: 위젯 데모 객체
  - 노트 카드: `cards`, `focus(card | null)`, `focusedId()`
  - 시간축: 위에 더해 `controller`(`AxisController`), `clusters()`
  - 우주 보기: 시간축에 더해 `hubs()`, `nodes()`(지난 프레임의 행성·허브 노드), `screenOf(월드 위치)`(탭할 화면 좌표, CSS px), `tapNode(노드)`(은하 탭 두 단계를 거친다)·`approachedKey()`(다가간 노드 키), `enterStrata(노드)`(바로 들어간다)·`exitStrata()`, `strataState()`, `pickStrataLayer(x, y)`, `openCardList()`(지층 보기의 카드 보기)·`setCardMode('space' | 'list')`·`cardListState()`
  - 로컬 탐색기: `openFiles(File[])`(파일 목록으로 원본을 연다. 폴더 고르기 창은 스크립트로 열 수 없어 확인 스크립트는 `webkitRelativePath`를 붙인 `File`로 폴더 구조를 넘긴다), `view.state()`(원본·폴더·항목 수·기다리는 썸네일·뷰어 파일), `view.navigate(경로)`, `view.openFile(경로)`, `view.viewer`(`step(±1)`, `close()`)
- `importFiles(File[])`: 설정 화면의 실데이터 불러오기와 같다. 결과 글을 돌려준다. 확인 스크립트는 `OffscreenCanvas.convertToBlob`으로 만든 JPEG 바이트를 `File`로 감싸 넘긴다
- `time()`: 지금 게임 시간(초)
- `advance(seconds, hz = 60)`: 게임 시간을 고정 간격으로 진행하고 한 번 그린다

브라우저 창이 숨어 있으면 프레임이 멈추거나 느려져 게임 시간이 흐르지 않는다. 화면 확인 스크립트는 기다리지 말고 `advance`로 시간을 진행한 뒤 캡처한다.

확인 도구의 캡처는 실제 화면 크기와 다를 수 있다. 캔버스에 보내는 좌표는 `getBoundingClientRect` 기준 CSS px로 구한다.

움직이는 카드의 탭을 확인할 때는 화면 좌표를 구한 같은 스크립트 안에서 캔버스에 `pointerdown`·`pointerup`을 보낸다. 확인 도구의 클릭은 그 사이에 프레임이 지나 카드가 이미 옮겨 가 있을 수 있다.
