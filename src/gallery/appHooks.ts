/**
 * 위젯 데모가 앱 쪽 동작을 부르는 자리. main.ts 가 채운다.
 * showInCosmos: 파일을 노트로 읽어 우주 보기로 띄우고 결과 글을 낸다(설정 화면의 실데이터 불러오기와 같다)
 */
export const appHooks: { showInCosmos: ((files: File[]) => Promise<string>) | null } = { showInCosmos: null };
