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
- **AI 요약**: Gemini API 키를 넣으면 메모 앨범의 긴 메모·문서를 요약하고 태그를 붙인다(아래 "AI 요약"). 키는 설정(`strata.settings`의 `geminiKey`)에 둔다. 개발 서버에 `GEMINI_API_KEY` 환경 변수가 있으면 키를 넣지 않아도 요약한다. `지금 요약`은 한 차례를 바로 돌리고, `키 지우기`는 설정의 키를 지운다. 아래 글에 기다리는 수·만든 수·마지막 오류가 보인다.
- **실데이터**: `파일`·`폴더`로 고른 파일을 노트로 읽어 우주 보기를 그 노트로 다시 띄운다(`src/dev/localNotes.ts`). 메모리에만 두는 임시 주입이라 다시 불러오면 가짜 노트로 돌아간다.
  - 사진(JPEG·PNG 등): 파일 앞부분(`dev.headerBytes`)에서 크기·EXIF 방향·촬영 시각을 읽는다(`src/dev/imageHeader.ts`). 원본 촬영 시각, 없으면 EXIF 파일 시각, 그것도 없으면 파일 수정 시각에 놓는다. 앞부분으로 크기를 모르는 형식은 한 번 디코딩해서 잰다. 제목은 파일 이름이다.
  - 구글 킵 테이크아웃 JSON: 제목·본문·체크리스트(항목과 체크 상태, 빈 항목은 뺀다)·라벨(태그)·만든 시각을 읽고, 본문(체크리스트는 항목 글)이 `album.docMinChars`자 이상이면 긴 문서, 아니면 메모다(`src/dev/keepNote.ts`). 휴지통 노트는 버린다.
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

## 메모 앨범 저장

- 우주 보기(`cosmos`)는 메모 앨범이다. 저장된 노트가 하나라도 있으면 그 노트만 띄우고, 없으면 가짜 노트를 미리보기로 띄운다. 실데이터 임시 주입과 탐색기 은하는 앨범이 아니라 `+ 노트`가 없다.
- 브라우저에서는 IndexedDB `strata` 데이터베이스에 둔다. `notes`에 노트 기록(드라이브와 같은 `NoteRecord` 형식, 지움 표시 포함), `photos`에 노트 번호를 열쇠로 사진 사본(JPEG Blob)을 둔다(`src/album/noteStore.ts`). 열 때 브라우저에 저장소 영구화를 요청한다.
- IndexedDB를 못 쓰면(사생활 보호 창 등) 메모리 저장소로 대신해 이번 실행에만 남고, 콘솔에 경고를 남긴다.
- 앨범을 비우려면 브라우저 개발자 도구에서 IndexedDB `strata`를 지운다. 같은 주소(개발 서버, 배포본)마다 따로다.
- 앱 시작은 저장소를 연 뒤 첫 화면을 띄운다(`main.ts`의 `ready`).

## AI 요약

