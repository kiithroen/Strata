# 동기화

메모 앨범의 노트를 구글 드라이브와 맞추는 규칙이다. 드라이브 구조와 앱 쪽 저장은 [roadmap.md](roadmap.md) "앱과 동기화"에 있다.

## 노트 기록 (`src/sync/noteRecord.ts`)

- 드라이브 `Strata/` 폴더에 노트마다 메타데이터 파일 `note-<번호>.json` 하나와 사진 파일 `photo-<번호>.<확장자>` 하나를 둔다(`noteFileName`, `photoFileName`, `noteIdOf`).
- 기록(`NoteRecord`) 필드: `v`(형식 판, 지금 1), `id`, `time`(노트 시각, 은하 자리), `modified`(마지막으로 고친 시각), `kind`(`photo`·`memo`·`doc`), `title`, `body`, `checklist`(체크리스트 항목 `{ text, done }` 목록. 있으면 `body`는 없다), `tags`, `tint`(메모 색 번호), `photo`(파일 이름과 폭·높이), `summary`(AI 요약과 태그 `{ text, tags, source }`), `deleted`(지움 표시).
- 읽을 때 형식을 검사한다(`parseNoteRecord`). 판·번호·시각·종류가 틀린 파일은 건너뛰고, 모르는 필드는 버리며, 크기가 틀린 사진 정보는 뺀다. 체크리스트는 글이 있는 항목만 읽고 `done`이 `true`가 아니면 끝내지 않은 항목이다.
- 노트를 지우면 파일을 지우지 않고 `deleted`를 남겨 다른 기기에도 지움이 퍼지게 한다. 은하에는 지운 노트를 빼고 최근 것부터 띄운다(`albumNotes`). 체크리스트 노트는 항목을 줄마다 체크 표시와 함께 적은 글(`src/core/checklist.ts`의 `checklistText`)을 카드·목록·검색의 글로 쓴다.

- 로컬 저장소(`src/album/noteStore.ts`)도 같은 기록을 지움 표시까지 그대로 둔다. 안드로이드 앱의 백업 폴더(`Documents/Strata`)도 같은 파일 이름과 기록이고, 앱 저장소와 `mergeRecords`로 맞춘다([development.md](development.md) "메모 앨범 저장"). 입력 화면이 만드는 기록은 `src/album/albumModel.ts`의 `recordFromDraft`(비운 글과 빈 항목은 빼고, 체크리스트 노트는 본문을 적지 않으며, 사진 노트는 메모 색을 버리며 사진 파일 이름은 `photo-<번호>.jpg`), 지울 때는 `deletedRecord`(글과 사진 정보를 비우고 번호·시각·지움 표시만 남긴다)다. 새 노트 번호는 만든 시각(36진수)에 난수 두 자리를 붙인다(`newNoteId`).

## AI 요약 (`summary`)

- `source`는 요약할 때 제목과 글(체크리스트는 끝냄 표시 없이 항목 글만)의 지문(`contentKey`, FNV-1a 32비트)이다. 지금 글의 지문과 다르면 지난 요약이라 요약 글은 쓰지 않는다(`freshSummary`). 은하 노트에는 지금 글의 요약만 넘긴다.
- `tags`는 AI가 붙인 태그다. 지난 요약이어도 새 요약이 올 때까지 쓴다. 은하 노트의 `tags`는 기록의 `tags` 뒤에 겹치지 않는 AI 태그를 붙인 것이고, 그중 AI 태그는 `autoTags`로도 넘긴다(`noteTags`).
- 요약을 적을 때는 `modified`를 그 판보다 1ms만 늦춘다(`Album.setSummary`). 요약은 그 판에서 나온 것이라, 요약 없는 같은 판과 합칠 때는 이겨 퍼지고 그 뒤에 고친 글에는 진다. 요약하는 동안 글이 바뀌었으면 적지 않는다.
- 노트를 고치면 요약을 그대로 옮긴다. 지문이 같으면(태그·색만 바꿈) 그대로 쓰고, 바뀌었으면 지난 요약이 된다.

## 합치기 (`mergeRecords`)

- 한쪽에만 있는 노트는 그쪽 것을 쓰고 없는 쪽으로 보낸다(로컬에만 있으면 올림, 드라이브에만 있으면 받음).
- 양쪽에 있으면 `modified`가 늦은 쪽이 이긴다. 같고 내용도 같으면 아무것도 보내지 않는다. 같은데 내용이 다르면 드라이브 쪽을 따라 여러 기기가 같은 결과에 닿게 한다.
- 지움 표시도 보통 기록처럼 `modified`로 겨룬다. 지운 뒤 다른 기기에서 더 늦게 고친 노트는 되살아난다.
