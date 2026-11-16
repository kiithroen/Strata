/** 글자 단위로 줄을 나눈다. maxLines 를 넘는 글이 남으면 마지막 줄 끝을 말줄임표로 바꾼다. */
export function wrapLines(
  ctx: Pick<CanvasRenderingContext2D, 'measureText'>,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  const paras = text.split('\n');
  for (let p = 0; p < paras.length; p++) {
    let line = '';
    for (const ch of paras[p]) {
      const next = line + ch;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        if (lines.length >= maxLines) return appendEllipsis(ctx, lines, maxWidth);
        line = ch === ' ' ? '' : ch;
      } else {
        line = next;
      }
    }
    lines.push(line);
    if (lines.length >= maxLines) {
      // 문단 끝에서 줄이 다 찼어도 뒤에 남은 글이 있으면 잘렸다고 알린다
      const rest = paras.slice(p + 1).some((para) => para.trim() !== '');
      return rest ? appendEllipsis(ctx, lines, maxWidth) : lines;
    }
  }
  return lines;
}

/** 마지막 줄 끝에 말줄임표를 붙이고, 폭을 넘으면 넘지 않을 때까지 글자를 덜어 낸다 */
function appendEllipsis(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, lines: string[], maxWidth: number): string[] {
  const last = lines.length - 1;
  if (last < 0) return lines;
  let line = lines[last];
  while (line.length > 0 && ctx.measureText(`${line}…`).width > maxWidth) line = line.slice(0, -1);
  lines[last] = `${line}…`;
  return lines;
}

/**
 * 캔버스 없이 어림한 글 폭(글자 크기 1 기준). 고정폭 글꼴에서 한글·한자 등 넓은 글자는 1, 나머지는 0.6 으로 센다.
 * 레이아웃이 텍스처를 그리기 전에 메모 크기를 정할 때 쓴다. 실제 측정보다 조금 넉넉하게 잡는다.
 */
export function estimateTextWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += ch.codePointAt(0)! >= 0x1100 ? 1 : 0.6;
  return w;
}

/** estimateTextWidth 로 재는 가짜 측정기. fontSize 는 px 다 */
export function estimatedMeasure(fontSize: number): Pick<CanvasRenderingContext2D, 'measureText'> {
  return { measureText: (s: string) => ({ width: estimateTextWidth(s) * fontSize }) as TextMetrics };
}
