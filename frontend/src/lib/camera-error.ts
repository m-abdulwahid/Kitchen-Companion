/**
 * Turn the browser's camera error into something a person can act on. getUserMedia rejects with a
 * DOMException whose `name` says what went wrong; showing one message for all of them ("blocked")
 * sends people to fix the wrong thing.
 */
export function describeCameraError(error: unknown): string {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera is blocked for this site. Click the camera or lock icon in the address bar, set Camera to Allow, then press Try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera found. Plug one in or turn it on, then press Try again.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is busy or not responding. Close other apps or tabs using it (Zoom, Teams, OBS, the /vision page), then press Try again.";
    case "NotSupportedError":
      return "The camera only works on https or localhost. Open the app from http://localhost:3000.";
    default:
      return `Couldn't start the camera${name ? ` (${name})` : ""}. Press Try again.`;
  }
}

/** Ask for the camera, or reject with the same kind of error if the browser has no camera API at all. */
export function requestCamera(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject({ name: "NotSupportedError" });
  }
  return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
}
