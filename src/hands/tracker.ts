import { HandTracker } from './HandTracker';

let instance: HandTracker | null = null;

/**
 * Singleton del tracker de manos compartido entre mini-apps.
 * El elemento <video> vive oculto en el body; cada app hace
 * start() al montar y stop() al desmontar.
 */
export function getHandTracker(): HandTracker {
  if (!instance) {
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.display = 'none';
    document.body.appendChild(video);
    instance = new HandTracker(video);
  }
  return instance;
}
