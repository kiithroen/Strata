import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Gemini API 의 generateContent 주소 */
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * 개발 서버에서 /api/gemini/<모델>:generateContent 요청에 GEMINI_API_KEY 환경 변수의 키를 붙여 Gemini API 로 넘긴다.
 * 키는 서버에만 있고 번들·브라우저에는 들어가지 않는다. 다른 주소로는 넘기지 않는다
 */
function geminiProxy(): Plugin {
  return {
    name: 'strata-gemini-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/gemini', (req, res) => {
        const key = process.env.GEMINI_API_KEY;
        const model = /^\/([\w.-]+):generateContent$/.exec(req.url ?? '')?.[1];
        if (req.method !== 'POST' || !model) {
          res.statusCode = 404;
          res.end();
          return;
        }
        if (!key) {
          res.statusCode = 503;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          fetch(`${GEMINI_API}/${model}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: Buffer.concat(chunks),
          })
            .then(async (upstream) => {
              res.statusCode = upstream.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(await upstream.text());
            })
            .catch(() => {
              res.statusCode = 502;
              res.end();
            });
        });
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  // 상대 경로로 빌드해 GitHub Pages 의 저장소 하위 경로(/Strata/)에서도 그대로 열린다
  base: './',
  server: { port: 5173, strictPort: true },
  plugins: [geminiProxy()],
  // 개발 서버에 GEMINI_API_KEY 가 있으면 앱이 설정의 키 없이도 프록시로 요약한다. 빌드에는 늘 false 다
  define: { __GEMINI_PROXY__: JSON.stringify(command === 'serve' && Boolean(process.env.GEMINI_API_KEY)) },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
}));
