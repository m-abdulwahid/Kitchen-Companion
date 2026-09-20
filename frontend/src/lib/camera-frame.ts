export type CameraFrame = {
  image: string;
  thumbnail: Uint8Array;
};

const FRAME_WIDTH = 640;
const THUMBNAIL_WIDTH = 32;
const THUMBNAIL_HEIGHT = 24;

/** Capture one modest JPEG plus a tiny local thumbnail for change detection. */
export function captureCameraFrame(video: HTMLVideoElement): CameraFrame | null {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
    return null;
  }
  const width = Math.min(FRAME_WIDTH, video.videoWidth);
  const height = Math.round((width * video.videoHeight) / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);

  const tiny = document.createElement("canvas");
  tiny.width = THUMBNAIL_WIDTH;
  tiny.height = THUMBNAIL_HEIGHT;
  const tinyContext = tiny.getContext("2d", { willReadFrequently: true });
  if (!tinyContext) return null;
  tinyContext.drawImage(canvas, 0, 0, tiny.width, tiny.height);
  const pixels = tinyContext.getImageData(0, 0, tiny.width, tiny.height).data;
  const thumbnail = new Uint8Array(tiny.width * tiny.height);
  for (let index = 0; index < thumbnail.length; index += 1) {
    thumbnail[index] = (pixels[index * 4] + pixels[index * 4 + 1] + pixels[index * 4 + 2]) / 3;
  }
  return { image: canvas.toDataURL("image/jpeg", 0.6), thumbnail };
}

/** A camera still is nearly black only while a device is starting, blocked, or covered. */
export function hasVisibleCameraImage(frame: CameraFrame): boolean {
  let total = 0;
  let lightest = 0;
  for (const pixel of frame.thumbnail) {
    total += pixel;
    lightest = Math.max(lightest, pixel);
  }
  return total / frame.thumbnail.length >= 8 || lightest >= 20;
}
