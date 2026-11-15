import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 상대 경로로 빌드해 GitHub Pages 의 저장소 하위 경로(/Strata/)에서도 그대로 열린다
  base: './',
  server: { port: 5173, strictPort: true },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
