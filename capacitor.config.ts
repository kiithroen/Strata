import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 안드로이드 앱 설정. 웹 빌드(dist)를 앱에 넣는다. appId 를 바꾸면 다른 앱으로 설치되어 저장한 노트가 따라오지 않는다.
 * 설정(localStorage)은 웹뷰 출처(https://localhost)마다 따로라, server 의 androidScheme·hostname 을 바꾸면 사라진다
 */
const config: CapacitorConfig = {
  appId: 'io.github.kiithroen.strata',
  appName: 'Strata',
  webDir: 'dist',
};

export default config;
