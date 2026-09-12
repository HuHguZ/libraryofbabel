/**
 * Cursor helpers for the WebGL canvas (kept outside components so imperative hover code stays simple).
 * While the view is aimed from the screen centre (captured mouse), the canvas hides the cursor and the
 * scene raycasts from the reticle instead of the pointer.
 */

export function isCenterAim(canvas: HTMLCanvasElement): boolean {
  return canvas.dataset.aim === "center";
}

export function setCenterAim(canvas: HTMLCanvasElement, on: boolean) {
  if (on) canvas.dataset.aim = "center";
  else delete canvas.dataset.aim;
  canvas.style.cursor = on ? "none" : "";
}

/** Sets the pointer cursor on the canvas (a captured mouse stays hidden). */
export function setCanvasCursor(canvas: HTMLCanvasElement, pointer: boolean) {
  canvas.style.cursor = isCenterAim(canvas) ? "none" : pointer ? "pointer" : "";
}

/** True on devices with a real mouse: the view can follow it shooter-style. */
export function mouseCaptureAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: fine)").matches;
}
