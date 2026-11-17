# 동기화

메모 앨범의 노트를 구글 드라이브와 맞추는 규칙이다. 드라이브 구조와 앱 쪽 저장은 [roadmap.md](roadmap.md) "앱과 동기화"에 있다.

## 노트 기록 (`src/sync/noteRecord.ts`)

- 드라이브 `Strata/` 폴더에 노트마다 메타데이터 파일 `note-<번호>.json` 하나와 사진 파일 `photo-<번호>.<확장자>` 하나를 둔다(`noteFileName`, `photoFileName`, `noteIdOf`).
- 기록(`NoteRecord`) 필드: `v`(형식 판, 지금 1), `id`, `time`(노트 시각, 은하 자리), `modified`(마지막으로 고친 시각), `kind`(`photo`·`memo`·`doc`), `title`, `body`, `checklist`(체크리스트 항목 `{ text, done }` 목록. 있으면 `body`는 없다), `tags`, `tint`(메모 색 번호), `photo`(파일 이름과 폭·높이), `deleted`(지움 표시).
- 읽을 때 형식을 검사한다(`parseNoteRecord`). 판·번호·시각·종류가 틀린 파일은 건너뛰고, 모르는 필드는 버리며, 크기가 틀린 사진 정보는 뺀다. 체크리스트는 글이 있는 항목만 읽고 `done`이 `true`가 아니면 끝내지 않은 항목이다.
- 노트를 지우면 파일을 지우지 않고 `deleted`를 남겨 다른 기기에도 지움이 퍼지게 한다. 은하에는 지운 노트를 빼고 최근 것부터 띄운다(`albumNotes`). 체크리스트 노트는 항목을 줄마다 체크 표시와 함께 적은 글(`src/core/checklist.ts`의 `checklistText`)을 카드·목록·검색의 글로 쓴다.

- 로컬 저장소(`src/album/noteStore.ts`)도 같은 기록을 지움 표시까지 그대로 둔다. 입력 화면이 만드는 기록은 `src/album/albumModel.ts`의 `recordFromDraft`(비운 글과 빈 항목은 빼고, 체크리스트 노트는 본문을 적지 않으며, 사진 노트는 메모 색을 버리며 사진 파일 이름은 `photo-<번호>.jpg`), 지울 때는 `deletedRecord`(글과 사진 정보를 비우고 번호·시각·지움 표시만 남긴다)다. 새 노트 번호는 만든 시각(36진수)에 난수 두 자리를 붙인다(`newNoteId`).

## 합치기 (`mergeRecords`)

- 한쪽에만 있는 노트는 그쪽 것을 쓰고 없는 쪽으로 보낸다(로컬에만 있으면 올림, 드라이브에만 있으면 받음).
- 양쪽에 있으면 `modified`가 늦은 쪽이 이긴다. 같고 내용도 같으면 아무것도 보내지 않는다. 같은데 내용이 다르면 드라이브 쪽을 따라 여러 기기가 같은 결과에 닿게 한다.
- 지움 표시도 보통 기록처럼 `modified`로 겨룬다. 지운 뒤 다른 기기에서 더 늦게 고친 노트는 되살아난다.
