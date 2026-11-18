import { tuning } from '../../config';

/**
 * file 을 숨은 video 요소로 열어 setup 이 done 을 부를 때까지 기다린다. 실패하거나 explorer.videoTimeoutMs 안에 끝나지 않으면
 * fail 값으로 끝낸다(fail 이 없으면 거부한다). 어느 쪽이든 요소를 비우고 객체 URL 을 돌려줘 미디어 자원을 쥐고 있지 않는다.
 */
function withVideo<T>(
  file: File,
  preload: 'metadata' | 'auto',
  setup: (v: HTMLVideoElement, done: (value: T) => void) => void,
  fail?: T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    let settled = false;
    const finish = (ok: boolean, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      v.onloadedmetadata = v.onseeked = v.onerror = null;
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
      if (ok) resolve(value as T);
      else if (fail !== undefined) resolve(fail);
      else reject(new Error('동영상을 열 수 없다'));
    };
    const timer = setTimeout(() => finish(false), tuning.explorer.videoTimeoutMs);
    v.muted = true;
    v.preload = preload;
    v.onerror = () => finish(false);
    setup(v, (value) => finish(true, value));
    v.src = url;
  });
}

/** 동영상 크기를 알아낸다. 실패하면 null */
export function videoSize(file: File): Promise<{ width: number; height: number } | null> {
  return withVideo<{ width: number; height: number } | null>(
    file,
    'metadata',
    (v, done) => {
      v.onloadedmetadata = () => done(v.videoWidth > 0 ? { width: v.videoWidth, height: v.videoHeight } : null);
    },
    null,
  );
}

/** 동영상의 한 장면(길이의 explorer.videoThumbAt 비율 자리)을 targetWidth 폭 캔버스로 그린다 */
export function videoFrame(file: File, targetWidth: number): Promise<HTMLCanvasElement> {
  return withVideo<HTMLCanvasElement>(file, 'auto', (v, done) => {
    v.onloadedmetadata = () => {
      v.currentTime = Number.isFinite(v.duration) ? v.duration * tuning.explorer.videoThumbAt : 0;
    };
    v.onseeked = () => {
      const w = Math.max(1, Math.round(targetWidth));
      const h = Math.max(1, Math.round((w * v.videoHeight) / Math.max(1, v.videoWidth)));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')?.drawImage(v, 0, 0, w, h);
      done(canvas);
    };
  });
}
