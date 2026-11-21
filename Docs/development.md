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

오른쪽 위 `설정` 버튼이 설정 화면을 연다(`src/gallery/settingsPanel.ts`). 설정 화면이 보일 때 `Esc`나 바깥 영역을 누르면 설정 화면만 닫힌다. 고른 값은 기기의 `localStorage`(`strata.settings`)에 남고, 저장소를 못 쓰면 이번 실행에만 적용된다(`src/gallery/settings.ts`). 개발 서버와 배포본이 같다.

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
- 저장소는 `NoteStore` 인터페이스 뒤에 있고 실행 환경에 따라 `openNoteStore`가 고른다(`src/album/noteStore.ts`).
- 안드로이드 앱은 SQLite와 앱 전용 파일 폴더에 둔다(`src/album/sqliteNoteStore.ts`, 플러그인 연결은 `nativeNoteStore.ts`). SQLite `strata` 데이터베이스의 `notes` 표에 노트마다 한 줄(`id`, `time`, `modified`, `deleted` 열과 기록 전체 JSON `record`, 지금 사진 파일 이름 `photo`)을 두고, 사진 사본은 앱 파일 폴더의 `photos/`에 둔다. 사진을 바꿀 때는 새 이름의 파일을 다 쓴 뒤 행을 바꾸고 옛 파일을 지운다. JSON이 깨진 행은 건너뛰고 나머지를 읽는다.
- 안드로이드 앱은 노트 사본을 내장 저장소 공용 폴더 `Documents/Strata`에도 쓴다(`src/album/backupStore.ts`의 `BackupNoteStore`). 드라이브와 같은 모양으로 노트마다 `note-<번호>.json`과 `photo-<번호>.<확장자>`를 두고([sync.md](sync.md) "노트 기록"), 갤러리 앱이 사진을 올리지 않게 `.nomedia`를 둔다. 앱을 지워도 이 폴더는 남는다.
  - 앱을 열 때 폴더와 앱 저장소를 `mergeRecords`로 맞춘다(수정 시각이 늦은 쪽이 이긴다). 앱 저장소가 비어 있으면(새로 설치) 맞춘 뒤에 첫 화면을 띄워 폴더의 노트로 되살리고, 아니면 첫 화면 뒤에 맞춘다(`applyExternal`로 메모리 앨범에도 반영한다).
  - 맞추기가 한 번 성공한 뒤부터 저장할 때마다 폴더에도 쓴다. 폴더 쓰기는 저장을 기다리게 하지 않고, 실패하면 설정 화면에 오류가 보이며 다음에 열 때 다시 맞춘다.
  - 다시 설치한 앱이 옛 파일을 읽고 고치려면 '모든 파일 접근'(`MANAGE_EXTERNAL_STORAGE`) 권한이 있어야 한다. 앱 안의 플러그인(`android/.../AllFilesAccessPlugin.java`)이 확인하고 설정 화면을 연다. 권한이 없으면 첫 실행 뒤 한 번만 묻고, 설정 화면의 `노트 백업`에서 다시 켤 수 있다. 설정 앱에서 돌아오거나 권한을 받아 맞춘 뒤 폴더에서 노트를 되살렸으면 앱을 다시 불러온다. `minSdkVersion`은 30(안드로이드 11 이상)이고, `android:allowBackup="false"`라 재설치 시 옛 SQLite DB가 복원되지 않는다.
- 브라우저에서는 IndexedDB `strata` 데이터베이스에 둔다. `notes`에 노트 기록(드라이브와 같은 `NoteRecord` 형식, 지움 표시 포함), `photos`에 노트 번호를 열쇠로 사진 사본(JPEG Blob)을 둔다. 열 때 브라우저에 저장소 영구화를 요청한다.
- 저장소를 못 열면(사생활 보호 창 등) 메모리 저장소로 대신해 이번 실행에만 남는다. 브라우저는 콘솔에 경고를 남기고, 앱은 경고 창을 띄운다.
- 브라우저에서 앨범을 비우려면 개발자 도구에서 IndexedDB `strata`를 지운다. 같은 주소(개발 서버, 배포본)마다 따로다. 앱의 앨범은 앱을 지우거나 앱 데이터를 지우면 앱 안에서는 사라지고, 다시 열 때 `Documents/Strata`에서 되살린다. 앨범을 정말 비우려면 그 폴더도 지운다.
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

