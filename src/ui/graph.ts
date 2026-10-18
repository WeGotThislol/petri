/**
 * A small hand-drawn-looking line chart of fitness per generation.
 * Best = mint line, average = soft lavender line.
 */
import { COLOR, FONT, rgba } from './tokens';

export function drawGraph(cv: HTMLCanvasElement, best: number[], mean: number[]): void {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const r = cv.getBoundingClientRect();
  cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height, pad = 6;
  g.clearRect(0, 0, W, H);
  // Hand-drawn baseline.
  g.strokeStyle = rgba(COLOR.inkFaint, 0.5); g.lineWidth = 1.5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(pad, H - pad); g.quadraticCurveTo(W / 2, H - pad + 1.5, W - pad, H - pad - 1); g.stroke();
  if (best.length < 2) {
    g.fillStyle = COLOR.inkFaint; g.font = `500 16px ${FONT.hand}`;
    g.fillText('the score graph draws itself here…', pad + 4, H / 2 + 4);
    return;
  }
  // Zoom the y-axis to the data so small improvements are visible.
  const max = Math.max(...best) + 0.05, min = Math.min(...mean) - 0.05;
  const X = (i: number) => pad + (i / Math.max(1, best.length - 1)) * (W - pad * 2);
  const Y = (v: number) => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  const line = (vals: number[], col: string, w: number) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round';
    g.beginPath();
    vals.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
    g.stroke();
  };
  line(mean, rgba(COLOR.lavender, 0.8), 2);
  line(best, COLOR.mint, 3);
  g.fillStyle = COLOR.mint;
  g.beginPath(); g.arc(X(best.length - 1), Y(best[best.length - 1]), 4, 0, Math.PI * 2); g.fill();
}
