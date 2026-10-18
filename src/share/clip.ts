/**
 * Recording a replay clip of a fight, entirely in the browser.
 *
 * `canvas.captureStream()` turns the canvas into a live video track, and
 * `MediaRecorder` encodes it (MP4 where the browser supports it, else WebM).
 * Because fights are deterministic, a "replay" is just the same two creatures
 * and the same seed, simulated again while we record.
 */
export interface Recording { stop(): Promise<{ blob: Blob; ext: string }> }

export function canRecord(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

export function startRecording(canvas: HTMLCanvasElement, fps = 30): Recording {
  // H.264 MP4 plays everywhere (incl. iPhone); otherwise WebM. A bare 'video/mp4' is avoided because
  // Chromium may put VP9 inside it, which QuickTime and iOS cannot play.
  const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start(250);
  return {
    stop: () => new Promise((resolve) => {
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = rec.mimeType || 'video/webm';
        resolve({ blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' });
      };
      rec.stop();
    }),
  };
}

/** Offer a Blob as a file download. */
export function download(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
