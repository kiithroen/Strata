# Strata

사진 노트가 3D 공간에 떠 있고, 터치스크린 손가락 조작으로 시간축을 탐험하며 노트를 보는 개인용 노트앱이다.
처음 읽을 것: [Docs/concept.md](Docs/concept.md), [Docs/roadmap.md](Docs/roadmap.md). 시스템 문서 목록은 [README.md](README.md)에 있다.

## 규칙

- **탐색·조작은 3D, 노트 입력만 2D(HTML)다.** 입력 화면을 3D 안에 만들지 않는다.
- **튜닝 값은 `src/config.ts`에만 둔다.** 문서·테스트·주석에 값을 옮겨 적지 않는다. 테스트는 `tuning`을 읽어 기대를 계산한다.
- **움직임은 게임 시간 기반이다.** 위치·회전·배율 접근은 `core/motion.ts`의 `approachFactor`(지수 접근)로 하고 프레임 수에 묶지 않는다. 테스트도 dt를 누적한 게임 시간으로 잰다.
- **위젯 하나는 렌더링과 로직을 나눈다.** 움직임·배치·모델(`cardMotion.ts`, `axisModel.ts`, `placement.ts` 등)은 three 수학 객체만 써서 노드 테스트가 가능해야 한다. 캔버스·WebGL·DOM은 뷰 파일과 데모에만 둔다.
- **새 위젯은 갤러리에 데모를 붙인다.** `src/gallery/registry.ts`에 `?w=` 이름으로 등록한다.
- **손가락 입력은 Pointer Events로 직접 받는다.** 캔버스의 `touch-action: none`을 지운다면 브라우저 확대·스크롤이 끼어든다.

## 함정

- `ShaderMaterial`은 출력 색공간 변환을 자동으로 하지 않는다. 프래그먼트 끝에 `#include <colorspace_fragment>`를 둔다. 화면 잡음처럼 지각상 균일해야 하는 효과는 그 뒤에 더한다.
- 브라우저 창이 숨어 있으면 `requestAnimationFrame`이 멈추거나 느려져 게임 시간이 흐르지 않는다. 화면 확인 스크립트는 벽시계로 기다리지 말고 `window.__strata.advance(초)`로 진행한 뒤 캡처한다.
- 종이 휨 높이 식은 `cardMaterial.ts` 정점 셰이더와 `noteCard/paperBend.ts`(은하 살이 닿는 카드 중심 자리용) 두 곳에 있다. 하나를 고치면 다른 쪽도 고친다.
- 시간축의 달력 계산은 현지 시각이다. 테스트의 기준 시각도 `new Date(연, 월, …)`로 만든다.
- 개발 서버(Vite)가 파일 변경을 놓쳐 옛 코드를 내보낼 때가 있다. 고친 동작이 화면에 안 보이면 `curl -s localhost:5173/src/<파일>`로 내보내는 코드를 확인하고, 다르면 그 파일을 `touch`한다.

## 검증

`npm run typecheck`, `npm test`, `npm run build`. 화면은 개발 서버를 띄워 캡처로 확인한다([Docs/development.md](Docs/development.md)).
화면 기준은 폴드 펼친 화면이다. 배치·간격은 그 크기에서 먼저 캡처해 맞추고, 접은 화면과 데스크톱은 깨지지 않는지만 본다(기준 크기는 development.md "검증").