## 안드로이드 앱

웹 빌드(`dist`)를 Capacitor로 감싼 디버그 APK를 직접 설치해 쓴다. 안드로이드 프로젝트는 `android/`, 설정은 `capacitor.config.ts`다. 쓰는 플러그인은 SQLite(`@capacitor-community/sqlite`), 파일(`@capacitor/filesystem`), 앱(`@capacitor/app`, 뒤로 키)이다.

### 준비

- `JAVA_HOME`이 Android Studio에 들어 있는 JDK(`jbr`)를 가리키게 한다. Gradle은 이 JDK에서 돈다. Gradle 판(`android/gradle/wrapper/gradle-wrapper.properties`)은 이 JDK를 지원해야 해서 Capacitor 템플릿 기본값보다 올려 두었다. Android Studio를 올려 JDK가 바뀌면 `Unsupported class file major version`이 나는지 보고 Gradle을 맞춘다.
- Capacitor는 Java 21로 컴파일하고, Filesystem 플러그인은 JDK 21 툴체인을 요구한다. 없으면 `android/settings.gradle`의 foojay 플러그인이 받아 `~/.gradle/jdks`에 둔다. 시스템에 JDK 21을 설치할 필요는 없다.
- Android SDK(컴파일 SDK는 `android/variables.gradle`의 `compileSdkVersion`)와 `ANDROID_HOME`. 처음 빌드할 때 Gradle이 배포판과 의존 패키지를 받는다.

### 빌드

```bash
npm run apk
```

웹을 빌드하고(`npm run build`), `dist`와 플러그인을 안드로이드 프로젝트에 복사한 뒤(`cap sync android`), 디버그 APK를 만든다(`gradlew.bat assembleDebug`, 윈도우 전용 스크립트다). `BUILD SUCCESSFUL` 줄을 확인한다. 결과는 `android/app/build/outputs/apk/debug/app-debug.apk`다. 웹 코드만 고쳤어도 `cap sync`를 거쳐야 앱에 들어간다. 플러그인을 더하거나 빼면 `npx cap sync android`가 Gradle 설정도 고친다.

### 설치

- **USB**: 폰에서 USB 디버깅을 켜고 연결한 뒤 `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. `-r`은 데이터를 둔 채 바꿔 설치한다.
- **파일로**: APK를 폰에 옮겨 파일 앱에서 열고, 처음 한 번 그 앱의 '출처를 알 수 없는 앱 설치'를 허용한다.
- 디버그 APK는 이 PC의 디버그 서명 키(`%USERPROFILE%\.android\debug.keystore`)로 서명된다. 다른 키로 서명한 APK는 바꿔 설치할 수 없어 앱을 지워야 한다. 노트는 `Documents/Strata`에서 되살아나지만 설정(`localStorage`)은 사라진다. 다른 PC에서 빌드할 때는 같은 키를 옮겨 쓴다.
- `appId`(`capacitor.config.ts`)를 바꾸면 다른 앱으로 설치된다. 같은 `Documents/Strata`를 읽으면 노트는 따라온다.

### 앱에서 다른 점

- PC 크롬의 `chrome://inspect`로 디버그 앱의 웹뷰 콘솔을 본다. 스크립트로 확인할 때는 `adb forward tcp:<포트> localabstract:webview_devtools_remote_<앱 pid>`로 웹뷰의 개발자 도구 프로토콜에 붙는다. 디버그 앱은 `adb shell run-as <appId>`로 데이터베이스(`databases/strataSQLite.db`)와 사진 폴더(`files/photos`)를 볼 수 있다.
- 안드로이드 뒤로 키는 열린 설정 화면·펼친 카드·방문 기록(노트 보기·입력·검색·카드 보기·지층 보기) 차례로 맨 위 화면을 닫고, 첫 화면이면 앱을 뒤로 보낸다(`main.ts`). 키보드가 떠 있으면 첫 뒤로는 키보드만 닫는다(검색은 열 때 입력 칸에 포커스가 간다).
- 설정(`strata.settings`, Gemini 키 포함)은 웹뷰 `localStorage`에 남는다. 웹뷰 출처는 `https://localhost`이고, `capacitor.config.ts`의 `server.androidScheme`·`hostname`을 바꾸면 설정이 사라진다.
- 앱에는 개발 서버 프록시가 없어 AI 요약은 설정의 키로만 돈다. 디버그 훅(`window.__strata`)도 없다.
- 로컬 탐색기는 아직 앱용 `FileSource`가 없다.

