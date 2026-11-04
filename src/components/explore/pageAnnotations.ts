import { layoutPage, TEXT_LAYOUT } from "./bookPages";

/** Pixel bands using the same wrapping, condensation and baselines as the page's text texture. */
export function annotationBands(content: string, start: number, end: number, measure: (text: string) => number) {
  const { lines, fontSize, lineHeight } = layoutPage(content), { left, right, top } = TEXT_LAYOUT;
  return lines.flatMap((line, row) => {
    if (line.start >= end || line.end + (line.brk ? 1 : 0) <= start) return [];
    const text = content.slice(line.start, line.end), scale = Math.min(1, (right - left) / Math.max(1, measure(text)));
    const from = Math.max(start, line.start) - line.start, to = Math.max(from, Math.min(end, line.end) - line.start);
    const x0 = left + measure(text.slice(0, from)) * scale - 1;
    const x1 = left + measure(text.slice(0, to)) * scale + 1;
    return [{ x: x0, y: top + row * lineHeight - fontSize * 0.72, width: Math.max(4, x1 - x0), height: lineHeight }];
  });
}
