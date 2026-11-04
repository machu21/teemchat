import { Capacitor } from '@capacitor/core';
import { computeScaledSize, SCREENSHOT_JPEG_QUALITY, SCREENSHOT_MAX_WIDTH } from '../utils/screenshot';

/**
 * Private, local-only screen capture for Companion Screen Help.
 *
 * The stream is never published to LiveKit or anyone in the room: it only lives in this
 * tab so single frames can be grabbed on demand when the user messages their companion.
 */
export class ScreenHelpSession {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private endedHandler: (() => void) | null = null;

  static isSupported(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    if (Capacitor.isNativePlatform()) return false;
    return typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  }

  get active(): boolean {
    return this.stream !== null;
  }

  /**
   * Opens the browser's screen picker. `onEnded` fires if the user stops sharing from the
   * browser's own UI (or the shared window closes).
   */
  async start(onEnded: () => void): Promise<void> {
    if (this.stream) return;

    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play().catch(() => undefined);

    this.stream = stream;
    this.video = video;
    this.endedHandler = () => {
      this.stop();
      onEnded();
    };
    stream.getVideoTracks()[0]?.addEventListener('ended', this.endedHandler);
  }

  /**
   * Grabs the current frame as a downscaled JPEG data URL, or null if nothing is shared.
   */
  async captureFrame(): Promise<string | null> {
    const video = this.video;
    if (!this.stream || !video) return null;

    if (video.videoWidth === 0) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1500);
        video.addEventListener(
          'loadeddata',
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true }
        );
      });
    }

    const { width, height } = computeScaledSize(video.videoWidth, video.videoHeight, SCREENSHOT_MAX_WIDTH);
    if (width === 0 || height === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', SCREENSHOT_JPEG_QUALITY);
  }

  stop(): void {
    if (this.stream) {
      const track = this.stream.getVideoTracks()[0];
      if (track && this.endedHandler) track.removeEventListener('ended', this.endedHandler);
      this.stream.getTracks().forEach((t) => t.stop());
    }
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
    this.stream = null;
    this.video = null;
    this.endedHandler = null;
  }
}