- `src/album/summaries.ts`의 `SummaryRunner`가 요약할 노트(지우지 않은 메모·문서, 글이 `album.summary.minChars`자 이상, 지금 글의 요약 없음)를 최근 것부터 한 차례에 `album.summary.perRun`개씩 요약하고 태그를 붙여 앨범에 적는다. 띄운 화면의 카드·검색·목록·노트 보기에 바로 반영하고(`CosmosDemo.refreshSummary`), 워드 클라우드는 다시 띄울 때 바뀐다.
- 도는 때: 앱을 열 때, 노트를 저장하고 `album.summary.settleSec` 뒤(이어서 저장하면 다시 기다린다), 열려 있는 동안 `album.summary.intervalSec`마다(`albumDemo.ts`의 `startSummaries`). 고친 지 `settleSec`이 안 된 노트는 고치는 중으로 보고 미룬다.
- 다시 만들지 않는 규칙: 요약은 노트 기록에 글 지문과 함께 남고(`summary`, [sync.md](sync.md) "AI 요약"), 지문이 바뀔 때만 다시 만든다. 지문은 제목과 글(체크리스트는 항목 글)로 내므로 태그·색을 바꾸거나 체크리스트 항목을 끝냄으로 바꿔도 다시 요청하지 않는다. 앱을 다시 열거나 다른 기기에서 받아도 요청하지 않는다.
- 요청은 `src/album/geminiSummarizer.ts`가 Gemini API `generateContent`로 보내고 요약과 태그를 JSON(`responseSchema`)으로 받는다. 모델·생각 깊이는 `album.summary.model`·`thinkingLevel`이다. 노트 글은 `<note>` 안의 자료로 넘기고, 노트에 붙은 태그(`<existing>`)와 앨범에서 많이 쓴 태그 `album.summary.vocabularySize`개(`<vocabulary>`)를 함께 넘겨 같은 뜻이면 있는 태그를 다시 쓰게 한다.
- AI 태그는 `#`·빈칸을 빼고 겹치는 것과 사용자 태그를 뺀 뒤 `album.summary.maxTags`개까지 남긴다(`cleanTags`). 은하 노트의 `tags`에는 사용자 태그 뒤에 붙어 검색·카드 목록·워드 클라우드·묶음 점수에 쓰이고, 노트 보기는 흐린 색으로 보인다. 입력 화면의 태그 칸에는 들어가지 않는다.
- 키를 두는 곳: 설정에 키가 있으면 브라우저에서 Gemini API를 바로 부른다. 없으면 개발 서버의 `/api/gemini/<모델>:generateContent` 프록시로 보내고, 개발 서버가 `GEMINI_API_KEY` 환경 변수의 키를 붙인다(`vite.config.ts`). 키는 번들에 들어가지 않고 배포본에는 프록시가 없다. `npm run dev:lan`이면 같은 네트워크의 기기도 프록시를 쓴다.
- 거절·빈 답·형식이 틀린 답은 그 노트만 이번 실행 동안 건너뛰고, 키 오류·권한·요청 한도·서버 오류·연결 실패는 그 차례를 멈추고 다음 차례에 다시 해 본다.
- 설정의 키는 그 기기 브라우저의 `localStorage`에 평문으로 남는다. 개인 기기에서만 넣는다. 앱으로 감쌀 때 기기 보안 저장소로 옮긴다.

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
| `src/album/` | 메모 앨범: 노트 입력 모델·검색(`albumModel.ts`), 로컬 저장소 인터페이스와 IndexedDB·메모리 구현(`noteStore.ts`), 저장소를 읽어 은하 노트를 만드는 `Album`(`album.ts`), 사진 사본 굽기(`photoCopy.ts`), AI 요약 차례(`summaries.ts`)와 Gemini API 요청(`geminiSummarizer.ts`) |
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
  - 우주 보기(이어서): `noteScreens`(`viewer`, `editor`(`fill({ title, body, checklist, tags, tint })`, `setPhotoFile(File)`, `draft()`), `openNote(번호)`, `compose()`, `edit(id)`), `openSearch(검색어)`(찾은 수), `openNodeCards()`(다가간 노드의 카드 보기)
  - 로컬 탐색기: `openFiles(File[])`(파일 목록으로 원본을 연다. 폴더 고르기 창은 스크립트로 열 수 없어 확인 스크립트는 `webkitRelativePath`를 붙인 `File`로 폴더 구조를 넘긴다), `view.state()`(원본·폴더·항목 수·기다리는 썸네일·뷰어 파일), `view.navigate(경로)`, `view.openFile(경로)`, `view.viewer`(`step(±1)`, `close()`)
- `importFiles(File[])`: 설정 화면의 실데이터 불러오기와 같다. 결과 글을 돌려준다. 확인 스크립트는 `OffscreenCanvas.convertToBlob`으로 만든 JPEG 바이트를 `File`로 감싸 넘긴다
- `ready`: 메모 앨범 저장소를 열고 첫 화면을 띄우면 끝나는 약속. 확인 스크립트는 이것을 기다린 뒤 `demo`를 쓴다
- `albumCount()`: 메모 앨범에 저장된 노트 수
- `time()`: 지금 게임 시간(초)
- `advance(seconds, hz = 60)`: 게임 시간을 고정 간격으로 진행하고 한 번 그린다

브라우저 창이 숨어 있으면 프레임이 멈추거나 느려져 게임 시간이 흐르지 않는다. 화면 확인 스크립트는 기다리지 말고 `advance`로 시간을 진행한 뒤 캡처한다.

확인 도구의 캡처는 실제 화면 크기와 다를 수 있다. 캔버스에 보내는 좌표는 `getBoundingClientRect` 기준 CSS px로 구한다.

움직이는 카드의 탭을 확인할 때는 화면 좌표를 구한 같은 스크립트 안에서 캔버스에 `pointerdown`·`pointerup`을 보낸다. 확인 도구의 클릭은 그 사이에 프레임이 지나 카드가 이미 옮겨 가 있을 수 있다.