## 배포

`main`에 푸시하면 `.github/workflows/pages.yml`이 `npm ci`, `npm test`, `npm run build`를 돌리고 `dist`를 GitHub Pages에 올린다. 주소는 <https://kiithroen.github.io/Strata/>다. 테스트나 빌드가 실패하면 올라가지 않는다.

- 빌드는 상대 경로(`vite.config.ts`의 `base: './'`)라 저장소 하위 경로에서도 열린다. 페이지 경로를 나누는 라우팅을 넣으면 이 설정을 다시 봐야 한다.
- 배포본에는 디버그 훅(`window.__strata`)이 없다.

## 구조

| 경로 | 내용 |
|---|---|
| `src/config.ts` | 튜닝 값(`tuning`) |
| `src/core/` | 위젯이 함께 쓰는 순수 로직: 지수 접근(`motion.ts`), 달력 단위(`calendar.ts`), 시드 난수, 날짜 표기, 프레임 통계(`frameStats.ts`), 품질 값(`quality.ts`), 동시 작업 제한 큐(`taskQueue.ts`), 바이트 상한 LRU 캐시(`lruCache.ts`) |
| `src/widgets/<위젯>/` | 위젯 하나. 움직임·배치는 순수 로직, 텍스처·재질·메시는 뷰 |
| `src/widgets/common/` | 위젯이 함께 쓰는 뷰 부품(글자 텍스처 캐시, 빛 무리 텍스처) |
| `src/input/` | 손가락 입력 해석 |
| `src/gallery/` | 위젯 갤러리: 공용 렌더러·장면·카메라(`stage.ts`), 위젯 데모, 은하 ↔ 지층 전환(`strataMode.ts`), 펼치기 공용 상태(`cardFocus.ts`), 시점 표시(`timeReadout.ts`), 시간 띠(`timeScrubber.ts`), 성능 표시(`perfOverlay.ts`), 블룸 후처리(`bloom.ts`), 설정 저장·화면(`settings.ts`, `settingsPanel.ts`), 등록표 |
| `src/album/` | 메모 앨범: 노트 입력 모델·검색(`albumModel.ts`), 로컬 저장소 인터페이스와 IndexedDB·메모리 구현(`noteStore.ts`), 앱의 SQLite·파일·백업 폴더 구현(`sqliteNoteStore.ts`, `nativeNoteStore.ts`, `backupStore.ts`), 저장소를 읽어 은하 노트를 만드는 `Album`(`album.ts`), 사진 사본 굽기(`photoCopy.ts`), AI 요약 차례(`summaries.ts`)와 Gemini API 요청(`geminiSummarizer.ts`) |
| `src/dev/` | 개발용 가짜 데이터(`noteData.ts`)와 실데이터 임시 불러오기(`localNotes.ts`, `imageHeader.ts`, `keepNote.ts`) |
| `test/` | vitest 단위 테스트(노드 환경). 앱 SQLite 저장소는 `node:sqlite`로 같은 SQL을 돌린다 |
| `android/` | Capacitor 안드로이드 프로젝트. `app/src/main/assets/public`은 `cap sync`가 채우는 사본이라 저장소에 넣지 않는다 |

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
- 로컬 탐색기(`?w=explorer`)는 데스크톱이 기준이다. 기준 CSS 크기는 **1440×900**이고, 폴드 펼친 화면과 접은 화면은 깨지지 않는지만 본다(좁은 화면에서는 단추·필터 줄이 경로 막대 아래로 내려간다).

## 디버그 훅

개발 서버에서만 `window.__strata`가 열린다.

- `id`: 지금 위젯 이름
- `demo`: 위젯 데모 객체
  - 노트 카드: `cards`, `focus(card | null)`, `focusedId()`
  - 시간축: 위에 더해 `controller`(`AxisController`), `clusters()`
  - 우주 보기: 시간축에 더해 `hubs()`, `nodes()`(지난 프레임의 행성·허브 노드), `screenOf(월드 위치)`(탭할 화면 좌표, CSS px), `tapNode(노드)`(은하 탭 두 단계를 거친다)·`approachedKey()`(다가간 노드 키), `enterStrata(노드)`(바로 들어간다)·`exitStrata()`, `strataState()`, `pickStrataLayer(x, y)`, `openCardList()`(지층 보기의 카드 보기)·`setCardMode('space' | 'list')`·`cardListState()`
  - 우주 보기(이어서): `noteScreens`(`viewer`, `editor`(`fill({ title, body, checklist, tags, tint })`, `setPhotoFile(File)`, `draft()`), `openNote(번호)`, `compose()`, `edit(id)`), `openSearch(검색어)`(찾은 수), `openNodeCards()`(다가간 노드의 카드 보기)
  - 로컬 탐색기: `openFiles(File[])`(파일 목록으로 원본을 연다. 폴더 고르기 창은 스크립트로 열 수 없어 확인 스크립트는 `webkitRelativePath`를 붙인 `File`로 폴더 구조를 넘긴다), `view.state()`(원본·폴더·항목 수·보기 방식·DOM 에 만든 칸 수·만드는 중인 썸네일·뷰어 파일), `view.navigate(경로)`, `view.setMode('grid' | 'list')`, `view.setSort('name' | 'modified' | 'size')`, `view.openFile(경로)`, `view.viewer`(`step(±1)`, `close()`)
- `importFiles(File[])`: 설정 화면의 실데이터 불러오기와 같다. 결과 글을 돌려준다. 확인 스크립트는 `OffscreenCanvas.convertToBlob`으로 만든 JPEG 바이트를 `File`로 감싸 넘긴다
- `ready`: 메모 앨범 저장소를 열고 첫 화면을 띄우면 끝나는 약속. 확인 스크립트는 이것을 기다린 뒤 `demo`를 쓴다
- `albumCount()`: 메모 앨범에 저장된 노트 수
- `time()`: 지금 게임 시간(초)
- `advance(seconds, hz = 60)`: 게임 시간을 고정 간격으로 진행하고 한 번 그린다

브라우저 창이 숨어 있으면 프레임이 멈추거나 느려져 게임 시간이 흐르지 않는다. 화면 확인 스크립트는 기다리지 말고 `advance`로 시간을 진행한 뒤 캡처한다.

확인 도구의 캡처는 실제 화면 크기와 다를 수 있다. 캔버스에 보내는 좌표는 `getBoundingClientRect` 기준 CSS px로 구한다.

움직이는 카드의 탭을 확인할 때는 화면 좌표를 구한 같은 스크립트 안에서 캔버스에 `pointerdown`·`pointerup`을 보낸다. 확인 도구의 클릭은 그 사이에 프레임이 지나 카드가 이미 옮겨 가 있을 수 있다.
